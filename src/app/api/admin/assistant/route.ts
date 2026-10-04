import { z } from "zod";
import { adminRoute } from "@/server/admin-http";
import { json, readJson } from "@/server/http";
import { rateLimit, RULES } from "@/server/rate-limit";
import { answerAdmin } from "@/server/services/assistant-admin";

const body = z.object({ conversationId: z.string().regex(/^[a-z0-9]{8,40}$/), message: z.string().min(1).max(600) });

/** Admin-only assistant. adminRoute re-verifies the session and admin claim on EVERY call; tools are read-only. */
export const POST = adminRoute(async (req, _ctx, admin) => {
  await rateLimit(RULES.adminAssistant, admin.uid);
  const b = await readJson(req, body, 8 * 1024);
  return json(await answerAdmin({ adminUid: admin.uid, conversationId: b.conversationId, message: b.message }));
});
