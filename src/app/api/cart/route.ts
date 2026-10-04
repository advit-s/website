import { z } from "zod";
import { assertSameOrigin, handle, json, readJson } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { clearStoredCart, getStoredCart, setStoredLine } from "@/server/repos/cart";

export const GET = handle(async () => {
  const u = await requireUser();
  return json({ lines: await getStoredCart(u.uid) });
});

const put = z.object({ variantId: z.string().min(1).max(120), quantity: z.number().int().min(0).max(10) });
export const PUT = handle(async (req) => {
  assertSameOrigin(req);
  const u = await requireUser();
  const { variantId, quantity } = await readJson(req, put);
  return json({ lines: await setStoredLine(u.uid, variantId, quantity) });
});

export const DELETE = handle(async (req) => {
  assertSameOrigin(req);
  const u = await requireUser();
  await clearStoredCart(u.uid);
  return json({ lines: [] });
});
