import type { MetadataRoute } from "next";
import { getActiveCategories, getListing } from "@/server/repos/catalog";

export const dynamic = "force-dynamic";

/** Public, indexable pages only. Cart, checkout, account, admin, tracking and auth pages are deliberately excluded (and also noindex). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const [cats, products] = await Promise.all([getActiveCategories(), getListing()]);
  const fixed = ["", "/shop", "/about", "/contact", "/faq", "/terms", "/privacy", "/shipping-policy", "/refund-policy"].map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.6 }));
  return [
    ...fixed,
    ...cats.map((c) => ({ url: `${base}/category/${c.slug}`, lastModified: new Date(c.updatedAt), changeFrequency: "weekly" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${base}/product/${p.slug}`, lastModified: new Date(p.createdAt), changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
