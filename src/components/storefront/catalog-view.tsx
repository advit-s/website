import Link from "next/link";
import { X } from "lucide-react";
import { catalogQueryToSearch, COLLECTIONS, type CatalogQuery, type CatalogResult } from "@/domain/catalog";
import { ProductGrid } from "./product-card";
import { FilterForm, MobileFilters, type FilterState } from "./filter-form";
import { SortSelect } from "./sort-select";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { formatINR } from "@/domain/money";

interface Props {
  basePath: string; // "/shop" or "/category/slug"
  query: CatalogQuery;
  result: CatalogResult;
  categories?: { slug: string; name: string }[]; // present on /shop only
  categoryNames?: Map<string, string>;
}

export function CatalogView({ basePath, query, result, categories }: Props) {
  const fixedCategory = !categories;
  const state: FilterState = {
    q: query.q,
    category: query.category,
    collection: query.collection,
    sort: query.sort,
    minPrice: query.minPrice != null ? query.minPrice / 100 : null,
    maxPrice: query.maxPrice != null ? query.maxPrice / 100 : null,
    sizes: query.sizes,
    colors: query.colors,
    fabrics: query.fabrics,
  };
  const href = (patch: Partial<CatalogQuery>) => `${basePath}${catalogQueryToSearch({ ...query, page: 1, ...patch }, fixedCategory)}`;
  const chips: { label: string; to: string }[] = [];
  if (query.q) chips.push({ label: `Search: ${query.q}`, to: href({ q: "" }) });
  if (query.collection) chips.push({ label: COLLECTIONS.find((c) => c.id === query.collection)?.label ?? query.collection, to: href({ collection: null }) });
  if (!fixedCategory && query.category) chips.push({ label: categories?.find((c) => c.slug === query.category)?.name ?? query.category, to: href({ category: null }) });
  if (query.minPrice != null || query.maxPrice != null) {
    chips.push({
      label: `${query.minPrice != null ? formatINR(query.minPrice) : "Any"} - ${query.maxPrice != null ? formatINR(query.maxPrice) : "Any"}`,
      to: href({ minPrice: null, maxPrice: null }),
    });
  }
  query.sizes.forEach((s) => chips.push({ label: `Size ${s}`, to: href({ sizes: query.sizes.filter((x) => x !== s) }) }));
  query.colors.forEach((s) => chips.push({ label: s, to: href({ colors: query.colors.filter((x) => x !== s) }) }));
  query.fabrics.forEach((s) => chips.push({ label: s, to: href({ fabrics: query.fabrics.filter((x) => x !== s) }) }));
  const activeFilters = chips.filter((c) => !c.label.startsWith("Search:")).length;
  const formKey = JSON.stringify(state);

  const filterProps = { basePath, state, facets: { ...result.facets, priceMin: result.facets.priceMin, priceMax: result.facets.priceMax }, categories, activeCount: activeFilters };

  return (
    <div className="grid gap-x-10 lg:grid-cols-[16rem_1fr]">
      <aside aria-label="Filters" className="hidden lg:block">
        <h2 className="t-eyebrow border-b border-line pb-3 text-maroon">Filter</h2>
        <FilterForm key={formKey} {...filterProps} />
      </aside>

      <section aria-label="Products" aria-live="polite">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <p className="text-sm text-ink-muted" role="status">
            {result.total} {result.total === 1 ? "piece" : "pieces"}
          </p>
          <div className="flex items-center gap-3">
            <MobileFilters key={formKey} {...filterProps} />
            <SortSelect value={query.sort} />
          </div>
        </div>

        {chips.length > 0 && (
          <ul className="mb-6 flex flex-wrap items-center gap-2" aria-label="Active filters">
            {chips.map((c) => (
              <li key={c.label}>
                <Link href={c.to} className="inline-flex min-h-9 items-center gap-1.5 rounded-sm border border-line bg-white px-3 text-sm hover:border-maroon">
                  {c.label}
                  <X className="size-3.5" aria-hidden />
                  <span className="sr-only">Remove filter</span>
                </Link>
              </li>
            ))}
            <li>
              <Link href={fixedCategory ? basePath : "/shop"} className="px-2 text-sm text-maroon underline underline-offset-4">
                Clear all
              </Link>
            </li>
          </ul>
        )}

        {result.items.length === 0 ? (
          <EmptyState
            title="No pieces match these filters"
            action={
              <ButtonLink href={fixedCategory ? basePath : "/shop"} variant="secondary">
                Clear filters
              </ButtonLink>
            }
          >
            Try removing a filter or searching for a different colour or fabric.
          </EmptyState>
        ) : (
          <ProductGrid products={result.items} priorityCount={4} />
        )}

        <Pagination page={result.page} pages={result.pages} href={(p) => `${basePath}${catalogQueryToSearch({ ...query, page: p }, fixedCategory)}`} />
      </section>
    </div>
  );
}
