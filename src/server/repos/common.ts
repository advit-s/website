import "server-only";
import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../firebase/admin";

export const C = {
  categories: "categories",
  products: "products",
  variants: "productVariants",
  orders: "orders",
  users: "users",
  stockLogs: "stockLogs",
  assistantLogs: "assistantLogs",
  settings: "settings",
  coupons: "coupons",
  couponRedemptions: "couponRedemptions",
  reservations: "stockReservations",
  idempotency: "idempotencyKeys",
  webhookReceipts: "webhookReceipts",
  contactEnquiries: "contactEnquiries",
  customEnquiries: "customEnquiries",
  auditLogs: "auditLogs",
  outbox: "notificationOutbox",
  uniqueKeys: "uniqueKeys",
  counters: "counters",
  orderAccess: "orderAccess",
  rateLimits: "rateLimits",
  simPayments: "simPayments",
  simShipments: "simShipments",
} as const;

/** Server clock as ISO-8601 UTC. All writes originate on the server, so this is the authoritative timestamp (D-25). */
export const nowIso = (): string => new Date().toISOString();
/**
 * Firestore TTL policies act ONLY on Timestamp fields. Use this for the `expiresAt` of rateLimits / idempotencyKeys (the documented
 * exception to the ISO-string convention, D-25). TTL deletion is delayed cleanup - never rely on it for access control or business expiry.
 */
export const ttlTimestamp = (epochMs: number): Timestamp => Timestamp.fromMillis(epochMs);

export const newId = (prefix = ""): string => `${prefix}${randomUUID().replace(/-/g, "").slice(0, 20)}`;

export const col = (name: string) => db().collection(name);

/** Firestore hard limits we design around (Standard edition). */
export const LIMITS = { batchWrites: 500, inClause: 30, docBytes: 1_048_576 } as const;

export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Opaque pagination cursor = (sort value, document id). The id breaks ties so equal timestamps never skip or repeat rows. */
export function encodeCursor(value: string, id: string): string {
  return Buffer.from(`${value}|${id}`, "utf8").toString("base64url");
}
export function decodeCursor(c: string | null | undefined): { value: string; id: string } | null {
  if (!c || c.length > 200) return null;
  try {
    const raw = Buffer.from(c, "base64url").toString("utf8");
    const i = raw.lastIndexOf("|");
    return i > 0 ? { value: raw.slice(0, i), id: raw.slice(i + 1) } : null;
  } catch {
    return null;
  }
}
