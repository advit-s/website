import type { Metadata } from "next";
import { getActiveCategories, queryCatalog } from "@/server/repos/catalog";
import { COLLECTIONS, parseCatalogQuery } from "@/domain/catalog";
import { CatalogView } from "@/components/storefront/catalog-view";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const q = parseCatalogQuery(await searchParams);
  const col = COLLECTIONS.find((c) => c.id === q.collection)?.label;
  // Filtered/paginated variants are not separate canonical pages.
  const filtered = Boolean(q.q || q.category || q.minPrice != null || q.maxPrice != null || q.sizes.length || q.colors.length || q.fabrics.length || q.page > 1 || q.sort !== "featured");
  return {
    title: q.q ? `Search: ${q.q}` : (col ?? "Shop all lehengas"),
    description: "Browse bridal, wedding, festive and party-wear lehengas and accessories.",
    alternates: { canonical: q.collection ? `/shop?collection=${q.collection}` : "/shop" },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function ShopPage({ searchParams }: { searchParams: SP }) {
  const query = parseCatalogQuery(await searchParams);
  const [result, categories] = await Promise.all([queryCatalog(query), getActiveCategories()]);
  const heading = query.q ? `Results for “${query.q}”` : (COLLECTIONS.find((c) => c.id === query.collection)?.label ?? "Shop all");
  return (
    <div className="container-rr pb-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Shop" }]} />
      <header className="mb-8 border-b border-line pb-6">
        <h1 className="t-h1">{heading}</h1>
        <p className="mt-2 max-w-2xl text-ink-muted">Filter by price, size, colour and fabric. Your filters stay in the address bar, so back and forward work as expected.</p>
      </header>
      <CatalogView basePath="/shop" query={query} result={result} categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} />
    </div>
  );
}
