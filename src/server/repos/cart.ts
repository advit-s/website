import "server-only";
import { C, col, nowIso } from "./common";
import { loadVariantsAndProducts } from "../services/cart-pricing";
import { availableUnits } from "@/domain/types";
import { badRequest } from "../http";

export interface StoredLine {
  variantId: string;
  quantity: number;
}

const MAX_LINES = 50;
const MAX_QTY = 10;
const cartCol = (uid: string) => col(C.users).doc(uid).collection("cart");
const wishCol = (uid: string) => col(C.users).doc(uid).collection("wishlist");

export async function getStoredCart(uid: string): Promise<StoredLine[]> {
  const snap = await cartCol(uid).orderBy("addedAt").limit(MAX_LINES).get();
  return snap.docs.map((d) => ({ variantId: d.id, quantity: (d.data() as { quantity: number }).quantity }));
}

/** Set a line's quantity (0 removes). Clamped to purchasable stock; rejects unknown or unpublished variants. */
export async function setStoredLine(uid: string, variantId: string, quantity: number): Promise<StoredLine[]> {
  if (quantity <= 0) {
    await cartCol(uid).doc(variantId).delete();
    return getStoredCart(uid);
  }
  const { variants, products } = await loadVariantsAndProducts([variantId]);
  const v = variants.get(variantId);
  const p = v ? products.get(v.productId) : undefined;
  if (!v || !p || p.status !== "published" || p.enquiryOnly) throw badRequest("This item is not available.");
  const q = Math.max(1, Math.min(MAX_QTY, quantity, Math.max(1, availableUnits(v))));
  const ref = cartCol(uid).doc(variantId);
  const existing = await ref.get();
  const now = nowIso();
  await ref.set({ variantId, productId: p.id, quantity: q, addedAt: existing.exists ? (existing.data() as { addedAt: string }).addedAt : now, updatedAt: now });
  return getStoredCart(uid);
}

/** Merge a guest cart into the account cart: quantities add up, then are capped by stock and per-line max. */
export async function mergeStoredCart(uid: string, guest: StoredLine[]): Promise<StoredLine[]> {
  const current = new Map((await getStoredCart(uid)).map((l) => [l.variantId, l.quantity]));
  const wanted = new Map(current);
  for (const g of guest.slice(0, MAX_LINES)) wanted.set(g.variantId, Math.min(MAX_QTY, (wanted.get(g.variantId) ?? 0) + g.quantity));
  const { variants, products } = await loadVariantsAndProducts([...wanted.keys()]);
  const now = nowIso();
  const batch = col(C.users).firestore.batch();
  for (const [variantId, qty] of wanted) {
    const v = variants.get(variantId);
    const p = v ? products.get(v.productId) : undefined;
    const ref = cartCol(uid).doc(variantId);
    if (!v || !p || p.status !== "published" || p.enquiryOnly || availableUnits(v) <= 0) {
      if (current.has(variantId)) batch.delete(ref);
      continue;
    }
    const q = Math.min(qty, availableUnits(v), MAX_QTY);
    batch.set(ref, { variantId, productId: p.id, quantity: q, addedAt: current.has(variantId) ? undefined : now, updatedAt: now }, { merge: true });
  }
  await batch.commit();
  return getStoredCart(uid);
}

export async function clearStoredCart(uid: string): Promise<void> {
  const snap = await cartCol(uid).limit(MAX_LINES).get();
  const b = col(C.users).firestore.batch();
  snap.docs.forEach((d) => b.delete(d.ref));
  await b.commit();
}

export async function getWishlistIds(uid: string): Promise<string[]> {
  const snap = await wishCol(uid).orderBy("addedAt", "desc").limit(200).get();
  return snap.docs.map((d) => d.id);
}

export async function setWishlist(uid: string, productId: string, on: boolean): Promise<void> {
  const ref = wishCol(uid).doc(productId);
  if (!on) {
    await ref.delete();
    return;
  }
  const p = await col(C.products).doc(productId).get();
  if (!p.exists || (p.data() as { status: string }).status !== "published") throw badRequest("This product is not available.");
  await ref.set({ addedAt: nowIso() }, { merge: true });
}

export async function mergeWishlist(uid: string, ids: string[]): Promise<void> {
  const unique = Array.from(new Set(ids)).slice(0, 100);
  for (const id of unique) {
    try {
      await setWishlist(uid, id, true);
    } catch {
      /* skip products that no longer exist */
    }
  }
}
