import { z } from "zod";
import { assertSameOrigin, handle, json, readJson } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { getWishlistIds, setWishlist } from "@/server/repos/cart";

export const GET = handle(async () => {
  const u = await requireUser();
  return json({ productIds: await getWishlistIds(u.uid) });
});

const put = z.object({ productId: z.string().min(1).max(60), on: z.boolean() });
export const PUT = handle(async (req) => {
  assertSameOrigin(req);
  const u = await requireUser();
  const { productId, on } = await readJson(req, put);
  await setWishlist(u.uid, productId, on);
  return json({ productIds: await getWishlistIds(u.uid) });
});
