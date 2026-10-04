import type { FulfilmentStatus, PaymentStatus, ReturnStatus } from "./types";

/**
 * Fulfilment state machine (docs/DECISIONS.md D-03). Cancellation is only reachable before Shipped.
 * Payment status and return status are tracked separately so "return requested" never means "refunded".
 */
const ORDER: FulfilmentStatus[] = ["new", "confirmed", "processing", "shipped", "out_for_delivery", "delivered"];

const NEXT: Record<FulfilmentStatus, FulfilmentStatus[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function allowedTransitions(from: FulfilmentStatus): FulfilmentStatus[] {
  return NEXT[from];
}

export function canTransition(from: FulfilmentStatus, to: FulfilmentStatus): boolean {
  return NEXT[from].includes(to);
}

/** A courier/webhook event may only move an order forward, never regress or resurrect it. */
export function canAdvanceFromProvider(from: FulfilmentStatus, to: FulfilmentStatus): boolean {
  if (from === "cancelled" || to === "cancelled") return false;
  const a = ORDER.indexOf(from);
  const b = ORDER.indexOf(to);
  // Provider may only drive shipped -> out_for_delivery -> delivered (and skip straight to delivered)
  return a >= ORDER.indexOf("shipped") && b > a && b >= ORDER.indexOf("out_for_delivery");
}

export function isCancellable(status: FulfilmentStatus): boolean {
  return NEXT[status].includes("cancelled");
}

export const STATUS_LABEL: Record<FulfilmentStatus, string> = {
  new: "New",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: "Payment pending",
  paid: "Paid",
  failed: "Payment failed",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

export const RETURN_LABEL: Record<ReturnStatus, string> = {
  none: "No return",
  requested: "Return requested",
  approved: "Return approved",
  rejected: "Return declined",
  received: "Return received",
  refund_pending: "Refund pending",
  closed: "Return closed",
};

/**
 * Account-page filters (All/Processing/Shipped/Delivered/Cancelled) and admin queue tabs
 * (All/Pending/Processing/Shipped/Delivered/Cancelled/Returns) map onto the canonical fields here.
 * "Processing" for customers covers everything accepted but not yet dispatched. "Pending" (admin) means awaiting action.
 */
export type QueueTab = "all" | "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "returns";

export const QUEUE_TABS: { id: QueueTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "processing", label: "Processing" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
  { id: "returns", label: "Returns" },
];

export function matchesQueueTab(
  tab: QueueTab,
  o: { status: FulfilmentStatus; paymentStatus: PaymentStatus; returnStatus: ReturnStatus; paymentMethod: "razorpay" | "cod" },
): boolean {
  switch (tab) {
    case "all":
      return true;
    case "pending":
      return o.status === "new" || (o.status !== "cancelled" && o.paymentMethod === "razorpay" && o.paymentStatus === "pending");
    case "processing":
      return o.status === "confirmed" || o.status === "processing";
    case "shipped":
      return o.status === "shipped" || o.status === "out_for_delivery";
    case "delivered":
      return o.status === "delivered";
    case "cancelled":
      return o.status === "cancelled";
    case "returns":
      return o.returnStatus !== "none";
  }
}

export type CustomerFilter = "all" | "processing" | "shipped" | "delivered" | "cancelled";
export function matchesCustomerFilter(f: CustomerFilter, status: FulfilmentStatus): boolean {
  switch (f) {
    case "all":
      return true;
    case "processing":
      return status === "new" || status === "confirmed" || status === "processing";
    case "shipped":
      return status === "shipped" || status === "out_for_delivery";
    case "delivered":
      return status === "delivered";
    case "cancelled":
      return status === "cancelled";
  }
}
