import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { requireUserPage } from "@/server/auth/session";
import { listUserOrders } from "@/server/repos/orders";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { LinkGuestOrder } from "@/components/account/link-order";
import { formatINR } from "@/domain/money";
import { STATUS_LABEL, PAYMENT_LABEL, type CustomerFilter } from "@/domain/order-state";

export const metadata: Metadata = { title: "My orders", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const FILTERS: { id: CustomerFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "processing", label: "Processing" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUserPage("/account/orders");
  const f = FILTERS.find((x) => x.id === sp.status)?.id ?? "all";
  const cursor = typeof sp.cursor === "string" ? sp.cursor.slice(0, 40) : null;
  const page = await listUserOrders(user.uid, f, cursor, 10);
  const df = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
  return (
    <div className="space-y-6">
      <h1 className="t-h1">My orders</h1>
      <nav aria-label="Filter orders" className="no-scrollbar flex gap-2 overflow-x-auto">
        {FILTERS.map((x) => (
          <Link
            key={x.id}
            href={x.id === "all" ? "/account/orders" : `/account/orders?status=${x.id}`}
            aria-current={x.id === f ? "page" : undefined}
            className={clsx("inline-flex min-h-10 shrink-0 items-center rounded-sm px-4 text-sm", x.id === f ? "bg-maroon text-white" : "bg-beige/60 hover:bg-beige")}
          >
            {x.label}
          </Link>
        ))}
      </nav>
      {page.items.length === 0 ? (
        <EmptyState title={f === "all" ? "No orders yet" : `No ${f} orders`} action={<ButtonLink href="/shop">Start shopping</ButtonLink>}>
          {f === "all" ? "When you place an order it will appear here." : "Try another filter."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {page.items.map((o) => (
            <li key={o.id} className="border border-line bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/account/orders/${o.id}`} className="font-medium text-maroon underline-offset-4 hover:underline">
                    {o.orderNumber}
                  </Link>
                  <p className="text-sm text-ink-muted">
                    {df.format(new Date(o.placedAt))} &middot; {o.items.reduce((n, i) => n + i.quantity, 0)} item(s)
                  </p>
                  <p className="mt-1 text-sm">
                    {o.items.map((i) => i.nameSnapshot).slice(0, 2).join(", ")}
                    {o.items.length > 2 ? ` +${o.items.length - 2} more` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatINR(o.pricing.total)}</p>
                  <div className="mt-1 flex flex-wrap justify-end gap-1.5">
                    <Badge tone={o.status === "delivered" ? "success" : o.status === "cancelled" ? "error" : "info"}>{STATUS_LABEL[o.status]}</Badge>
                    <Badge tone={o.paymentStatus === "paid" ? "success" : o.paymentStatus === "failed" ? "error" : "warning"}>{o.paymentMethod === "cod" && o.paymentStatus === "pending" ? "COD" : PAYMENT_LABEL[o.paymentStatus]}</Badge>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <LinkGuestOrder />
      {page.nextCursor && (
        <div className="text-center">
          <Link
            href={`/account/orders?${f !== "all" ? `status=${f}&` : ""}cursor=${encodeURIComponent(page.nextCursor)}`}
            className="inline-flex min-h-11 items-center border border-maroon px-6 font-nav text-[0.78rem] uppercase tracking-[0.12em] text-maroon hover:bg-maroon hover:text-white"
          >
            Older orders
          </Link>
        </div>
      )}
    </div>
  );
}
