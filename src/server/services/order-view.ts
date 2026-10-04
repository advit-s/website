import "server-only";
import { C, col } from "../repos/common";
import { getTimeline, maskEmail, maskPhone, orderFromDoc } from "./order-core";
import { normalizeIndianPhone } from "@/domain/validation";
import type { Order, TimelineEvent } from "@/domain/types";
import { PAYMENT_LABEL, RETURN_LABEL, STATUS_LABEL } from "@/domain/order-state";
import { getPublicSettings } from "../repos/settings";

/** Customer-safe order DTO. Never includes idempotency keys, review flags, provider ids or internal notes. */
export interface OrderView {
  id: string;
  orderNumber: string;
  placedAt: string;
  status: Order["status"];
  statusLabel: string;
  paymentMethod: Order["paymentMethod"];
  paymentStatus: Order["paymentStatus"];
  paymentLabel: string;
  returnStatus: Order["returnStatus"];
  returnLabel: string;
  simulated: boolean;
  items: { name: string; size: string; color: string; quantity: number; unitPrice: number; lineTotal: number; image: string | null; productId: string; isCustomizable: boolean }[];
  pricing: Order["pricing"];
  address: Order["shippingAddress"];
  contact: Order["contact"];
  estimateText: string;
  courierName: string | null;
  awbNumber: string | null;
  trackingUrl: string | null;
  refundedTotal: number;
  refunds: { amount: number; state: string; at: string }[];
  timeline: { label: string; detail: string | null; at: string }[];
  canCancel: boolean;
  canRequestReturn: boolean;
  needsPayment: boolean;
  hasCustomItems: boolean;
  custom: Order["custom"];
}

export async function toOrderView(order: Order): Promise<OrderView> {
  const [events, settings] = await Promise.all([getTimeline(order.id, true), getPublicSettings()]);
  const deliveredAt = order.shipment.deliveredAt ? new Date(order.shipment.deliveredAt).getTime() : null;
  const returnWindowMs = settings.policy.returnWindowDays * 86_400_000;
  const canReturn =
    order.status === "delivered" &&
    order.returnStatus === "none" &&
    !order.hasCustomItems &&
    deliveredAt != null &&
    Date.now() - deliveredAt <= returnWindowMs;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    placedAt: order.placedAt,
    status: order.status,
    statusLabel: STATUS_LABEL[order.status],
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    paymentLabel: order.paymentMethod === "cod" && order.paymentStatus === "pending" ? "Cash on delivery (pay on arrival)" : PAYMENT_LABEL[order.paymentStatus],
    returnStatus: order.returnStatus,
    returnLabel: RETURN_LABEL[order.returnStatus],
    simulated: order.integrationMode === "simulated",
    items: order.items.map((i) => ({ name: i.nameSnapshot, size: i.size, color: i.color, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal, image: i.imageSnapshot, productId: i.productId, isCustomizable: i.isCustomizable })),
    pricing: order.pricing,
    address: order.shippingAddress,
    contact: order.contact,
    estimateText: order.shipment.estimateText,
    courierName: order.shipment.courierName,
    awbNumber: order.shipment.awbNumber,
    trackingUrl: order.shipment.trackingUrl,
    refundedTotal: order.payment.refundedTotal,
    refunds: order.payment.refunds.map((r) => ({ amount: r.amount, state: r.state, at: r.updatedAt })),
    timeline: events.map((e: TimelineEvent) => ({ label: e.label, detail: e.detail, at: e.at })),
    canCancel: ["new", "confirmed", "processing"].includes(order.status) && !order.hasCustomItems,
    canRequestReturn: canReturn,
    needsPayment: order.paymentMethod === "razorpay" && order.paymentStatus !== "paid" && order.status !== "cancelled",
    hasCustomItems: order.hasCustomItems,
    custom: order.custom,
  };
}

/** Minimal, masked data returned after order number + contact match (no address line, phone, email, prices or invoice). */
export interface PublicTracking {
  orderNumber: string;
  statusLabel: string;
  status: Order["status"];
  paymentLabel: string;
  placedAt: string;
  estimateText: string;
  deliveringTo: string; // city, state only
  items: { name: string; quantity: number }[];
  courierName: string | null;
  trackingUrl: string | null;
  maskedPhone: string;
  maskedEmail: string;
  timeline: { label: string; at: string }[];
}

export async function toPublicTracking(order: Order): Promise<PublicTracking> {
  const events = await getTimeline(order.id, true);
  return {
    orderNumber: order.orderNumber,
    statusLabel: STATUS_LABEL[order.status],
    status: order.status,
    paymentLabel: order.paymentMethod === "cod" && order.paymentStatus === "pending" ? "Cash on delivery" : PAYMENT_LABEL[order.paymentStatus],
    placedAt: order.placedAt,
    estimateText: order.shipment.estimateText,
    deliveringTo: `${order.shippingAddress.city}, ${order.shippingAddress.state}`,
    items: order.items.map((i) => ({ name: i.nameSnapshot, quantity: i.quantity })),
    courierName: order.shipment.courierName,
    trackingUrl: order.shipment.trackingUrl,
    maskedPhone: maskPhone(order.contact.phone),
    maskedEmail: maskEmail(order.contact.email),
    timeline: events.map((e) => ({ label: e.label, at: e.at })),
  };
}

/**
 * Find an order by number AND matching contact. "Not found" and "wrong contact" are indistinguishable to the caller
 * so order numbers cannot be probed.
 */
export async function findOrderByContact(orderNumber: string, contact: string): Promise<Order | null> {
  const q = await col(C.orders).where("orderNumber", "==", orderNumber.toUpperCase()).limit(1).get();
  const doc = q.docs[0];
  if (!doc) return null;
  const order = orderFromDoc(doc);
  const input = contact.trim().toLowerCase();
  const phone = normalizeIndianPhone(input);
  const emailMatch = input.includes("@") && input === order.contact.email.toLowerCase();
  const phoneMatch = phone != null && (phone === order.contact.phone || phone === order.shippingAddress.phone);
  return emailMatch || phoneMatch ? order : null;
}
