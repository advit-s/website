import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { C, col, newId, nowIso } from "../repos/common";
import { env } from "../env";
import type { Order, TimelineEvent } from "@/domain/types";

export function orderFromDoc(snap: FirebaseFirestore.DocumentSnapshot): Order {
  return { ...(snap.data() as Omit<Order, "id">), id: snap.id };
}

export const orderRef = (id: string) => col(C.orders).doc(id);

/** Queue a timeline entry inside a transaction. `customerVisible` entries are shown on tracking pages. */
export function addTimeline(tx: Transaction, orderId: string, e: Omit<TimelineEvent, "id" | "at"> & { at?: string }): void {
  const id = newId("tl_");
  tx.set(orderRef(orderId).collection("timeline").doc(id), { ...e, at: e.at ?? nowIso() });
}

export async function addTimelineNow(orderId: string, e: Omit<TimelineEvent, "id" | "at">): Promise<void> {
  await orderRef(orderId).collection("timeline").doc(newId("tl_")).set({ ...e, at: nowIso() });
}

export async function getTimeline(orderId: string, customerOnly: boolean): Promise<TimelineEvent[]> {
  const snap = await orderRef(orderId).collection("timeline").orderBy("at", "asc").limit(200).get();
  const all = snap.docs.map((d) => ({ ...(d.data() as Omit<TimelineEvent, "id">), id: d.id }));
  return customerOnly ? all.filter((e) => e.customerVisible) : all;
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/* --------------------------------------------------------------- access tokens
 * Guests have no account, so confirmation/tracking access is a signed, expiring, order-scoped token (never the
 * order id alone). Format: base64url(JSON{o,e,k}).hex(hmac). `k` is the purpose ("success" | "track").
 */
function secret(): string {
  const e = env();
  const s = e.ORDER_TOKEN_SECRET ?? (e.APP_ENV === "local" ? e.SIMULATION_SECRET : undefined);
  if (!s) throw new Error("ORDER_TOKEN_SECRET is not configured.");
  return s;
}

export type TokenPurpose = "success" | "track";

export function makeAccessToken(orderId: string, purpose: TokenPurpose, ttlSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ o: orderId, k: purpose, e: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyAccessToken(token: string | undefined | null, orderId: string, purpose: TokenPurpose): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = createHmac("sha256", secret()).update(payload).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { o: string; k: string; e: number };
    return p.o === orderId && p.k === purpose && p.e > Date.now() / 1000;
  } catch {
    return false;
  }
}

/** Verify a token for a purpose and return the order id it grants access to (null if invalid/expired). */
export function parseAccessToken(token: string | undefined | null, purpose: TokenPurpose): string | null {
  if (!token) return null;
  const [payload] = token.split(".");
  if (!payload) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { o?: string };
    return p.o && verifyAccessToken(token, p.o, purpose) ? p.o : null;
  } catch {
    return null;
  }
}

export const ACCESS_COOKIE = (orderId: string) => `rr_oa_${orderId.slice(-12)}`;

/** Mask for tracking views: "+91••••••3210", "p•••@example.com". */
export function maskPhone(p: string): string {
  return p.length > 4 ? `${p.slice(0, 3)}${"•".repeat(Math.max(0, p.length - 7))}${p.slice(-4)}` : "••••";
}
export function maskEmail(e: string): string {
  const [u = "", d = ""] = e.split("@");
  return `${u.slice(0, 1)}${"•".repeat(Math.max(2, u.length - 1))}@${d}`;
}

export function formatOrderNumber(n: number): string {
  return `RRC-${n}`;
}
