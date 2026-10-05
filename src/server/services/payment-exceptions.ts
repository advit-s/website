import "server-only";
import { newId, nowIso } from "../repos/common";
import { db } from "../firebase/admin";
import { addTimeline, orderFromDoc, orderRef, sha256 } from "./order-core";
import { auditInTx } from "./audit";
import { payments, ProviderError } from "../providers/payments";
import { badRequest, conflict, notFound } from "../http";
import type { Order, RefundRecord } from "@/domain/types";

/**
 * Payment exceptions: money the provider verifiably captured that the order's own flow could not apply.
 * Stored as orders/{orderId}/paymentExceptions/{sha256(paymentId)} (one document per provider payment, so repeated webhook /
 * callback / reconcile deliveries are no-ops).
 *
 *   after_cod_switch  - the customer's earlier online attempt captured after the order was switched to cash on delivery.
 *   duplicate_capture - a second, different payment captured for an order that is already paid.
 *
 * An exception NEVER resets fulfilment, never allocates stock again and never creates a refund by itself. Staff resolve it by
 * (a) requesting a refund of the extra capture (verified against the provider first), or (b) recording that it was already
 * refunded outside this system (verified against the provider's refund list).
 */

export type ExceptionKind = "after_cod_switch" | "duplicate_capture";
export type ExceptionStatus = "needs_review" | "refund_requested" | "refunded" | "reconciled_manually";

/** Statuses that still block confirmation / processing / shipping of the order. */
export const UNRESOLVED_STATUSES: ExceptionStatus[] = ["needs_review", "refund_requested"];

export interface PaymentExceptionDoc {
  kind: ExceptionKind;
  providerOrderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  source: string;
  status: ExceptionStatus;
  createdAt: string;
  updatedAt?: string;
  /** Fulfilment status of the order when the capture arrived (an already-shipped order needs courier review). */
  fulfilmentAtCapture: string;
  refundId?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  note?: string | null;
}

export interface PaymentExceptionView extends PaymentExceptionDoc {
  id: string;
  /** The order was already shipped/delivered when this capture arrived or since: courier COD collection must be reviewed. */
  courierReview: boolean;
  /** Cash on delivery has already been collected: the customer has paid twice. */
  codCollected: boolean;
  guidance: string;
}

export const exceptionId = (paymentId: string): string => sha256(paymentId).slice(0, 32);
const exceptionRef = (orderId: string, id: string) => orderRef(orderId).collection("paymentExceptions").doc(id);

const SHIPPED = new Set(["shipped", "out_for_delivery", "delivered"]);

/** Record an exception inside the capture transaction. Returns false when this payment was already recorded (repeat delivery). */
export async function recordPaymentException(tx: FirebaseFirestore.Transaction, order: Order, a: { providerOrderId: string; paymentId: string; amount: number; currency: string; source: string }, kind: ExceptionKind): Promise<boolean> {
  const ref = exceptionRef(order.id, exceptionId(a.paymentId));
  const prior = await tx.get(ref);
  if (prior.exists) return false;
  const now = nowIso();
  const shipped = SHIPPED.has(order.status);
  const doc: PaymentExceptionDoc = { kind, providerOrderId: a.providerOrderId, paymentId: a.paymentId, amount: a.amount, currency: a.currency, source: a.source, status: "needs_review", createdAt: now, updatedAt: now, fulfilmentAtCapture: order.status, refundId: null };
  tx.set(ref, doc);
  const ids = [...new Set([...(order.payment.exceptionPaymentIds ?? []), a.paymentId])].slice(0, 20);
  tx.update(orderRef(order.id), {
    needsReview: true,
    "payment.exceptionPaymentIds": ids,
    "payment.lastError": kind === "after_cod_switch" ? "Online payment captured after switching to COD. Resolve the payment exception before fulfilment." : "A second online payment was captured for an order that is already paid. Resolve the payment exception.",
    updatedAt: now,
    version: order.version + 1,
  });
  addTimeline(tx, order.id, {
    type: `payment.exception.${kind}`,
    label: `${kind === "after_cod_switch" ? "Online payment received after COD switch" : "Duplicate online payment received"} - payment exception opened${shipped ? " (order already shipped: courier collection needs review)" : ""}`,
    detail: a.paymentId,
    customerVisible: false,
    actor: "provider",
  });
  return true;
}

function guidanceFor(o: Order, e: PaymentExceptionDoc): string {
  const cod = o.paymentMethod === "cod" && o.paymentStatus !== "pending" && o.paymentStatus !== "failed";
  const shipped = SHIPPED.has(o.status);
  if (e.status === "refunded") return "The extra payment has been refunded.";
  if (e.status === "reconciled_manually") return "Recorded as handled outside this system.";
  if (e.status === "refund_requested") return "A refund of the extra payment is requested. Send it to the provider from the refund list and confirm it completes.";
  if (e.kind === "duplicate_capture") return "The customer paid twice online. Refund the second payment (verified against the provider first).";
  if (cod) return "Cash on delivery was already collected and an online payment was also captured: the customer paid twice. Refund the online payment.";
  if (shipped) return "The parcel is already with the courier as cash on delivery. Refund the online payment so the customer pays once, and check the courier will still collect the cash amount. Do not re-ship.";
  return "The order is a cash-on-delivery order but an online payment was captured. Refund the online payment so the customer pays once. Confirmation, processing and shipping are blocked until this is resolved.";
}

export async function listPaymentExceptions(orderId: string): Promise<PaymentExceptionView[]> {
  const [snap, os] = await Promise.all([orderRef(orderId).collection("paymentExceptions").orderBy("createdAt", "desc").limit(20).get(), orderRef(orderId).get()]);
  if (!os.exists) return [];
  const o = orderFromDoc(os);
  return snap.docs.map((d) => {
    const e = d.data() as PaymentExceptionDoc;
    return { ...e, id: d.id, courierReview: SHIPPED.has(e.fulfilmentAtCapture) || SHIPPED.has(o.status), codCollected: o.paymentMethod === "cod" && o.paymentStatus === "paid", guidance: guidanceFor(o, e) };
  });
}

/** Read inside a transaction: any unresolved exception on the order? (Reads must precede writes.) */
export async function hasUnresolvedException(tx: FirebaseFirestore.Transaction, orderId: string): Promise<boolean> {
  const q = await tx.get(orderRef(orderId).collection("paymentExceptions").where("status", "in", UNRESOLVED_STATUSES).limit(1));
  return !q.empty;
}

export async function hasUnresolvedExceptionNow(orderId: string): Promise<boolean> {
  const q = await orderRef(orderId).collection("paymentExceptions").where("status", "in", UNRESOLVED_STATUSES).limit(1).get();
  return !q.empty;
}

export const EXCEPTION_BLOCK = "This order has an unresolved payment exception (an online payment was captured outside its normal flow). Resolve it in the Payment exceptions panel first.";

/** Why generic "clear review" must refuse: an unresolved exception, or any refund that is not settled. */
export async function reviewBlockers(orderId: string): Promise<string | null> {
  const o = orderFromDoc(await orderRef(orderId).get());
  if (o.payment.refunds.some((r) => r.state === "processing")) return "A refund is still processing or awaiting reconciliation. It must be settled with the payment provider first.";
  if (await hasUnresolvedExceptionNow(orderId)) return EXCEPTION_BLOCK;
  return null;
}

/**
 * Request a refund of an extra capture. Money-changing, so it is verified against the PROVIDER (not the stored copy):
 * the payment must exist, be captured, belong to one of this order's provider orders, and match the recorded amount.
 * This only creates the refund request; sending it is the usual separate, recent-sign-in-protected step.
 */
export async function requestExceptionRefund(orderId: string, id: string, actor: string): Promise<Order> {
  const pre = orderFromDoc(await orderRef(orderId).get());
  const exSnap = await exceptionRef(orderId, id).get();
  if (!exSnap.exists) throw notFound("Payment exception not found.");
  const ex = exSnap.data() as PaymentExceptionDoc;
  if (ex.status !== "needs_review") throw conflict("NOT_OPEN", "This payment exception is not waiting for a decision.");
  let p;
  try {
    p = await payments().fetchPayment(ex.paymentId);
  } catch (e) {
    if (e instanceof ProviderError && e.kind === "rejected") throw conflict("PROVIDER_MISMATCH", "The payment provider does not know this payment. Do not refund it from here; check the provider dashboard.");
    throw conflict("PROVIDER_UNAVAILABLE", "The payment provider could not be reached to verify this payment. Try again shortly.");
  }
  if (p.status !== "captured" || p.amount !== ex.amount || p.currency !== ex.currency || !pre.payment.providerOrderIds.includes(p.orderId)) {
    throw conflict("PROVIDER_MISMATCH", "The provider's record of this payment does not match (not captured, a different amount, or not part of this order). Nothing was requested.");
  }
  await db().runTransaction(async (tx) => {
    const [oSnap, eSnap] = await Promise.all([tx.get(orderRef(orderId)), tx.get(exceptionRef(orderId, id))]);
    const o = orderFromDoc(oSnap);
    const cur = eSnap.data() as PaymentExceptionDoc;
    if (cur.status !== "needs_review") throw conflict("NOT_OPEN", "This payment exception was already handled.");
    const rid = newId("rf_");
    const now = nowIso();
    const rec: RefundRecord = { id: rid, amount: cur.amount, state: "requested", reason: "Refund of extra online payment", providerRefundId: null, reference: null, requestedBy: actor, requestedAt: now, updatedAt: now, idempotencyKey: `refund_${orderId}_${rid}`, paymentId: cur.paymentId, exceptionId: id, attempt: 0 };
    tx.update(orderRef(orderId), { "payment.refunds": [...o.payment.refunds, rec], updatedAt: now, version: o.version + 1 });
    tx.update(exceptionRef(orderId, id), { status: "refund_requested", refundId: rid, updatedAt: now });
    addTimeline(tx, orderId, { type: "payment.exception.refund_requested", label: "Refund of the extra online payment requested", detail: cur.paymentId, customerVisible: false, actor });
    auditInTx(tx, actor, "payment_exception.refund_request", orderId, { exceptionId: id, paymentId: cur.paymentId, amount: cur.amount });
  });
  return orderFromDoc(await orderRef(orderId).get());
}

/**
 * Record that the extra capture was already refunded outside this system (for example from the provider dashboard).
 * Accepted only when the provider's own refund list proves processed refunds covering the full amount.
 */
export async function reconcileExceptionManually(orderId: string, id: string, actor: string, note: string): Promise<Order> {
  const text = note.trim();
  if (text.length < 20) throw badRequest("Describe how it was handled (where, when, reference) - at least 20 characters.");
  const exSnap = await exceptionRef(orderId, id).get();
  if (!exSnap.exists) throw notFound("Payment exception not found.");
  const ex = exSnap.data() as PaymentExceptionDoc;
  if (ex.status !== "needs_review") throw conflict("NOT_OPEN", "This payment exception is not waiting for a decision.");
  let refunded = 0;
  try {
    refunded = (await payments().listPaymentRefunds(ex.paymentId)).filter((r) => r.status === "processed").reduce((s, r) => s + r.amount, 0);
  } catch {
    throw conflict("PROVIDER_UNAVAILABLE", "The payment provider could not be reached to verify the refund. Try again shortly.");
  }
  if (refunded < ex.amount) throw conflict("NOT_REFUNDED", "The provider shows no completed refund covering this payment, so it cannot be recorded as handled.");
  await db().runTransaction(async (tx) => {
    const eSnap = await tx.get(exceptionRef(orderId, id));
    const cur = eSnap.data() as PaymentExceptionDoc;
    if (cur.status !== "needs_review") throw conflict("NOT_OPEN", "This payment exception was already handled.");
    const now = nowIso();
    tx.update(exceptionRef(orderId, id), { status: "reconciled_manually", resolvedAt: now, resolvedBy: actor, note: text.slice(0, 500), updatedAt: now });
    addTimeline(tx, orderId, { type: "payment.exception.reconciled", label: "Extra online payment recorded as already refunded outside the system", detail: text.slice(0, 200), customerVisible: false, actor });
    auditInTx(tx, actor, "payment_exception.reconcile_manual", orderId, { exceptionId: id, paymentId: cur.paymentId, providerRefunded: refunded });
  });
  return orderFromDoc(await orderRef(orderId).get());
}
