import { z } from "zod";
import { adminRoute } from "@/server/admin-http";
import { conflict, json, readJson } from "@/server/http";
import { privateSettingsSchema, publicSettingsSchema } from "@/domain/settings";
import { getPrivateSettings, getPublicSettingsFresh, savePrivateSettings, savePublicSettings } from "@/server/repos/settings";
import { audit } from "@/server/services/audit";
import { C, col } from "@/server/repos/common";

const safeHref = z.string().max(200).refine((v) => v === "" || v.startsWith("/") || /^https:\/\//.test(v), "Use a path starting with / or an https:// link");
const body = z.object({
  public: publicSettingsSchema.superRefine((p, ctx) => {
    if (p.announcement.href) {
      const r = safeHref.safeParse(p.announcement.href);
      if (!r.success) ctx.addIssue({ code: "custom", path: ["announcement", "href"], message: r.error.issues[0]!.message });
    }
    if (!/^(\/|https:\/\/)/.test(p.hero.ctaHref)) ctx.addIssue({ code: "custom", path: ["hero", "ctaHref"], message: "Use a path starting with / or an https:// link" });
    if (p.delivery.ncrDays[0] > p.delivery.ncrDays[1]) ctx.addIssue({ code: "custom", path: ["delivery", "ncrDays"], message: "Minimum days cannot exceed maximum" });
    if (p.delivery.restDays[0] > p.delivery.restDays[1]) ctx.addIssue({ code: "custom", path: ["delivery", "restDays"], message: "Minimum days cannot exceed maximum" });
    if (p.policy.refundBusinessDaysMin > p.policy.refundBusinessDaysMax) ctx.addIssue({ code: "custom", path: ["policy", "refundBusinessDaysMin"], message: "Minimum cannot exceed maximum" });
  }),
  private: privateSettingsSchema,
  expectedUpdatedAt: z.string().nullable().optional(),
});

export const GET = adminRoute(async () => json({ public: await getPublicSettingsFresh(), private: await getPrivateSettings() }));

/** Validated save. Contains no secrets (those live in environment/secret manager). Conflict-checked against the last-seen update time. */
export const PUT = adminRoute(async (req, _ctx, admin) => {
  const b = await readJson(req, body, 128 * 1024);
  const cur = await col(C.settings).doc("public").get();
  const curUpdated = (cur.data() as { updatedAt?: string } | undefined)?.updatedAt ?? null;
  if (b.expectedUpdatedAt !== undefined && b.expectedUpdatedAt !== curUpdated) {
    throw conflict("VERSION_CONFLICT", "Settings were changed by someone else since you opened this page. Reload to see their changes.");
  }
  await savePublicSettings(b.public, admin.uid);
  await savePrivateSettings(b.private, admin.uid);
  await audit(admin.uid, "settings.update", "settings", { sections: "public+private" });
  const after = await col(C.settings).doc("public").get();
  return json({ ok: true, updatedAt: (after.data() as { updatedAt?: string }).updatedAt });
});
