import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Alert } from "@/components/ui/feedback";
import { TrackOrderForm } from "@/components/storefront/track-order-form";
import { OrderDetail } from "@/components/orders/order-detail";
import { authorizeOrder } from "@/server/auth/order-access";
import { toOrderView } from "@/server/services/order-view";

export const metadata: Metadata = { title: "Track your order", robots: { index: false, follow: true } };
export const dynamic = "force-dynamic";

export default async function TrackOrderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const orderId = typeof sp.o === "string" ? sp.o : null;
  const prefill = typeof sp.order === "string" ? sp.order.slice(0, 20) : undefined;
  let view = null;
  if (orderId) {
    // Private detail view: only via a verified secure link (token cookie) or the signed-in owner.
    const authorised = await authorizeOrder(orderId, ["track", "success"]).catch(() => null);
    if (authorised) view = await toOrderView(authorised.order);
  }
  return (
    <div className="container-rr pb-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Track order" }]} />
      <div className="mx-auto max-w-3xl">
        <h1 className="t-h1">Track your order</h1>
        <p className="mt-2 text-ink-muted">Enter your order number and the phone number or email you used at checkout. No account needed.</p>
        <div className="mt-8">
          {sp.link === "invalid" && <Alert tone="error" className="mb-6">That secure link is invalid or has expired. Look up your order again to get a new one.</Alert>}
          {orderId && !view && <Alert tone="error" className="mb-6">We couldn&apos;t open that order. Look it up below with your order number and contact details.</Alert>}
          {view ? (
            <div className="space-y-6">
              <Alert tone="success">Secure view for order {view.orderNumber}. <Link href="/track-order" className="underline underline-offset-4">Look up another order</Link></Alert>
              <OrderDetail view={view} actions={false} />
            </div>
          ) : (
            <TrackOrderForm initialOrder={prefill} />
          )}
        </div>
      </div>
    </div>
  );
}
