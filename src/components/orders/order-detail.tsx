import Link from "next/link";
import { Download, MessageCircle } from "lucide-react";
import { OrderProgress, UpdatesList } from "./order-progress";
import { OrderActions } from "./order-actions";
import { Media } from "@/components/ui/media";
import { Badge, Alert, SimulationBadge } from "@/components/ui/feedback";
import { formatINR } from "@/domain/money";
import type { OrderView } from "@/server/services/order-view";

const dt = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Kolkata" });

/** Authorised full order view: items, address, payment summary, timeline, invoice, support and applicable actions. */
export function OrderDetail({ view, actions = true }: { view: OrderView; actions?: boolean }) {
  const tone = view.status === "delivered" ? "success" : view.status === "cancelled" ? "error" : "info";
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="t-h2">Order {view.orderNumber}</h1>
          <p className="text-sm text-ink-muted">Placed {dt.format(new Date(view.placedAt))} IST</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tone}>{view.statusLabel}</Badge>
          <Badge tone={view.paymentStatus === "paid" ? "success" : view.paymentStatus === "failed" ? "error" : "warning"}>{view.paymentLabel}</Badge>
          {view.returnStatus !== "none" && <Badge tone="info">{view.returnLabel}</Badge>}
          {view.simulated && <SimulationBadge what="order" />}
        </div>
      </header>

      <section className="border border-line bg-white p-5" aria-label="Progress">
        <OrderProgress status={view.status} />
        <p className="mt-4 text-sm text-ink-muted">{view.estimateText}.</p>
        {view.courierName && (
          <p className="mt-1 text-sm">
            Courier: <strong>{view.courierName}</strong>
            {view.awbNumber && <> &middot; AWB {view.awbNumber}</>}
            {view.trackingUrl && (
              <>
                {" "}
                &middot;{" "}
                <a href={view.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-maroon underline underline-offset-4">
                  Track with courier<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </>
            )}
          </p>
        )}
      </section>

      {view.needsPayment && (
        <Alert tone="warning" title="Payment pending">
          This order is not confirmed until payment is verified. <Link href="/checkout" className="underline underline-offset-4">Return to checkout</Link> if you were interrupted; unpaid orders are released automatically after a short time.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="border border-line bg-white p-5" aria-labelledby="items-h">
          <h2 id="items-h" className="t-h3 !text-lg">
            Items
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {view.items.map((i, n) => (
              <li key={n} className="flex gap-3 py-3">
                <div className="w-16 shrink-0">
                  <Media src={i.image} alt="" ratio="4/5" sizes="64px" />
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium leading-snug">{i.name}</p>
                  <p className="text-ink-muted">
                    Size {i.size} &middot; {i.color} &middot; Qty {i.quantity}
                  </p>
                  <p className="text-ink-muted">{formatINR(i.unitPrice)} each</p>
                </div>
                <p className="text-sm font-medium">{formatINR(i.lineTotal)}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-6">
          <section className="border border-line bg-white p-5" aria-labelledby="pay-h">
            <h2 id="pay-h" className="t-h3 !text-lg">
              Payment summary
            </h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatINR(view.pricing.subtotal)}</dd></div>
              {view.pricing.discount > 0 && <div className="flex justify-between text-success"><dt>Discount{view.pricing.couponCode ? ` (${view.pricing.couponCode})` : ""}</dt><dd>&minus; {formatINR(view.pricing.discount)}</dd></div>}
              <div className="flex justify-between"><dt>Delivery</dt><dd>{view.pricing.shipping === 0 ? "Free" : formatINR(view.pricing.shipping)}</dd></div>
              {view.pricing.codFee > 0 && <div className="flex justify-between"><dt>COD fee</dt><dd>{formatINR(view.pricing.codFee)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Total</dt><dd>{formatINR(view.pricing.total)}</dd></div>
              {view.refundedTotal > 0 && <div className="flex justify-between text-success"><dt>Refunded</dt><dd>{formatINR(view.refundedTotal)}</dd></div>}
            </dl>
            <p className="mt-2 text-xs text-ink-muted">Method: {view.paymentMethod === "cod" ? "Cash on delivery" : "Online (Razorpay)"}</p>
            {view.refunds.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                {view.refunds.map((r, i) => (
                  <li key={i}>Refund of {formatINR(r.amount)}: {r.state}</li>
                ))}
              </ul>
            )}
          </section>
          <section className="border border-line bg-white p-5" aria-labelledby="addr-h">
            <h2 id="addr-h" className="t-h3 !text-lg">
              Delivery address
            </h2>
            <address className="mt-2 text-sm not-italic text-charcoal">
              {view.address.fullName}
              <br />
              {view.address.line1}
              {view.address.line2 ? <><br />{view.address.line2}</> : null}
              <br />
              {view.address.city}, {view.address.state} {view.address.pincode}
              <br />
              {view.address.phone}
            </address>
            <p className="mt-2 text-xs text-ink-muted">This is the address saved with this order. Editing your saved addresses never changes it.</p>
          </section>
        </div>
      </div>

      {view.custom && (
        <section className="border border-line bg-white p-5" aria-labelledby="cust-h">
          <h2 id="cust-h" className="t-h3 !text-lg">
            Made-to-order details
          </h2>
          <dl className="mt-2 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="text-ink-muted">Agreed quote</dt><dd>{view.custom.quotedTotal != null ? formatINR(view.custom.quotedTotal) : "Awaiting quotation"}</dd></div>
            <div><dt className="text-ink-muted">Advance paid</dt><dd>{formatINR(view.custom.advancePaid)}</dd></div>
            <div><dt className="text-ink-muted">Lead time</dt><dd>{view.custom.leadTimeDays != null ? `${view.custom.leadTimeDays} days` : "To be agreed"}</dd></div>
            <div><dt className="text-ink-muted">Production</dt><dd>{view.custom.productionState?.replace(/_/g, " ") ?? "-"}</dd></div>
          </dl>
        </section>
      )}

      <section className="border border-line bg-white p-5" aria-labelledby="upd-h">
        <h2 id="upd-h" className="t-h3 !text-lg">
          Updates
        </h2>
        <div className="mt-4">
          <UpdatesList events={view.timeline} />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <a href={`/api/orders/${view.id}/invoice`} className="inline-flex min-h-11 items-center gap-2 border border-maroon px-5 font-nav text-[0.78rem] font-medium uppercase tracking-[0.12em] text-maroon hover:bg-maroon hover:text-white">
          <Download className="size-4" aria-hidden /> Download invoice (PDF)
        </a>
        <Link href={`/contact?order=${encodeURIComponent(view.orderNumber)}`} className="inline-flex min-h-11 items-center gap-2 px-3 text-sm text-maroon underline underline-offset-4">
          <MessageCircle className="size-4" aria-hidden /> Need help with this order?
        </Link>
      </div>

      {actions && (view.canCancel || view.canRequestReturn) && <OrderActions orderId={view.id} canCancel={view.canCancel} canReturn={view.canRequestReturn} />}
    </div>
  );
}
