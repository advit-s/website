import { z } from "zod";
import { assertSameOrigin, clientIp, handle, json, readJson } from "@/server/http";
import { rateLimit, RULES } from "@/server/rate-limit";
import { authorizeOrder } from "@/server/auth/order-access";
import { newPaymentAttempt, ensurePaymentAttempt } from "@/server/services/checkout";
import { switchToCod } from "@/server/services/payment-events";
import { orderFromDoc, orderRef } from "@/server/services/order-core";

const body = z.object({ orderId: z.string().min(5).max(40), action: z.enum(["resume", "retry", "switch_cod"]) });

/** Inline recovery after a failed or cancelled payment: reopen, retry (bounded attempts) or change to cash on delivery. */
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  await rateLimit(RULES.checkoutIp, clientIp(req));
  const { orderId, action } = await readJson(req, body);
  await authorizeOrder(orderId);
  if (action === "switch_cod") {
    await switchToCod(orderId);
    const o = orderFromDoc(await orderRef(orderId).get());
    return json({ ok: true, paymentMethod: o.paymentMethod, total: o.pricing.total });
  }
  const payment = action === "retry" ? await newPaymentAttempt(orderId) : await ensurePaymentAttempt(orderId);
  return json({ ok: true, payment });
});
