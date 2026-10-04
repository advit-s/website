import "server-only";
import { FieldPath } from "firebase-admin/firestore";
import { C, col, decodeCursor, encodeCursor } from "./common";
import { orderFromDoc } from "../services/order-core";
import type { CustomerFilter } from "@/domain/order-state";
import type { FulfilmentStatus, Order } from "@/domain/types";

const STATUS_SETS: Record<CustomerFilter, FulfilmentStatus[] | null> = {
  all: null,
  processing: ["new", "confirmed", "processing"],
  shipped: ["shipped", "out_for_delivery"],
  delivered: ["delivered"],
  cancelled: ["cancelled"],
};

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** A customer's own orders, newest first, cursor-paginated (never loads all orders). Needs the composite indexes in firestore.indexes.json. */
export async function listUserOrders(uid: string, filter: CustomerFilter, cursor: string | null, limit = 10): Promise<Page<Order>> {
  let q: FirebaseFirestore.Query = col(C.orders).where("userId", "==", uid);
  const set = STATUS_SETS[filter];
  if (set) q = q.where("status", "in", set);
  q = q.orderBy("placedAt", "desc").orderBy(FieldPath.documentId(), "desc");
  const c = decodeCursor(cursor);
  if (c) q = q.startAfter(c.value, c.id);
  const snap = await q.limit(limit + 1).get();
  const docs = snap.docs.map(orderFromDoc);
  const items = docs.slice(0, limit);
  return { items, nextCursor: docs.length > limit && items.length ? encodeCursor(items[items.length - 1]!.placedAt, items[items.length - 1]!.id) : null };
}

export async function countUserOrders(uid: string): Promise<number> {
  const agg = await col(C.orders).where("userId", "==", uid).count().get();
  return agg.data().count;
}
