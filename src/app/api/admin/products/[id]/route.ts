import { z } from "zod";
import { adminRoute } from "@/server/admin-http";
import { json, readJson } from "@/server/http";
import { productInputSchema } from "@/domain/admin-schemas";
import { saveProduct, setProductStatus } from "@/server/services/catalog-admin";

export const PUT = adminRoute(async (req, ctx: { params: Promise<{ id: string }> }, admin) => {
  const { id } = await ctx.params;
  const input = await readJson(req, productInputSchema, 256 * 1024);
  return json(await saveProduct(input, id, admin.uid));
});

const status = z.object({ status: z.enum(["draft", "published", "archived"]) });
export const PATCH = adminRoute(async (req, ctx: { params: Promise<{ id: string }> }, admin) => {
  const { id } = await ctx.params;
  const { status: s } = await readJson(req, status);
  await setProductStatus(id, s, admin.uid);
  return json({ ok: true });
});
