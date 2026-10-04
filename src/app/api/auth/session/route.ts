import { cookies } from "next/headers";
import { z } from "zod";
import { assertSameOrigin, clientIp, handle, json, readJson } from "@/server/http";
import { rateLimit, RULES } from "@/server/rate-limit";
import { createSessionFromIdToken, SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";

const body = z.object({ idToken: z.string().min(20).max(4096) });

/** Exchange a freshly-issued Firebase ID token for an HTTP-only, revocable session cookie. */
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  await rateLimit(RULES.sessionIp, clientIp(req));
  const { idToken } = await readJson(req, body);
  const s = await createSessionFromIdToken(idToken);
  (await cookies()).set(SESSION_COOKIE, s.cookie, sessionCookieOptions(s.maxAgeSeconds));
  return json({ ok: true, isAdmin: s.user.isAdmin });
});

/** Sign out: clears the cookie. Revoking refresh tokens (all devices) is done by the admin script or account security action. */
export const DELETE = handle(async (req) => {
  assertSameOrigin(req);
  (await cookies()).set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  return json({ ok: true });
});
