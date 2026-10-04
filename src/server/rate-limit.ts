import "server-only";
import { createHash } from "node:crypto";
import { C, col, nowIso } from "./repos/common";
import { db } from "./firebase/admin";
import { HttpError } from "./http";

/**
 * Distributed fixed-window rate limiter backed by Firestore (shared by every server instance).
 * Each (rule, subject, window) is one document; `expiresAt` supports a Firestore TTL policy (docs/DEPLOYMENT.md).
 * Sensitive rules fail CLOSED when the store is unreachable; low-risk rules set `failOpen`.
 */
export interface RateLimitRule {
  /** Logical bucket, e.g. "assistant:ip" */
  name: string;
  limit: number;
  windowSeconds: number;
  failOpen?: boolean;
}

export async function rateLimit(rule: RateLimitRule, subject: string): Promise<{ remaining: number; retryAfter: number }> {
  const now = Date.now();
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
  const id = `${createHash("sha256").update(`${rule.name}|${subject}`).digest("hex").slice(0, 40)}_${windowStart}`;
  const ref = col(C.rateLimits).doc(id);

  let result: { allowed: boolean; count: number };
  try {
    result = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? ((snap.data() as { count?: number }).count ?? 0) : 0;
      if (current >= rule.limit) return { allowed: false, count: current };
      tx.set(ref, {
        rule: rule.name,
        count: current + 1,
        windowStart: new Date(windowStart).toISOString(),
        expiresAt: new Date(windowStart + windowMs * 2).toISOString(),
        updatedAt: nowIso(),
      });
      return { allowed: true, count: current + 1 };
    });
  } catch {
    if (rule.failOpen) return { remaining: 1, retryAfter };
    throw new HttpError(503, "RATE_LIMIT_UNAVAILABLE", "Service temporarily unavailable. Please try again shortly.");
  }

  if (!result.allowed) {
    throw new HttpError(429, "RATE_LIMITED", "Too many requests. Please wait a moment and try again.", { retryAfter });
  }
  return { remaining: Math.max(0, rule.limit - result.count), retryAfter };
}

/** Pre-defined rules. Callers combine IP and per-subject limits. */
export const RULES = {
  assistantIp: { name: "assistant:ip", limit: 20, windowSeconds: 600 },
  assistantSession: { name: "assistant:session", limit: 30, windowSeconds: 3600 },
  adminAssistant: { name: "admin-assistant:uid", limit: 60, windowSeconds: 3600 },
  checkoutIp: { name: "checkout:ip", limit: 20, windowSeconds: 600 },
  trackOrderIp: { name: "track:ip", limit: 10, windowSeconds: 600 },
  trackOrderTarget: { name: "track:order", limit: 5, windowSeconds: 900 },
  contactIp: { name: "contact:ip", limit: 5, windowSeconds: 3600 },
  customEnquiryIp: { name: "custom:ip", limit: 5, windowSeconds: 3600 },
  sessionIp: { name: "session:ip", limit: 30, windowSeconds: 600 },
  pincodeIp: { name: "pincode:ip", limit: 60, windowSeconds: 300, failOpen: true },
  importUid: { name: "import:uid", limit: 10, windowSeconds: 3600 },
  couponIp: { name: "coupon:ip", limit: 20, windowSeconds: 600, failOpen: true },
} satisfies Record<string, RateLimitRule>;
