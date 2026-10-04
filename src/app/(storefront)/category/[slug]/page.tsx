import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getCategoryBySlug, queryCatalog } from "@/server/repos/catalog";
import { parseCatalogQuery } from "@/domain/catalog";
import { CatalogView } from "@/components/storefront/catalog-view";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { mediaUrl } from "@/lib/media";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await getCategoryBySlug((await params).slug);
  if (!category) return { title: "Category not found", robots: { index: false } };
  return { title: category.name, description: category.description.slice(0, 155), alternates: { canonical: `/category/${category.slug}` } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound(); // unknown or inactive categories are a real 404
  const query = parseCatalogQuery(await searchParams, slug);
  const result = await queryCatalog(query);
  return (
    <>
      <section className="on-dark relative isolate overflow-hidden bg-maroon text-white">
        {category.imageUrl && <Image src={mediaUrl(category.imageUrl)} alt="" fill unoptimized sizes="100vw" className="-z-10 object-cover object-top opacity-30" />}
        <div className="container-rr py-12 sm:py-16">
          <p className="t-eyebrow text-gold">Collection</p>
          <h1 className="t-h1 mt-2 !text-white">{category.name}</h1>
          <p className="mt-3 max-w-2xl text-white/85">{category.description}</p>
        </div>
      </section>
      <div className="container-rr pb-6">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Shop", href: "/shop" }, { label: category.name }]} />
        <CatalogView basePath={`/category/${category.slug}`} query={query} result={result} />
      </div>
    </>
  );
}
