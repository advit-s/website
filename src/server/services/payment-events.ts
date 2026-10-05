import "server-only";
import { C, col, newId, nowIso } from "../repos/common";
import { db } from "../firebase/admin";
import { addTimeline, orderFromDoc, orderRef, sha256 } from "./order-core";
import { applyStock, readVariants, type StockLine } from "./stock";
import { enqueueNotification } from "./notifications";
import { payments } from "../providers/payments";
import { getPublicSettingsFresh } from "../repos/settings";
import { invalidate } from "../cache";
import { badRequest, conflict, notFound } from "../http";
import { computePricing } from "@/domain/pricing";
import { formatINR } from "@/domain/money";
import type { Order, RefundRecord } from "@/domain/types";

export type CaptureSource = "callback" | "webhook" | "reconcile";

export interface CaptureArgs {
  providerOrderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  source: CaptureSource;
}

export type CaptureResult =
  | { applied: true; orderId: string; outcome: "confirmed" | "revived" | "needs_review" }
  | { applied: false; orderId: string | null; reason: "already_paid" | "unknown_order" | "amount_mismatch" | "cancelled_by_staff" | "unexpected_payment_method" };

const PAID_STATES = new Set(["paid", "partially_refunded", "refunded"]);

export async function findOrderIdByProviderOrder(providerOrderId: string): Promise<string | null> {
  const q = await col(C.orders).where("payment.providerOrderIds", "array-contains", providerOrderId).limit(1).get();
  return q.docs[0]?.id ?? null;
}

/**
 * Mark an order paid. The only way an order becomes paid. Idempotent: callback, webhook and reconciliation can all
 * call this in any order and any number of times - the first to run commits stock exactly once, the rest no-op.
 */
export async function applyPaymentCaptured(a: CaptureArgs): Promise<CaptureResult> {
  const orderId = await findOrderIdByProviderOrder(a.providerOrderId);
  if (!orderId) return { applied: false, orderId: null, reason: "unknown_order" };

  const result = await db().runTransaction(async (tx): Promise<CaptureResult & { notify?: Order }> => {
    const ref = orderRef(orderId);
    const snap = await tx.get(ref);
    const order = orderFromDoc(snap);
    // A previously opened online checkout can capture after the customer switched
    // to COD. That order already allocated stock (and may already be shipped).
    // Preserve its fulfilment/payment state and retain evidence for reconciliation.
    if (order.paymentMethod !== "razorpay") {
      const exceptionRef = ref.collection("paymentExceptions").doc(sha256(a.paymentId));
      const prior = await tx.get(exceptionRef);
      if (!prior.exists) {
        tx.set(exceptionRef, { ...a, createdAt: nowIso(), status: "needs_review" });
        tx.update(ref, { needsReview: true, "payment.lastError": "Online payment captured after switching to COD. Reconcile payment and courier collection before fulfilment.", updatedAt: nowIso(), version: order.version + 1 });
        addTimeline(tx, orderId, { type: "payment.after_cod_switch", label: "Online payment received after COD switch - manual reconciliation required", detail: a.paymentId, customerVisible: false, actor: "provider" });
      }
      return { applied: false, orderId, reason: "unexpected_payment_method" };
    }
    if (PAID_STATES.has(order.paymentStatus)) return { applied: false, orderId, reason: "already_paid" };

    if (a.currency !== "INR" || a.amount !== order.pricing.total) {
      tx.update(ref, { needsReview: true, "payment.lastError": `Captured amount ${a.amount} ${a.currency} does not match order total ${order.pricing.total}`, updatedAt: nowIso(), version: order.version + 1 });
      addTimeline(tx, orderId, { type: "payment.amount_mismatch", label: "Payment amount mismatch - held for review", detail: `payment ${a.paymentId}`, customerVisible: false, actor: "provider" });
      return { applied: false, orderId, reason: "amount_mismatch" };
    }

    const lines: StockLine[] = order.items.map((i) => ({ variantId: i.variantId, productId: i.productId, quantity: i.quantity }));
    const rsvRef = order.reservationId ? col(C.reservations).doc(order.reservationId) : null;
    const rsv = rsvRef ? await tx.get(rsvRef) : null;
    const rsvStatus = (rsv?.data() as { status?: string } | undefined)?.status;
    const variants = await readVariants(tx, lines);
    const now = nowIso();
    const base = {
      paymentStatus: "paid" as const,
      "payment.razorpayPaymentId": a.paymentId,
      "payment.capturedAt": now,
      "payment.lastError": null,
      updatedAt: now,
      version: order.version + 1,
    };

    // Normal path: the hold is still active (even if its clock has passed but the cleanup job has not run yet).
    if (order.stockState === "reserved" && rsvStatus === "active" && rsvRef) {
      applyStock(tx, variants, lines, "commit", { orderId, reason: `sale ${order.orderNumber}`, actor: `system:${a.source}` });
      tx.update(rsvRef, { status: "committed", committedAt: now });
      tx.update(ref, { ...base, stockState: "committed" });
      addTimeline(tx, orderId, { type: "payment.captured", label: "Payment received", detail: `via ${a.source}`, customerVisible: true, actor: "provider" });
      return { applied: true, orderId, outcome: "confirmed", notify: order };
    }

    // Late payment: the hold was released (expired / cancelled). Never fulfil against unavailable stock.
    if (order.status === "cancelled" && order.cancelReason !== "payment_expired") {
      tx.update(ref, { ...base, needsReview: true });
      addTimeline(tx, orderId, { type: "payment.late_after_cancel", label: "Payment received for an order cancelled by staff - refund required", detail: a.paymentId, customerVisible: false, actor: "provider" });
      addRefundRequest(tx, orderRef(orderId), order, "Payment captured after the order was cancelled");
      return { applied: false, orderId, reason: "cancelled_by_staff" };
    }
    const reAllocatable = lines.every((l) => {
      const v = variants.get(l.variantId);
      return v && v.stock - v.reserved >= l.quantity;
    });
    if (reAllocatable) {
      applyStock(tx, variants, lines, "allocate", { orderId, reason: `late payment re-allocation ${order.orderNumber}`, actor: `system:${a.source}` });
      if (rsvRef && rsv?.exists) tx.update(rsvRef, { status: "committed", committedAt: now });
      tx.update(ref, { ...base, status: "new", cancelReason: null, stockState: "committed" });
      addTimeline(tx, orderId, { type: "payment.late_revived", label: "Payment received after the hold expired - order reinstated", detail: "Stock was still available and has been re-allocated.", customerVisible: true, actor: "system" });
      return { applied: true, orderId, outcome: "revived", notify: order };
    }
    tx.update(ref, { ...base, needsReview: true, stockState: "none" });
    addTimeline(tx, orderId, { type: "payment.late_no_stock", label: "Payment received after the hold expired and the item is no longer available - refund requested", detail: a.paymentId, customerVisible: true, actor: "system" });
    addRefundRequest(tx, orderRef(orderId), order, "Payment captured after hold expiry; stock no longer available");
    return { applied: true, orderId, outcome: "needs_review", notify: order };
  });

  if (result.applied) {
    invalidate("catalog");
    const o = (result as { notify?: Order }).notify;
    if (o) {
      await enqueueNotification({ kind: result.outcome === "needs_review" ? "order.needs_review" : "order.paid", to: result.outcome === "needs_review" ? { admin: true } : { email: o.contact.email, phone: o.contact.phone }, data: { orderNumber: o.orderNumber, reason: "Late payment could not be fulfilled; a refund request was created." }, dedupeKey: `paid_${orderId}` });
      if (result.outcome !== "needs_review") await enqueueNotification({ kind: "admin.new_order", to: { admin: true }, data: { orderNumber: o.orderNumber, total: formatINR(o.pricing.total), method: "prepaid" }, dedupeKey: `admin_new_${orderId}` });
    }
  }
  const { notify: _n, ...clean } = result as CaptureResult & { notify?: Order };
  void _n;
  return clean;
}

/** Queue a full-refund request (state: requested). Execution is a separate, permission-checked, idempotent step. */
function addRefundRequest(tx: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, order: Order, reason: string): void {
  const id = newId("rf_");
  const rec: RefundRecord = {
    id,
    amount: order.pricing.total,
    state: "requested",
    reason,
    providerRefundId: null,
    reference: null,
    requestedBy: "system",
    requestedAt: nowIso(),
    updatedAt: nowIso(),
    idempotencyKey: `refund_${order.id}_${id}`,
  };
  tx.update(ref, { "payment.refunds": [...order.payment.refunds, rec] });
}

export async function applyPaymentFailed(a: { providerOrderId: string; paymentId: string; reason: string | null }): Promise<{ applied: boolean }> {
  const orderId = await findOrderIdByProviderOrder(a.providerOrderId);
  if (!orderId) return { applied: false };
  return db().runTransaction(async (tx) => {
    const order = orderFromDoc(await tx.get(orderRef(orderId)));
    // Out-of-order safety: a failure event can never undo a captured payment or touch a cancelled order.
    if (PAID_STATES.has(order.paymentStatus) || order.status === "cancelled") return { applied: false };
    tx.update(orderRef(orderId), { paymentStatus: "failed", "payment.lastError": (a.reason ?? "Payment failed").slice(0, 200), updatedAt: nowIso(), version: order.version + 1 });
    addTimeline(tx, orderId, { type: "payment.failed", label: "Payment failed", detail: a.reason ? a.reason.slice(0, 200) : null, customerVisible: true, actor: "provider" });
    return { applied: true };
  });
}

/** Browser callback after Checkout: verify the signature, then verify with the provider before marking paid. */
export async function verifyCheckoutCallback(orderId: string, cb: { providerOrderId: string; paymentId: string; signature: string }): Promise<{ status: "paid" | "pending" | "failed"; orderNumber: string }> {
  const snap = await orderRef(orderId).get();
  if (!snap.exists) throw notFound("Order not found.");
  const order = orderFromDoc(snap);
  if (!order.payment.providerOrderIds.includes(cb.providerOrderId)) throw badRequest("This payment does not belong to this order.");
  const provider = payments();
  if (!provider.verifyCheckoutSignature({ orderId: cb.providerOrderId, paymentId: cb.paymentId, signature: cb.signature })) {
    throw badRequest("Payment signature could not be verified.");
  }
  const p = await provider.fetchPayment(cb.paymentId);
  if (p.orderId !== cb.providerOrderId) throw badRequest("Payment does not match the order.");
  if (p.status === "captured") {
    await applyPaymentCaptured({ providerOrderId: p.orderId, paymentId: p.id, amount: p.amount, currency: p.currency, source: "callback" });
    const verified = orderFromDoc(await orderRef(orderId).get());
    return { status: PAID_STATES.has(verified.paymentStatus) && !verified.needsReview ? "paid" : "pending", orderNumber: order.orderNumber };
  }
  if (p.status === "failed") {
    await applyPaymentFailed({ providerOrderId: p.orderId, paymentId: p.id, reason: p.errorDescription });
    return { status: "failed", orderNumber: order.orderNumber };
  }
  return { status: "pending", orderNumber: order.orderNumber }; // authorized / created: wait for the webhook, never fake success
}

/** Convert an unpaid prepaid order to cash on delivery (the "change payment method" path after a failed payment). */
export async function switchToCod(orderId: string): Promise<void> {
  const settings = await getPublicSettingsFresh();
  await db().runTransaction(async (tx) => {
    const ref = orderRef(orderId);
    const order = orderFromDoc(await tx.get(ref));
    if (order.paymentMethod !== "razorpay" || order.paymentStatus === "paid" || order.status === "cancelled") throw conflict("NOT_SWITCHABLE", "This order can no longer be switched to cash on delivery.");
    if (!settings.cod.enabled || settings.delivery.codBlockedPincodes.includes(order.shippingAddress.pincode) || order.hasCustomItems) throw badRequest("Cash on delivery is not available for this order.");
    const rsvRef = order.reservationId ? col(C.reservations).doc(order.reservationId) : null;
    const rsv = rsvRef ? await tx.get(rsvRef) : null;
    if (!rsv || (rsv.data() as { status: string }).status !== "active") throw conflict("ORDER_EXPIRED", "Your stock hold expired. Please place the order again.");
    const lines: StockLine[] = order.items.map((i) => ({ variantId: i.variantId, productId: i.productId, quantity: i.quantity }));
    const variants = await readVariants(tx, lines);
    const pricing = computePricing({
      lines: order.items.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity, weightGrams: i.weightGrams, isCustomizable: i.isCustomizable })),
      coupon: null,
      zone: order.shipment.zone,
      paymentMethod: "cod",
      settings,
      now: new Date(),
    });
    // Discounts were fixed at placement; only the COD fee is added on top of the existing figures.
    const total = order.pricing.subtotal - order.pricing.discount + order.pricing.shipping + pricing.codFee;
    if (total > settings.cod.maxOrderValue) throw badRequest("Cash on delivery is not available for orders of this value.");
    applyStock(tx, variants, lines, "commit", { orderId, reason: `COD switch ${order.orderNumber}`, actor: "customer" });
    tx.update(rsv.ref, { status: "committed", committedAt: nowIso() });
    tx.update(ref, { paymentMethod: "cod", paymentStatus: "pending", stockState: "committed", "pricing.codFee": pricing.codFee, "pricing.total": total, updatedAt: nowIso(), version: order.version + 1 });
    addTimeline(tx, orderId, { type: "payment.switched_cod", label: "Switched to cash on delivery", detail: null, customerVisible: true, actor: "customer" });
  });
  invalidate("catalog");
}

/**
 * Release holds that passed their expiry. Runnable by Cloud Scheduler (POST /api/jobs/expire), `npm run jobs:expire`,
 * and opportunistically. Each reservation is processed in its own transaction and is idempotent: it only acts while
 * status === "active", so reruns and concurrent workers release stock exactly once.
 */
export async function expireReservations(limit = 100, nowDate = new Date()): Promise<{ released: number; skippedPaid: number }> {
  const q = await col(C.reservations).where("status", "==", "active").where("expiresAt", "<=", nowDate.toISOString()).orderBy("expiresAt").limit(limit).get();
  let released = 0;
  let skippedPaid = 0;
  for (const doc of q.docs) {
    const res = await db().runTransaction(async (tx) => {
      const rsv = await tx.get(doc.ref);
      const data = rsv.data() as { status: string; orderId: string; items: StockLine[] } | undefined;
      if (!data || data.status !== "active") return "noop" as const;
      const order = orderFromDoc(await tx.get(orderRef(data.orderId)));
      if (PAID_STATES.has(order.paymentStatus)) return "paid" as const; // payment landed first; capture path owns commit
      const variants = await readVariants(tx, data.items);
      applyStock(tx, variants, data.items, "release", { orderId: order.id, reason: `hold expired ${order.orderNumber}`, actor: "system:expiry" });
      tx.update(doc.ref, { status: "expired", releasedAt: nowIso() });
      tx.update(orderRef(order.id), {
        status: "cancelled",
        cancelReason: "payment_expired",
        stockState: "released",
        paymentStatus: order.paymentStatus === "pending" ? "failed" : order.paymentStatus,
        updatedAt: nowIso(),
        version: order.version + 1,
      });
      addTimeline(tx, order.id, { type: "order.expired", label: "Order cancelled - payment not completed in time", detail: "The items were released back to stock.", customerVisible: true, actor: "system" });
      return "released" as const;
    });
    if (res === "released") released++;
    if (res === "paid") skippedPaid++;
  }
  if (released) invalidate("catalog");
  return { released, skippedPaid };
}

/**
 * Reconcile prepaid orders whose webhook/callback may have been lost: ask the provider for payments on each recent
 * unpaid order and apply any capture. Safe to run repeatedly.
 */
export async function reconcilePayments(limit = 50): Promise<{ checked: number; applied: number }> {
  const since = new Date(Date.now() - 48 * 3600_000).toISOString();
  const q = await col(C.orders).where("paymentStatus", "in", ["pending", "failed"]).where("placedAt", ">=", since).orderBy("placedAt", "desc").limit(limit).get();
  let checked = 0;
  let applied = 0;
  for (const d of q.docs) {
    const o = orderFromDoc(d);
    if (o.paymentMethod !== "razorpay" || !o.payment.providerOrderIds.length) continue;
    checked++;
    for (const pid of o.payment.providerOrderIds) {
      try {
        const list = await payments().fetchOrderPayments(pid);
        const cap = list.find((p) => p.status === "captured");
        if (cap) {
          const r = await applyPaymentCaptured({ providerOrderId: pid, paymentId: cap.id, amount: cap.amount, currency: cap.currency, source: "reconcile" });
          if (r.applied) applied++;
          break;
        }
      } catch (e) {
        console.error("[reconcile] provider lookup failed", o.orderNumber, e instanceof Error ? e.message : e);
      }
    }
  }
  return { checked, applied };
}

/* ------------------------------------------------------------------ webhooks */

export interface WebhookOutcome {
  status: 200 | 400;
  body: Record<string, unknown>;
}

interface RazorpayEvent {
  event: string;
  payload?: {
    payment?: { entity?: { id: string; order_id: string; amount: number; currency: string; status: string; error_description?: string | null } };
    order?: { entity?: { id: string; status?: string } };
    refund?: { entity?: { id: string; payment_id: string; amount: number; status: string } };
  };
}

/**
 * Razorpay webhook processor. Signature is verified over the RAW body before anything is parsed; duplicate deliveries
 * (same x-razorpay-event-id) are acknowledged without re-applying; out-of-order events are safe because every apply
 * function is state-guarded.
 */
export async function handleRazorpayWebhook(rawBody: string, signature: string | null, eventIdHeader: string | null): Promise<WebhookOutcome> {
  const provider = payments();
  if (!signature || !provider.verifyWebhookSignature(rawBody, signature)) return { status: 400, body: { error: "invalid signature" } };
  let evt: RazorpayEvent;
  try {
    evt = JSON.parse(rawBody) as RazorpayEvent;
  } catch {
    return { status: 400, body: { error: "malformed body" } };
  }
  const eventId = eventIdHeader ?? `body_${sha256(rawBody)}`;
  const receiptRef = col(C.webhookReceipts).doc(`razorpay_${eventId}`.slice(0, 200));
  try {
    await receiptRef.create({ provider: "razorpay", event: evt.event, status: "processing", receivedAt: nowIso() });
  } catch (e) {
    if ((e as { code?: number }).code !== 6) throw e;
    const prev = await receiptRef.get();
    if ((prev.data() as { status?: string } | undefined)?.status === "done") return { status: 200, body: { ok: true, duplicate: true } };
    // previous attempt died mid-flight: process again (handlers are idempotent)
  }

  const pay = evt.payload?.payment?.entity;
  switch (evt.event) {
    case "payment.captured":
    case "order.paid":
      if (pay && pay.status === "captured") await applyPaymentCaptured({ providerOrderId: pay.order_id, paymentId: pay.id, amount: pay.amount, currency: pay.currency, source: "webhook" });
      break;
    case "payment.failed":
      if (pay) await applyPaymentFailed({ providerOrderId: pay.order_id, paymentId: pay.id, reason: pay.error_description ?? null });
      break;
    case "refund.processed":
    case "refund.failed": {
      const r = evt.payload?.refund?.entity;
      if (r) await applyRefundEvent(r.payment_id, r.id, evt.event === "refund.processed" ? "processed" : "failed");
      break;
    }
    default:
      break; // ignored events are still acknowledged so the provider stops retrying
  }
  await receiptRef.update({ status: "done", processedAt: nowIso() });
  return { status: 200, body: { ok: true } };
}

export async function applyRefundEvent(paymentId: string, providerRefundId: string, status: "processed" | "failed"): Promise<void> {
  const q = await col(C.orders).where("payment.razorpayPaymentId", "==", paymentId).limit(1).get();
  const doc = q.docs[0];
  if (!doc) return;
  await db().runTransaction(async (tx) => {
    const order = orderFromDoc(await tx.get(doc.ref));
    const existing = order.payment.refunds.find((r) => r.providerRefundId === providerRefundId);
    // Unknown events must not mutate totals; completed money movement is terminal.
    if (!existing || existing.state === "completed" || (existing.state === "failed" && status === "failed")) return;
    const refunds = order.payment.refunds.map((r) => (r.providerRefundId === providerRefundId ? { ...r, state: status === "processed" ? ("completed" as const) : ("failed" as const), updatedAt: nowIso() } : r));
    const refundedTotal = refunds.filter((r) => r.state === "completed").reduce((s, r) => s + r.amount, 0);
    const paymentStatus = refundedTotal >= order.pricing.total ? "refunded" : refundedTotal > 0 ? "partially_refunded" : order.paymentStatus;
    tx.update(doc.ref, { "payment.refunds": refunds, "payment.refundedTotal": refundedTotal, paymentStatus, updatedAt: nowIso(), version: order.version + 1 });
    addTimeline(tx, order.id, { type: "refund.event", label: `Refund ${status === "processed" ? "completed" : "failed"}`, detail: providerRefundId, customerVisible: true, actor: "provider" });
  });
}
