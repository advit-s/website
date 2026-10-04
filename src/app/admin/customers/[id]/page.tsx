import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/auth/session";
import { getCustomer } from "@/server/services/admin-customers";
import { listUserOrders } from "@/server/repos/orders";
import { Card, PageHeader } from "@/components/admin/admin-shell";
import { tableCls } from "@/components/admin/table-styles";
import { Badge, Alert } from "@/components/ui/feedback";
import { formatINR } from "@/domain/money";
import { STATUS_LABEL, PAYMENT_LABEL } from "@/domain/order-state";

export const metadata: Metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

export default async function AdminCustomer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  await requireAdminPage(`/admin/customers/${id}`);
  const sp = await searchParams;
  const c = await getCustomer(id);
  if (!c) notFound();
  const tab = sp.tab === "addresses" ? "addresses" : "orders";
  const orders = await listUserOrders(id, "all", sp.cursor ?? null, 10);
  const df = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-ink-muted"><Link href="/admin/customers" className="hover:underline">Customers</Link> / {c.fullName || c.email || c.uid}</nav>
      <PageHeader title={c.fullName || "Customer"} description={`Customer since ${df.format(new Date(c.createdAt))} IST`} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card title="Contact"><p className="text-sm">{c.email ?? "No email"}</p><p className="text-sm">{c.phone ?? "No phone"}</p></Card>
        <Card title="Orders"><p className="text-2xl font-semibold">{c.orderCount}</p></Card>
        <Card title="Paid spend"><p className="text-2xl font-semibold">{formatINR(c.spend)}</p><p className="text-xs text-ink-muted">Captured payments, before refunds</p></Card>
      </div>
      <nav aria-label="Customer sections" className="mb-3 flex gap-2">
        {(["orders", "addresses"] as const).map((t) => (
          <Link key={t} href={`/admin/customers/${id}${t === "orders" ? "" : "?tab=addresses"}`} aria-current={t === tab ? "page" : undefined} className={clsx("inline-flex min-h-9 items-center rounded-sm border px-3 text-sm capitalize", t === tab ? "border-maroon bg-maroon text-white" : "border-line bg-white hover:bg-beige/60")}>{t}</Link>
        ))}
      </nav>
      {tab === "orders" ? (
        <>
          <div className={tableCls.wrap}>
            <table className={tableCls.table}>
              <caption className="sr-only">Orders</caption>
              <thead><tr><th className={tableCls.th}>Order</th><th className={tableCls.th}>Status</th><th className={tableCls.th}>Payment</th><th className={clsx(tableCls.th, "text-right")}>Total</th></tr></thead>
              <tbody>
                {orders.items.length === 0 && <tr><td className={tableCls.td} colSpan={4}>No orders.</td></tr>}
                {orders.items.map((o) => (
                  <tr key={o.id}>
                    <td className={tableCls.td}><Link href={`/admin/orders/${o.id}`} className="font-medium text-maroon hover:underline">{o.orderNumber}</Link><div className="text-xs text-ink-muted">{df.format(new Date(o.placedAt))}</div></td>
                    <td className={tableCls.td}><Badge tone={o.status === "delivered" ? "success" : o.status === "cancelled" ? "error" : "info"}>{STATUS_LABEL[o.status]}</Badge></td>
                    <td className={tableCls.td}>{PAYMENT_LABEL[o.paymentStatus]}</td>
                    <td className={clsx(tableCls.td, "text-right")}>{formatINR(o.pricing.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {orders.nextCursor && <p className="mt-3 text-sm"><Link href={`/admin/customers/${id}?cursor=${encodeURIComponent(orders.nextCursor)}`} className="text-maroon underline underline-offset-4">Older orders</Link></p>}
        </>
      ) : c.addresses.length === 0 ? (
        <Alert tone="info">No saved addresses.</Alert>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {c.addresses.map((a) => (
            <li key={a.id}><Card title={`${a.label}${a.isDefault ? " (default)" : ""}`}><address className="text-sm not-italic">{a.fullName}<br />{a.line1}{a.line2 ? <><br />{a.line2}</> : null}<br />{a.city}, {a.state} {a.pincode}<br />{a.phone}</address></Card></li>
          ))}
        </ul>
      )}
    </>
  );
}
