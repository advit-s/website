import { describe, expect, it } from "vitest";
import { bps, formatINR, percentOff, rupeesToPaise } from "@/domain/money";
import { computePricing, evaluateCoupon, quoteShipping, type Coupon } from "@/domain/pricing";
import { DEFAULT_PUBLIC_SETTINGS } from "@/domain/settings";
import { checkPincode } from "@/domain/pincode";
import { allowedTransitions, canAdvanceFromProvider, canTransition, matchesCustomerFilter, matchesQueueTab } from "@/domain/order-state";
import { buildSearchTokens, catalogQueryToSearch, parseCatalogQuery, runCatalogQuery, type ListingProduct } from "@/domain/catalog";
import { addressSchema, checkoutSchema, normalizeIndianPhone, passwordSchema } from "@/domain/validation";
import { safeNext } from "@/lib/safe-redirect";
import { slugify } from "@/domain/product-build";

const S = DEFAULT_PUBLIC_SETTINGS;

describe("money (integer paise)", () => {
  it("converts rupees to paise without float drift and formats for display", () => {
    expect(rupeesToPaise(42999)).toBe(4_299_900);
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
    expect(formatINR(4_299_900)).toBe("₹42,999");
    expect(formatINR(129_950)).toBe("₹1,299.50");
  });
  it("computes percentage off and basis points", () => {
    expect(percentOff(4_299_900, 4_899_900)).toBe(12);
    expect(percentOff(100, null)).toBe(0);
    expect(percentOff(100, 100)).toBe(0);
    expect(bps(1_000_000, 1000)).toBe(100_000);
  });
  it("rejects negative or non-finite rupees", () => {
    expect(() => rupeesToPaise(-1)).toThrow();
    expect(() => rupeesToPaise(NaN)).toThrow();
  });
});

const line = (unitPrice: number, quantity = 1, weightGrams = 500, isCustomizable = false) => ({ unitPrice, quantity, weightGrams, isCustomizable });
const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  code: "T10", type: "percent", value: 1000, minSubtotal: 0, maxDiscount: null, startsAt: null, endsAt: null, usageLimit: null, perUserLimit: null, usedCount: 0, isActive: true, excludesCustom: false, description: "", ...over,
});

describe("pricing", () => {
  const now = new Date("2026-10-04T00:00:00Z");
  it("charges the rest-of-India estimate when no pincode is known and flags it as an estimate", () => {
    const p = computePricing({ lines: [line(500_000)], coupon: null, zone: null, paymentMethod: "razorpay", settings: S, now });
    expect(p.shippingEstimated).toBe(true);
    expect(p.shipping).toBe(S.delivery.restOfIndiaFlatRate);
    expect(p.total).toBe(500_000 + S.delivery.restOfIndiaFlatRate);
  });
  it("applies NCR rate, free delivery at the threshold, and reports the remainder", () => {
    expect(computePricing({ lines: [line(500_000)], coupon: null, zone: "ncr", paymentMethod: "cod", settings: S, now }).shipping).toBe(S.delivery.ncrFlatRate);
    const free = computePricing({ lines: [line(S.delivery.freeShippingThreshold)], coupon: null, zone: "rest", paymentMethod: "cod", settings: S, now });
    expect(free.shipping).toBe(0);
    const near = quoteShipping([line(900_000)], 900_000, "rest", S.delivery);
    expect(near.remainingForFree).toBe(100_000);
  });
  it("adds a heavy-piece surcharge per started kg above the limit, waived above the free threshold", () => {
    const heavy = [line(300_000, 1, 3_200)]; // 1.2 kg over 2 kg -> 2 started kg
    expect(quoteShipping(heavy, 300_000, "ncr", S.delivery).amount).toBe(S.delivery.ncrFlatRate + 2 * S.delivery.heavySurchargePerKg);
    expect(quoteShipping([line(1_200_000, 1, 3_200)], 1_200_000, "ncr", S.delivery).amount).toBe(0);
  });
  it("discounts percent coupons with caps and minimum spend, never below zero", () => {
    const c = coupon({ maxDiscount: 50_000, minSubtotal: 100_000 });
    expect(evaluateCoupon(c, 1_000_000, [line(1_000_000)], now)).toEqual({ ok: true, discount: 50_000 });
    expect(evaluateCoupon(c, 50_000, [line(50_000)], now)).toMatchObject({ ok: false });
    expect(evaluateCoupon(coupon({ type: "fixed", value: 9_999_999 }), 100_000, [line(100_000)], now)).toEqual({ ok: true, discount: 100_000 });
  });
  it("enforces dates, usage limits, activity and custom-piece exclusions", () => {
    expect(evaluateCoupon(coupon({ endsAt: "2026-01-01T00:00:00Z" }), 100_000, [line(100_000)], now)).toMatchObject({ ok: false });
    expect(evaluateCoupon(coupon({ startsAt: "2027-01-01T00:00:00Z" }), 100_000, [line(100_000)], now)).toMatchObject({ ok: false });
    expect(evaluateCoupon(coupon({ usageLimit: 5, usedCount: 5 }), 100_000, [line(100_000)], now)).toMatchObject({ ok: false });
    expect(evaluateCoupon(coupon({ isActive: false }), 100_000, [line(100_000)], now)).toMatchObject({ ok: false });
    expect(evaluateCoupon(coupon({ excludesCustom: true }), 100_000, [line(100_000, 1, 500, true)], now)).toMatchObject({ ok: false });
    expect(evaluateCoupon(null, 100_000, [], now)).toMatchObject({ ok: false });
  });
  it("adds the COD fee only for cash on delivery and treats an invalid coupon as no discount", () => {
    const cod = computePricing({ lines: [line(500_000)], coupon: null, zone: "ncr", paymentMethod: "cod", settings: { ...S, cod: { ...S.cod, fee: 5_000 } }, now });
    expect(cod.codFee).toBe(5_000);
    const bad = computePricing({ lines: [line(500_000)], coupon: coupon({ isActive: false }), zone: "ncr", paymentMethod: "razorpay", settings: S, now });
    expect(bad.discount).toBe(0);
    expect(bad.couponError).toBeTruthy();
  });
});

describe("pincode", () => {
  it("classifies NCR vs rest and validates the format", () => {
    expect(checkPincode("110001", S.delivery, true)).toMatchObject({ ok: true, zone: "ncr" });
    expect(checkPincode("201301", S.delivery, true)).toMatchObject({ ok: true, zone: "ncr" });
    expect(checkPincode("560001", S.delivery, true)).toMatchObject({ ok: true, zone: "rest" });
    expect(checkPincode("012345", S.delivery, true)).toMatchObject({ ok: false, reason: "invalid" });
    expect(checkPincode("12345", S.delivery, true)).toMatchObject({ ok: false });
    expect(checkPincode("abcdef", S.delivery, true)).toMatchObject({ ok: false });
  });
  it("honours unserviceable and COD-blocked lists", () => {
    const d = { ...S.delivery, unserviceablePincodes: ["744101"], codBlockedPincodes: ["682001"] };
    expect(checkPincode("744101", d, true)).toMatchObject({ ok: false, reason: "unserviceable" });
    expect(checkPincode("682001", d, true)).toMatchObject({ ok: true, codAllowed: false });
    expect(checkPincode("560001", d, false)).toMatchObject({ ok: true, codAllowed: false });
  });
  it("labels estimates as estimates, not guarantees", () => {
    const r = checkPincode("110001", S.delivery, true);
    expect(r.ok && r.estimateText).toMatch(/estimate/i);
  });
});

describe("order state machine", () => {
  it("allows only the documented forward transitions and cancellation before shipping", () => {
    expect(allowedTransitions("new")).toEqual(["confirmed", "cancelled"]);
    expect(canTransition("processing", "cancelled")).toBe(true);
    expect(canTransition("shipped", "cancelled")).toBe(false);
    expect(canTransition("delivered", "shipped")).toBe(false);
    expect(canTransition("cancelled", "new")).toBe(false);
    expect(canTransition("new", "shipped")).toBe(false);
  });
  it("lets providers move shipments forward only - never regress, skip back, or resurrect", () => {
    expect(canAdvanceFromProvider("shipped", "out_for_delivery")).toBe(true);
    expect(canAdvanceFromProvider("shipped", "delivered")).toBe(true);
    expect(canAdvanceFromProvider("out_for_delivery", "shipped")).toBe(false);
    expect(canAdvanceFromProvider("delivered", "out_for_delivery")).toBe(false);
    expect(canAdvanceFromProvider("cancelled", "delivered")).toBe(false);
    expect(canAdvanceFromProvider("processing", "delivered")).toBe(false);
    expect(canAdvanceFromProvider("shipped", "cancelled")).toBe(false);
  });
  it("maps admin queue tabs and customer filters explicitly", () => {
    const o = { status: "new" as const, paymentStatus: "pending" as const, returnStatus: "none" as const, paymentMethod: "razorpay" as const };
    expect(matchesQueueTab("pending", o)).toBe(true);
    expect(matchesQueueTab("processing", o)).toBe(false);
    expect(matchesQueueTab("returns", { ...o, returnStatus: "requested" })).toBe(true);
    expect(matchesQueueTab("shipped", { ...o, status: "out_for_delivery" })).toBe(true);
    expect(matchesCustomerFilter("processing", "confirmed")).toBe(true);
    expect(matchesCustomerFilter("shipped", "delivered")).toBe(false);
  });
});

const prod = (over: Partial<ListingProduct>): ListingProduct => ({
  id: "p", slug: "p", name: "P", categoryId: "c1", price: 100_000, compareAtPrice: null, fabric: "Silk", workType: "", sizes: ["M"], colors: ["Red"], tags: [], searchTokens: buildSearchTokens(["P", "Silk", "Red"]), image: null, imageHover: null,
  isFeatured: false, isBestSeller: false, isNewArrival: false, isCustomizable: false, enquiryOnly: false, leadTimeDays: null, availableUnits: 3, isDemo: true, createdAt: "2026-01-01T00:00:00Z", ...over,
});

describe("catalog listing", () => {
  const all = [
    prod({ id: "a", name: "Royal Rose", categoryId: "c1", price: 4_000_000, sizes: ["S", "M"], colors: ["Maroon"], searchTokens: buildSearchTokens(["Royal Rose Bridal", "Maroon", "Zari"]), isFeatured: true }),
    prod({ id: "b", name: "Peach", categoryId: "c2", price: 900_000, sizes: ["M", "L"], colors: ["Peach"], compareAtPrice: 1_200_000, isNewArrival: true, createdAt: "2026-03-01T00:00:00Z" }),
    prod({ id: "c", name: "Ivory", categoryId: "c2", price: 2_500_000, sizes: ["L"], colors: ["Ivory"], isBestSeller: true, createdAt: "2026-02-01T00:00:00Z" }),
  ];
  const cats = new Map([["bridal", "c1"], ["festive", "c2"]]);
  const q = (p: Record<string, string>, fixed?: string) => parseCatalogQuery(p, fixed);

  it("filters by category, collection, price, size, colour and text; paginates", () => {
    expect(runCatalogQuery(all, cats, q({ category: "festive" })).items.map((i) => i.id).sort()).toEqual(["b", "c"]);
    expect(runCatalogQuery(all, cats, q({ collection: "sale" })).items.map((i) => i.id)).toEqual(["b"]);
    expect(runCatalogQuery(all, cats, q({ collection: "new" })).items.map((i) => i.id)).toEqual(["b"]);
    expect(runCatalogQuery(all, cats, q({ minPrice: "10000", maxPrice: "30000" })).items.map((i) => i.id)).toEqual(["c"]);
    expect(runCatalogQuery(all, cats, q({ size: "L" })).items.map((i) => i.id).sort()).toEqual(["b", "c"]);
    expect(runCatalogQuery(all, cats, q({ color: "Maroon" })).items.map((i) => i.id)).toEqual(["a"]);
    expect(runCatalogQuery(all, cats, q({ q: "bridal mar" })).items.map((i) => i.id)).toEqual(["a"]);
    expect(runCatalogQuery(all, cats, q({ q: "zzz" })).total).toBe(0);
  });
  it("unknown category yields an empty result rather than everything", () => {
    expect(runCatalogQuery(all, cats, q({ category: "nope" })).total).toBe(0);
  });
  it("sorts by price and newest", () => {
    expect(runCatalogQuery(all, cats, q({ sort: "price-asc" })).items.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(runCatalogQuery(all, cats, q({ sort: "price-desc" })).items.map((i) => i.id)).toEqual(["a", "c", "b"]);
    expect(runCatalogQuery(all, cats, q({ sort: "newest" })).items.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });
  it("clamps hostile query params and round-trips filters through the URL", () => {
    const hostile = q({ page: "-5", minPrice: "abc", sort: "DROP", collection: "x", q: "a".repeat(500) });
    expect(hostile).toMatchObject({ page: 1, minPrice: null, sort: "featured", collection: null });
    expect(hostile.q.length).toBeLessThanOrEqual(80);
    const parsed = q({ category: "festive", size: "M,L", color: "Red", minPrice: "5000", sort: "price-asc", page: "2" });
    const search = catalogQueryToSearch(parsed);
    const again = parseCatalogQuery(Object.fromEntries(new URLSearchParams(search)));
    expect(again).toMatchObject({ category: "festive", sizes: ["M", "L"], colors: ["Red"], minPrice: 500_000, sort: "price-asc", page: 2 });
  });
  it("computes facet counts from the unfiltered scope", () => {
    const r = runCatalogQuery(all, cats, q({ size: "S" }));
    expect(r.facets.sizes.find((f) => f.value === "L")?.count).toBe(2);
  });
});

describe("validation", () => {
  it("normalises Indian mobile numbers and rejects others", () => {
    expect(normalizeIndianPhone("98765 43210")).toBe("+919876543210");
    expect(normalizeIndianPhone("+91-9876543210")).toBe("+919876543210");
    expect(normalizeIndianPhone("09876543210")).toBe("+919876543210");
    expect(normalizeIndianPhone("1234567890")).toBeNull();
    expect(normalizeIndianPhone("+14155552671")).toBeNull();
  });
  it("enforces the password policy (8+, upper, lower, digit)", () => {
    expect(passwordSchema.safeParse("Abcdefg1").success).toBe(true);
    for (const bad of ["short1A", "alllowercase1", "ALLUPPERCASE1", "NoDigitsHere"]) expect(passwordSchema.safeParse(bad).success).toBe(false);
  });
  it("accepts only India addresses with valid pincodes and states", () => {
    const base = { fullName: "A B", phone: "9876543210", line1: "12 Main Road", city: "Noida", state: "Uttar Pradesh", pincode: "201301" };
    expect(addressSchema.safeParse(base).success).toBe(true);
    expect(addressSchema.safeParse({ ...base, pincode: "20130" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...base, state: "Texas" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...base, country: "US" }).success).toBe(false);
  });
  it("bounds checkout quantities and ignores client-supplied totals", () => {
    const base = { contact: { name: "A B", email: "a@b.co", phone: "9876543210" }, address: { fullName: "A B", phone: "9876543210", line1: "12 Main Road", city: "Noida", state: "Uttar Pradesh", pincode: "201301" }, paymentMethod: "cod" };
    expect(checkoutSchema.safeParse({ ...base, lines: [{ variantId: "v", quantity: 0 }] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, lines: [{ variantId: "v", quantity: 11 }] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, lines: [{ variantId: "v", quantity: -1 }] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, lines: [{ variantId: "v", quantity: 1.5 }] }).success).toBe(false);
    const parsed = checkoutSchema.parse({ ...base, lines: [{ variantId: "v", quantity: 1 }], total: 1, price: 1, discount: 99999 });
    expect(parsed).not.toHaveProperty("total");
    expect(parsed).not.toHaveProperty("discount");
  });
});

describe("safe redirect", () => {
  it("allows same-site paths and blocks open redirects", () => {
    expect(safeNext("/cart?x=1")).toBe("/cart?x=1");
    expect(safeNext("/product/royal-rose")).toBe("/product/royal-rose");
    for (const evil of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/%2F%2Fevil.com", "/login", "/api/auth/session", "evil.com", "/a\nb"]) {
      expect(safeNext(evil, "/account")).toBe("/account");
    }
    expect(safeNext(null, "/x")).toBe("/x");
  });
});

describe("slugify", () => {
  it("produces lowercase hyphenated slugs", () => {
    expect(slugify("Royal Rose & Bridal Lehenga!")).toBe("royal-rose-and-bridal-lehenga");
    expect(slugify("  Crème Brûlée  ")).toBe("creme-brulee");
  });
});
