import { z } from "zod";
import { assertSameOrigin, clientIp, handle, json, readJson } from "@/server/http";
import { rateLimit, RULES } from "@/server/rate-limit";
import { priceCart } from "@/server/services/cart-pricing";
import { cartLinesSchema } from "@/domain/validation";

const body = z.object({
  lines: cartLinesSchema,
  pincode: z.string().regex(/^\d{6}$/).optional().or(z.literal("").transform(() => undefined)),
  couponCode: z.string().trim().toUpperCase().max(30).optional().or(z.literal("").transform(() => undefined)),
  paymentMethod: z.enum(["razorpay", "cod"]).optional(),
});

/** Server-revalidated cart: prices, availability, discount, shipping and totals. Client numbers are never trusted. */
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const input = await readJson(req, body);
  if (input.couponCode) await rateLimit(RULES.couponIp, clientIp(req));
  return json(await priceCart(input));
});
