import { z } from "zod";
import { assertSameOrigin, clientIp, handle, json, readJson } from "@/server/http";
import { rateLimit, RULES } from "@/server/rate-limit";
import { authorizeOrder } from "@/server/auth/order-access";
import { verifyCheckoutCallback } from "@/server/services/payment-events";

const body = z.object({
  orderId: z.string().min(5).max(40),
  razorpay_order_id: z.string().min(5).max(80),
  razorpay_payment_id: z.string().min(5).max(80),
  razorpay_signature: z.string().min(20).max(200),
});

/**
 * Browser callback after Checkout. The signature AND a provider-side payment lookup must both pass before the order is
 * marked paid; a plain client POST can never mark an order paid.
 */
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  await rateLimit(RULES.checkoutIp, clientIp(req));
  const b = await readJson(req, body);
  await authorizeOrder(b.orderId);
  const r = await verifyCheckoutCallback(b.orderId, { providerOrderId: b.razorpay_order_id, paymentId: b.razorpay_payment_id, signature: b.razorpay_signature });
  return json(r);
});
