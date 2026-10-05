import "server-only";
import { randomBytes } from "node:crypto";
import { C, col, nowIso } from "../repos/common";
import { env, isSimulated, requireConfigured } from "../env";
import { classifyHttpFailure, ProviderError } from "./errors";
import type { Order } from "@/domain/types";

/**
 * Courier adapter. Booking either REALLY succeeds (returns a provider shipment + AWB) or THROWS - it never fabricates a booking.
 * Simulated mode returns clearly-marked fake references for local testing; manual AWB entry (no adapter) is always available.
 *
 * Booking is two provider calls (create the order, then assign a courier/AWB). Progress is reported through `persist` after
 * each step so a failure between them can be RESUMED from the stored provider ids instead of creating a second order
 * (see services/shipment-booking.ts). Nothing here retries on its own.
 */
export interface BookingResult {
  provider: "shiprocket";
  shiprocketOrderId: string;
  awbNumber: string;
  courierName: string;
  trackingUrl: string | null;
  simulated: boolean;
}

/** What is known after each provider step; stored on the order so a retry can resume. */
export interface BookingProgress {
  state: "order_created" | "awb_assigned";
  shiprocketOrderId: string;
  shipmentId: string;
  awbNumber?: string;
  courierName?: string;
  trackingUrl?: string | null;
  simulated?: boolean;
}

/** Owner-supplied parcel assumptions (Admin > Settings > Shipping). Live booking refuses to guess them. */
export interface ParcelConfig {
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  packagingWeightGrams: number;
}

export interface BookContext {
  parcel: ParcelConfig | null;
  resume?: BookingProgress | null;
  persist?: (p: BookingProgress) => Promise<void>;
}

export interface ExistingBooking {
  shiprocketOrderId: string;
  shipmentId: string;
  /** Our order number as the provider recorded it (the channel order id). */
  channelOrderId: string;
  awbNumber: string | null;
  courierName: string | null;
}

export interface TrackingSnapshot {
  statusText: string;
  mapped: "shipped" | "out_for_delivery" | "delivered" | "exception" | null;
}

export interface ShippingProvider {
  readonly mode: "simulated" | "live";
  book(order: Order, ctx: BookContext): Promise<BookingResult>;
  /** Look up a provider order we already know the id of (used to attach a booking whose outcome was unknown). */
  fetchBooking(shiprocketOrderId: string): Promise<ExistingBooking>;
  track(awb: string): Promise<TrackingSnapshot>;
}

/** Total parcel weight in kg from item weights + owner-supplied packaging. Throws when it cannot be known. */
export function parcelWeightKg(order: Order, parcel: ParcelConfig): number {
  const grams = order.items.reduce((g, i) => g + i.weightGrams * i.quantity, 0) + parcel.packagingWeightGrams;
  if (!(grams > 0)) throw new Error("Cannot book: the order's items have no weight. Set product weights, then retry.");
  return Math.round(grams) / 1000;
}

/** Map Shiprocket status text to our canonical states. Unknown/RTO/undelivered => "exception" (flag for a human, never regress state). */
export function mapShiprocketStatus(text: string): TrackingSnapshot["mapped"] {
  const t = text.toUpperCase();
  if (/OUT FOR DELIVERY/.test(t)) return "out_for_delivery";
  if (/\bDELIVERED\b/.test(t) && !/UNDELIVERED|NOT DELIVERED|RTO/.test(t)) return "delivered";
  if (/RTO|UNDELIVERED|LOST|DAMAGED|CANCEL|NDR/.test(t)) return "exception";
  if (/PICKED UP|IN TRANSIT|SHIPPED|REACHED|DISPATCH|MANIFEST/.test(t)) return "shipped";
  return null;
}

class SimulatedShipping implements ShippingProvider {
  readonly mode = "simulated" as const;
  async book(order: Order, ctx: BookContext): Promise<BookingResult> {
    let p: BookingProgress | null = ctx.resume ?? null;
    if (!p) {
      const shipmentId = `simshp_${randomBytes(4).toString("hex")}`;
      p = { state: "order_created", shiprocketOrderId: `sim_${order.orderNumber}`, shipmentId, simulated: true };
      await col(C.simShipments).doc(p.shiprocketOrderId).set({ channelOrderId: order.orderNumber, shipmentId, awbNumber: null, courierName: null, createdAt: nowIso() });
      await ctx.persist?.(p);
    }
    if (p.state !== "awb_assigned") {
      const awb = `SIM${randomBytes(5).toString("hex").toUpperCase()}`;
      p = { ...p, state: "awb_assigned", awbNumber: awb, courierName: "Simulated Courier (not a real booking)", trackingUrl: null };
      await col(C.simShipments).doc(p.shiprocketOrderId).set({ awbNumber: awb, courierName: p.courierName }, { merge: true });
      await ctx.persist?.(p);
    }
    return { provider: "shiprocket", shiprocketOrderId: p.shiprocketOrderId, awbNumber: p.awbNumber!, courierName: p.courierName!, trackingUrl: p.trackingUrl ?? null, simulated: true };
  }
  async fetchBooking(shiprocketOrderId: string): Promise<ExistingBooking> {
    const s = await col(C.simShipments).doc(shiprocketOrderId).get();
    if (!s.exists) throw new ProviderError("Simulated shipment not found", "rejected", 404);
    const d = s.data() as { channelOrderId: string; shipmentId: string; awbNumber: string | null; courierName: string | null };
    return { shiprocketOrderId, shipmentId: d.shipmentId, channelOrderId: d.channelOrderId, awbNumber: d.awbNumber, courierName: d.courierName };
  }
  async track(): Promise<TrackingSnapshot> {
    return { statusText: "Simulated tracking", mapped: null };
  }
}

class ShiprocketShipping implements ShippingProvider {
  readonly mode = "live" as const;
  private token: { value: string; at: number } | null = null;
  private async auth(): Promise<string> {
    if (this.token && Date.now() - this.token.at < 8 * 24 * 3600_000) return this.token.value;
    const c = requireConfigured("Shiprocket", "SHIPROCKET_EMAIL", "SHIPROCKET_PASSWORD");
    const r = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: c.SHIPROCKET_EMAIL, password: c.SHIPROCKET_PASSWORD }), signal: AbortSignal.timeout(15_000) });
    const j = (await r.json().catch(() => ({}))) as { token?: string };
    if (!r.ok || !j.token) throw new ProviderError("Shiprocket login failed - check the API user credentials.", "rejected", r.status);
    this.token = { value: j.token, at: Date.now() };
    return j.token;
  }
  private async call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const token = await this.auth();
    let r: Response;
    let text: string;
    try {
      r = await fetch(`https://apiv2.shiprocket.in/v1/external${path}`, {
        method: init?.method ?? "GET",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: init?.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      text = await r.text();
    } catch (e) {
      // Timeout / dropped connection: the call may or may not have been processed.
      throw new ProviderError(`Shiprocket ${path} did not complete: ${e instanceof Error ? e.message : "network error"}`, "unknown");
    }
    let j: unknown = null;
    try {
      j = JSON.parse(text);
    } catch {
      j = null;
    }
    if (!r.ok) throw new ProviderError(`Shiprocket ${path} failed: ${(j as { message?: string } | null)?.message ?? r.status}`, classifyHttpFailure(r.status, j), r.status);
    if (j === null) throw new ProviderError(`Shiprocket ${path} returned an unreadable body`, "unknown", r.status);
    return j as T;
  }
  async book(order: Order, ctx: BookContext): Promise<BookingResult> {
    const pickup = env().SHIPROCKET_PICKUP_LOCATION;
    if (!pickup) throw new ProviderError("SHIPROCKET_PICKUP_LOCATION is not configured (the pickup location name from your Shiprocket account).", "rejected");
    if (!ctx.parcel) throw new ProviderError("Parcel dimensions are not set. Enter the standard parcel length, breadth and height in Admin > Settings > Shipping before booking with Shiprocket (or enter the AWB manually).", "rejected");
    let p: BookingProgress | null = ctx.resume ?? null;
    if (!p) {
      const a = order.shippingAddress;
      const [first, ...rest] = a.fullName.split(" ");
      const created = await this.call<{ order_id?: number; shipment_id?: number }>("/orders/create/adhoc", {
        method: "POST",
        body: {
          order_id: order.orderNumber,
          order_date: new Date(order.placedAt).toISOString().slice(0, 16).replace("T", " "),
          pickup_location: pickup,
          billing_customer_name: first,
          billing_last_name: rest.join(" "),
          billing_address: a.line1,
          billing_address_2: a.line2,
          billing_city: a.city,
          billing_pincode: a.pincode,
          billing_state: a.state,
          billing_country: "India",
          billing_email: order.contact.email,
          billing_phone: a.phone.replace(/^\+91/, ""),
          shipping_is_billing: true,
          order_items: order.items.map((i) => ({ name: i.nameSnapshot, sku: i.sku, units: i.quantity, selling_price: i.unitPrice / 100 })),
          payment_method: order.paymentMethod === "cod" ? "COD" : "Prepaid",
          sub_total: order.pricing.total / 100,
          length: ctx.parcel.lengthCm,
          breadth: ctx.parcel.breadthCm,
          height: ctx.parcel.heightCm,
          weight: parcelWeightKg(order, ctx.parcel),
        },
      });
      // A 2xx without a shipment id does not prove nothing was created: report it as unknown, never as "not booked".
      if (!created.shipment_id) throw new ProviderError("Shiprocket answered without a shipment id; whether an order was created is unknown.", "unknown");
      p = { state: "order_created", shiprocketOrderId: String(created.order_id ?? created.shipment_id), shipmentId: String(created.shipment_id) };
      await ctx.persist?.(p);
    }
    if (p.state !== "awb_assigned") {
      const awb = await this.call<{ response?: { data?: { awb_code?: string; courier_name?: string } } }>("/courier/assign/awb", { method: "POST", body: { shipment_id: Number(p.shipmentId) || p.shipmentId } });
      const data = awb.response?.data;
      if (!data?.awb_code) throw new Error(`Shiprocket order ${p.shiprocketOrderId} exists but no AWB was assigned. Retry to resume from this step, or assign a courier in the Shiprocket panel and enter the AWB manually.`);
      p = { ...p, state: "awb_assigned", awbNumber: data.awb_code, courierName: data.courier_name ?? "Courier", trackingUrl: `https://shiprocket.co/tracking/${data.awb_code}` };
      await ctx.persist?.(p);
    }
    return { provider: "shiprocket", shiprocketOrderId: p.shiprocketOrderId, awbNumber: p.awbNumber!, courierName: p.courierName ?? "Courier", trackingUrl: p.trackingUrl ?? null, simulated: false };
  }
  /**
   * Fetch an order by Shiprocket's id. NOTE: this endpoint and its response shape come from Shiprocket's public documentation and
   * have NOT been exercised against a real account - verify in a Shiprocket sandbox/staging account before relying on it (docs/DEPLOYMENT.md).
   */
  async fetchBooking(shiprocketOrderId: string): Promise<ExistingBooking> {
    const j = await this.call<{ data?: { id?: number; channel_order_id?: string; shipments?: { id?: number; awb?: string | null; courier?: string | null } | { id?: number; awb?: string | null; courier?: string | null }[] } }>(`/orders/show/${encodeURIComponent(shiprocketOrderId)}`);
    const d = j.data;
    const ship = Array.isArray(d?.shipments) ? d?.shipments[0] : d?.shipments;
    if (!d?.id || !d.channel_order_id || !ship?.id) throw new ProviderError("Shiprocket returned an order we cannot read (missing ids).", "unknown");
    return { shiprocketOrderId: String(d.id), shipmentId: String(ship.id), channelOrderId: d.channel_order_id, awbNumber: ship.awb ?? null, courierName: ship.courier ?? null };
  }
  async track(awb: string): Promise<TrackingSnapshot> {
    const j = await this.call<{ tracking_data?: { shipment_track?: { current_status?: string }[] } }>(`/courier/track/awb/${encodeURIComponent(awb)}`);
    const text = j.tracking_data?.shipment_track?.[0]?.current_status ?? "";
    return { statusText: text, mapped: mapShiprocketStatus(text) };
  }
}

let sim: SimulatedShipping | null = null;
let live: ShiprocketShipping | null = null;
export function shipping(): ShippingProvider {
  return isSimulated() ? (sim ??= new SimulatedShipping()) : (live ??= new ShiprocketShipping());
}
