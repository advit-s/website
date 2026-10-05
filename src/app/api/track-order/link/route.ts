import { assertSameOrigin, clientIp, HttpError, handle, json, readJson } from "@/server/http";
import { rateLimit, RULES } from "@/server/rate-limit";
import { trackOrderSchema } from "@/domain/validation";
import { findOrderByContact } from "@/server/services/order-view";
import { makeAccessToken } from "@/server/services/order-core";
import { enqueueNotification } from "@/server/services/notifications";
import { deliveryCapability } from "@/server/providers/messaging";
import { env, isSimulated } from "@/server/env";

/**
 * Private order details (address, prices, invoice) require a verified channel: a short-lived, order-scoped link goes to the
 * email/phone ON FILE (never to what the visitor typed). The response says only what is true:
 *   "preview_only"  local simulated build - nothing is sent; the link is returned, labelled, for local testing
 *   "queued"        a real channel exists; the message is queued for delivery (NOT yet delivered)
 *   503 MESSAGING_UNAVAILABLE  live mode with no channel configured - nothing is queued or stored, no link is created
 * The outbox stores only the order id; the link itself is minted at delivery time and never persisted.
 */
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  await rateLimit(RULES.trackOrderIp, clientIp(req));
  const { orderNumber, contact } = await readJson(req, trackOrderSchema);
  await rateLimit(RULES.trackOrderTarget, orderNumber);
  const order = await findOrderByContact(orderNumber, contact);
  if (!order) throw new HttpError(404, "NOT_FOUND", "We couldn't find an order matching those details.");
  const capability = deliveryCapability();
  if (capability === "unavailable") {
    throw new HttpError(503, "MESSAGING_UNAVAILABLE", "We can't send secure links right now. Please contact us and we will help you with your order.");
  }
  await enqueueNotification({
    kind: "order.secure_link",
    to: { email: order.contact.email, phone: order.contact.phone },
    data: { orderNumber: order.orderNumber, orderId: order.id },
  });
  if (capability === "preview_only") {
    const token = makeAccessToken(order.id, "track", 3600);
    const link = new URL(`/api/track-order/open?token=${encodeURIComponent(token)}`, env().NEXT_PUBLIC_SITE_URL).toString();
    return json({ status: "preview_only", simulatedPreviewLink: isSimulated() ? link : undefined });
  }
  return json({ status: "queued" });
});
