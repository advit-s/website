import "server-only";
import { C, col, chunk } from "../repos/common";
import { db } from "../firebase/admin";
import { fromDoc, getActiveCategories } from "../repos/catalog";
import { getPublicSettings } from "../repos/settings";
import { availableUnits, type Product, type Variant } from "@/domain/types";
import { computePricing, type Coupon, type PricedLine } from "@/domain/pricing";
import { checkPincode, type PincodeCheck, type Zone } from "@/domain/pincode";
import type { Paise } from "@/domain/money";

export type LineStatus = "ok" | "reduced" | "out_of_stock" | "unavailable";

export interface PricedCartItem {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  image: { src: string; alt: string } | null;
  size: string;
  color: string;
  sku: string;
  unitPrice: Paise;
  /** Quantity the customer asked for. */
  requested: number;
  /** Quantity that can actually be sold now (<= requested). */
  quantity: number;
  available: number;
  lineTotal: Paise;
  status: LineStatus;
  isCustomizable: boolean;
  enquiryOnly: boolean;
  leadTimeDays: number | null;
  weightGrams: number;
}

export interface PricedCart {
  items: PricedCartItem[];
  /** True if every line is purchasable as requested. */
  allOk: boolean;
  pricing: ReturnType<typeof computePricing>;
  coupon: { code: string; description: string } | null;
  couponError: string | null;
  pincode: PincodeCheck | null;
  zone: Zone | null;
  codAllowed: boolean;
  codReason: string | null;
  freeShippingThreshold: Paise;
  hasCustom: boolean;
}

export interface PriceCartInput {
  lines: { variantId: string; quantity: number }[];
  pincode?: string | null;
  couponCode?: string | null;
  paymentMethod?: "razorpay" | "cod";
}

export async function loadCoupon(code: string | null | undefined): Promise<Coupon | null> {
  if (!code) return null;
  const s = await col(C.coupons).doc(code.trim().toUpperCase()).get();
  return s.exists ? ({ ...(s.data() as Omit<Coupon, "code">), code: s.id } as Coupon) : null;
}

export async function loadVariantsAndProducts(variantIds: string[]): Promise<{ variants: Map<string, Variant>; products: Map<string, Product> }> {
  const ids = Array.from(new Set(variantIds));
  const variants = new Map<string, Variant>();
  for (const group of chunk(ids, 100)) {
    if (!group.length) continue;
    const snaps = await db().getAll(...group.map((id) => col(C.variants).doc(id)));
    snaps.forEach((s) => s.exists && variants.set(s.id, fromDoc<Variant>(s)));
  }
  const productIds = Array.from(new Set([...variants.values()].map((v) => v.productId)));
  const products = new Map<string, Product>();
  for (const group of chunk(productIds, 100)) {
    if (!group.length) continue;
    const snaps = await db().getAll(...group.map((id) => col(C.products).doc(id)));
    snaps.forEach((s) => s.exists && products.set(s.id, fromDoc<Product>(s)));
  }
  return { variants, products };
}

/**
 * The single authoritative cart calculation: prices come from Firestore, never from the client.
 * Availability accounts for reservations (stock - reserved).
 */
export async function priceCart(input: PriceCartInput, now = new Date()): Promise<PricedCart> {
  const [settings, categories] = await Promise.all([getPublicSettings(), getActiveCategories()]);
  const activeCategoryIds = new Set(categories.map((c) => c.id));
  const merged = new Map<string, number>();
  for (const l of input.lines) merged.set(l.variantId, Math.min(settings.checkout.maxQuantityPerLine, (merged.get(l.variantId) ?? 0) + l.quantity));
  const { variants, products } = await loadVariantsAndProducts([...merged.keys()]);

  const items: PricedCartItem[] = [];
  for (const [variantId, requested] of merged) {
    const v = variants.get(variantId);
    const p = v ? products.get(v.productId) : undefined;
    if (!v || !p || p.status !== "published" || !activeCategoryIds.has(p.categoryId)) {
      items.push({ variantId, productId: v?.productId ?? "", slug: p?.slug ?? "", name: p?.name ?? "Unavailable item", image: null, size: v?.size ?? "", color: v?.color ?? "", sku: v?.sku ?? "", unitPrice: 0, requested, quantity: 0, available: 0, lineTotal: 0, status: "unavailable", isCustomizable: false, enquiryOnly: false, leadTimeDays: null, weightGrams: 0 });
      continue;
    }
    const avail = availableUnits(v);
    const unitPrice = v.priceOverride !== null && v.priceOverride !== undefined ? v.priceOverride : p.price; // explicit null check: a 0 override is honoured, not skipped
    const sellable = p.enquiryOnly ? 0 : Math.min(requested, avail);
    const img = [...p.images].sort((a, b) => a.order - b.order)[0];
    items.push({
      variantId,
      productId: p.id,
      slug: p.slug,
      name: p.name,
      image: img ? { src: img.src, alt: img.alt } : null,
      size: v.size,
      color: v.color,
      sku: v.sku,
      unitPrice,
      requested,
      quantity: sellable,
      available: avail,
      lineTotal: unitPrice * sellable,
      status: p.enquiryOnly ? "unavailable" : avail <= 0 ? "out_of_stock" : sellable < requested ? "reduced" : "ok",
      isCustomizable: p.isCustomizable,
      enquiryOnly: p.enquiryOnly,
      leadTimeDays: p.leadTimeDays,
      weightGrams: p.weightGrams,
    });
  }

  const sellableItems = items.filter((i) => i.quantity > 0);
  const lines: PricedLine[] = sellableItems.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity, weightGrams: i.weightGrams, isCustomizable: i.isCustomizable }));

  const pin = input.pincode ? checkPincode(input.pincode, settings.delivery, settings.cod.enabled) : null;
  const zone: Zone | null = pin?.ok ? pin.zone : null;

  const coupon = await loadCoupon(input.couponCode);
  const method = input.paymentMethod ?? "razorpay";
  const pricing = computePricing({ lines, coupon, zone, paymentMethod: method, settings, now });

  const hasCustom = sellableItems.some((i) => i.isCustomizable);
  const subtotal = pricing.subtotal;
  let codAllowed = settings.cod.enabled;
  let codReason: string | null = settings.cod.enabled ? null : "Cash on delivery is not offered right now.";
  if (codAllowed && pin && !pin.ok) {
    codAllowed = false;
    codReason = "Enter a serviceable pincode to see cash on delivery.";
  } else if (codAllowed && pin?.ok && !pin.codAllowed) {
    codAllowed = false;
    codReason = "Cash on delivery is not available for this pincode.";
  } else if (codAllowed && subtotal - pricing.discount > settings.cod.maxOrderValue) {
    codAllowed = false;
    codReason = "Cash on delivery is not available for orders of this value.";
  } else if (codAllowed && hasCustom) {
    codAllowed = false;
    codReason = "Made-to-order pieces are paid online (or by advance agreed with us).";
  }

  return {
    items,
    allOk: items.length > 0 && items.every((i) => i.status === "ok"),
    pricing,
    coupon: coupon && pricing.couponCode ? { code: coupon.code, description: coupon.description } : null,
    couponError: input.couponCode && !coupon ? "This coupon code is not valid." : pricing.couponError,
    pincode: pin,
    zone,
    codAllowed,
    codReason,
    freeShippingThreshold: settings.delivery.freeShippingThreshold,
    hasCustom,
  };
}
