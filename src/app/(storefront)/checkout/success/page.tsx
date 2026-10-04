import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Package } from "lucide-react";
import { authorizeOrder } from "@/server/auth/order-access";
import { getSession } from "@/server/auth/session";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Media } from "@/components/ui/media";
import { PendingPoller } from "@/components/storefront/pending-poller";
import { formatINR } from "@/domain/money";
import { STATUS_LABEL } from "@/domain/order-state";

export const metadata: Metadata = { title: "Order confirmation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const orderId = typeof sp.o === "string" ? sp.o : "";
  if (!/^ord_[a-z0-9]{10,30}$/i.test(orderId)) notFound();
  // Server-authorised: owner session, or the order-scoped token cookie set at checkout. Anything else is a 404.
  const { order, via } = await authorizeOrder(orderId).catch(() => notFound());
  const session = await getSession();

  const isCod = order.paymentMethod === "cod";
  const paid = ["paid", "partially_refunded", "refunded"].includes(order.paymentStatus);
  const cancelled = order.status === "cancelled";
  const pending = !isCod && !paid && !cancelled;

  const custom = order.items.filter((i) => i.isCustomizable && i.leadTimeDays);
  const lead = custom.length ? Math.max(...custom.map((i) => i.leadTimeDays ?? 0)) : null;

  return (
    <div className="container-rr pb-6 pt-8">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          {pending ? <Clock className="mx-auto size-12 text-warning" aria-hidden /> : cancelled ? <Package className="mx-auto size-12 text-error" aria-hidden /> : <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />}
          <p className="t-eyebrow mt-4 text-wine">{pending ? "Verifying your payment" : cancelled ? "Order cancelled" : isCod ? "Order placed" : "Payment received"}</p>
          <h1 className="t-h1 mt-2">{pending ? "We're confirming your payment" : cancelled ? "This order was not completed" : "Thank you for your order"}</h1>
          <p className="mt-3 text-lg">
            Order number <strong className="font-semibold text-maroon">{order.orderNumber}</strong>
          </p>
        </div>

        {pending && (
          <Alert tone="warning" title="Payment pending" className="mt-8">
            Your order is not confirmed yet. We only confirm online orders once the payment provider verifies the payment, so this is not a success page yet. This page refreshes automatically. If money was deducted, it will be matched to this order or refunded.
            <PendingPoller />
          </Alert>
        )}
        {cancelled && (
          <Alert tone="error" title="Cancelled" className="mt-8">
            {order.cancelReason === "payment_expired" ? "Payment was not completed in time, so the items were released." : "This order has been cancelled."} <Link href="/shop" className="underline underline-offset-4">Continue shopping</Link>
          </Alert>
        )}
        {order.needsReview && !cancelled && (
          <Alert tone="info" title="We are reviewing your order" className="mt-8">
            Our team is checking this order and will contact you shortly.
          </Alert>
        )}

        {!pending && !cancelled && (
          <section className="mt-8 border border-line bg-white p-6" aria-labelledby="what-next">
            <h2 id="what-next" className="t-h3">
              What happens next
            </h2>
            <ul className="mt-3 space-y-2 text-ink-muted">
              <li>{isCod ? "Pay the courier in cash when your order arrives." : "Your payment has been received."} We will confirm your order shortly and send updates{order.contact.email ? <> to {order.contact.email}</> : null}.</li>
              <li>{order.shipment.estimateText}.</li>
              {lead != null && <li>Made-to-order pieces need about {lead} days of production before dispatch - this is in addition to the delivery time above.</li>}
            </ul>
          </section>
        )}

        <section className="mt-6 border border-line bg-white p-6" aria-labelledby="summary">
          <h2 id="summary" className="t-h3">
            Order summary
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {order.items.map((i) => (
              <li key={i.variantId} className="flex gap-3 py-3">
                <div className="w-14 shrink-0">
                  <Media src={i.imageSnapshot} alt="" ratio="4/5" sizes="56px" />
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-medium">{i.nameSnapshot}</p>
                  <p className="text-ink-muted">
                    Size {i.size} &middot; {i.color} &middot; Qty {i.quantity}
                  </p>
                </div>
                <p className="text-sm font-medium">{formatINR(i.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatINR(order.pricing.subtotal)}</dd></div>
            {order.pricing.discount > 0 && <div className="flex justify-between text-success"><dt>Discount</dt><dd>&minus; {formatINR(order.pricing.discount)}</dd></div>}
            <div className="flex justify-between"><dt>Delivery</dt><dd>{order.pricing.shipping === 0 ? "Free" : formatINR(order.pricing.shipping)}</dd></div>
            {order.pricing.codFee > 0 && <div className="flex justify-between"><dt>Cash on delivery fee</dt><dd>{formatINR(order.pricing.codFee)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>{isCod ? "To pay on delivery" : "Total"}</dt><dd>{formatINR(order.pricing.total)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-ink-muted">
            Status: {STATUS_LABEL[order.status]} &middot; Payment: {isCod ? "cash on delivery (not yet paid)" : paid ? "paid" : "pending"} &middot; Delivering to {order.shippingAddress.city}, {order.shippingAddress.state}
          </p>
        </section>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {via === "owner" ? (
            <ButtonLink href={`/account/orders/${order.id}`}>Track this order</ButtonLink>
          ) : (
            <ButtonLink href={`/track-order?order=${encodeURIComponent(order.orderNumber)}`}>Track this order</ButtonLink>
          )}
          <ButtonLink href="/shop" variant="secondary">
            Continue shopping
          </ButtonLink>
        </div>

        {!session && (
          <p className="mx-auto mt-8 max-w-md rounded-sm bg-rose p-4 text-center text-sm">
            Want to follow this order any time? <Link href="/register" className="font-medium text-maroon underline underline-offset-4">Create an account</Link>. Orders placed as a guest are not linked automatically; you can track them with your order number and phone or email.
          </p>
        )}
      </div>
    </div>
  );
}
