import { z } from "zod";
import { assertSameOrigin, clientIp, handle, json, readJson } from "@/server/http";
import { rateLimit, RULES } from "@/server/rate-limit";
import { getSession } from "@/server/auth/session";
import { getPrivateSettings } from "@/server/repos/settings";
import { answerCustomer } from "@/server/services/assistant-customer";

const body = z.object({
  sessionId: z.string().regex(/^[a-z0-9]{16,40}$/, "Invalid session"),
  message: z.string().min(1).max(600),
  website: z.string().max(0).optional(),
});

/**
 * Public shopping assistant. Read-only by construction (no tools, no data beyond retrieved catalogue + policies), rate limited per IP,
 * per session and per day, input/output bounded. See src/server/services/assistant-customer.ts for the safety design.
 */
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const { sessionId, message, website } = await readJson(req, body, 8 * 1024);
  if (website) return json({ reply: "Thanks!", products: [], handoffUrl: null, simulated: false, mode: "live" });
  await rateLimit(RULES.assistantIp, clientIp(req));
  await rateLimit(RULES.assistantSession, sessionId);
  const priv = await getPrivateSettings();
  await rateLimit({ name: "assistant:day", limit: priv.assistant.dailyMessageCap, windowSeconds: 86_400 }, new Date().toISOString().slice(0, 10));
  const session = await getSession();
  return json(await answerCustomer({ sessionId, message, userId: session?.uid ?? null }));
});
