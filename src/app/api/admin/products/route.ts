import { adminRoute } from "@/server/admin-http";
import { json, readJson } from "@/server/http";
import { productInputSchema } from "@/domain/admin-schemas";
import { saveProduct } from "@/server/services/catalog-admin";

export const POST = adminRoute(async (req, _ctx, admin) => {
  const input = await readJson(req, productInputSchema, 256 * 1024);
  return json(await saveProduct(input, null, admin.uid), { status: 201 });
});
