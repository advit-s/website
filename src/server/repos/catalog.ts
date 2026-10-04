import "server-only";
import { C, col } from "./common";
import { cachedFn } from "../cache";
import type { Category, Product, Variant } from "@/domain/types";
import { availableUnits } from "@/domain/types";
import { LISTING_CAP, runCatalogQuery, type CatalogQuery, type CatalogResult, type ListingProduct } from "@/domain/catalog";
import { getPublicSettings } from "./settings";
import { sortSizes } from "@/domain/product-build";

type Doc = FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot;

export function fromDoc<T>(snap: Doc): T {
  return { ...(snap.data() as object), id: snap.id } as T;
}

/* ------------------------------------------------------------ categories */

async function readCategories(): Promise<Category[]> {
  const snap = await col(C.categories).orderBy("sortOrder").get();
  return snap.docs.map((d) => fromDoc<Category>(d));
}
const cachedCategories = cachedFn(readCategories, ["categories-all"], ["catalog"]);

/** Active categories drive storefront navigation; inactive ones never appear publicly. */
export async function getActiveCategories(): Promise<Category[]> {
  return (await cachedCategories()).filter((c) => c.isActive);
}
export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  return (await getActiveCategories()).find((c) => c.slug === slug) ?? null;
}
export async function getAllCategoriesAdmin(): Promise<Category[]> {
  return readCategories();
}

/* ------------------------------------------------------------ listing snapshot */

function toListing(p: Product): ListingProduct {
  const imgs = [...p.images].sort((a, b) => a.order - b.order);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    categoryId: p.categoryId,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    fabric: p.fabric,
    workType: p.workType,
    sizes: p.sizes,
    colors: p.colors,
    tags: p.tags,
    searchTokens: p.searchTokens,
    image: imgs[0] ? { src: imgs[0].src, alt: imgs[0].alt } : null,
    imageHover: imgs[1] ? { src: imgs[1].src, alt: imgs[1].alt } : null,
    isFeatured: p.isFeatured,
    isBestSeller: p.isBestSeller,
    isNewArrival: p.isNewArrival,
    isCustomizable: p.isCustomizable,
    enquiryOnly: p.enquiryOnly,
    leadTimeDays: p.leadTimeDays,
    availableUnits: p.availableUnits,
    isDemo: p.isDemo,
    createdAt: p.createdAt,
  };
}

async function readListing(): Promise<ListingProduct[]> {
  const [products, categories] = await Promise.all([
    col(C.products).where("status", "==", "published").orderBy("createdAt", "desc").limit(LISTING_CAP).get(),
    cachedCategories(),
  ]);
  const activeIds = new Set(categories.filter((c) => c.isActive).map((c) => c.id));
  // Products in an inactive category are not publicly listed.
  return products.docs.map((d) => fromDoc<Product>(d)).filter((p) => activeIds.has(p.categoryId)).map(toListing);
}
const cachedListing = cachedFn(readListing, ["catalog-listing"], ["catalog"]);

export async function getListing(): Promise<ListingProduct[]> {
  return cachedListing();
}

export async function queryCatalog(query: CatalogQuery): Promise<CatalogResult & { categoryNotFound: boolean }> {
  const [all, categories] = await Promise.all([getListing(), getActiveCategories()]);
  const map = new Map(categories.map((c) => [c.slug, c.id]));
  const categoryNotFound = Boolean(query.category && !map.has(query.category));
  return { ...runCatalogQuery(all, map, query), categoryNotFound };
}

/* ------------------------------------------------------------ home */

export interface HomeData {
  categories: Category[];
  featured: ListingProduct[];
  bestsellers: ListingProduct[];
  newArrivals: ListingProduct[];
}

export async function getHomeData(): Promise<HomeData> {
  const [categories, listing, settings] = await Promise.all([getActiveCategories(), getListing(), getPublicSettings()]);
  const byId = new Map(listing.map((p) => [p.id, p]));
  const picked = settings.home.featuredProductIds.map((id) => byId.get(id)).filter((p): p is ListingProduct => Boolean(p));
  const featured = (picked.length ? picked : listing.filter((p) => p.isFeatured)).slice(0, 8);
  return {
    categories,
    featured,
    bestsellers: listing.filter((p) => p.isBestSeller).slice(0, 4),
    newArrivals: listing.filter((p) => p.isNewArrival).slice(0, 4),
  };
}

/* ------------------------------------------------------------ product page */

export interface ProductPageData {
  product: Product;
  category: Category | null;
  variants: Variant[];
  related: ListingProduct[];
}

/** Public product read: only published products in active categories. Variants are projected without private operational fields by callers. */
export async function getProductPageData(slug: string): Promise<ProductPageData | null> {
  const snap = await col(C.products).where("slug", "==", slug).where("status", "==", "published").limit(1).get();
  const doc = snap.docs[0];
  if (!doc) return null;
  const product = fromDoc<Product>(doc);
  const categories = await getActiveCategories();
  const category = categories.find((c) => c.id === product.categoryId) ?? null;
  if (!category) return null;
  const vs = await col(C.variants).where("productId", "==", product.id).get();
  const variants = vs.docs.map((d) => fromDoc<Variant>(d));
  const listing = await getListing();
  const related = listing.filter((p) => p.categoryId === product.categoryId && p.id !== product.id).slice(0, 4);
  return { product, category, variants, related };
}

/** Public-safe variant: no reserved count, thresholds or version. */
export interface PublicVariant {
  id: string;
  size: string;
  color: string;
  price: number;
  available: number;
  lowStock: boolean;
}

export function toPublicVariants(product: Pick<Product, "price">, variants: Variant[]): PublicVariant[] {
  const order = sortSizes(variants.map((v) => v.size));
  const sorted = [...variants].sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size) || a.color.localeCompare(b.color));
  return sorted.map((v) => {
    const avail = availableUnits(v);
    return {
      id: v.id,
      size: v.size,
      color: v.color,
      price: v.priceOverride ?? product.price,
      available: avail,
      lowStock: avail > 0 && avail <= v.lowStockThreshold,
    };
  });
}

export async function getProductSlugs(): Promise<string[]> {
  return (await getListing()).map((p) => p.slug);
}
