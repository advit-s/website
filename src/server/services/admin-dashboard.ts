import "server-only";
import { AggregateField } from "firebase-admin/firestore";
import { C, col } from "../repos/common";
import { orderFromDoc } from "./order-core";
import { fromDoc } from "../repos/catalog";
import { periodRange, type Period } from "@/domain/time";
import type { Order, Variant } from "@/domain/types";

export interface DashboardData {
  rangeLabel: string;
  period: Period;
  ordersPlaced: number;
  paidRevenue: number;
  paidOrders: number;
  toConfirm: number;
  awaitingPayment: number;
  codOutstanding: { count: number; value: number };
  returnsOpen: number;
  needsReview: number;
  lowStockCount: number;
  lowStock: { id: string; productName: string; size: string; color: string; sku: string; available: number; threshold: number }[];
  recentOrders: Order[];
}

/**
 * Every figure is a bounded aggregation query (count/sum) or a small page - no collection is ever downloaded.
 * Definitions (also shown on the page):
 *  - Paid revenue = orders whose payment was captured in the period (online payments, and COD once cash is marked collected),
 *    before refunds. Pending prepaid orders and uncollected COD are NOT revenue.
 */
export async function getDashboard(period: Period): Promise<DashboardData> {
  const r = periodRange(period);
  const orders = col(C.orders);
  const startIso = r.start.toISOString();
  const endIso = r.end.toISOString();
  const [placed, revenue, newCount, awaiting, cod, returns, review, low, lowDocs, recent] = await Promise.all([
    orders.where("placedAt", ">=", startIso).where("placedAt", "<", endIso).count().get(),
    orders.where("paymentStatus", "==", "paid").where("payment.capturedAt", ">=", startIso).where("payment.capturedAt", "<", endIso).aggregate({ total: AggregateField.sum("pricing.total"), n: AggregateField.count() }).get(),
    orders.where("status", "==", "new").count().get(),
    orders.where("paymentMethod", "==", "razorpay").where("paymentStatus", "in", ["pending", "failed"]).where("status", "==", "new").count().get(),
    orders.where("paymentMethod", "==", "cod").where("paymentStatus", "==", "pending").where("status", "in", ["new", "confirmed", "processing", "shipped", "out_for_delivery"]).aggregate({ n: AggregateField.count(), v: AggregateField.sum("pricing.total") }).get(),
    orders.where("returnStatus", "in", ["requested", "approved", "received", "refund_pending"]).count().get(),
    orders.where("needsReview", "==", true).count().get(),
    col(C.variants).where("isLowStock", "==", true).count().get(),
    col(C.variants).where("isLowStock", "==", true).orderBy("updatedAt", "desc").limit(8).get(),
    orders.orderBy("placedAt", "desc").limit(8).get(),
  ]);
  const rv = revenue.data();
  const cv = cod.data();
  return {
    rangeLabel: r.label,
    period,
    ordersPlaced: placed.data().count,
    paidRevenue: rv.total ?? 0,
    paidOrders: rv.n,
    toConfirm: Math.max(0, newCount.data().count - awaiting.data().count),
    awaitingPayment: awaiting.data().count,
    codOutstanding: { count: cv.n, value: cv.v ?? 0 },
    returnsOpen: returns.data().count,
    needsReview: review.data().count,
    lowStockCount: low.data().count,
    lowStock: lowDocs.docs.map((d) => {
      const v = fromDoc<Variant>(d);
      return { id: v.id, productName: v.productName, size: v.size, color: v.color, sku: v.sku, available: Math.max(0, v.stock - v.reserved), threshold: v.lowStockThreshold };
    }),
    recentOrders: recent.docs.map(orderFromDoc),
  };
}
