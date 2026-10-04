import { z } from "zod";
import { adminRoute } from "@/server/admin-http";
import { json, readJson } from "@/server/http";
import { categoryInputSchema } from "@/domain/admin-schemas";
import { deleteCategory, saveCategory } from "@/server/services/catalog-admin";

const withId = categoryInputSchema.extend({ id: z.string().min(1).max(60).optional() });

export const POST = adminRoute(async (req, _ctx, admin) => {
  const { id, ...input } = await readJson(req, withId);
  return json({ category: await saveCategory(input, id ?? null, admin.uid) }, { status: id ? 200 : 201 });
});

const del = z.object({ id: z.string().min(1).max(60), reassignTo: z.string().min(1).max(60).nullable().default(null) });
export const DELETE = adminRoute(
  async (req, _ctx, admin) => {
    const { id, reassignTo } = await readJson(req, del);
    return json(await deleteCategory(id, reassignTo, admin.uid));
  },
  { recent: true },
);
