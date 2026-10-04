import "server-only";
import { AggregateField, FieldPath } from "firebase-admin/firestore";
import { C, col, decodeCursor, encodeCursor } from "../repos/common";
import { normalizeIndianPhone } from "@/domain/validation";
import { orderFromDoc } from "./order-core";
import type { Order } from "@/domain/types";

export interface CustomerRow {
  uid: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  orderCount: number;
  spend: number; // paid orders, before refunds
  latestOrder: { id: string; orderNumber: string; placedAt: string } | null;
}

async function stats(uid: string): Promise<Pick<CustomerRow, "orderCount" | "spend" | "latestOrder">> {
  const orders = col(C.orders).where("userId", "==", uid);
  const [count, sum, latest] = await Promise.all([
    orders.count().get(),
    orders.where("paymentStatus", "in", ["paid", "partially_refunded"]).aggregate({ s: AggregateField.sum("pricing.total") }).get(),
    orders.orderBy("placedAt", "desc").limit(1).get(),
  ]);
  const l = latest.docs[0];
  const o = l ? orderFromDoc(l) : null;
  return { orderCount: count.data().count, spend: sum.data().s ?? 0, latestOrder: o ? { id: o.id, orderNumber: o.orderNumber, placedAt: o.placedAt } : null };
}

/** Registered customers only (guest orders live in the order queue). Cursor-paginated; aggregates are per-row count/sum queries, not scans. */
export async function listCustomers(opts: { q?: string; cursor?: string | null; limit?: number }): Promise<{ rows: CustomerRow[]; nextCursor: string | null; note: string | null }> {
  const limit = opts.limit ?? 20;
  const term = (opts.q ?? "").trim();
  let docs: FirebaseFirestore.QueryDocumentSnapshot[];
  let nextCursor: string | null = null;
  if (term) {
    let q: FirebaseFirestore.Query | null = null;
    if (term.includes("@")) q = col(C.users).where("email", "==", term.toLowerCase());
    else if (normalizeIndianPhone(term)) q = col(C.users).where("phone", "==", normalizeIndianPhone(term));
    if (!q) return { rows: [], nextCursor: null, note: "Search by exact email address or a 10-digit phone number." };
    docs = (await q.limit(10).get()).docs;
  } else {
    let q: FirebaseFirestore.Query = col(C.users).orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
    const c = decodeCursor(opts.cursor);
    if (c) q = q.startAfter(c.value, c.id);
    const snap = await q.limit(limit + 1).get();
    docs = snap.docs.slice(0, limit);
    if (snap.docs.length > limit && docs.length) nextCursor = encodeCursor((docs.at(-1)!.data() as { createdAt: string }).createdAt, docs.at(-1)!.id);
  }
  const rows = await Promise.all(
    docs.map(async (d) => {
      const u = d.data() as { fullName?: string; email?: string | null; phone?: string | null; createdAt: string };
      return { uid: d.id, fullName: u.fullName ?? "", email: u.email ?? null, phone: u.phone ?? null, createdAt: u.createdAt, ...(await stats(d.id)) };
    }),
  );
  return { rows, nextCursor, note: null };
}

export async function getCustomer(uid: string) {
  const snap = await col(C.users).doc(uid).get();
  if (!snap.exists) return null;
  const u = snap.data() as { fullName?: string; email?: string | null; phone?: string | null; createdAt: string };
  const [st, addrs] = await Promise.all([stats(uid), col(C.users).doc(uid).collection("addresses").limit(20).get()]);
  return {
    uid,
    fullName: u.fullName ?? "",
    email: u.email ?? null,
    phone: u.phone ?? null,
    createdAt: u.createdAt,
    ...st,
    addresses: addrs.docs.map((d) => ({ id: d.id, ...(d.data() as { label: string; fullName: string; line1: string; line2: string; city: string; state: string; pincode: string; phone: string; isDefault: boolean }) })),
  };
}

export type { Order };
