import { z } from "zod";
import { assertSameOrigin, handle, json, readJson } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { mergeStoredCart, mergeWishlist, getWishlistIds } from "@/server/repos/cart";
import { cartLinesSchema } from "@/domain/validation";

const body = z.object({ lines: cartLinesSchema, wishlist: z.array(z.string().max(60)).max(100).default([]) });

/** Merge the browser's guest cart/wishlist into the signed-in account deliberately, with stock caps. */
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const u = await requireUser();
  const { lines, wishlist } = await readJson(req, body);
  const merged = await mergeStoredCart(u.uid, lines);
  await mergeWishlist(u.uid, wishlist);
  return json({ lines: merged, wishlist: await getWishlistIds(u.uid) });
});
