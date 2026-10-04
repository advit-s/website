import { handle, json } from "@/server/http";
import { authorizeOrder } from "@/server/auth/order-access";
import { getPublicSettings } from "@/server/repos/settings";
import { C, col } from "@/server/repos/common";

/** Minimal payment/stock-hold status for an order the caller is authorised to see (used to resume checkout after a refresh). */
export const GET = handle(async (req) => {
  const orderId = new URL(req.url).searchParams.get("orderId") ?? "";
  const { order } = await authorizeOrder(orderId);
  const settings = await getPublicSettings();
  let holdExpiresAt: string | null = null;
  if (order.reservationId) {
    const r = await col(C.reservations).doc(order.reservationId).get();
    const d = r.data() as { status: string; expiresAt: string } | undefined;
    if (d?.status === "active") holdExpiresAt = d.expiresAt;
  }
  return json({
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    total: order.pricing.total,
    attempts: order.payment.attempts,
    maxAttempts: settings.checkout.maxPaymentAttempts,
    holdExpiresAt,
    canSwitchToCod: order.paymentMethod === "razorpay" && order.paymentStatus !== "paid" && Boolean(holdExpiresAt) && settings.cod.enabled && !order.hasCustomItems && !settings.delivery.codBlockedPincodes.includes(order.shippingAddress.pincode),
  });
});
