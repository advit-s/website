import "server-only";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { C, col, newId, nowIso } from "../repos/common";
import { computeIsLowStock } from "@/domain/product-build";
import { availableUnits, type Variant } from "@/domain/types";
import { conflict } from "../http";

export interface StockLine {
  variantId: string;
  productId: string;
  quantity: number;
}

export type StockOp = "reserve" | "release" | "commit" | "allocate" | "restock";

export class OutOfStockError extends Error {
  constructor(public variantId: string, public requested: number, public available: number) {
    super(`Only ${available} unit(s) available for ${variantId}`);
  }
}

/** Read every variant document involved (all reads must precede writes inside a Firestore transaction). */
export async function readVariants(tx: Transaction, lines: StockLine[]): Promise<Map<string, Variant>> {
  const refs = lines.map((l) => col(C.variants).doc(l.variantId));
  const snaps = refs.length ? await tx.getAll(...refs) : [];
  const out = new Map<string, Variant>();
  snaps.forEach((s) => s.exists && out.set(s.id, { ...(s.data() as Omit<Variant, "id">), id: s.id }));
  return out;
}

interface Ctx {
  orderId: string | null;
  reason: string;
  actor: string;
}

/**
 * Apply a stock operation to already-read variants and queue the writes on `tx`.
 * Invariants maintained here and nowhere else:
 *   available = stock - reserved >= 0, isLowStock = available <= threshold, product.availableUnits kept in step,
 *   every on-hand stock movement gets an append-only stockLogs entry.
 */
export function applyStock(tx: Transaction, variants: Map<string, Variant>, lines: StockLine[], op: StockOp, ctx: Ctx): void {
  const now = nowIso();
  const productDelta = new Map<string, number>();
  for (const l of lines) {
    const v = variants.get(l.variantId);
    if (!v) throw conflict("VARIANT_MISSING", "An item in this order no longer exists.", { variantId: l.variantId });
    const q = l.quantity;
    const prevStock = v.stock;
    let { stock, reserved } = v;
    let delta = 0; // change in sellable units

    switch (op) {
      case "reserve":
        if (availableUnits(v) < q) throw new OutOfStockError(v.id, q, availableUnits(v));
        reserved += q;
        delta = -q;
        break;
      case "release":
        reserved = Math.max(0, reserved - q);
        delta = q;
        break;
      case "commit":
        stock -= q;
        reserved = Math.max(0, reserved - q);
        if (stock < 0) throw conflict("NEGATIVE_STOCK", "Stock would become negative.", { variantId: v.id });
        break;
      case "allocate":
        if (availableUnits(v) < q) throw new OutOfStockError(v.id, q, availableUnits(v));
        stock -= q;
        delta = -q;
        break;
      case "restock":
        stock += q;
        delta = q;
        break;
    }

    const next = { stock, reserved, lowStockThreshold: v.lowStockThreshold };
    tx.update(col(C.variants).doc(v.id), {
      stock,
      reserved,
      isLowStock: computeIsLowStock(next),
      version: v.version + 1,
      updatedAt: now,
    });
    // keep a working copy current so repeated lines for the same variant (should not happen) stay consistent
    variants.set(v.id, { ...v, stock, reserved, version: v.version + 1 });
    if (delta !== 0) productDelta.set(l.productId, (productDelta.get(l.productId) ?? 0) + delta);

    if (stock !== prevStock) {
      tx.set(col(C.stockLogs).doc(newId("log_")), {
        variantId: v.id,
        productId: l.productId,
        previousStock: prevStock,
        newStock: stock,
        delta: stock - prevStock,
        reason: ctx.reason,
        orderId: ctx.orderId,
        changedBy: ctx.actor,
        changedAt: now,
      });
    }
  }
  for (const [productId, d] of productDelta) {
    tx.update(col(C.products).doc(productId), { availableUnits: FieldValue.increment(d), updatedAt: now });
  }
}
