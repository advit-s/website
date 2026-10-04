import "server-only";
import { randomBytes } from "node:crypto";
import { env, isSimulated, requireConfigured } from "../env";
import type { Order } from "@/domain/types";

/**
 * Courier adapter. Booking either REALLY succeeds (returns a provider shipment + AWB) or THROWS - it never fabricates a booking.
 * Simulated mode returns clearly-marked fake references for local testing; manual AWB entry (no adapter) is always available.
 */
export interface BookingResult {
  provider: "shiprocket";
  shiprocketOrderId: string;
  awbNumber: string;
  courierName: string;
  trackingUrl: string | null;
  simulated: boolean;
}
export interface TrackingSnapshot {
  statusText: string;
  mapped: "shipped" | "out_for_delivery" | "delivered" | "exception" | null;
}

export interface ShippingProvider {
  readonly mode: "simulated" | "live";
  book(order: Order): Promise<BookingResult>;
  track(awb: string): Promise<TrackingSnapshot>;
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
  async book(order: Order): Promise<BookingResult> {
    const awb = `SIM${randomBytes(5).toString("hex").toUpperCase()}`;
    return { provider: "shiprocket", shiprocketOrderId: `sim_${order.orderNumber}`, awbNumber: awb, courierName: "Simulated Courier (not a real booking)", trackingUrl: null, simulated: true };
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
    if (!r.ok || !j.token) throw new Error("Shiprocket login failed - check the API user credentials.");
    this.token = { value: j.token, at: Date.now() };
    return j.token;
  }
  private async call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const token = await this.auth();
    const r = await fetch(`https://apiv2.shiprocket.in/v1/external${path}`, {
      method: init?.method ?? "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const j = (await r.json().catch(() => ({}))) as T & { message?: string };
    if (!r.ok) throw new Error(`Shiprocket ${path} failed: ${(j as { message?: string }).message ?? r.status}`);
    return j;
  }
  async book(order: Order): Promise<BookingResult> {
    const pickup = env().SHIPROCKET_PICKUP_LOCATION;
    if (!pickup) throw new Error("SHIPROCKET_PICKUP_LOCATION is not configured (the pickup location name from your Shiprocket account).");
    const a = order.shippingAddress;
    const [first, ...rest] = a.fullName.split(" ");
    const kg = Math.max(0.5, order.items.reduce((g, i) => g + i.weightGrams * i.quantity, 0) / 1000);
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
        length: 40,
        breadth: 30,
        height: 10,
        weight: kg,
      },
    });
    if (!created.shipment_id) throw new Error("Shiprocket did not return a shipment id - the booking was NOT made.");
    const awb = await this.call<{ response?: { data?: { awb_code?: string; courier_name?: string } } }>("/courier/assign/awb", { method: "POST", body: { shipment_id: created.shipment_id } });
    const data = awb.response?.data;
    if (!data?.awb_code) throw new Error("Shiprocket created the order but did not assign an AWB. Assign a courier in the Shiprocket panel and enter the AWB manually.");
    return { provider: "shiprocket", shiprocketOrderId: String(created.order_id ?? created.shipment_id), awbNumber: data.awb_code, courierName: data.courier_name ?? "Courier", trackingUrl: `https://shiprocket.co/tracking/${data.awb_code}`, simulated: false };
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
