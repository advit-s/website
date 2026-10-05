import { readFileSync } from "node:fs";
import { db, adminAuth } from "@/server/firebase/admin";
import { C, chunk, nowIso } from "@/server/repos/common";
import { DEFAULT_PRIVATE_SETTINGS, DEFAULT_PUBLIC_SETTINGS } from "@/domain/settings";
import { computeIsLowStock, deriveFromVariants, productSearchTokens, variantId } from "@/domain/product-build";
import { rupeesToPaise } from "@/domain/money";
import type { Product, Variant } from "@/domain/types";
import { SEED_CATEGORIES, SEED_COUPONS, SEED_PRODUCTS } from "./seed-catalog";

/** Alt text for the sample photographs (written by scripts/fetch-photos.mjs). */
const PHOTO_ALTS: Record<string, [string, string]> = JSON.parse(readFileSync("scripts/lib/photo-alts.json", "utf8"));

export const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo#Passw0rd";

export const DEMO_USERS = [
  { key: "admin", email: "admin@rajraani.test", name: "Demo Admin", phone: "+919000000001", admin: true },
  { key: "customer", email: "customer@rajraani.test", name: "Priya Demo", phone: "+919000000002", admin: false },
  { key: "customer2", email: "customer2@rajraani.test", name: "Anika Demo", phone: "+919000000003", admin: false },
] as const;

/** Collections wiped by reset. Orders etc. are included: this is demo data only. */
export const ALL_COLLECTIONS = [
  C.categories, C.products, C.variants, C.orders, C.users, C.stockLogs, C.assistantLogs, C.settings, C.coupons, C.couponRedemptions,
  C.reservations, C.idempotency, C.webhookReceipts, C.contactEnquiries, C.customEnquiries, C.auditLogs, C.outbox, C.uniqueKeys,
  C.counters, C.orderAccess, C.rateLimits,
];

export async function wipeAll(): Promise<void> {
  for (const name of ALL_COLLECTIONS) {
    await db().recursiveDelete(db().collection(name));
  }
  // Auth emulator users
  const auth = adminAuth();
  const list = await auth.listUsers(1000);
  if (list.users.length) await auth.deleteUsers(list.users.map((u) => u.uid));
}

export async function seedCatalog(): Promise<{ products: number; variants: number }> {
  const now = nowIso();
  const catName = new Map(SEED_CATEGORIES.map((c) => [c.id, c.name]));
  const writes: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];
  const d = db();

  SEED_CATEGORIES.forEach((c, i) => {
    writes.push((b) => {
      b.set(d.collection(C.categories).doc(c.id), {
        name: c.name,
        slug: c.slug,
        description: c.description,
        imageUrl: `/photos/category-${c.slug}.jpg`,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      b.set(d.collection(C.uniqueKeys).doc(`category-slug:${c.slug}`), { entity: "category", id: c.id, createdAt: now });
    });
    void i;
  });

  let variantCount = 0;
  SEED_PRODUCTS.forEach((sp, idx) => {
    const variants: Variant[] = sp.variants.map(([size, color, stock, threshold, override], vi) => {
      const v: Variant = {
        id: variantId(sp.id, size, color),
        productId: sp.id,
        productName: sp.name,
        categoryId: sp.categoryId,
        size,
        color,
        sku: `${sp.skuPrefix}-${size.replace(/\s+/g, "").toUpperCase().slice(0, 3)}-${color.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3)}`,
        stock,
        reserved: 0,
        lowStockThreshold: threshold ?? 3,
        isLowStock: false,
        priceOverride: override != null ? rupeesToPaise(override) : null,
        version: 1,
        updatedAt: now,
      };
      v.isLowStock = computeIsLowStock(v);
      void vi;
      return v;
    });
    const derived = deriveFromVariants(variants);
    const created = new Date(Date.now() - (SEED_PRODUCTS.length - idx) * 3_600_000 * 6).toISOString();
    const published = (sp.status ?? "published") === "published";
    const images = [
      { src: `/photos/${sp.slug}-1.jpg`, alt: `${PHOTO_ALTS[sp.slug]?.[0] ?? sp.name} (sample photograph)`, order: 0 },
      { src: `/photos/${sp.slug}-2.jpg`, alt: `${PHOTO_ALTS[sp.slug]?.[1] ?? sp.name} (sample photograph)`, order: 1 },
    ];
    const product: Omit<Product, "id"> = {
      categoryId: sp.categoryId,
      name: sp.name,
      slug: sp.slug,
      description: sp.description,
      details: sp.details,
      price: rupeesToPaise(sp.price),
      compareAtPrice: sp.compareAt ? rupeesToPaise(sp.compareAt) : null,
      fabric: sp.fabric,
      workType: sp.workType,
      setIncludes: sp.setIncludes,
      weightGrams: sp.weightGrams,
      isCustomizable: sp.customizable ?? false,
      enquiryOnly: sp.enquiryOnly ?? false,
      leadTimeDays: sp.leadTimeDays ?? null,
      isFeatured: sp.featured ?? false,
      isBestSeller: sp.bestSeller ?? false,
      isNewArrival: sp.newArrival ?? false,
      status: published ? "published" : "draft",
      images,
      tags: sp.tags,
      seo: { title: `${sp.name} | Raj Raani Collections`, description: sp.description.slice(0, 155) },
      sizes: derived.sizes,
      colors: derived.colors,
      availableUnits: derived.availableUnits,
      searchTokens: productSearchTokens({ name: sp.name, categoryName: catName.get(sp.categoryId) ?? "", fabric: sp.fabric, workType: sp.workType, colors: derived.colors, tags: sp.tags }),
      isDemo: true,
      version: 1,
      createdAt: created,
      updatedAt: now,
      publishedAt: published ? created : null,
    };
    writes.push((b) => {
      b.set(d.collection(C.products).doc(sp.id), product);
      b.set(d.collection(C.uniqueKeys).doc(`product-slug:${sp.slug}`), { entity: "product", id: sp.id, createdAt: now });
    });
    for (const v of variants) {
      variantCount++;
      const { id, ...rest } = v;
      writes.push((b) => {
        b.set(d.collection(C.variants).doc(id), rest);
        b.set(d.collection(C.uniqueKeys).doc(`sku:${v.sku}`), { entity: "variant", id, createdAt: now });
        b.set(d.collection(C.stockLogs).doc(`seed_${id}`), {
          variantId: id,
          productId: sp.id,
          previousStock: 0,
          newStock: v.stock,
          delta: v.stock,
          reason: "seed: initial demo stock",
          changedBy: "system:seed",
          changedAt: now,
        });
      });
    }
  });

  for (const group of chunk(writes, 120)) {
    const b = d.batch();
    group.forEach((w) => w(b));
    await b.commit();
  }

  const b = d.batch();
  b.set(d.collection(C.settings).doc("public"), {
    ...DEFAULT_PUBLIC_SETTINGS,
    delivery: { ...DEFAULT_PUBLIC_SETTINGS.delivery, unserviceablePincodes: ["744101"], codBlockedPincodes: ["682001"] },
    updatedAt: now,
    updatedBy: "system:seed",
  });
  b.set(d.collection(C.settings).doc("private"), { ...DEFAULT_PRIVATE_SETTINGS, updatedAt: now, updatedBy: "system:seed" });
  for (const c of SEED_COUPONS) {
    b.set(d.collection(C.coupons).doc(c.code), {
      ...c,
      startsAt: null,
      endsAt: null,
      usedCount: 0,
      isActive: true,
      excludesCustom: true,
      createdAt: now,
    });
  }
  await b.commit();
  return { products: SEED_PRODUCTS.length, variants: variantCount };
}

export async function seedUsers(): Promise<Record<string, string>> {
  const auth = adminAuth();
  const now = nowIso();
  const uids: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    let uid: string;
    try {
      uid = (await auth.getUserByEmail(u.email)).uid;
    } catch {
      uid = (
        await auth.createUser({ email: u.email, password: DEMO_PASSWORD, displayName: u.name, emailVerified: true, phoneNumber: u.phone })
      ).uid;
    }
    await auth.setCustomUserClaims(uid, u.admin ? { admin: true } : {});
    uids[u.key] = uid;
    await db()
      .collection(C.users)
      .doc(uid)
      .set({ fullName: u.name, email: u.email, phone: u.phone, role: u.admin ? "admin-account" : "customer", createdAt: now, updatedAt: now }, { merge: true });
  }
  // A saved address for the demo customer.
  await db().collection(C.users).doc(uids.customer!).collection("addresses").doc("addr_home").set({
    label: "Home",
    fullName: "Priya Demo",
    phone: "+919000000002",
    line1: "12 Sector 18",
    line2: "",
    city: "Noida",
    state: "Uttar Pradesh",
    pincode: "201301",
    country: "IN",
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  });
  return uids;
}
