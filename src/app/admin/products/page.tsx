import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Plus } from "lucide-react";
import { requireAdminPage } from "@/server/auth/session";
import { getAllCategoriesAdmin } from "@/server/repos/catalog";
import { listAdminProducts } from "@/server/services/catalog-admin";
import { LISTING_CAP } from "@/domain/catalog";
import { Card, PageHeader } from "@/components/admin/admin-shell";
import { tableCls } from "@/components/admin/table-styles";
import { StatusToggle } from "@/components/admin/status-toggle";
import { Badge, Alert } from "@/components/ui/feedback";
import { ButtonLink, Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { adminMediaUrl } from "@/lib/media";
import { formatINR } from "@/domain/money";
import { C, col } from "@/server/repos/common";

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

export default async function AdminProducts({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage("/admin/products");
  const sp = await searchParams;
  const status = ["draft", "published", "archived"].includes(sp.status ?? "") ? sp.status : undefined;
  const [cats, list, published] = await Promise.all([
    getAllCategoriesAdmin(),
    listAdminProducts({ q: sp.q?.slice(0, 80), status, categoryId: sp.category || undefined, stock: sp.stock, cursor: sp.cursor ?? null }),
    col(C.products).where("status", "==", "published").count().get(),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const publishedCount = published.data().count;
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, status, category: sp.category, stock: sp.stock, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  return (
    <>
      <PageHeader
        title="Products"
        description="Draft products never appear in the storefront. Publish when images, price and variants are ready."
        actions={
          <ButtonLink href="/admin/products/new">
            <Plus className="size-4" aria-hidden /> Add product
          </ButtonLink>
        }
      />
      {publishedCount > LISTING_CAP * 0.8 && (
        <Alert tone="warning" title="Approaching the catalogue size limit" className="mb-4">
          {publishedCount} published products. The storefront listing is designed for up to {LISTING_CAP}; beyond that an external search service is needed (docs/DECISIONS.md D-26).
        </Alert>
      )}
      <Card className="mb-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_9rem_12rem_9rem_auto]">
          <div>
            <label htmlFor="q" className="sr-only">Search products</label>
            <Input id="q" name="q" defaultValue={sp.q} placeholder="Search name, fabric, colour" className="min-h-10" />
          </div>
          <div>
            <label htmlFor="status" className="sr-only">Status</label>
            <Select id="status" name="status" defaultValue={status ?? ""} className="min-h-10">
              <option value="">All statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </Select>
          </div>
          <div>
            <label htmlFor="category" className="sr-only">Category</label>
            <Select id="category" name="category" defaultValue={sp.category ?? ""} className="min-h-10">
              <option value="">All categories</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="stock" className="sr-only">Stock</label>
            <Select id="stock" name="stock" defaultValue={sp.stock ?? ""} className="min-h-10">
              <option value="">Any stock</option>
              <option value="in">In stock</option>
              <option value="out">Out of stock</option>
            </Select>
          </div>
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
      </Card>

      <div className={tableCls.wrap}>
        <table className={tableCls.table}>
          <caption className="sr-only">Products</caption>
          <thead>
            <tr>
              <th className={tableCls.th}>Product</th>
              <th className={tableCls.th}>Category</th>
              <th className={tableCls.th}>Price</th>
              <th className={tableCls.th}>Stock</th>
              <th className={tableCls.th}>Status</th>
              <th className={tableCls.th}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {list.rows.length === 0 && (
              <tr>
                <td className={tableCls.td} colSpan={6}>No products match these filters.</td>
              </tr>
            )}
            {list.rows.map((p) => (
              <tr key={p.id}>
                <td className={tableCls.td}>
                  <div className="flex items-center gap-3">
                    <span className="relative block h-14 w-11 shrink-0 overflow-hidden bg-beige">
                      {p.image && <Image src={adminMediaUrl(p.image)} alt="" fill unoptimized sizes="44px" className="object-cover" />}
                    </span>
                    <div className="min-w-0">
                      <Link href={`/admin/products/${p.id}`} className="font-medium text-maroon hover:underline">{p.name}</Link>
                      <p className="text-xs text-ink-muted">/{p.slug}{p.isDemo ? " - demo" : ""}</p>
                    </div>
                  </div>
                </td>
                <td className={tableCls.td}>{catName.get(p.categoryId) ?? "-"}</td>
                <td className={tableCls.td}>{formatINR(p.price)}</td>
                <td className={tableCls.td}>{p.availableUnits > 0 ? `${p.availableUnits} available` : <Badge tone="error">Out of stock</Badge>}</td>
                <td className={tableCls.td}><StatusToggle id={p.id} status={p.status} /></td>
                <td className={tableCls.td}>
                  <Link href={`/admin/products/${p.id}`} className="text-sm text-maroon underline underline-offset-4">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-ink-muted">
        <span>{list.rows.length} shown</span>
        {list.nextCursor ? (
          <Link href={`/admin/products${qs({ cursor: list.nextCursor })}`} className="text-maroon underline underline-offset-4">Next page</Link>
        ) : (
          <span>End of list</span>
        )}
      </nav>
    </>
  );
}
