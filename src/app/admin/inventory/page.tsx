import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { requireAdminPage } from "@/server/auth/session";
import { getAllCategoriesAdmin } from "@/server/repos/catalog";
import { listInventory } from "@/server/services/inventory";
import { InventoryTable } from "@/components/admin/inventory-table";
import { Card, PageHeader } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { id: "all", label: "All variants" },
  { id: "low", label: "Low stock" },
  { id: "out", label: "Out of stock" },
] as const;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage("/admin/inventory");
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.id === sp.filter)?.id ?? "all") as "all" | "low" | "out";
  const cats = await getAllCategoriesAdmin();
  const { rows, nextCursor } = await listInventory({ filter, q: sp.q?.slice(0, 60), categoryId: sp.category || undefined, cursor: sp.cursor ?? null, limit: 50 });
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ filter: filter === "all" ? "" : filter, q: sp.q, category: sp.category, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const exportQuery = `${filter !== "all" ? `&filter=${filter}` : ""}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}${sp.category ? `&category=${encodeURIComponent(sp.category)}` : ""}`;
  return (
    <>
      <PageHeader title="Inventory" description="One row per size/colour. Edits are version-checked, so a sale that lands while you are typing is never silently overwritten. Held units belong to unpaid orders and release automatically." />
      <nav aria-label="Inventory filter" className="mb-3 flex gap-2">
        {FILTERS.map((f) => (
          <Link key={f.id} href={`/admin/inventory${qs({ filter: f.id === "all" ? "" : f.id, cursor: "" })}`} aria-current={f.id === filter ? "page" : undefined} className={clsx("inline-flex min-h-9 items-center rounded-sm border px-3 text-sm", f.id === filter ? "border-maroon bg-maroon text-white" : "border-line bg-white hover:bg-beige/60")}>
            {f.label}
          </Link>
        ))}
      </nav>
      <Card className="mb-4">
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_14rem_auto]">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <div>
            <label htmlFor="q" className="sr-only">Search by SKU or product</label>
            <Input id="q" name="q" defaultValue={sp.q} placeholder="Search SKU prefix or product name" className="min-h-10" />
          </div>
          <div>
            <label htmlFor="category" className="sr-only">Category</label>
            <Select id="category" name="category" defaultValue={sp.category ?? ""} className="min-h-10">
              <option value="">All categories</option>
              {cats.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
      </Card>
      <InventoryTable key={rows.map((r) => r.id + r.version).join()} initialRows={rows} exportQuery={exportQuery} />
      <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-ink-muted">
        <span>{rows.length} shown</span>
        {nextCursor ? <Link href={`/admin/inventory${qs({ cursor: nextCursor })}`} className="text-maroon underline underline-offset-4">Next page</Link> : <span>End of list</span>}
      </nav>
    </>
  );
}
