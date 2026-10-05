import "server-only";
import { db } from "../firebase/admin";
import { addTimeline, orderFromDoc, orderRef } from "./order-core";
import { auditInTx } from "./audit";
import { shipping, type BookingProgress, type BookingResult, type ParcelConfig } from "../providers/shipping";
import { ProviderError } from "../providers/errors";
import { getPrivateSettings } from "../repos/settings";
import { badRequest, conflict, notFound } from "../http";
import { nowIso } from "../repos/common";
import type { Order } from "@/domain/types";

/**
 * Courier booking with durable provider identity.
 *
 * A Shiprocket booking is two provider calls: create the order, then assign a courier/AWB. The state machine below is persisted at
 * orders/{id}/shipmentBookings/current so that no failure can lead to a SECOND order being created blindly:
 *
 *   (none) -> intent --create ok--> order_created --assign ok--> awb_assigned --(order marked shipped)--> shipped
 *
 *  - `intent`        a create call was started. If its outcome is unknown (timeout / 5xx / crash) the record STAYS here and further
 *                    booking is refused: a provider order may exist. Staff either enter the AWB manually, or attach the existing
 *                    provider order by id (verified: its channel order id must be this order's number).
 *  - `order_created` the provider order id and shipment id are stored. A retry RESUMES at the AWB step; it never creates another order.
 *  - `awb_assigned`  the AWB is stored. A retry just finishes marking the order shipped, without calling the provider.
 *  - A definitive provider rejection of the create call (a structured 4xx) proves nothing was created, so the record is removed and the
 *    booking can simply be tried again.
 */
export type BookingDocState = "intent" | "order_created" | "awb_assigned";

export interface BookingDoc {
  state: BookingDocState;
  channelOrderId: string;
  attempt: number;
  startedAt: string;
  startedBy: string;
  updatedAt: string;
  /** Another request is mid-flight until this time; guards double clicks and concurrent admins. */
  inFlightUntil: string | null;
  lastError: string | null;
  shiprocketOrderId?: string;
  shipmentId?: string;
  awbNumber?: string;
  courierName?: string;
  trackingUrl?: string | null;
  simulated?: boolean;
  /** Set when staff entered the AWB manually instead. */
  manualOverride?: boolean;
}

const bookingRef = (orderId: string) => orderRef(orderId).collection("shipmentBookings").doc("current");
const IN_FLIGHT_MS = 45_000;

export async function getBooking(orderId: string): Promise<BookingDoc | null> {
  const s = await bookingRef(orderId).get();
  return s.exists ? (s.data() as BookingDoc) : null;
}

export function parcelFrom(p: { shipping: { parcel: { lengthCm: number; breadthCm: number; heightCm: number } | null; packagingWeightGrams: number } }): ParcelConfig | null {
  const x = p.shipping.parcel;
  return x ? { lengthCm: x.lengthCm, breadthCm: x.breadthCm, heightCm: x.heightCm, packagingWeightGrams: p.shipping.packagingWeightGrams } : null;
}

const toResult = (b: BookingDoc): BookingResult => ({ provider: "shiprocket", shiprocketOrderId: b.shiprocketOrderId!, awbNumber: b.awbNumber!, courierName: b.courierName ?? "Courier", trackingUrl: b.trackingUrl ?? null, simulated: Boolean(b.simulated) });

export async function bookWithRecovery(order: Order, actor: string): Promise<BookingResult> {
  const parcel = parcelFrom(await getPrivateSettings());
  const provider = shipping();
  const ref = bookingRef(order.id);

  // Claim the booking (or resume it) atomically.
  const claim = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const now = nowIso();
    const lock = new Date(Date.now() + IN_FLIGHT_MS).toISOString();
    if (!s.exists) {
      const d: BookingDoc = { state: "intent", channelOrderId: order.orderNumber, attempt: 1, startedAt: now, startedBy: actor, updatedAt: now, inFlightUntil: lock, lastError: null };
      tx.create(ref, d);
      return { mode: "fresh" as const, doc: d };
    }
    const d = s.data() as BookingDoc;
    if (d.state === "awb_assigned") return { mode: "done" as const, doc: d };
    if (d.inFlightUntil && d.inFlightUntil > now) throw conflict("BOOKING_IN_PROGRESS", "A courier booking for this order is already in progress. Wait a moment and reload.");
    if (d.state === "intent") {
      throw conflict(
        "BOOKING_UNCERTAIN",
        `A previous Shiprocket booking attempt for ${order.orderNumber} did not finish and its outcome is unknown, so a Shiprocket order may already exist. Search Shiprocket for ${order.orderNumber}. If it exists, attach it by its order id; otherwise ship manually with an AWB. Booking again is blocked to avoid a duplicate shipment.`,
      );
    }
    tx.update(ref, { attempt: d.attempt + 1, inFlightUntil: lock, updatedAt: now, lastError: null });
    return { mode: "resume" as const, doc: d };
  });
  if (claim.mode === "done") return toResult(claim.doc);

  const persist = async (p: BookingProgress) => {
    await ref.update({ state: p.state, shiprocketOrderId: p.shiprocketOrderId, shipmentId: p.shipmentId, awbNumber: p.awbNumber ?? null, courierName: p.courierName ?? null, trackingUrl: p.trackingUrl ?? null, simulated: Boolean(p.simulated), updatedAt: nowIso() });
  };
  const resume: BookingProgress | null =
    claim.mode === "resume" && claim.doc.shiprocketOrderId && claim.doc.shipmentId ? { state: "order_created", shiprocketOrderId: claim.doc.shiprocketOrderId, shipmentId: claim.doc.shipmentId, simulated: claim.doc.simulated } : null;

  try {
    const result = await provider.book(order, { parcel, resume, persist });
    await ref.update({ inFlightUntil: null, updatedAt: nowIso(), lastError: null });
    return result;
  } catch (e) {
    const cur = (await ref.get()).data() as BookingDoc | undefined;
    const msg = e instanceof Error ? e.message.slice(0, 300) : "Booking failed";
    const definite = e instanceof ProviderError && e.kind === "rejected";
    if (cur && cur.state === "awb_assigned") {
      // The booking completed and was stored; the failure came afterwards. Nothing to redo - use what was stored.
      await ref.update({ inFlightUntil: null, updatedAt: nowIso() });
      return toResult(cur);
    }
    if (cur && cur.state === "intent") {
      if (definite || !(e instanceof ProviderError)) {
        // Nothing was created (a definitive refusal, or a failure on our side before any provider call): clean slate.
        await ref.delete();
        if (e instanceof ProviderError) throw badRequest(`Shiprocket refused the booking: ${msg}. Nothing was created, so you can fix the problem and try again.`);
        throw e;
      }
      await ref.update({ inFlightUntil: null, lastError: msg, updatedAt: nowIso() });
      await flagBookingUncertain(order.id, actor, msg);
      throw conflict("BOOKING_UNCERTAIN", `The Shiprocket booking for ${order.orderNumber} ended without a confirmed result (${msg}). A Shiprocket order may exist. It is now locked: search Shiprocket for ${order.orderNumber} and attach it by order id, or ship manually with an AWB.`);
    }
    // order_created: the provider order is known; keep it so the next try resumes at the AWB step.
    await ref.update({ inFlightUntil: null, lastError: msg, updatedAt: nowIso() });
    throw conflict("BOOKING_PARTIAL", `Shiprocket created order ${cur?.shiprocketOrderId ?? ""} but the courier/AWB step failed: ${msg}. Try again to resume from the AWB step (no second order will be created), or assign a courier in Shiprocket and enter the AWB manually.`);
  }
}

async function flagBookingUncertain(orderId: string, actor: string, msg: string): Promise<void> {
  await db().runTransaction(async (tx) => {
    const o = orderFromDoc(await tx.get(orderRef(orderId)));
    tx.update(orderRef(orderId), { needsReview: true, updatedAt: nowIso(), version: o.version + 1 });
    addTimeline(tx, orderId, { type: "shipment.booking_uncertain", label: "Courier booking outcome unknown - check Shiprocket before booking again", detail: msg.slice(0, 200), customerVisible: false, actor });
    auditInTx(tx, actor, "shipment.booking_uncertain", orderId, { error: msg.slice(0, 200) });
  });
}

/**
 * Attach a Shiprocket order that already exists (typically after an `intent` whose outcome was unknown). The provider is asked for the
 * order and it must carry THIS order's number as its channel order id; ids are stored and booking continues from the stored state.
 */
export async function attachBooking(orderId: string, shiprocketOrderId: string, actor: string): Promise<Order> {
  const order = orderFromDoc(await orderRef(orderId).get());
  if (!order.id) throw notFound("Order not found.");
  if (!["processing", "confirmed"].includes(order.status)) throw conflict("BAD_STATE", "A courier booking can only be attached before the order is shipped.");
  const id = shiprocketOrderId.trim();
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(id)) throw badRequest("Enter the Shiprocket order id exactly as shown in the Shiprocket panel.");
  let found;
  try {
    found = await shipping().fetchBooking(id);
  } catch (e) {
    if (e instanceof ProviderError && e.kind === "rejected") throw conflict("PROVIDER_MISMATCH", "Shiprocket does not know an order with that id.");
    throw conflict("PROVIDER_UNAVAILABLE", "Shiprocket could not be reached to verify that order. Try again shortly.");
  }
  if (found.channelOrderId !== order.orderNumber) throw conflict("PROVIDER_MISMATCH", `That Shiprocket order belongs to ${found.channelOrderId}, not ${order.orderNumber}. Nothing was attached.`);
  await db().runTransaction(async (tx) => {
    const s = await tx.get(bookingRef(orderId));
    const cur = s.exists ? (s.data() as BookingDoc) : null;
    if (cur?.state === "awb_assigned") throw conflict("ALREADY_BOOKED", "This order already has a booking with an AWB.");
    if (cur?.inFlightUntil && cur.inFlightUntil > nowIso()) throw conflict("BOOKING_IN_PROGRESS", "A booking for this order is in progress.");
    const now = nowIso();
    const doc: BookingDoc = {
      state: found.awbNumber ? "awb_assigned" : "order_created",
      channelOrderId: order.orderNumber,
      attempt: (cur?.attempt ?? 0) + 1,
      startedAt: cur?.startedAt ?? now,
      startedBy: cur?.startedBy ?? actor,
      updatedAt: now,
      inFlightUntil: null,
      lastError: null,
      shiprocketOrderId: found.shiprocketOrderId,
      shipmentId: found.shipmentId,
      ...(found.awbNumber ? { awbNumber: found.awbNumber, courierName: found.courierName ?? "Courier", trackingUrl: `https://shiprocket.co/tracking/${found.awbNumber}` } : {}),
    };
    tx.set(bookingRef(orderId), doc);
    addTimeline(tx, orderId, { type: "shipment.booking_attached", label: "Existing Shiprocket order attached", detail: `${found.shiprocketOrderId}${found.awbNumber ? ` - AWB ${found.awbNumber}` : " (no AWB yet)"}`, customerVisible: false, actor });
    auditInTx(tx, actor, "shipment.booking_attach", orderId, { shiprocketOrderId: found.shiprocketOrderId, awb: found.awbNumber });
  });
  return orderFromDoc(await orderRef(orderId).get());
}

/** Staff entered the AWB manually: remember that any stored provider booking was bypassed on purpose. */
export async function markManualOverride(orderId: string): Promise<void> {
  const r = bookingRef(orderId);
  if ((await r.get()).exists) await r.update({ manualOverride: true, inFlightUntil: null, updatedAt: nowIso() });
}
