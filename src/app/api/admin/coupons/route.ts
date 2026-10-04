import { z } from "zod";
import { adminRoute } from "@/server/admin-http";
import { json, readJson } from "@/server/http";
import { C, col, nowIso } from "@/server/repos/common";
import { audit } from "@/server/services/audit";

const iso = z.string().datetime().nullable().default(null);
const body = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,29}$/, "3-30 characters: letters, numbers, - or _"),
    type: z.enum(["percent", "fixed"]),
    /** percent: whole percent 1-90 (stored as basis points); fixed: paise */
    value: z.number().int().min(1),
    minSubtotal: z.number().int().min(0).max(100_000_000_00).default(0),
    maxDiscount: z.number().int().min(1).max(100_000_000_00).nullable().default(null),
    usageLimit: z.number().int().min(1).max(1_000_000).nullable().default(null),
    perUserLimit: z.number().int().min(1).max(100).nullable().default(null),
    startsAt: iso,
    endsAt: iso,
    isActive: z.boolean().default(true),
    excludesCustom: z.boolean().default(true),
    description: z.string().trim().max(120).default(""),
  })
  .superRefine((c, ctx) => {
    if (c.type === "percent" && c.value > 90) ctx.addIssue({ code: "custom", path: ["value"], message: "A percentage coupon cannot exceed 90%" });
    if (c.type === "fixed" && c.value > 100_000_000) ctx.addIssue({ code: "custom", path: ["value"], message: "Too large" });
    if (c.startsAt && c.endsAt && c.startsAt >= c.endsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after start" });
  });

export const GET = adminRoute(async () => {
  const snap = await col(C.coupons).orderBy("createdAt", "desc").limit(50).get();
  return json({ coupons: snap.docs.map((d) => ({ ...(d.data() as object), code: d.id })) });
});

/** Create or update a coupon. `usedCount` is owned by checkout and is never writable here. Percent values arrive as whole percent. */
export const POST = adminRoute(async (req, _ctx, admin) => {
  const c = await readJson(req, body);
  const ref = col(C.coupons).doc(c.code);
  const cur = await ref.get();
  const stored = { ...c, value: c.type === "percent" ? c.value * 100 : c.value };
  if (!cur.exists) await ref.set({ ...stored, usedCount: 0, createdAt: nowIso(), updatedAt: nowIso() });
  else await ref.set({ ...stored, updatedAt: nowIso() }, { merge: true });
  await audit(admin.uid, cur.exists ? "coupon.update" : "coupon.create", c.code, { type: c.type, active: c.isActive });
  return json({ ok: true });
});
