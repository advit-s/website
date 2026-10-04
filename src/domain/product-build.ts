import { buildSearchTokens } from "./catalog";
import type { Variant } from "./types";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "Free Size", "Custom"];

export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a);
    const ib = SIZE_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
}

/** Facets and stock summary denormalised onto the product from its variants. */
export function deriveFromVariants(variants: Pick<Variant, "size" | "color" | "stock" | "reserved">[]) {
  const sizes = sortSizes(Array.from(new Set(variants.map((v) => v.size))));
  const colors = Array.from(new Set(variants.map((v) => v.color))).sort();
  const availableUnits = variants.reduce((s, v) => s + Math.max(0, v.stock - v.reserved), 0);
  return { sizes, colors, availableUnits };
}

export const computeIsLowStock = (v: Pick<Variant, "stock" | "reserved" | "lowStockThreshold">): boolean =>
  Math.max(0, v.stock - v.reserved) <= v.lowStockThreshold;

export function productSearchTokens(p: {
  name: string;
  categoryName: string;
  fabric: string;
  workType: string;
  colors: string[];
  tags: string[];
}): string[] {
  return buildSearchTokens([p.name, p.categoryName, p.fabric, p.workType, p.colors, p.tags]);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Deterministic variant id and SKU from parts, matching the PDF's examples (e.g. RRC-BR-001-M-MRN). */
export function variantId(productId: string, size: string, color: string): string {
  return `var_${productId}_${slugify(size)}_${slugify(color)}`.replace(/-/g, "_");
}
