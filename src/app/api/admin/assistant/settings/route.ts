import { z } from "zod";
import { adminRoute } from "@/server/admin-http";
import { json, readJson } from "@/server/http";
import { getPrivateSettings, savePrivateSettings } from "@/server/repos/settings";
import { audit } from "@/server/services/audit";

const body = z.object({ customerEnabled: z.boolean(), retentionDays: z.number().int().min(1).max(730), dailyMessageCap: z.number().int().min(10).max(100000) });

export const PUT = adminRoute(async (req, _ctx, admin) => {
  const b = await readJson(req, body);
  const cur = await getPrivateSettings();
  await savePrivateSettings({ ...cur, assistant: b }, admin.uid);
  await audit(admin.uid, "assistant.settings", "settings/private", b);
  return json({ ok: true });
});
