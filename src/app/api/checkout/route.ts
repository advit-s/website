import { assertSameOrigin, badRequest, clientIp, handle, json, readJson } from "@/server/http";
import { rateLimit, RULES } from "@/server/rate-limit";
import { checkoutSchema } from "@/domain/validation";
import { getSession } from "@/server/auth/session";
import { placeOrder } from "@/server/services/checkout";
import { setOrderAccessCookie } from "@/server/auth/order-access";

/**
 * Place an order. Requires an `Idempotency-Key` header (client UUID per checkout attempt): repeating the same request
 * returns the same order instead of creating another. Guests are supported; signed-in customers are linked to the order.
 */
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  await rateLimit(RULES.checkoutIp, clientIp(req));
  const key = req.headers.get("idempotency-key") ?? "";
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(key)) throw badRequest("A valid Idempotency-Key header is required.");
  const input = await readJson(req, checkoutSchema, 32 * 1024);
  if (input.website) throw badRequest("Request rejected."); // honeypot
  const session = await getSession();
  const result = await placeOrder(input, { userId: session?.uid ?? null, idempotencyKey: key });
  await setOrderAccessCookie(result.orderId);
  return json(result, { status: result.reused ? 200 : 201 });
});
