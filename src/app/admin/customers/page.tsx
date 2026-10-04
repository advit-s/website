import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { requireAdminPage } from "@/server/auth/session";
import { listCustomers } from "@/server/services/admin-customers";
import { PageHeader, tableCls } from "@/components/admin/admin-shell";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { formatINR } from "@/domain/money";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function AdminCustomers({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage("/admin/customers");
  const sp = await searchParams;
  const { rows, nextCursor, note } = await listCustomers({ q: sp.q?.slice(0, 80), cursor: sp.cursor ?? null });
  const df = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
  return (
    <>
      <PageHeader title="Customers" description="Registered customers (guest buyers appear only in Orders). Contact details here are restricted to administrators." />
      <form method="get" className="mb-4 flex max-w-xl gap-2">
        <label htmlFor="q" className="sr-only">Search customers</label>
        <Input id="q" name="q" defaultValue={sp.q} placeholder="Exact email or phone number" className="min-h-10" />
        <Button type="submit" variant="secondary">Search</Button>
        {sp.q && <Link href="/admin/customers" className="inline-flex min-h-10 items-center px-2 text-sm text-maroon underline">Clear</Link>}
      </form>
      {note && <Alert tone="info" className="mb-4">{note}</Alert>}
      <div className={tableCls.wrap}>
        <table className={tableCls.table}>
          <caption className="sr-only">Customers</caption>
          <thead>
            <tr>
              <th className={tableCls.th}>Customer</th>
              <th className={tableCls.th}>Contact</th>
              <th className={clsx(tableCls.th, "text-right")}>Orders</th>
              <th className={clsx(tableCls.th, "text-right")}>Paid spend</th>
              <th className={tableCls.th}>Latest order</th>
              <th className={tableCls.th}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td className={tableCls.td} colSpan={6}>No customers found.</td></tr>}
            {rows.map((c) => (
              <tr key={c.uid}>
                <td className={tableCls.td}><Link href={`/admin/customers/${c.uid}`} className="font-medium text-maroon hover:underline">{c.fullName || "(no name)"}</Link></td>
                <td className={tableCls.td}><div>{c.email ?? "-"}</div><div className="text-xs text-ink-muted">{c.phone ?? ""}</div></td>
                <td className={clsx(tableCls.td, "text-right")}>{c.orderCount}</td>
                <td className={clsx(tableCls.td, "text-right")}>{formatINR(c.spend)}</td>
                <td className={tableCls.td}>{c.latestOrder ? <Link href={`/admin/orders/${c.latestOrder.id}`} className="text-maroon hover:underline">{c.latestOrder.orderNumber}</Link> : "-"}</td>
                <td className={tableCls.td}>{df.format(new Date(c.createdAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-ink-muted">
        <span>{rows.length} shown</span>
        {nextCursor ? <Link href={`/admin/customers?cursor=${encodeURIComponent(nextCursor)}`} className="text-maroon underline underline-offset-4">Next page</Link> : <span>End of list</span>}
      </nav>
    </>
  );
}
