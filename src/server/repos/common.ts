import "server-only";
import { randomUUID } from "node:crypto";
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
} as const;

/** Server clock as ISO-8601 UTC. All writes originate on the server, so this is the authoritative timestamp (D-25). */
export const nowIso = (): string => new Date().toISOString();
export const newId = (prefix = ""): string => `${prefix}${randomUUID().replace(/-/g, "").slice(0, 20)}`;

export const col = (name: string) => db().collection(name);

/** Firestore hard limits we design around (Standard edition). */
export const LIMITS = { batchWrites: 500, inClause: 30, docBytes: 1_048_576 } as const;

export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
