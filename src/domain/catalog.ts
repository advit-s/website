import type { Paise } from "./money";

/**
 * Catalog listing logic (pure + unit-tested).
 *
 * Search strategy (docs/DECISIONS.md D-26): Firestore has no arbitrary full-text search and permits only one
 * array-contains per query, so a multi-facet shop page cannot be expressed as one indexed query. Instead the server
 * loads a bounded listing projection of PUBLISHED products (cap LISTING_CAP, cached), then filters, sorts and
 * paginates here. Free-text search matches whole-word prefixes against pre-built `searchTokens`.
 * Beyond LISTING_CAP products an external search service is required; admin sees a warning before that.
 */
export const LISTING_CAP = 1000;
export const PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;

export interface ListingProduct {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  price: Paise;
  compareAtPrice: Paise | null;
  fabric: string;
  workType: string;
  sizes: string[];
  colors: string[];
  tags: string[];
  searchTokens: string[];
  image: { src: string; alt: string } | null;
  imageHover: { src: string; alt: string } | null;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  isCustomizable: boolean;
  enquiryOnly: boolean;
  leadTimeDays: number | null;
  availableUnits: number;
  isDemo: boolean;
  createdAt: string;
}

export type Collection = "new" | "bestsellers" | "sale" | "featured";
export type SortKey = "featured" | "newest" | "price-asc" | "price-desc" | "name";

export interface CatalogQuery {
  q: string;
  category: string | null; // slug
  collection: Collection | null;
  minPrice: Paise | null;
  maxPrice: Paise | null;
  sizes: string[];
  colors: string[];
  fabrics: string[];
  sort: SortKey;
  page: number;
  pageSize: number;
}

export const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "newest", label: "Newest" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
  { id: "name", label: "Name A-Z" },
];

export const COLLECTIONS: { id: Collection; label: string }[] = [
  { id: "new", label: "New arrivals" },
  { id: "bestsellers", label: "Best sellers" },
  { id: "sale", label: "Sale" },
  { id: "featured", label: "Featured" },
];

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
const many = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : v ? v.split(",") : []).map((s) => s.trim()).filter(Boolean).slice(0, 12);

function rupeesParam(v: string): Paise | null {
  if (!/^\d{1,8}$/.test(v)) return null;
  return Number(v) * 100;
}

/** Parse URL search params into a clamped, validated query. Prices in the URL are whole rupees. */
export function parseCatalogQuery(params: Params, fixedCategory?: string): CatalogQuery {
  const collection = one(params.collection) as Collection;
  const sort = one(params.sort) as SortKey;
  const page = Math.max(1, Math.min(500, parseInt(one(params.page), 10) || 1));
  return {
    q: one(params.q).slice(0, 80).trim(),
    category: fixedCategory ?? (one(params.category).slice(0, 80) || null),
    collection: COLLECTIONS.some((c) => c.id === collection) ? collection : null,
    minPrice: rupeesParam(one(params.minPrice)),
    maxPrice: rupeesParam(one(params.maxPrice)),
    sizes: many(params.size),
    colors: many(params.color),
    fabrics: many(params.fabric),
    sort: SORT_OPTIONS.some((s) => s.id === sort) ? sort : "featured",
    page,
    pageSize: PAGE_SIZE,
  };
}

/** Serialise a query back to URL params (omitting defaults) so filters survive navigation and back/forward. */
export function catalogQueryToSearch(q: Partial<CatalogQuery>, omitCategory = false): string {
  const sp = new URLSearchParams();
  if (q.q) sp.set("q", q.q);
  if (q.category && !omitCategory) sp.set("category", q.category);
  if (q.collection) sp.set("collection", q.collection);
  if (q.minPrice != null) sp.set("minPrice", String(Math.round(q.minPrice / 100)));
  if (q.maxPrice != null) sp.set("maxPrice", String(Math.round(q.maxPrice / 100)));
  if (q.sizes?.length) sp.set("size", q.sizes.join(","));
  if (q.colors?.length) sp.set("color", q.colors.join(","));
  if (q.fabrics?.length) sp.set("fabric", q.fabrics.join(","));
  if (q.sort && q.sort !== "featured") sp.set("sort", q.sort);
  if (q.page && q.page > 1) sp.set("page", String(q.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 2),
    ),
  );
}

export function buildSearchTokens(parts: (string | string[])[]): string[] {
  return tokenize(parts.flat().join(" ")).slice(0, 60);
}

function matchesSearch(p: ListingProduct, qTokens: string[]): boolean {
  return qTokens.every((q) => p.searchTokens.some((t) => t.startsWith(q)));
}

export const isOnSale = (p: Pick<ListingProduct, "price" | "compareAtPrice">): boolean => p.compareAtPrice != null && p.compareAtPrice > p.price;

export interface FacetCount {
  value: string;
  count: number;
}

export interface CatalogResult {
  items: ListingProduct[];
  total: number;
  page: number;
  pages: number;
  facets: { sizes: FacetCount[]; colors: FacetCount[]; fabrics: FacetCount[]; priceMin: Paise; priceMax: Paise };
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "Free Size", "Custom"];

function countBy(items: ListingProduct[], pick: (p: ListingProduct) => string[]): FacetCount[] {
  const m = new Map<string, number>();
  for (const p of items) for (const v of new Set(pick(p))) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([value, count]) => ({ value, count }));
}

export function runCatalogQuery(all: ListingProduct[], categoryIdBySlug: Map<string, string>, query: CatalogQuery): CatalogResult {
  const qTokens = tokenize(query.q);
  const categoryId = query.category ? categoryIdBySlug.get(query.category) : undefined;

  // Scope = everything except the facet filters, so facet counts stay meaningful.
  let scope = all;
  if (query.category) scope = categoryId ? scope.filter((p) => p.categoryId === categoryId) : [];
  if (query.collection === "new") scope = scope.filter((p) => p.isNewArrival);
  else if (query.collection === "bestsellers") scope = scope.filter((p) => p.isBestSeller);
  else if (query.collection === "sale") scope = scope.filter(isOnSale);
  else if (query.collection === "featured") scope = scope.filter((p) => p.isFeatured);
  if (qTokens.length) scope = scope.filter((p) => matchesSearch(p, qTokens));

  let filtered = scope;
  if (query.minPrice != null) filtered = filtered.filter((p) => p.price >= query.minPrice!);
  if (query.maxPrice != null) filtered = filtered.filter((p) => p.price <= query.maxPrice!);
  if (query.sizes.length) filtered = filtered.filter((p) => p.sizes.some((s) => query.sizes.includes(s)));
  if (query.colors.length) filtered = filtered.filter((p) => p.colors.some((c) => query.colors.includes(c)));
  if (query.fabrics.length) filtered = filtered.filter((p) => query.fabrics.includes(p.fabric));

  const sorted = [...filtered];
  const byNew = (a: ListingProduct, b: ListingProduct) => b.createdAt.localeCompare(a.createdAt);
  switch (query.sort) {
    case "price-asc":
      sorted.sort((a, b) => a.price - b.price || byNew(a, b));
      break;
    case "price-desc":
      sorted.sort((a, b) => b.price - a.price || byNew(a, b));
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "newest":
      sorted.sort(byNew);
      break;
    default:
      sorted.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || Number(b.isBestSeller) - Number(a.isBestSeller) || byNew(a, b));
  }

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pages);
  const items = sorted.slice((page - 1) * query.pageSize, page * query.pageSize);

  const sizes = countBy(scope, (p) => p.sizes).sort((a, b) => SIZE_ORDER.indexOf(a.value) - SIZE_ORDER.indexOf(b.value) || a.value.localeCompare(b.value));
  const prices = scope.map((p) => p.price);
  return {
    items,
    total,
    page,
    pages,
    facets: {
      sizes,
      colors: countBy(scope, (p) => p.colors).sort((a, b) => a.value.localeCompare(b.value)),
      fabrics: countBy(scope, (p) => (p.fabric ? [p.fabric] : [])).sort((a, b) => a.value.localeCompare(b.value)),
      priceMin: prices.length ? Math.min(...prices) : 0,
      priceMax: prices.length ? Math.max(...prices) : 0,
    },
  };
}
