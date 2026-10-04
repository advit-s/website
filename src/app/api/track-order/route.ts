import { assertSameOrigin, clientIp, HttpError, handle, json, readJson } from "@/server/http";
import { rateLimit, RULES } from "@/server/rate-limit";
import { trackOrderSchema } from "@/domain/validation";
import { findOrderByContact, toPublicTracking } from "@/server/services/order-view";

const NOT_FOUND = () => new HttpError(404, "NOT_FOUND", "We couldn't find an order matching those details. Check the order number and the phone number or email used at checkout.");

/** Guest order lookup: order number + matching contact -> minimal masked tracking data. Rate-limited per IP and per order number. */
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  await rateLimit(RULES.trackOrderIp, clientIp(req));
  const { orderNumber, contact } = await readJson(req, trackOrderSchema);
  await rateLimit(RULES.trackOrderTarget, orderNumber);
  const order = await findOrderByContact(orderNumber, contact);
  if (!order) throw NOT_FOUND();
  return json({ tracking: await toPublicTracking(order) });
});
