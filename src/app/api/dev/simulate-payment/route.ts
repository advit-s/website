import { z } from "zod";
import { createHash } from "node:crypto";
import { assertSameOrigin, handle, json, notFound, readJson } from "@/server/http";
import { isSimulated, env } from "@/server/env";
import { authorizeOrder } from "@/server/auth/order-access";
import { hmacHex, simulatedPayments, SIM_WEBHOOK_SECRET } from "@/server/providers/payments";

const body = z.object({ orderId: z.string().min(5).max(40), outcome: z.enum(["success", "failed", "cancelled"]), deliverWebhook: z.boolean().default(true) });

/**
 * LOCAL SIMULATION ONLY. Plays the part of the customer paying in Razorpay Checkout: creates a simulated payment and,
 * like the real provider, sends a SIGNED webhook to our own webhook endpoint. Returns the callback fields the browser
 * would receive. Hard-disabled outside simulated mode (and simulated mode is refused in production by env validation).
 */
export const POST = handle(async (req) => {
  if (!isSimulated() || env().APP_ENV === "production") throw notFound();
  assertSameOrigin(req);
  const b = await readJson(req, body);
  const { order } = await authorizeOrder(b.orderId);
  const providerOrderId = order.payment.razorpayOrderId;
  if (!providerOrderId) throw notFound("No payment attempt to simulate.");
  if (b.outcome === "cancelled") return json({ cancelled: true });

  const sim = simulatedPayments();
  const { payment, signature } = await sim.simulateCustomerPayment(providerOrderId, b.outcome === "success" ? "success" : "failed");
  if (b.deliverWebhook) {
    const payload = JSON.stringify({
      event: payment.status === "captured" ? "payment.captured" : "payment.failed",
      payload: { payment: { entity: { id: payment.id, order_id: payment.orderId, amount: payment.amount, currency: payment.currency, status: payment.status, error_description: payment.errorDescription } } },
    });
    const eventId = "evt_" + createHash("sha256").update(payload).digest("hex").slice(0, 20);
    await fetch(new URL("/api/webhooks/razorpay", env().NEXT_PUBLIC_SITE_URL), {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": hmacHex(SIM_WEBHOOK_SECRET(), payload), "x-razorpay-event-id": eventId },
      body: payload,
    }).catch(() => undefined);
  }
  return json({ razorpay_order_id: payment.orderId, razorpay_payment_id: payment.id, razorpay_signature: signature, status: payment.status });
});
