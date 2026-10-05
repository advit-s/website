import "server-only";
import { FieldPath } from "firebase-admin/firestore";
import { C, col, decodeCursor, encodeCursor, newId, nowIso } from "../repos/common";
import { db } from "../firebase/admin";
import { addTimeline, getTimeline, orderFromDoc, orderRef } from "./order-core";
import { applyStock, readVariants, type StockLine } from "./stock";
import { enqueueNotification } from "./notifications";
import { cancelOrder } from "./order-actions";
import { attachBooking, bookWithRecovery, markManualOverride } from "./shipment-booking";
import { audit, auditInTx } from "./audit";
import { reconcileRefund, attestRefundNotCreated, refundPatch } from "./refunds";
import { EXCEPTION_BLOCK, hasUnresolvedException, hasUnresolvedExceptionNow, reconcileExceptionManually, requestExceptionRefund, reviewBlockers } from "./payment-exceptions";
import { refundable as refundableAmount } from "@/domain/refunds";
import { invalidate } from "../cache";
import { badRequest, conflict, notFound } from "../http";
import { canTransition, matchesQueueTab, STATUS_LABEL, type QueueTab } from "@/domain/order-state";
import { normalizeIndianPhone } from "@/domain/validation";
import type { FulfilmentStatus, Order, RefundRecord, TimelineEvent } from "@/domain/types";

/* ------------------------------------------------------------------ queue */

const TAB_STATUS: Partial<Record<QueueTab, FulfilmentStatus[]>> = {
  pending: ["new"],
  processing: ["confirmed", "processing"],
  shipped: ["shipped", "out_for_delivery"],
  delivered: ["delivered"],
  cancelled: ["cancelled"],
};

/**
 * One order queue. Tabs are indexed filters on status / returnStatus ordered by placedAt with an id tiebreak, cursor-paginated.
 * Search is by order number, exact email or exact phone (indexed equality), then tab-filtered in memory (<= 25 matches).
 */
export async function listAdminOrders(opts: { tab: QueueTab; q?: string; cursor?: string | null; limit?: number }): Promise<{ orders: Order[]; nextCursor: string | null; searchNote: string | null }> {
  const limit = opts.limit ?? 20;
  const term = (opts.q ?? "").trim();
  if (term) {
    let q: FirebaseFirestore.Query | null = null;
    let note: string | null = null;
    if (/^RRC-\d+$/i.test(term)) q = col(C.orders).where("orderNumber", "==", term.toUpperCase());
    else if (term.includes("@")) q = col(C.orders).where("contact.email", "==", term.toLowerCase());
    else if (normalizeIndianPhone(term)) q = col(C.orders).where("contact.phone", "==", normalizeIndianPhone(term));
    else note = "Search by order number (RRC-1042), exact email, or a 10-digit phone number.";
    if (!q) return { orders: [], nextCursor: null, searchNote: note };
    const snap = await q.limit(25).get();
    const orders = snap.docs.map(orderFromDoc).filter((o) => matchesQueueTab(opts.tab, o)).sort((a, b) => b.placedAt.localeCompare(a.placedAt));
    return { orders, nextCursor: null, searchNote: null };
  }
  let q: FirebaseFirestore.Query = col(C.orders);
  if (opts.tab === "returns") q = q.where("returnStatus", "in", ["requested", "approved", "received", "refund_pending"]);
  else if (TAB_STATUS[opts.tab]) q = q.where("status", "in", TAB_STATUS[opts.tab]!);
  q = q.orderBy("placedAt", "desc").orderBy(FieldPath.documentId(), "desc");
  const c = decodeCursor(opts.cursor);
  if (c) q = q.startAfter(c.value, c.id);
  const snap = await q.limit(limit + 1).get();
  const all = snap.docs.map(orderFromDoc);
  const orders = all.slice(0, limit);
  return { orders, nextCursor: all.length > limit && orders.length ? encodeCursor(orders.at(-1)!.placedAt, orders.at(-1)!.id) : null, searchNote: null };
}

export interface AdminOrderDetail {
  order: Order;
  timeline: TimelineEvent[];
  notes: { id: string; text: string; by: string; at: string }[];
  returns: { id: string; reason: string; at: string; status: string; disposition?: string }[];
}

export async function getAdminOrder(id: string): Promise<AdminOrderDetail | null> {
  const snap = await orderRef(id).get();
  if (!snap.exists) return null;
  const [timeline, notes, returns] = await Promise.all([
    getTimeline(id, false),
    orderRef(id).collection("notes").orderBy("at", "desc").limit(50).get(),
    orderRef(id).collection("returns").orderBy("requestedAt", "desc").limit(10).get(),
  ]);
  return {
    order: orderFromDoc(snap),
    timeline,
    notes: notes.docs.map((d) => ({ id: d.id, ...(d.data() as { text: string; by: string; at: string }) })),
    returns: returns.docs.map((d) => {
      const x = d.data() as { reason: string; requestedAt: string; status: string; disposition?: string };
      return { id: d.id, reason: x.reason, at: x.requestedAt, status: x.status, disposition: x.disposition };
    }),
  };
}

/* ------------------------------------------------------------------ actions */

export type OrderAction =
  | { type: "confirm" }
  | { type: "start_processing" }
  | { type: "ship"; mode: "shiprocket" | "manual"; courierName?: string; awbNumber?: string; trackingUrl?: string }
  | { type: "out_for_delivery" }
  | { type: "deliver"; codCollected?: boolean }
  | { type: "collect_cod" }
  | { type: "cancel"; reason: string }
  | { type: "note"; text: string }
  | { type: "refund_request"; amount: number; reason: string }
  | { type: "cod_refund_record"; refundId: string; reference: string }
  | { type: "exception_refund"; exceptionId: string }
  | { type: "exception_reconcile"; exceptionId: string; note: string }
  | { type: "booking_attach"; shiprocketOrderId: string }
  | { type: "refund_reconcile"; refundId: string }
  | { type: "refund_attest_absent"; refundId: string; note: string }
  | { type: "return_decision"; decision: "approve" | "reject"; note?: string }
  | { type: "return_received"; disposition: "restock" | "discard" }
  | { type: "return_close" }
  | { type: "custom_quote"; quotedTotal: number | null; leadTimeDays: number | null; advancePaid: number; productionState: "enquiry" | "quoted" | "in_production" | "ready" }
  | { type: "clear_review" };

const notifyStatus = (o: Order, status: FulfilmentStatus, detail?: string) =>
  enqueueNotification({ kind: "order.status", to: { email: o.contact.email, phone: o.contact.phone }, data: { orderNumber: o.orderNumber, statusLabel: STATUS_LABEL[status], detail: detail ?? "" }, dedupeKey: `status_${o.id}_${status}` });

/** Every admin mutation of an order goes through here: state guards, timeline (customer-visible where appropriate), audit entry. */
export async function applyOrderAction(orderId: string, action: OrderAction, actor: string): Promise<Order> {
  switch (action.type) {
    case "confirm":
    case "start_processing":
    case "out_for_delivery":
      return transition(orderId, action.type === "confirm" ? "confirmed" : action.type === "start_processing" ? "processing" : "out_for_delivery", actor);
    case "ship":
      return ship(orderId, action, actor);
    case "deliver":
      return deliver(orderId, action.codCollected ?? true, actor);
    case "collect_cod":
      return collectCod(orderId, actor);
    case "cancel": {
      const o = await cancelOrder(orderId, { id: actor, kind: "admin" }, action.reason);
      await audit(actor, "order.cancel", orderId, { reason: action.reason });
      return o;
    }
    case "note": {
      await orderRef(orderId).collection("notes").doc(newId("nt_")).set({ text: action.text.slice(0, 1000), by: actor, at: nowIso() });
      await audit(actor, "order.note", orderId);
      return orderFromDoc(await orderRef(orderId).get());
    }
    case "refund_request":
      return requestRefund(orderId, action.amount, action.reason, actor);
    case "cod_refund_record":
      return recordCodRefund(orderId, action.refundId, action.reference, actor);
    case "exception_refund":
      return requestExceptionRefund(orderId, action.exceptionId, actor);
    case "exception_reconcile":
      return reconcileExceptionManually(orderId, action.exceptionId, actor, action.note);
    case "booking_attach":
      return attachBooking(orderId, action.shiprocketOrderId, actor);
    case "refund_reconcile": {
      const rep = await reconcileRefund(orderId, action.refundId, actor);
      if (rep.outcome === "not_pending") throw conflict("NOT_PENDING", rep.detail);
      return orderFromDoc(await orderRef(orderId).get());
    }
    case "refund_attest_absent":
      return attestRefundNotCreated(orderId, action.refundId, actor, action.note);
    case "return_decision":
      return returnDecision(orderId, action.decision, action.note, actor);
    case "return_received":
      return returnReceived(orderId, action.disposition, actor);
    case "return_close":
      return simpleUpdate(orderId, actor, "return.close", (o) => {
        if (!["received", "refund_pending", "rejected"].includes(o.returnStatus)) throw conflict("BAD_STATE", "This return cannot be closed yet.");
        return { patch: { returnStatus: "closed" }, label: "Return closed", visible: true };
      });
    case "custom_quote":
      return simpleUpdate(orderId, actor, "order.custom_quote", (o) => {
        if (!o.hasCustomItems) throw badRequest("This order has no made-to-order items.");
        return {
          patch: { custom: { quotedTotal: action.quotedTotal, advancePaid: action.advancePaid, leadTimeDays: action.leadTimeDays, productionState: action.productionState } },
          label: action.productionState === "quoted" ? "Quotation agreed" : action.productionState === "in_production" ? "Production started" : action.productionState === "ready" ? "Ready to ship" : "Custom order updated",
          visible: true,
        };
      });
    case "clear_review": {
      // A generic "clear" must never erase an unresolved money problem.
      const blocked = await reviewBlockers(orderId);
      if (blocked) throw conflict("REVIEW_BLOCKED", blocked);
      return simpleUpdate(orderId, actor, "order.clear_review", (o) => {
        if (o.payment.refunds.some((r) => r.state === "processing")) throw conflict("REVIEW_BLOCKED", "A refund is still processing or awaiting reconciliation.");
        return { patch: { needsReview: false }, label: "Review cleared", visible: false };
      });
    }
  }
}

async function simpleUpdate(orderId: string, actor: string, auditAction: string, fn: (o: Order) => { patch: Record<string, unknown>; label: string; visible: boolean; detail?: string }): Promise<Order> {
  await db().runTransaction(async (tx) => {
    const o = orderFromDoc(await tx.get(orderRef(orderId)));
    const r = fn(o);
    tx.update(orderRef(orderId), { ...r.patch, updatedAt: nowIso(), version: o.version + 1 });
    addTimeline(tx, orderId, { type: auditAction, label: r.label, detail: r.detail ?? null, customerVisible: r.visible, actor });
    auditInTx(tx, actor, auditAction, orderId, r.patch);
  });
  return orderFromDoc(await orderRef(orderId).get());
}

async function transition(orderId: string, to: FulfilmentStatus, actor: string): Promise<Order> {
  const before = await db().runTransaction(async (tx) => {
    const o = orderFromDoc(await tx.get(orderRef(orderId)));
    if (!canTransition(o.status, to)) throw conflict("BAD_TRANSITION", `An order that is ${STATUS_LABEL[o.status].toLowerCase()} cannot move to ${STATUS_LABEL[to].toLowerCase()}.`);
    if (to === "confirmed" && o.paymentMethod === "razorpay" && o.paymentStatus !== "paid") throw conflict("UNPAID", "This prepaid order has not been paid yet, so it cannot be confirmed.");
    if ((to === "confirmed" || to === "processing") && (await hasUnresolvedException(tx, orderId))) throw conflict("PAYMENT_EXCEPTION", EXCEPTION_BLOCK);
    if (to === "confirmed" && o.needsReview) throw conflict("NEEDS_REVIEW", "This order is flagged for review. Resolve the flag first.");
    tx.update(orderRef(orderId), { status: to, updatedAt: nowIso(), version: o.version + 1 });
    addTimeline(tx, orderId, { type: `status.${to}`, label: STATUS_LABEL[to], detail: null, customerVisible: true, actor });
    auditInTx(tx, actor, `order.${to}`, orderId, { from: o.status });
    return o;
  });
  await notifyStatus(before, to);
  return orderFromDoc(await orderRef(orderId).get());
}

async function ship(orderId: string, a: Extract<OrderAction, { type: "ship" }>, actor: string): Promise<Order> {
  const order = orderFromDoc(await orderRef(orderId).get());
  if (!order.id) throw notFound("Order not found.");
  if (!canTransition(order.status, "shipped")) throw conflict("BAD_TRANSITION", "Only an order that is Processing can be shipped.");
  // Checked before any courier booking so a blocked order never creates an external shipment.
  if (await hasUnresolvedExceptionNow(orderId)) throw conflict("PAYMENT_EXCEPTION", EXCEPTION_BLOCK);
  let info: { provider: "shiprocket" | "manual"; shiprocketOrderId: string | null; awb: string; courier: string; url: string | null; simulated: boolean };
  if (a.mode === "shiprocket") {
    // The provider is called OUTSIDE any transaction, with its progress persisted step by step (shipment-booking.ts), so a failure
    // can be resumed or attached but never re-booked blindly. If it fails, the order itself is unchanged and the real error is shown.
    const b = await bookWithRecovery(order, actor);
    info = { provider: "shiprocket", shiprocketOrderId: b.shiprocketOrderId, awb: b.awbNumber, courier: b.courierName, url: b.trackingUrl, simulated: b.simulated };
  } else {
    if (!a.courierName?.trim() || !a.awbNumber?.trim()) throw badRequest("Enter the courier name and the AWB / tracking number for a manual booking.");
    if (a.trackingUrl && !/^https:\/\//.test(a.trackingUrl)) throw badRequest("The tracking link must start with https://");
    info = { provider: "manual", shiprocketOrderId: null, awb: a.awbNumber.trim().slice(0, 60), courier: a.courierName.trim().slice(0, 60), url: a.trackingUrl?.trim() || null, simulated: false };
  }
  await db().runTransaction(async (tx) => {
    const o = orderFromDoc(await tx.get(orderRef(orderId)));
    if (!canTransition(o.status, "shipped")) throw conflict("BAD_TRANSITION", "The order changed while booking. Reload and check its state.");
    if (await hasUnresolvedException(tx, orderId)) throw conflict("PAYMENT_EXCEPTION", EXCEPTION_BLOCK);
    const now = nowIso();
    tx.update(orderRef(orderId), {
      status: "shipped",
      "shipment.provider": info.provider,
      "shipment.shiprocketOrderId": info.shiprocketOrderId,
      "shipment.awbNumber": info.awb,
      "shipment.courierName": info.courier,
      "shipment.trackingUrl": info.url,
      "shipment.shippedAt": now,
      updatedAt: now,
      version: o.version + 1,
    });
    addTimeline(tx, orderId, { type: "status.shipped", label: "Shipped", detail: `${info.courier} - AWB ${info.awb}${info.simulated ? " (simulated booking)" : ""}`, customerVisible: true, actor });
    auditInTx(tx, actor, "order.ship", orderId, { provider: info.provider, awb: info.awb, simulated: info.simulated });
  });
  if (info.provider === "manual") await markManualOverride(orderId);
  await notifyStatus(order, "shipped", `${info.courier}, AWB ${info.awb}`);
  return orderFromDoc(await orderRef(orderId).get());
}

async function deliver(orderId: string, codCollected: boolean, actor: string): Promise<Order> {
  const before = await db().runTransaction(async (tx) => {
    const o = orderFromDoc(await tx.get(orderRef(orderId)));
    if (!canTransition(o.status, "delivered")) throw conflict("BAD_TRANSITION", "Only a shipped order can be marked delivered.");
    const now = nowIso();
    const collect = o.paymentMethod === "cod" && o.paymentStatus === "pending" && codCollected;
    tx.update(orderRef(orderId), { status: "delivered", "shipment.deliveredAt": now, ...(collect ? { paymentStatus: "paid", "payment.capturedAt": now } : {}), updatedAt: now, version: o.version + 1 });
    addTimeline(tx, orderId, { type: "status.delivered", label: "Delivered", detail: null, customerVisible: true, actor });
    if (collect) addTimeline(tx, orderId, { type: "payment.cod_collected", label: "Cash on delivery collected", detail: null, customerVisible: false, actor });
    auditInTx(tx, actor, "order.deliver", orderId, { codCollected: collect });
    return o;
  });
  await notifyStatus(before, "delivered");
  return orderFromDoc(await orderRef(orderId).get());
}

async function collectCod(orderId: string, actor: string): Promise<Order> {
  return simpleUpdate(orderId, actor, "order.cod_collected", (o) => {
    if (o.paymentMethod !== "cod" || o.paymentStatus !== "pending") throw conflict("BAD_STATE", "This is not an uncollected cash-on-delivery order.");
    if (o.status === "cancelled") throw conflict("BAD_STATE", "A cancelled order has no cash to collect.");
    return { patch: { paymentStatus: "paid", "payment.capturedAt": nowIso() }, label: "Cash on delivery collected", visible: false };
  });
}

/* ------------------------------------------------------------------ refunds */

async function requestRefund(orderId: string, amount: number, reason: string, actor: string): Promise<Order> {
  if (!Number.isInteger(amount) || amount <= 0) throw badRequest("Enter a refund amount greater than zero.");
  if (reason.trim().length < 3) throw badRequest("Give a reason for the refund.");
  return simpleUpdate(orderId, actor, "refund.request", (o) => {
    if (!["paid", "partially_refunded"].includes(o.paymentStatus)) throw conflict("NOT_PAID", "Only a paid order can be refunded.");
    const refundable = refundableAmount(o.pricing.total, o.payment.refunds);
    if (amount > refundable) throw conflict("OVER_REFUND", `At most ${(refundable / 100).toFixed(2)} INR can still be refunded on this order.`);
    const id = newId("rf_");
    const rec: RefundRecord = { id, amount, state: "requested", reason: reason.slice(0, 200), providerRefundId: null, reference: null, requestedBy: actor, requestedAt: nowIso(), updatedAt: nowIso(), idempotencyKey: `refund_${orderId}_${id}` };
    const patch: Record<string, unknown> = { "payment.refunds": [...o.payment.refunds, rec] };
    if (o.returnStatus === "received") patch.returnStatus = "refund_pending";
    return { patch, label: "Refund requested", detail: reason.slice(0, 120), visible: false };
  });
}

// executeRefund / reconcileRefund / attestRefundNotCreated live in refunds.ts (durable dispatch records and recovery).
export { executeRefund } from "./refunds";

async function recordCodRefund(orderId: string, refundId: string, reference: string, actor: string): Promise<Order> {
  if (reference.trim().length < 4) throw badRequest("Enter the bank transfer / UPI reference.");
  return simpleUpdate(orderId, actor, "refund.cod_record", (o) => {
    const r = o.payment.refunds.find((x) => x.id === refundId);
    if (!r) throw notFound("Refund not found.");
    if (o.paymentMethod !== "cod" || r.exceptionId) throw badRequest("Online payments are refunded through the provider.");
    if (r.state === "completed") throw conflict("ALREADY_DONE", "Already recorded.");
    const refunds = o.payment.refunds.map((x) => (x.id === refundId ? { ...x, state: "completed" as const, reference: reference.trim().slice(0, 80), updatedAt: nowIso() } : x));
    const patch: Record<string, unknown> = { ...refundPatch(o, refunds) };
    if (o.returnStatus === "refund_pending") patch.returnStatus = "closed";
    // The reference is financial data: stored on the order for admins only, never in the customer-visible timeline.
    return { patch, label: "Refund completed", visible: true };
  });
}

/* ------------------------------------------------------------------ returns */

async function returnDecision(orderId: string, decision: "approve" | "reject", note: string | undefined, actor: string): Promise<Order> {
  return simpleUpdate(orderId, actor, `return.${decision}`, (o) => {
    if (o.returnStatus !== "requested") throw conflict("BAD_STATE", "There is no pending return request on this order.");
    return { patch: { returnStatus: decision === "approve" ? "approved" : "rejected" }, label: decision === "approve" ? "Return approved" : "Return declined", detail: note?.slice(0, 200), visible: true };
  });
}

/** Returned stock disposition is explicit and audited: `restock` adds the units back to sellable stock, `discard` records them as not resellable. */
async function returnReceived(orderId: string, disposition: "restock" | "discard", actor: string): Promise<Order> {
  await db().runTransaction(async (tx) => {
    const o = orderFromDoc(await tx.get(orderRef(orderId)));
    if (o.returnStatus !== "approved") throw conflict("BAD_STATE", "Approve the return before marking it received.");
    const lines: StockLine[] = o.items.map((i) => ({ variantId: i.variantId, productId: i.productId, quantity: i.quantity }));
    const ret = await tx.get(orderRef(orderId).collection("returns").limit(1)); // all reads happen before any write
    if (disposition === "restock") {
      const variants = await readVariants(tx, lines);
      applyStock(tx, variants, lines, "restock", { orderId, reason: `return restock ${o.orderNumber}`, actor });
    }
    tx.update(orderRef(orderId), { returnStatus: "received", updatedAt: nowIso(), version: o.version + 1 });
    if (ret.docs[0]) tx.update(ret.docs[0].ref, { status: "received", disposition, receivedAt: nowIso() });
    addTimeline(tx, orderId, { type: "return.received", label: "Return received", detail: disposition === "restock" ? "Item inspected and returned to stock." : "Item inspected; not resellable.", customerVisible: true, actor });
    auditInTx(tx, actor, "return.received", orderId, { disposition });
  });
  if (disposition === "restock") invalidate("catalog");
  return orderFromDoc(await orderRef(orderId).get());
}
