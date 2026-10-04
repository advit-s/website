import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/auth/session";
import { getAllCategoriesAdmin } from "@/server/repos/catalog";
import { getProductForAdmin } from "@/server/services/catalog-admin";
import { ProductEditor } from "@/components/admin/product-editor";
import type { EditorState } from "@/components/admin/product-editor-state";
import { PageHeader } from "@/components/admin/admin-shell";

export const metadata: Metadata = { title: "Edit product" };
export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdminPage(`/admin/products/${id}`);
  const [data, cats] = await Promise.all([getProductForAdmin(id), getAllCategoriesAdmin()]);
  if (!data) notFound();
  const { product: p, variants } = data;
  const rupees = (paise: number | null) => (paise == null ? "" : String(paise / 100));
  const initial: EditorState = {
    name: p.name, slug: p.slug, categoryId: p.categoryId, description: p.description, details: p.details.join("\n"),
    price: rupees(p.price), compareAtPrice: rupees(p.compareAtPrice), fabric: p.fabric, workType: p.workType, setIncludes: p.setIncludes,
    weightGrams: String(p.weightGrams), isCustomizable: p.isCustomizable, enquiryOnly: p.enquiryOnly, leadTimeDays: p.leadTimeDays == null ? "" : String(p.leadTimeDays),
    isFeatured: p.isFeatured, isBestSeller: p.isBestSeller, isNewArrival: p.isNewArrival, status: p.status,
    images: [...p.images].sort((a, b) => a.order - b.order).map((i) => ({ src: i.src, alt: i.alt })),
    tags: p.tags.join(", "), seoTitle: p.seo.title, seoDescription: p.seo.description,
    variants: variants.map((v) => ({ key: v.id, id: v.id, size: v.size, color: v.color, sku: v.sku, stock: String(v.stock), currentStock: v.stock, reserved: v.reserved, version: v.version, lowStockThreshold: String(v.lowStockThreshold), priceOverride: rupees(v.priceOverride) })),
  };
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-ink-muted">
        <Link href="/admin/products" className="hover:underline">Products</Link> / {p.name}
      </nav>
      <PageHeader title="Edit product" description={`Last updated ${new Date(p.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST. Product id ${p.id}.`} />
      <ProductEditor initial={initial} categories={cats.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive }))} productId={p.id} version={p.version} isDemo={p.isDemo} />
    </>
  );
}
