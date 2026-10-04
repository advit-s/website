import type { Metadata } from "next";
import { requireAdminPage } from "@/server/auth/session";
import { getAllCategoriesAdmin } from "@/server/repos/catalog";
import { countCategoryProducts } from "@/server/services/catalog-admin";
import { CategoriesManager } from "@/components/admin/categories-manager";
import { PageHeader } from "@/components/admin/admin-shell";

export const metadata: Metadata = { title: "Categories" };
export const dynamic = "force-dynamic";

export default async function AdminCategories() {
  await requireAdminPage("/admin/categories");
  const cats = await getAllCategoriesAdmin();
  const counts = await Promise.all(cats.map((c) => countCategoryProducts(c.id)));
  return (
    <>
      <PageHeader title="Categories" description="Active categories appear in the storefront navigation and shop immediately - no deployment needed." />
      <CategoriesManager rows={cats.map((c, i) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, imageUrl: c.imageUrl, sortOrder: c.sortOrder, isActive: c.isActive, version: c.version, productCount: counts[i] ?? 0 }))} />
    </>
  );
}
