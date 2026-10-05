import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireAdminPage } from "@/server/auth/session";
import { getAdminOrder } from "@/server/services/admin-orders";
import { getRefundRecovery } from "@/server/services/refunds";
import { listPaymentExceptions, reviewBlockers } from "@/server/services/payment-exceptions";
import { refundable as refundableAmount } from "@/domain/refunds";
import { Card, PageHeader } from "@/components/admin/admin-shell";
import { OrderActionsPanel } from "@/components/admin/order-actions-panel";
import { OrderProgress } from "@/components/orders/order-progress";
import { Badge } from "@/components/ui/feedback";
import { Media } from "@/components/ui/media";
import { formatINR } from "@/domain/money";
import { PAYMENT_LABEL, STATUS_LABEL } from "@/domain/order-state";
import { isSimulated } from "@/server/env";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdminPage(`/admin/orders/${id}`);
  const d = await getAdminOrder(id);
  if (!d) notFound();
  const [recovery, exceptions, reviewBlocked] = await Promise.all([getRefundRecovery(id), listPaymentExceptions(id), reviewBlockers(id)]);
  const { order: o } = d;
  const dt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  const refundable = refundableAmount(o.pricing.total, o.payment.refunds);
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-ink-muted">
        <Link href="/admin/orders" className="hover:underline">Orders</Link> / {o.orderNumber}
      </nav>
      <PageHeader
        title={`Order ${o.orderNumber}`}
        description={`Placed ${dt.format(new Date(o.placedAt))} IST · ${o.userId ? "registered customer" : "guest checkout"}${o.integrationMode === "simulated" ? " · simulated payment/shipping" : ""}`}
        actions={
          <a href={`/api/orders/${o.id}/invoice`} className="inline-flex min-h-10 items-center gap-2 border border-line bg-white px-4 text-sm hover:border-maroon">
            <Download className="size-4" aria-hidden /> Invoice PDF
          </a>
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        <Badge tone={o.status === "delivered" ? "success" : o.status === "cancelled" ? "error" : "info"}>{STATUS_LABEL[o.status]}</Badge>
        <Badge tone={o.paymentStatus === "paid" ? "success" : o.paymentStatus === "failed" ? "error" : "warning"}>{PAYMENT_LABEL[o.paymentStatus]}</Badge>
        <Badge tone="neutral">{o.paymentMethod === "cod" ? "Cash on delivery" : "Online (Razorpay)"}</Badge>
        {o.stockState !== "none" && <Badge tone="neutral">Stock: {o.stockState}</Badge>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card title="Progress"><OrderProgress status={o.status} /></Card>

          <Card title="Actions">
            <OrderActionsPanel
              orderId={o.id}
              status={o.status}
              paymentMethod={o.paymentMethod}
              paymentStatus={o.paymentStatus}
              returnStatus={o.returnStatus}
              hasCustomItems={o.hasCustomItems}
              needsReview={o.needsReview}
              total={o.pricing.total}
              refundable={refundable}
              refunds={o.payment.refunds}
              custom={o.custom}
              simulated={isSimulated()}
              dispatches={recovery.dispatches.map((x) => ({ refundId: x.refundId, attempt: x.attempt, outcome: x.outcome, receipt: x.receipt, providerRefundId: x.providerRefundId, lastCheck: x.lastCheck ?? null }))}
              evidence={recovery.evidence.map((x) => ({ providerRefundId: x.providerRefundId, state: x.state, status: x.status, note: x.note }))}
              exceptions={exceptions.map((x) => ({ id: x.id, kind: x.kind, paymentId: x.paymentId, amount: x.amount, status: x.status, guidance: x.guidance, courierReview: x.courierReview, codCollected: x.codCollected, createdAt: x.createdAt, refundId: x.refundId ?? null }))}
              reviewBlocked={reviewBlocked}
            />
          </Card>

          <Card title="Items (snapshot at purchase)">
            <ul className="divide-y divide-line">
              {o.items.map((i) => (
                <li key={i.variantId} className="flex gap-3 py-3">
                  <div className="w-14 shrink-0"><Media src={i.imageSnapshot} alt="" ratio="4/5" sizes="56px" /></div>
                  <div className="min-w-0 flex-1 text-sm">
                    <Link href={`/admin/products/${i.productId}`} className="font-medium text-maroon hover:underline">{i.nameSnapshot}</Link>
                    <p className="text-ink-muted">{i.size} &middot; {i.color} &middot; <span className="font-mono text-xs">{i.sku}</span></p>
                    <p className="text-ink-muted">{formatINR(i.unitPrice)} &times; {i.quantity}</p>
                  </div>
                  <p className="text-sm font-medium">{formatINR(i.lineTotal)}</p>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatINR(o.pricing.subtotal)}</dd></div>
              {o.pricing.discount > 0 && <div className="flex justify-between"><dt>Discount {o.pricing.couponCode ? `(${o.pricing.couponCode})` : ""}</dt><dd>&minus; {formatINR(o.pricing.discount)}</dd></div>}
              <div className="flex justify-between"><dt>Delivery</dt><dd>{formatINR(o.pricing.shipping)}</dd></div>
              {o.pricing.codFee > 0 && <div className="flex justify-between"><dt>COD fee</dt><dd>{formatINR(o.pricing.codFee)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Total</dt><dd>{formatINR(o.pricing.total)}</dd></div>
              {o.payment.refundedTotal > 0 && <div className="flex justify-between text-success"><dt>Refunded</dt><dd>{formatINR(o.payment.refundedTotal)}</dd></div>}
            </dl>
          </Card>

          <Card title="Timeline and audit trail">
            <ol className="space-y-3 border-l-2 border-line pl-4 text-sm">
              {[...d.timeline].reverse().map((e) => (
                <li key={e.id} className="relative">
                  <span aria-hidden className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-maroon" />
                  <p className="font-medium">{e.label} {!e.customerVisible && <Badge tone="neutral">internal</Badge>}</p>
                  {e.detail && <p className="text-ink-muted">{e.detail}</p>}
                  <p className="text-xs text-ink-muted">{dt.format(new Date(e.at))} &middot; {e.actor}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Customer">
            <p className="font-medium">{o.contact.name}</p>
            <p className="text-sm">{o.contact.email}</p>
            <p className="text-sm">{o.contact.phone}</p>
            {o.userId && <Link href={`/admin/customers/${o.userId}`} className="mt-2 inline-block text-sm text-maroon underline underline-offset-4">View customer profile</Link>}
          </Card>
          <Card title="Delivery address (snapshot)">
            <address className="text-sm not-italic">
              {o.shippingAddress.fullName}<br />{o.shippingAddress.line1}{o.shippingAddress.line2 ? <><br />{o.shippingAddress.line2}</> : null}<br />{o.shippingAddress.city}, {o.shippingAddress.state} {o.shippingAddress.pincode}<br />{o.shippingAddress.phone}
            </address>
            <p className="mt-2 text-xs text-ink-muted">Zone: {o.shipment.zone === "ncr" ? "Delhi NCR" : "Rest of India"}. {o.shipment.estimateText}.</p>
          </Card>
          <Card title="Shipment">
            {o.shipment.awbNumber ? (
              <dl className="space-y-1 text-sm">
                <div><dt className="text-ink-muted">Courier</dt><dd>{o.shipment.courierName}</dd></div>
                <div><dt className="text-ink-muted">AWB</dt><dd className="font-mono">{o.shipment.awbNumber}</dd></div>
                <div><dt className="text-ink-muted">Booked via</dt><dd>{o.shipment.provider === "shiprocket" ? "Shiprocket" : "Manual entry"}</dd></div>
                {o.shipment.trackingUrl && <div><dt className="text-ink-muted">Tracking</dt><dd><a href={o.shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-maroon underline">Open<span className="sr-only"> (opens in a new tab)</span></a></dd></div>}
              </dl>
            ) : <p className="text-sm text-ink-muted">Not shipped yet.</p>}
          </Card>
          <Card title="Payment">
            <dl className="space-y-1 text-sm">
              <div><dt className="text-ink-muted">Method</dt><dd>{o.paymentMethod === "cod" ? "Cash on delivery" : "Razorpay"}</dd></div>
              <div><dt className="text-ink-muted">Status</dt><dd>{PAYMENT_LABEL[o.paymentStatus]}</dd></div>
              {o.payment.razorpayPaymentId && <div><dt className="text-ink-muted">Payment id</dt><dd className="break-all font-mono text-xs">{o.payment.razorpayPaymentId}</dd></div>}
              {o.payment.providerOrderIds.length > 0 && <div><dt className="text-ink-muted">Provider orders ({o.payment.attempts} attempt(s))</dt><dd className="break-all font-mono text-xs">{o.payment.providerOrderIds.join(", ")}</dd></div>}
              {o.payment.capturedAt && <div><dt className="text-ink-muted">Captured</dt><dd>{dt.format(new Date(o.payment.capturedAt))}</dd></div>}
              {o.payment.lastError && <div><dt className="text-ink-muted">Last error</dt><dd className="text-error">{o.payment.lastError}</dd></div>}
            </dl>
          </Card>
          {d.returns.length > 0 && (
            <Card title="Return requests">
              <ul className="space-y-2 text-sm">{d.returns.map((r) => (<li key={r.id}><p>{r.reason}</p><p className="text-xs text-ink-muted">{dt.format(new Date(r.at))} &middot; {r.status}{r.disposition ? ` (${r.disposition})` : ""}</p></li>))}</ul>
            </Card>
          )}
          <Card title="Internal notes">
            {d.notes.length === 0 ? <p className="text-sm text-ink-muted">No notes.</p> : (
              <ul className="space-y-2 text-sm">{d.notes.map((n) => (<li key={n.id}><p>{n.text}</p><p className="text-xs text-ink-muted">{dt.format(new Date(n.at))} &middot; {n.by}</p></li>))}</ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
