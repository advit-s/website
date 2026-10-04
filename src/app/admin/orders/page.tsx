import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { requireAdminPage } from "@/server/auth/session";
import { listAdminOrders } from "@/server/services/admin-orders";
import { PageHeader, tableCls } from "@/components/admin/admin-shell";
import { Badge, Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { formatINR } from "@/domain/money";
import { PAYMENT_LABEL, QUEUE_TABS, STATUS_LABEL, type QueueTab } from "@/domain/order-state";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default async function AdminOrders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage("/admin/orders");
  const sp = await searchParams;
  const tab = (QUEUE_TABS.find((t) => t.id === sp.tab)?.id ?? "all") as QueueTab;
  const q = sp.q?.slice(0, 80);
  const { orders, nextCursor, searchNote } = await listAdminOrders({ tab, q, cursor: sp.cursor ?? null });
  const df = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  const href = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ tab: tab === "all" ? "" : tab, q, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/admin/orders${s ? `?${s}` : ""}`;
  };
  return (
    <>
      <PageHeader title="Orders" description="One queue for every order. Pending = new orders awaiting your action (COD, or prepaid awaiting payment or confirmation)." />
      <nav aria-label="Order status" className="mb-3 flex flex-wrap gap-2">
        {QUEUE_TABS.map((t) => (
          <Link key={t.id} href={href({ tab: t.id === "all" ? "" : t.id, cursor: "" })} aria-current={t.id === tab ? "page" : undefined} className={clsx("inline-flex min-h-9 items-center rounded-sm border px-3 text-sm", t.id === tab ? "border-maroon bg-maroon text-white" : "border-line bg-white hover:bg-beige/60")}>
            {t.label}
          </Link>
        ))}
      </nav>
      <form method="get" className="mb-4 flex max-w-xl gap-2">
        {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
        <label htmlFor="q" className="sr-only">Search orders</label>
        <Input id="q" name="q" defaultValue={q} placeholder="Order number, email or phone" className="min-h-10" />
        <Button type="submit" variant="secondary">Search</Button>
        {q && <Link href={href({ q: "" })} className="inline-flex min-h-10 items-center px-2 text-sm text-maroon underline">Clear</Link>}
      </form>
      {searchNote && <Alert tone="info" className="mb-4">{searchNote}</Alert>}

      <div className={tableCls.wrap}>
        <table className={tableCls.table}>
          <caption className="sr-only">Orders</caption>
          <thead>
            <tr>
              <th className={tableCls.th}>Order</th>
              <th className={tableCls.th}>Customer</th>
              <th className={tableCls.th}>Items</th>
              <th className={clsx(tableCls.th, "text-right")}>Total</th>
              <th className={tableCls.th}>Payment</th>
              <th className={tableCls.th}>Fulfilment</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan={6} className={tableCls.td}>No orders here.</td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id}>
                <td className={tableCls.td}>
                  <Link href={`/admin/orders/${o.id}`} className="font-medium text-maroon hover:underline">{o.orderNumber}</Link>
                  <div className="text-xs text-ink-muted">{df.format(new Date(o.placedAt))}</div>
                  {o.integrationMode === "simulated" && <span className="text-[0.65rem] uppercase text-warning">simulated</span>}
                </td>
                <td className={tableCls.td}>
                  <div>{o.contact.name}</div>
                  <div className="text-xs text-ink-muted">{o.userId ? "Account" : "Guest"} &middot; {o.shippingAddress.city}</div>
                </td>
                <td className={tableCls.td}>{o.items.reduce((n, i) => n + i.quantity, 0)}</td>
                <td className={clsx(tableCls.td, "text-right font-medium")}>{formatINR(o.pricing.total)}</td>
                <td className={tableCls.td}>
                  <Badge tone={o.paymentStatus === "paid" ? "success" : o.paymentStatus === "failed" ? "error" : o.paymentStatus === "pending" ? "warning" : "info"}>{PAYMENT_LABEL[o.paymentStatus]}</Badge>
                  <div className="text-xs text-ink-muted">{o.paymentMethod === "cod" ? "Cash on delivery" : "Online"}</div>
                </td>
                <td className={tableCls.td}>
                  <Badge tone={o.status === "delivered" ? "success" : o.status === "cancelled" ? "error" : "info"}>{STATUS_LABEL[o.status]}</Badge>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {o.needsReview && <Badge tone="warning">Needs review</Badge>}
                    {o.returnStatus !== "none" && <Badge tone="info">Return: {o.returnStatus.replace(/_/g, " ")}</Badge>}
                    {o.hasCustomItems && <Badge tone="gold">Made to order</Badge>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-ink-muted">
        <span>{orders.length} shown</span>
        {nextCursor ? <Link href={href({ cursor: nextCursor })} className="text-maroon underline underline-offset-4">Older orders</Link> : <span>End of list</span>}
      </nav>
    </>
  );
}
