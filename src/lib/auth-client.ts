import { signOut, type User } from "firebase/auth";
import { firebaseAuth } from "./firebase-client";
import { clearGuestState, takeGuestState } from "@/components/providers/cart";
import { safeNext } from "./safe-redirect";

const FRIENDLY: Record<string, string> = {
  "auth/invalid-credential": "That email and password do not match.",
  "auth/wrong-password": "That email and password do not match.",
  "auth/user-not-found": "That email and password do not match.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/email-already-in-use": "An account with this email already exists. Try signing in instead.",
  "auth/weak-password": "Choose a stronger password (8+ characters with upper, lower and a number).",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/invalid-verification-code": "That code is not correct. Check the SMS and try again.",
  "auth/code-expired": "That code has expired. Request a new one.",
  "auth/invalid-phone-number": "Enter a valid Indian mobile number.",
  "auth/missing-phone-number": "Enter your mobile number.",
  "auth/quota-exceeded": "SMS limit reached. Please try again later.",
  "auth/captcha-check-failed": "Verification failed. Please refresh and try again.",
  "auth/network-request-failed": "Network problem. Check your connection and try again.",
  "auth/expired-action-code": "This link has expired. Request a new one.",
  "auth/invalid-action-code": "This link is invalid or has already been used. Request a new one.",
  "auth/user-disabled": "This account has been disabled. Contact support.",
  "auth/requires-recent-login": "Please sign in again to continue.",
  "auth/account-exists-with-different-credential": "An account already exists with a different sign-in method.",
};

export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code && FRIENDLY[code]) return FRIENDLY[code]!;
  return "Something went wrong. Please try again.";
}

/**
 * After Firebase authenticates the user in the browser: mint the server session cookie, merge the guest cart,
 * drop the browser-side Firebase session (the cookie is now the only session) and return where to go next.
 */
export async function completeSignIn(user: User, next?: string | null): Promise<string> {
  const idToken = await user.getIdToken(true); // force refresh so custom claims (admin) are current
  const r = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
    credentials: "same-origin",
  });
  const data = (await r.json().catch(() => ({}))) as { isAdmin?: boolean; error?: { message?: string } };
  if (!r.ok) throw new Error(data.error?.message ?? "We could not start your session. Please try again.");

  const guest = takeGuestState();
  if (guest.lines.length || guest.wishlist.length) {
    await fetch("/api/cart/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guest),
      credentials: "same-origin",
    }).catch(() => undefined);
  }
  clearGuestState();
  await signOut(firebaseAuth()).catch(() => undefined);
  // Role decides the default landing page: admin claim -> /admin, otherwise /account. A safe ?next= overrides it.
  const fallback = data.isAdmin ? "/admin" : "/account";
  return safeNext(next, fallback);
}
