import { assertSameOrigin, clientIp, HttpError, handle, json, readJson } from "@/server/http";
import { rateLimit, RULES } from "@/server/rate-limit";
import { trackOrderSchema } from "@/domain/validation";
import { findOrderByContact } from "@/server/services/order-view";
import { makeAccessToken } from "@/server/services/order-core";
import { enqueueNotification } from "@/server/services/notifications";
import { env, isSimulated } from "@/server/env";

/**
 * Private order details (address, prices, invoice) require a verified channel: we send a short-lived, order-scoped link to the
 * email/phone ON FILE (never to what the visitor typed). No messaging vendor is configured yet, so the link goes to the notification
 * outbox; in simulated mode it is also returned and clearly labelled so the flow can be tested locally.
 */
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  await rateLimit(RULES.trackOrderIp, clientIp(req));
  const { orderNumber, contact } = await readJson(req, trackOrderSchema);
  await rateLimit(RULES.trackOrderTarget, orderNumber);
  const order = await findOrderByContact(orderNumber, contact);
  if (!order) throw new HttpError(404, "NOT_FOUND", "We couldn't find an order matching those details.");
  const token = makeAccessToken(order.id, "track", 3600);
  const link = new URL(`/api/track-order/open?token=${encodeURIComponent(token)}`, env().NEXT_PUBLIC_SITE_URL).toString();
  await enqueueNotification({
    kind: "order.status",
    to: { email: order.contact.email, phone: order.contact.phone },
    data: { orderNumber: order.orderNumber, statusLabel: "Secure order link", detail: `Open this link within 1 hour to see your full order details: ${link}` },
  });
  return json({ sent: true, simulatedPreviewLink: isSimulated() ? link : undefined });
});
