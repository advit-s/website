import { z } from "zod";
import { adminRoute } from "@/server/admin-http";
import { json, readJson } from "@/server/http";
import { updateVariant } from "@/server/services/inventory";

const body = z.object({
  expectedVersion: z.number().int().min(1),
  stock: z.number().int().min(0).max(100_000).optional(),
  priceOverride: z.number().int().min(1).max(10_000_000_00).nullable().optional(),
  lowStockThreshold: z.number().int().min(0).max(1000).optional(),
  reason: z.string().trim().max(120).default("manual count"),
});

/** Inline spreadsheet edit with optimistic concurrency: a stale expectedVersion is rejected with 409 and the current numbers. */
export const PATCH = adminRoute(async (req, ctx: { params: Promise<{ variantId: string }> }, admin) => {
  const { variantId } = await ctx.params;
  const { expectedVersion, reason, ...patch } = await readJson(req, body);
  const row = await updateVariant(variantId, expectedVersion, patch, reason || "manual count", admin.uid);
  return json({ row });
});
