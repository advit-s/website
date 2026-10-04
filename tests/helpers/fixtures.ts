import { db } from "@/server/firebase/admin";
import { C, newId, nowIso } from "@/server/repos/common";
import { computeIsLowStock, deriveFromVariants, productSearchTokens, variantId } from "@/domain/product-build";
import { DEFAULT_PUBLIC_SETTINGS } from "@/domain/settings";
import type { CheckoutInput } from "@/domain/validation";

export interface FixtureVariant {
  id: string;
  size: string;
  color: string;
}
export interface Fixture {
  categoryId: string;
  productId: string;
  slug: string;
  price: number;
  variants: FixtureVariant[];
}

/** Ensure public settings exist so tests do not depend on the seed script. */
export async function ensureSettings(): Promise<void> {
  await db().collection(C.settings).doc("public").set({ ...DEFAULT_PUBLIC_SETTINGS, delivery: { ...DEFAULT_PUBLIC_SETTINGS.delivery, unserviceablePincodes: ["744101"], codBlockedPincodes: ["682001"] } });
}

/** Create an isolated active category + published product + variants with given stock levels. */
export async function makeProduct(opts: { price?: number; stocks: number[]; weightGrams?: number; enquiryOnly?: boolean; customizable?: boolean; threshold?: number } = { stocks: [5] }): Promise<Fixture> {
  const tag = newId("t").slice(0, 10);
  const categoryId = `cat_${tag}`;
  const productId = `prod_${tag}`;
  const price = opts.price ?? 1_000_000;
  const now = nowIso();
  await db().collection(C.categories).doc(categoryId).set({ name: `Test ${tag}`, slug: `test-${tag}`, description: "t", imageUrl: null, sortOrder: 99, isActive: true, version: 1, createdAt: now, updatedAt: now });
  const vs = opts.stocks.map((stock, i) => {
    const size = ["S", "M", "L", "XL", "XXL"][i] ?? `S${i}`;
    return { id: variantId(productId, size, "Red"), size, color: "Red", stock, reserved: 0, lowStockThreshold: opts.threshold ?? 3, productId, productName: `Test ${tag}`, categoryId, sku: `T-${tag.toUpperCase()}-${size}`, priceOverride: null, version: 1, updatedAt: now, isLowStock: false };
  });
  vs.forEach((v) => (v.isLowStock = computeIsLowStock(v)));
  const d = deriveFromVariants(vs);
  await db().collection(C.products).doc(productId).set({
    categoryId, name: `Test ${tag}`, slug: `test-${tag}`, description: "t", details: [], price, compareAtPrice: null, fabric: "Silk", workType: "Zari", setIncludes: "", weightGrams: opts.weightGrams ?? 500,
    isCustomizable: opts.customizable ?? false, enquiryOnly: opts.enquiryOnly ?? false, leadTimeDays: null, isFeatured: false, isBestSeller: false, isNewArrival: false, status: "published",
    images: [{ src: "/demo/placeholder.svg", alt: "x", order: 0 }], tags: [], seo: { title: "", description: "" }, sizes: d.sizes, colors: d.colors, availableUnits: d.availableUnits,
    searchTokens: productSearchTokens({ name: `Test ${tag}`, categoryName: "", fabric: "Silk", workType: "Zari", colors: d.colors, tags: [] }), isDemo: true, version: 1, createdAt: now, updatedAt: now, publishedAt: now,
  });
  for (const v of vs) {
    const { id, ...rest } = v;
    await db().collection(C.variants).doc(id).set(rest);
    await db().collection(C.uniqueKeys).doc(`sku:${v.sku}`).set({ entity: "variant", id, createdAt: now });
  }
  return { categoryId, productId, slug: `test-${tag}`, price, variants: vs.map((v) => ({ id: v.id, size: v.size, color: v.color })) };
}

export const address = { fullName: "Test Buyer", phone: "9876543210", line1: "12 Sector 18", line2: "", city: "Noida", state: "Uttar Pradesh" as const, pincode: "201301", country: "IN" as const };

export function checkoutInput(variantId: string, quantity: number, over: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    lines: [{ variantId, quantity }],
    contact: { name: "Test Buyer", email: "buyer@example.test", phone: "+919876543210" },
    address: { ...address, phone: "+919876543210" },
    paymentMethod: "cod",
    ...over,
  } as CheckoutInput;
}

export async function getVariant(id: string) {
  return (await db().collection(C.variants).doc(id).get()).data() as { stock: number; reserved: number; isLowStock: boolean; version: number };
}
export async function getProductUnits(id: string) {
  return ((await db().collection(C.products).doc(id).get()).data() as { availableUnits: number }).availableUnits;
}
