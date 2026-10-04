import "server-only";
import { C, col, newId, nowIso } from "../repos/common";
import { db } from "../firebase/admin";
import { addTimeline, orderFromDoc, orderRef } from "./order-core";
import { applyStock, readVariants, type StockLine } from "./stock";
import { enqueueNotification } from "./notifications";
import { invalidate } from "../cache";
import { getPublicSettingsFresh } from "../repos/settings";
import { badRequest, conflict } from "../http";
import { isCancellable } from "@/domain/order-state";
import type { Order, RefundRecord } from "@/domain/types";

export interface Actor {
  id: string; // "customer" | "guest" | admin uid | "system"
  kind: "customer" | "admin" | "system";
}

/**
 * Cancel an order that has not shipped. Releases a held reservation or restocks allocated stock exactly once
 * (the stockState field is the guard), records an audited timeline event, and queues a full refund request when a
 * prepaid payment had been captured (execution is a separate permission-checked step).
 */
export async function cancelOrder(orderId: string, actor: Actor, reason: string): Promise<Order> {
  const result = await db().runTransaction(async (tx) => {
    const ref = orderRef(orderId);
    const order = orderFromDoc(await tx.get(ref));
    if (order.status === "cancelled") return { order, changed: false };
    if (!isCancellable(order.status)) throw conflict("NOT_CANCELLABLE", "This order can no longer be cancelled because it has already shipped. Please request a return after delivery.");
    if (actor.kind === "customer" && order.hasCustomItems) throw conflict("CUSTOM_ORDER", "Made-to-measure orders are cancelled by arrangement. Please contact us on WhatsApp.");

    const lines: StockLine[] = order.items.map((i) => ({ variantId: i.variantId, productId: i.productId, quantity: i.quantity }));
    const rsvRef = order.reservationId ? col(C.reservations).doc(order.reservationId) : null;
    const rsv = rsvRef ? await tx.get(rsvRef) : null;
    const variants = order.stockState === "reserved" || order.stockState === "committed" ? await readVariants(tx, lines) : new Map();

    if (order.stockState === "reserved") {
      if (rsv && (rsv.data() as { status: string }).status === "active") {
        applyStock(tx, variants, lines, "release", { orderId, reason: `cancel ${order.orderNumber}`, actor: actor.id });
        tx.update(rsv.ref, { status: "released", releasedAt: nowIso() });
      }
    } else if (order.stockState === "committed") {
      applyStock(tx, variants, lines, "restock", { orderId, reason: `cancel restock ${order.orderNumber}`, actor: actor.id });
    }

    const paid = order.paymentMethod === "razorpay" && ["paid", "partially_refunded"].includes(order.paymentStatus);
    const refunds: RefundRecord[] = [...order.payment.refunds];
    const refundable = order.pricing.total - order.payment.refundedTotal - refunds.filter((r) => r.state === "requested" || r.state === "processing").reduce((s, r) => s + r.amount, 0);
    if (paid && refundable > 0) {
      const id = newId("rf_");
      refunds.push({ id, amount: refundable, state: "requested", reason: `Order cancelled: ${reason}`.slice(0, 200), providerRefundId: null, reference: null, requestedBy: actor.id, requestedAt: nowIso(), updatedAt: nowIso(), idempotencyKey: `refund_${orderId}_${id}` });
    }

    tx.update(ref, {
      status: "cancelled",
      cancelReason: reason.slice(0, 200),
      stockState: order.stockState === "none" ? "none" : "released",
      "payment.refunds": refunds,
      paymentStatus: order.paymentStatus === "pending" && order.paymentMethod === "razorpay" ? "failed" : order.paymentStatus,
      updatedAt: nowIso(),
      version: order.version + 1,
    });
    addTimeline(tx, orderId, {
      type: "order.cancelled",
      label: "Order cancelled",
      detail: paid ? "Your payment will be refunded to the original payment method once the refund is processed." : reason.slice(0, 120),
      customerVisible: true,
      actor: actor.id,
    });
    return { order, changed: true };
  });

  if (result.changed) {
    invalidate("catalog");
    await enqueueNotification({ kind: "order.cancelled", to: { email: result.order.contact.email, phone: result.order.contact.phone }, data: { orderNumber: result.order.orderNumber, detail: reason }, dedupeKey: `cancel_${orderId}` });
  }
  return orderFromDoc(await orderRef(orderId).get());
}

/** Customer return request. A request is NOT a refund: it only opens the return workflow for the owner to review. */
export async function requestReturn(orderId: string, reason: string, actor: Actor): Promise<void> {
  const settings = await getPublicSettingsFresh();
  await db().runTransaction(async (tx) => {
    const order = orderFromDoc(await tx.get(orderRef(orderId)));
    if (order.status !== "delivered") throw conflict("NOT_DELIVERED", "Returns can be requested after delivery.");
    if (order.hasCustomItems) throw conflict("CUSTOM_ORDER", "Made-to-measure pieces are not returnable. If the item is damaged or incorrect, please contact us within the damage-reporting window.");
    if (order.returnStatus !== "none") throw conflict("ALREADY_REQUESTED", "A return has already been requested for this order.");
    const deliveredAt = order.shipment.deliveredAt ? new Date(order.shipment.deliveredAt).getTime() : 0;
    if (!deliveredAt || Date.now() - deliveredAt > settings.policy.returnWindowDays * 86_400_000) throw conflict("WINDOW_CLOSED", `The ${settings.policy.returnWindowDays}-day return window has closed.`);
    if (reason.trim().length < 5) throw badRequest("Please tell us briefly why you are returning the item.");
    tx.update(orderRef(orderId), { returnStatus: "requested", updatedAt: nowIso(), version: order.version + 1 });
    tx.set(orderRef(orderId).collection("returns").doc(newId("ret_")), { reason: reason.slice(0, 500), requestedBy: actor.id, requestedAt: nowIso(), status: "requested" });
    addTimeline(tx, orderId, { type: "return.requested", label: "Return requested", detail: "We will review your request and get back to you.", customerVisible: true, actor: actor.id });
  });
  await enqueueNotification({ kind: "order.status", to: { admin: true }, data: { orderNumber: orderId, statusLabel: "Return requested" } });
}
