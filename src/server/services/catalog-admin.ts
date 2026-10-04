import "server-only";
import { FieldPath } from "firebase-admin/firestore";
import { C, col, chunk, decodeCursor, encodeCursor, newId, nowIso } from "../repos/common";
import { db } from "../firebase/admin";
import { fromDoc } from "../repos/catalog";
import { audit, auditInTx } from "./audit";
import { publishImage } from "./media";
import { invalidate } from "../cache";
import { badRequest, conflict, notFound } from "../http";
import { computeIsLowStock, deriveFromVariants, productSearchTokens, variantId } from "@/domain/product-build";
import type { CategoryInput, ProductInput } from "@/domain/admin-schemas";
import type { Category, Product, Variant } from "@/domain/types";

const keyRef = (k: string) => col(C.uniqueKeys).doc(k);

/* ------------------------------------------------------------------ categories */

export async function saveCategory(input: CategoryInput, id: string | null, actor: string): Promise<Category> {
  const catId = id ?? newId("cat_");
  const now = nowIso();
  await db().runTransaction(async (tx) => {
    const ref = col(C.categories).doc(catId);
    const cur = id ? await tx.get(ref) : null;
    if (id && !cur?.exists) throw notFound("Category not found.");
    const curData = cur?.data() as Category | undefined;
    if (curData && input.expectedVersion != null && curData.version !== input.expectedVersion) {
      throw conflict("VERSION_CONFLICT", "This category was changed by someone else. Reload to see the latest version.", { currentVersion: curData.version });
    }
    const slugKey = keyRef(`category-slug:${input.slug}`);
    const slugSnap = await tx.get(slugKey);
    if (slugSnap.exists && (slugSnap.data() as { id: string }).id !== catId) throw conflict("SLUG_TAKEN", "Another category already uses this slug.");
    tx.set(slugKey, { entity: "category", id: catId, createdAt: now });
    if (curData && curData.slug !== input.slug) tx.delete(keyRef(`category-slug:${curData.slug}`));
    const { expectedVersion: _v, ...fields } = input;
    void _v;
    tx.set(ref, { ...fields, version: (curData?.version ?? 0) + 1, createdAt: curData?.createdAt ?? now, updatedAt: now });
    auditInTx(tx, actor, id ? "category.update" : "category.create", catId, { slug: input.slug, isActive: input.isActive });
  });
  invalidate("catalog");
  return fromDoc<Category>(await col(C.categories).doc(catId).get());
}

export async function countCategoryProducts(id: string): Promise<number> {
  return (await col(C.products).where("categoryId", "==", id).count().get()).data().count;
}

/**
 * Delete a category. A category that still has products cannot be deleted unless the admin explicitly chooses a
 * category to reassign them to (done in bounded chunks; variants' denormalised categoryId is moved with their product).
 */
export async function deleteCategory(id: string, reassignTo: string | null, actor: string): Promise<{ moved: number }> {
  const ref = col(C.categories).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Category not found.");
  const cat = fromDoc<Category>(snap);
  const n = await countCategoryProducts(id);
  let moved = 0;
  if (n > 0) {
    if (!reassignTo) throw conflict("HAS_PRODUCTS", `This category has ${n} product(s). Choose another category to move them to, or deactivate the category instead.`, { count: n });
    if (reassignTo === id) throw badRequest("Choose a different category.");
    const target = await col(C.categories).doc(reassignTo).get();
    if (!target.exists) throw notFound("Target category not found.");
    for (;;) {
      const batchSnap = await col(C.products).where("categoryId", "==", id).limit(100).get();
      if (batchSnap.empty) break;
      for (const group of chunk(batchSnap.docs, 40)) {
        const b = db().batch();
        for (const p of group) {
          b.update(p.ref, { categoryId: reassignTo, updatedAt: nowIso() });
          const vs = await col(C.variants).where("productId", "==", p.id).get();
          vs.docs.forEach((v) => b.update(v.ref, { categoryId: reassignTo, updatedAt: nowIso() }));
        }
        await b.commit();
        moved += group.length;
      }
    }
  }
  const b = db().batch();
  b.delete(ref);
  b.delete(keyRef(`category-slug:${cat.slug}`));
  await b.commit();
  await audit(actor, "category.delete", id, { slug: cat.slug, moved, reassignTo });
  invalidate("catalog");
  return { moved };
}

/* ------------------------------------------------------------------ products */

export interface ProductWithVariants {
  product: Product;
  variants: Variant[];
}

export async function getProductForAdmin(id: string): Promise<ProductWithVariants | null> {
  const snap = await col(C.products).doc(id).get();
  if (!snap.exists) return null;
  const vs = await col(C.variants).where("productId", "==", id).get();
  return { product: fromDoc<Product>(snap), variants: vs.docs.map((d) => fromDoc<Variant>(d)).sort((a, b) => a.sku.localeCompare(b.sku)) };
}

export async function isSlugAvailable(slug: string, productId: string | null): Promise<boolean> {
  const s = await keyRef(`product-slug:${slug}`).get();
  return !s.exists || (s.data() as { id: string }).id === productId;
}

/**
 * Create or update a product and its variants in ONE transaction:
 *  - slug and SKU uniqueness are enforced with unique-key documents written in the same transaction (a query-then-write check is race-prone);
 *  - the denormalised productName/categoryId on every variant, plus product facets, available units and search tokens, are rewritten together;
 *  - existing variants' on-hand stock is NEVER changed here (that is Inventory's version-checked job); new variants get their opening stock + a log entry;
 *  - removing a variant is refused while units are reserved by an unpaid order.
 */
export async function saveProduct(input: ProductInput, id: string | null, actor: string): Promise<{ id: string; version: number }> {
  const productId = id ?? newId("prod_");
  const now = nowIso();

  // Make images public only when the product is published (draft media stays private). Done before the transaction: it is idempotent file I/O.
  const images = [...input.images].sort((a, b) => a.order - b.order);
  const finalImages = input.status === "published" ? await Promise.all(images.map(async (im, i) => ({ ...im, order: i, src: await publishImage(im.src) }))) : images.map((im, i) => ({ ...im, order: i }));

  await db().runTransaction(async (tx) => {
    const pRef = col(C.products).doc(productId);
    const cur = id ? await tx.get(pRef) : null;
    if (id && !cur?.exists) throw notFound("Product not found.");
    const curData = cur?.exists ? (cur.data() as Product) : undefined;
    if (curData && input.expectedVersion != null && curData.version !== input.expectedVersion) {
      throw conflict("VERSION_CONFLICT", "This product was changed by someone else since you opened it. Reload to see the latest version, then re-apply your edits.", { currentVersion: curData.version });
    }
    const catSnap = await tx.get(col(C.categories).doc(input.categoryId));
    if (!catSnap.exists) throw badRequest("The selected category does not exist.");
    const category = catSnap.data() as Category;
    if (input.status === "published" && !category.isActive) throw badRequest("A product cannot be published in an inactive category.");

    const slugKey = keyRef(`product-slug:${input.slug}`);
    const slugSnap = await tx.get(slugKey);
    if (slugSnap.exists && (slugSnap.data() as { id: string }).id !== productId) throw conflict("SLUG_TAKEN", "Another product already uses this slug.");

    const existingSnap = id ? await tx.get(col(C.variants).where("productId", "==", productId)) : null;
    const existing = new Map((existingSnap?.docs ?? []).map((d) => [d.id, { ...(d.data() as Omit<Variant, "id">), id: d.id } as Variant]));

    // Resolve each submitted variant to an existing doc (by id) or a new one.
    const resolved = input.variants.map((v) => {
      const vid = v.id && existing.has(v.id) ? v.id : variantId(productId, v.size, v.color);
      return { input: v, vid, prev: existing.get(vid) };
    });
    const ids = new Set(resolved.map((r) => r.vid));
    if (ids.size !== resolved.length) throw badRequest("Two variants resolve to the same size and colour.");
    const removed = [...existing.values()].filter((v) => !ids.has(v.id));
    for (const v of removed) if (v.reserved > 0) throw conflict("VARIANT_RESERVED", `Variant ${v.sku} has units reserved by an unpaid order and cannot be removed yet.`);

    // SKU unique keys: read every key we may touch before any write.
    const skuKeys = await Promise.all(resolved.map(async (r) => ({ r, snap: await tx.get(keyRef(`sku:${r.input.sku}`)) })));
    for (const { r, snap } of skuKeys) {
      if (snap.exists && (snap.data() as { id: string }).id !== r.vid) throw conflict("SKU_TAKEN", `SKU ${r.input.sku} is already used by another variant.`, { sku: r.input.sku });
    }

    // ---- writes ----
    const finalVariants: Pick<Variant, "size" | "color" | "stock" | "reserved">[] = [];
    for (const { r } of skuKeys) {
      const v = r.input;
      const prev = r.prev;
      const stock = prev ? prev.stock : v.stock;
      const reserved = prev ? prev.reserved : 0;
      finalVariants.push({ size: v.size, color: v.color, stock, reserved });
      const doc: Omit<Variant, "id"> = {
        productId,
        productName: input.name,
        categoryId: input.categoryId,
        size: v.size,
        color: v.color,
        sku: v.sku,
        stock,
        reserved,
        lowStockThreshold: v.lowStockThreshold,
        isLowStock: computeIsLowStock({ stock, reserved, lowStockThreshold: v.lowStockThreshold }),
        priceOverride: v.priceOverride,
        version: (prev?.version ?? 0) + 1,
        updatedAt: now,
      };
      tx.set(col(C.variants).doc(r.vid), doc);
      tx.set(keyRef(`sku:${v.sku}`), { entity: "variant", id: r.vid, createdAt: now });
      if (prev && prev.sku !== v.sku) tx.delete(keyRef(`sku:${prev.sku}`));
      if (!prev && stock > 0) {
        tx.set(col(C.stockLogs).doc(newId("log_")), { variantId: r.vid, productId, previousStock: 0, newStock: stock, delta: stock, reason: "opening stock (product editor)", orderId: null, changedBy: actor, changedAt: now });
      }
    }
    for (const v of removed) {
      tx.delete(col(C.variants).doc(v.id));
      tx.delete(keyRef(`sku:${v.sku}`));
      if (v.stock > 0) tx.set(col(C.stockLogs).doc(newId("log_")), { variantId: v.id, productId, previousStock: v.stock, newStock: 0, delta: -v.stock, reason: "variant removed (product editor)", orderId: null, changedBy: actor, changedAt: now });
    }

    const derived = deriveFromVariants(finalVariants);
    const doc: Omit<Product, "id"> = {
      categoryId: input.categoryId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      details: input.details,
      price: input.price,
      compareAtPrice: input.compareAtPrice,
      fabric: input.fabric,
      workType: input.workType,
      setIncludes: input.setIncludes,
      weightGrams: input.weightGrams,
      isCustomizable: input.isCustomizable,
      enquiryOnly: input.enquiryOnly,
      leadTimeDays: input.leadTimeDays,
      isFeatured: input.isFeatured,
      isBestSeller: input.isBestSeller,
      isNewArrival: input.isNewArrival,
      status: input.status,
      images: finalImages,
      tags: input.tags,
      seo: input.seo,
      sizes: derived.sizes,
      colors: derived.colors,
      availableUnits: derived.availableUnits,
      searchTokens: productSearchTokens({ name: input.name, categoryName: category.name, fabric: input.fabric, workType: input.workType, colors: derived.colors, tags: input.tags }),
      isDemo: curData?.isDemo ?? false,
      version: (curData?.version ?? 0) + 1,
      createdAt: curData?.createdAt ?? now,
      updatedAt: now,
      publishedAt: input.status === "published" ? (curData?.publishedAt ?? now) : (curData?.publishedAt ?? null),
    };
    tx.set(pRef, doc);
    tx.set(slugKey, { entity: "product", id: productId, createdAt: now });
    if (curData && curData.slug !== input.slug) tx.delete(keyRef(`product-slug:${curData.slug}`));
    auditInTx(tx, actor, id ? "product.update" : "product.create", productId, { name: input.name, status: input.status, variants: resolved.length, removed: removed.length });
  });

  invalidate("catalog");
  const saved = await col(C.products).doc(productId).get();
  return { id: productId, version: (saved.data() as Product).version };
}

export async function setProductStatus(id: string, status: Product["status"], actor: string): Promise<void> {
  const data = await getProductForAdmin(id);
  if (!data) throw notFound("Product not found.");
  const p = data.product;
  if (status === "published") {
    if (p.images.length === 0) throw badRequest("Add at least one image before publishing.");
    if (data.variants.length === 0) throw badRequest("Add at least one variant before publishing.");
    const images = await Promise.all(p.images.map(async (im) => ({ ...im, src: await publishImage(im.src) })));
    await col(C.products).doc(id).update({ images, status, publishedAt: p.publishedAt ?? nowIso(), updatedAt: nowIso(), version: p.version + 1 });
  } else {
    await col(C.products).doc(id).update({ status, updatedAt: nowIso(), version: p.version + 1 });
  }
  await audit(actor, `product.${status}`, id, { name: p.name });
  invalidate("catalog");
}

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  price: number;
  status: Product["status"];
  availableUnits: number;
  variantCount: number;
  image: string | null;
  updatedAt: string;
  isDemo: boolean;
}

/**
 * Admin product list: indexed equality filters (status, category) + cursor pagination by updatedAt.
 * Free-text and stock filters are applied to each fetched batch with a hard scan cap (400 docs), so a request is always bounded.
 */
export async function listAdminProducts(opts: { q?: string; status?: string; categoryId?: string; stock?: string; cursor?: string | null; limit?: number }): Promise<{ rows: AdminProductRow[]; nextCursor: string | null; scanned: number }> {
  const limit = opts.limit ?? 20;
  const tokens = (opts.q ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const rows: AdminProductRow[] = [];
  let cursor = decodeCursor(opts.cursor);
  let scanned = 0;
  let lastKey: string | null = null;
  let exhausted = false;
  while (rows.length < limit && scanned < 400 && !exhausted) {
    let q: FirebaseFirestore.Query = col(C.products);
    if (opts.status) q = q.where("status", "==", opts.status);
    if (opts.categoryId) q = q.where("categoryId", "==", opts.categoryId);
    q = q.orderBy("updatedAt", "desc").orderBy(FieldPath.documentId(), "desc");
    if (cursor) q = q.startAfter(cursor.value, cursor.id);
    const snap = await q.limit(50).get();
    if (snap.size < 50) exhausted = true;
    for (const d of snap.docs) {
      scanned++;
      const p = fromDoc<Product>(d);
      lastKey = encodeCursor(p.updatedAt, p.id);
      cursor = { value: p.updatedAt, id: p.id };
      if (tokens.length && !tokens.every((t) => p.searchTokens.some((s) => s.startsWith(t)) || p.slug.includes(t) || p.name.toLowerCase().includes(t))) continue;
      if (opts.stock === "out" && p.availableUnits > 0) continue;
      if (opts.stock === "in" && p.availableUnits <= 0) continue;
      rows.push({ id: p.id, name: p.name, slug: p.slug, categoryId: p.categoryId, price: p.price, status: p.status, availableUnits: p.availableUnits, variantCount: p.sizes.length * Math.max(1, p.colors.length), image: p.images[0]?.src ?? null, updatedAt: p.updatedAt, isDemo: p.isDemo });
      if (rows.length >= limit) break;
    }
    if (snap.empty) break;
  }
  return { rows, nextCursor: !exhausted || rows.length >= limit ? lastKey : null, scanned };
}
