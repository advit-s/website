import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, db } from "../firebase/admin";
import { env } from "../env";
import { C, nowIso } from "../repos/common";
import { HttpError, forbidden, unauthorized } from "../http";

/**
 * Session cookie name. "__session" is the only cookie Firebase-fronted CDNs forward to the origin, so it is
 * the safe choice for App Hosting. The cookie is HttpOnly, SameSite=Lax, Secure in production (D-15).
 */
export const SESSION_COOKIE = "__session";

/** Customer 14 days, admin 24 hours (inside the PDF's 7-14 d / 24-72 h ranges). */
export const SESSION_MS = { customer: 14 * 24 * 3600 * 1000, admin: 24 * 3600 * 1000 } as const;
/** An ID token must be this fresh to mint a session or perform a destructive admin action. */
export const RECENT_AUTH_SECONDS = 5 * 60;
/** Destructive admin actions need a sign-in no older than this (checked against the session cookie's auth_time). */
export const ADMIN_RECENT_SECONDS = 30 * 60;

export interface SessionUser {
  uid: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
}

function toUser(d: DecodedIdToken): SessionUser {
  return {
    uid: d.uid,
    email: d.email ?? null,
    phone: d.phone_number ?? null,
    name: (d.name as string | undefined) ?? null,
    emailVerified: Boolean(d.email_verified),
    isAdmin: d.admin === true,
  };
}

/** Verified current user from the session cookie (checks revocation), or null. Cached per request. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  if (!value) return null;
  try {
    return toUser(await adminAuth().verifySessionCookie(value, true));
  } catch {
    return null;
  }
});

/** For Server Components / pages: redirects to /login with a safe return path. */
export async function requireUserPage(returnTo: string): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return s;
}

/** Admin gate for pages: signed-out -> /login, signed-in non-admin -> /account. Never trusts client state. */
export async function requireAdminPage(returnTo: string): Promise<SessionUser> {
  const s = await requireUserPage(returnTo);
  if (!s.isAdmin) redirect("/account");
  return s;
}

/** For route handlers / server actions: throws HttpError instead of redirecting. */
export async function requireUser(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw unauthorized();
  return s;
}

export async function requireAdmin(): Promise<SessionUser> {
  const s = await requireUser();
  if (!s.isAdmin) throw forbidden("Administrator access required.");
  return s;
}

/**
 * Destructive admin actions (refunds, imports, deletions) need a *recent* sign-in. The session cookie embeds
 * auth_time; if it is older than RECENT_AUTH_SECONDS the admin must re-authenticate.
 */
export async function requireRecentAdmin(): Promise<SessionUser> {
  const admin = await requireAdmin();
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  const decoded = await adminAuth().verifySessionCookie(value ?? "", true);
  const authTime = decoded.auth_time ?? 0;
  if (Date.now() / 1000 - authTime > ADMIN_RECENT_SECONDS) {
    throw new HttpError(401, "REAUTH_REQUIRED", "Please sign in again to confirm this sensitive action.");
  }
  return admin;
}

export interface CreatedSession {
  cookie: string;
  maxAgeSeconds: number;
  user: SessionUser;
}

/** Exchange a freshly issued ID token for a revocable session cookie. */
export async function createSessionFromIdToken(idToken: string): Promise<CreatedSession> {
  const auth = adminAuth();
  let decoded: DecodedIdToken;
  try {
    decoded = await auth.verifyIdToken(idToken, true);
  } catch {
    throw new HttpError(401, "INVALID_TOKEN", "Your sign-in could not be verified. Please try again.");
  }
  if (Date.now() / 1000 - decoded.auth_time > RECENT_AUTH_SECONDS) {
    throw new HttpError(401, "STALE_TOKEN", "Please sign in again.");
  }
  const user = toUser(decoded);
  const ms = user.isAdmin ? SESSION_MS.admin : SESSION_MS.customer;
  const cookie = await auth.createSessionCookie(idToken, { expiresIn: ms });
  await ensureProfile(decoded);
  return { cookie, maxAgeSeconds: Math.floor(ms / 1000), user };
}

/** Server-owned profile creation (D-09). Never accepts role or other privileged fields from the client. */
async function ensureProfile(d: DecodedIdToken): Promise<void> {
  const ref = db().collection(C.users).doc(d.uid);
  const snap = await ref.get();
  const now = nowIso();
  if (!snap.exists) {
    await ref.set({
      fullName: (d.name as string | undefined) ?? "",
      email: d.email ?? null,
      phone: d.phone_number ?? null,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    const cur = snap.data() as { email?: string | null; phone?: string | null };
    const patch: Record<string, unknown> = {};
    if (!cur.email && d.email) patch.email = d.email;
    if (!cur.phone && d.phone_number) patch.phone = d.phone_number;
    if (Object.keys(patch).length) await ref.update({ ...patch, updatedAt: now });
  }
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: env().APP_ENV !== "local",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
