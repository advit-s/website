"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, SimulationBadge } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { OrderProgress, UpdatesList } from "@/components/orders/order-progress";
import type { PublicTracking } from "@/server/services/order-view";

export function TrackOrderForm({ initialOrder }: { initialOrder?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PublicTracking | null>(null);
  const [creds, setCreds] = useState({ orderNumber: initialOrder ?? "", contact: "" });
  const [link, setLink] = useState<{ sent: boolean; preview?: string } | null>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFe({});
    setLink(null);
    try {
      const r = await fetch("/api/track-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(creds) });
      const data = await r.json();
      if (r.ok) setResult(data.tracking);
      else {
        setResult(null);
        if (data?.error?.fields) setFe(data.error.fields);
        else setError(data?.error?.message ?? "Something went wrong.");
      }
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendLink() {
    setBusy(true);
    const r = await fetch("/api/track-order/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(creds) });
    const data = await r.json();
    setBusy(false);
    if (r.ok) setLink({ sent: true, preview: data.simulatedPreviewLink });
    else setError(data?.error?.message ?? "Could not send the link.");
  }

  return (
    <div className="space-y-8">
      <form onSubmit={lookup} noValidate className="space-y-4 border border-line bg-white p-5 sm:p-6">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Order number" required error={fe.orderNumber} hint="Looks like RRC-1042">
            {(f) => <Input id={f.id} value={creds.orderNumber} onChange={(e) => setCreds({ ...creds, orderNumber: e.target.value.toUpperCase() })} autoComplete="off" aria-invalid={f.invalid} aria-describedby={f.describedBy} />}
          </Field>
          <Field label="Phone number or email used at checkout" required error={fe.contact}>
            {(f) => <Input id={f.id} value={creds.contact} onChange={(e) => setCreds({ ...creds, contact: e.target.value })} autoComplete="off" aria-invalid={f.invalid} aria-describedby={f.describedBy} />}
          </Field>
        </div>
        <Button type="submit" size="lg" loading={busy && !result}>
          Track order
        </Button>
      </form>

      {result && (
        <section aria-labelledby="trk" className="space-y-6 border border-line bg-white p-5 sm:p-6" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="trk" className="t-h3">
              Order {result.orderNumber}
            </h2>
            <p className="text-sm font-medium text-maroon">{result.statusLabel}</p>
          </div>
          <OrderProgress status={result.status} />
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-ink-muted">Delivering to</dt><dd>{result.deliveringTo}</dd></div>
            <div><dt className="text-ink-muted">Payment</dt><dd>{result.paymentLabel}</dd></div>
            <div className="sm:col-span-2"><dt className="text-ink-muted">Estimate</dt><dd>{result.estimateText}</dd></div>
            {result.courierName && <div><dt className="text-ink-muted">Courier</dt><dd>{result.courierName}</dd></div>}
            {result.trackingUrl && (
              <div>
                <dt className="text-ink-muted">Courier tracking</dt>
                <dd><a href={result.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-maroon underline underline-offset-4">Open courier page<span className="sr-only"> (opens in a new tab)</span></a></dd>
              </div>
            )}
            <div className="sm:col-span-2"><dt className="text-ink-muted">Items</dt><dd>{result.items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}</dd></div>
          </dl>
          <div>
            <h3 className="mb-3 font-sans text-base font-semibold">Updates</h3>
            <UpdatesList events={result.timeline} />
          </div>
          <div className="border-t border-line pt-5">
            <h3 className="font-sans text-base font-semibold">See full order details</h3>
            <p className="mt-1 text-sm text-ink-muted">For your privacy, the delivery address, prices and invoice are shown only through a secure link sent to {result.maskedEmail} / {result.maskedPhone}.</p>
            <Button type="button" variant="secondary" className="mt-3" onClick={sendLink} loading={busy}>
              <Mail className="size-4" aria-hidden /> Send me a secure link
            </Button>
            {link?.sent && (
              <div className="mt-3 space-y-2" role="status">
                <Alert tone="success">A secure link has been queued for the contact details on this order. It works for 1 hour.</Alert>
                {link.preview && (
                  <div className="space-y-1 rounded-sm border border-warning/40 bg-warning-bg p-3 text-sm">
                    <SimulationBadge what="email delivery" />
                    <p>No messaging provider is connected, so nothing was actually sent. For local testing, open the link directly: <a href={link.preview} className="break-all text-maroon underline">{link.preview}</a></p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
