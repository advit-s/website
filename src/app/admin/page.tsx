import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import { requireAdminPage } from "@/server/auth/session";
import { getDashboard } from "@/server/services/admin-dashboard";
import { Card, PageHeader } from "@/components/admin/admin-shell";
import { tableCls } from "@/components/admin/table-styles";
import { Badge } from "@/components/ui/feedback";
import { formatINR } from "@/domain/money";
import { STATUS_LABEL } from "@/domain/order-state";
import type { Period } from "@/domain/time";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "month", label: "Month to date" },
];

function Stat({ label, value, hint, href, tone }: { label: string; value: string; hint?: string; href?: string; tone?: "warn" }) {
  const body = (
    <div className={clsx("rounded-md border bg-white p-4", tone === "warn" ? "border-warning/40" : "border-line", href && "hover:border-maroon")}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-charcoal">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage("/admin");
  const sp = await searchParams;
  const period = (PERIODS.find((p) => p.id === sp.period)?.id ?? "today") as Period;
  const d = await getDashboard(period);
  const df = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={d.rangeLabel} />
      <nav aria-label="Period" className="flex gap-2">
        {PERIODS.map((p) => (
          <Link key={p.id} href={p.id === "today" ? "/admin" : `/admin?period=${p.id}`} aria-current={p.id === period ? "page" : undefined} className={clsx("inline-flex min-h-9 items-center rounded-sm px-3 text-sm", p.id === period ? "bg-maroon text-white" : "bg-white hover:bg-beige/60 border border-line")}>
            {p.label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Orders placed" value={String(d.ordersPlaced)} hint="All orders created in this period" href="/admin/orders" />
        <Stat label="Paid revenue" value={formatINR(d.paidRevenue)} hint={`${d.paidOrders} order(s) with captured payment, before refunds`} />
        <Stat label="To confirm" value={String(d.toConfirm)} hint="New orders ready for you (COD or paid)" href="/admin/orders?tab=pending" tone={d.toConfirm > 0 ? "warn" : undefined} />
        <Stat label="Awaiting payment" value={String(d.awaitingPayment)} hint="Prepaid orders not yet paid. Not revenue." href="/admin/orders?tab=pending" />
        <Stat label="COD to collect" value={formatINR(d.codOutstanding.value)} hint={`${d.codOutstanding.count} open cash-on-delivery order(s). Not revenue until collected.`} />
        <Stat label="Low stock variants" value={String(d.lowStockCount)} hint="At or below their threshold (reservations counted)" href="/admin/inventory?filter=low" tone={d.lowStockCount > 0 ? "warn" : undefined} />
        <Stat label="Open returns" value={String(d.returnsOpen)} href="/admin/orders?tab=returns" />
        <Stat label="Needs review" value={String(d.needsReview)} hint="Payment or stock exceptions" href="/admin/orders" tone={d.needsReview > 0 ? "warn" : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Recent orders" action={<Link href="/admin/orders" className="text-sm text-maroon hover:underline">All orders</Link>}>
          {d.recentOrders.length === 0 ? (
            <p className="text-sm text-ink-muted">No orders yet.</p>
          ) : (
            <div className={tableCls.wrap}>
              <table className={tableCls.table}>
                <thead>
                  <tr>
                    <th className={tableCls.th}>Order</th>
                    <th className={tableCls.th}>Status</th>
                    <th className={tableCls.th}>Payment</th>
                    <th className={clsx(tableCls.th, "text-right")}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recentOrders.map((o) => (
                    <tr key={o.id}>
                      <td className={tableCls.td}>
                        <Link href={`/admin/orders/${o.id}`} className="font-medium text-maroon hover:underline">
                          {o.orderNumber}
                        </Link>
                        <div className="text-xs text-ink-muted">{df.format(new Date(o.placedAt))}</div>
                      </td>
                      <td className={tableCls.td}>
                        <Badge tone={o.status === "delivered" ? "success" : o.status === "cancelled" ? "error" : "info"}>{STATUS_LABEL[o.status]}</Badge>
                      </td>
                      <td className={tableCls.td}>
                        <Badge tone={o.paymentStatus === "paid" ? "success" : o.paymentStatus === "failed" ? "error" : "warning"}>{o.paymentMethod === "cod" ? "COD" : "Online"} {o.paymentStatus}</Badge>
                      </td>
                      <td className={clsx(tableCls.td, "text-right font-medium")}>{formatINR(o.pricing.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Low stock" action={<Link href="/admin/inventory?filter=low" className="text-sm text-maroon hover:underline">Inventory</Link>}>
          {d.lowStock.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing is running low.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.lowStock.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{v.productName}</p>
                    <p className="text-xs text-ink-muted">
                      {v.size} &middot; {v.color} &middot; {v.sku}
                    </p>
                  </div>
                  <Badge tone={v.available === 0 ? "error" : "warning"}>
                    <AlertTriangle className="size-3" aria-hidden /> {v.available === 0 ? "Out of stock" : `${v.available} left`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="text-xs text-ink-muted">
        Definitions: dates use India Standard Time. &ldquo;Paid revenue&rdquo; counts only captured payments (online payments, and cash-on-delivery once you mark the cash as collected). Pending prepaid orders and uncollected COD are shown separately and are never counted as revenue.
      </p>
    </div>
  );
}
