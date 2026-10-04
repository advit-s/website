import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/server/auth/session";
import { getAllCategoriesAdmin } from "@/server/repos/catalog";
import { ProductEditor } from "@/components/admin/product-editor";
import { emptyEditor } from "@/components/admin/product-editor-state";
import { PageHeader } from "@/components/admin/admin-shell";

export const metadata: Metadata = { title: "New product" };
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requireAdminPage("/admin/products/new");
  const cats = await getAllCategoriesAdmin();
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-ink-muted">
        <Link href="/admin/products" className="hover:underline">Products</Link> / New
      </nav>
      <PageHeader title="Add product" description="Create a product with its images, pricing and size/colour variants. Save as a draft until it is ready to publish." />
      <ProductEditor initial={emptyEditor()} categories={cats.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive }))} productId={null} />
    </>
  );
}
