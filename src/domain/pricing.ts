import type { Paise } from "./money";
import { bps } from "./money";
import type { PublicSettings } from "./settings";
import type { Zone } from "./pincode";

export interface Coupon {
  code: string; // uppercase, unique (doc id)
  type: "percent" | "fixed";
  /** percent: basis points (1000 = 10%); fixed: paise */
  value: number;
  minSubtotal: Paise;
  maxDiscount: Paise | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  isActive: boolean;
  excludesCustom: boolean;
  description: string;
}

export interface PricedLine {
  unitPrice: Paise;
  quantity: number;
  weightGrams: number;
  isCustomizable: boolean;
}

export type CouponCheck = { ok: true; discount: Paise } | { ok: false; reason: string };

export function evaluateCoupon(coupon: Coupon | null, subtotal: Paise, lines: PricedLine[], now: Date): CouponCheck {
  if (!coupon || !coupon.isActive) return { ok: false, reason: "This coupon code is not valid." };
  if (coupon.startsAt && now < new Date(coupon.startsAt)) return { ok: false, reason: "This coupon is not active yet." };
  if (coupon.endsAt && now > new Date(coupon.endsAt)) return { ok: false, reason: "This coupon has expired." };
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) return { ok: false, reason: "This coupon has reached its usage limit." };
  if (subtotal < coupon.minSubtotal) return { ok: false, reason: "Your order does not meet this coupon's minimum spend." };
  if (coupon.excludesCustom && lines.some((l) => l.isCustomizable)) {
    return { ok: false, reason: "This coupon cannot be combined with made-to-measure pieces." };
  }
  let discount = coupon.type === "percent" ? bps(subtotal, coupon.value) : coupon.value;
  if (coupon.maxDiscount != null) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, subtotal);
  if (discount <= 0) return { ok: false, reason: "This coupon gives no discount on your order." };
  return { ok: true, discount };
}

export interface ShippingQuote {
  amount: Paise;
  /** True when no pincode has been entered, so the figure is a conservative estimate. */
  estimated: boolean;
  freeApplied: boolean;
  /** Paise still needed for free delivery (0 when already free). */
  remainingForFree: Paise;
}

export function quoteShipping(
  lines: PricedLine[],
  subtotalAfterDiscount: Paise,
  zone: Zone | null,
  delivery: PublicSettings["delivery"],
): ShippingQuote {
  const estimated = zone === null;
  const base = zone === "ncr" ? delivery.ncrFlatRate : delivery.restOfIndiaFlatRate;
  const totalGrams = lines.reduce((g, l) => g + l.weightGrams * l.quantity, 0);
  const extraGrams = Math.max(0, totalGrams - delivery.heavyAboveGrams);
  const surcharge = Math.ceil(extraGrams / 1000) * delivery.heavySurchargePerKg;
  const threshold = delivery.freeShippingThreshold;
  const freeApplied = threshold > 0 && subtotalAfterDiscount >= threshold;
  return {
    amount: freeApplied ? 0 : base + surcharge,
    estimated,
    freeApplied,
    remainingForFree: threshold > 0 ? Math.max(0, threshold - subtotalAfterDiscount) : 0,
  };
}

export interface PricingInput {
  lines: PricedLine[];
  coupon: Coupon | null;
  zone: Zone | null;
  paymentMethod: "razorpay" | "cod";
  settings: Pick<PublicSettings, "delivery" | "cod">;
  now: Date;
}

export interface PricingResult {
  subtotal: Paise;
  discount: Paise;
  couponCode: string | null;
  couponError: string | null;
  shipping: Paise;
  shippingEstimated: boolean;
  freeShippingRemaining: Paise;
  codFee: Paise;
  total: Paise;
}

/** The single authoritative price calculation. Server-side only inputs; never trust client totals. */
export function computePricing(input: PricingInput): PricingResult {
  const subtotal = input.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  let discount = 0;
  let couponCode: string | null = null;
  let couponError: string | null = null;
  if (input.coupon) {
    const res = evaluateCoupon(input.coupon, subtotal, input.lines, input.now);
    if (res.ok) {
      discount = res.discount;
      couponCode = input.coupon.code;
    } else couponError = res.reason;
  }
  const afterDiscount = subtotal - discount;
  const ship = quoteShipping(input.lines, afterDiscount, input.zone, input.settings.delivery);
  const codFee = input.paymentMethod === "cod" ? input.settings.cod.fee : 0;
  return {
    subtotal,
    discount,
    couponCode,
    couponError,
    shipping: ship.amount,
    shippingEstimated: ship.estimated,
    freeShippingRemaining: ship.remainingForFree,
    codFee,
    total: afterDiscount + ship.amount + codFee,
  };
}
