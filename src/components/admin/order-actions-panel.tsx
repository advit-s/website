"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Badge } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/field";
import { allowedTransitions } from "@/domain/order-state";
import type { FulfilmentStatus, PaymentMethod, PaymentStatus, RefundRecord, ReturnStatus } from "@/domain/types";
import { formatINR } from "@/domain/money";

interface Props {
  orderId: string;
  status: FulfilmentStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  returnStatus: ReturnStatus;
  hasCustomItems: boolean;
  needsReview: boolean;
  total: number;
  refundable: number;
  refunds: RefundRecord[];
  custom: { quotedTotal: number | null; advancePaid: number; leadTimeDays: number | null; productionState: string | null } | null;
  simulated: boolean;
  /** Latest dispatch records per refund attempt (what was sent, receipt, last provider check). */
  dispatches: { refundId: string; attempt: number; outcome: string; receipt: string; providerRefundId: string | null; lastCheck?: { at: string; result: string; detail: string } | null }[];
  /** Provider refund events that could not be matched to a refund yet (kept as evidence). */
  evidence: { providerRefundId: string; state: string; status: string; note: string | null }[];
  exceptions: { id: string; kind: string; paymentId: string; amount: number; status: string; guidance: string; courierReview: boolean; codCollected: boolean; createdAt: string; refundId?: string | null }[];
  /** Why generic "Mark reviewed" is currently refused (unresolved money problem), or null. */
  reviewBlocked: string | null;
}

type Modal = null | "ship" | "cancel" | "refund" | "cod_ref" | "note" | "quote" | "return_received" | "attest" | "ex_reconcile";

export function OrderActionsPanel(p: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string | boolean>>({});
  const set = (k: string, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const next = allowedTransitions(p.status);

  async function act(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setError(null);
    setOk(null);
    const r = await fetch(`/api/admin/orders/${p.orderId}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) {
      setError(d?.error?.code === "REAUTH_REQUIRED" ? "For safety, sign out and sign back in, then retry." : d?.error?.fields ? Object.values(d.error.fields as Record<string, string>).join("; ") : (d?.error?.message ?? "Action failed."));
      return false;
    }
    setOk(`${label}: done.`);
    setModal(null);
    setF({});
    router.refresh();
    return true;
  }

  async function runRefund(refundId: string) {
    setBusy(`refund-${refundId}`);
    setError(null);
    const r = await fetch(`/api/admin/orders/${p.orderId}/refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refundId }) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) setError(d?.error?.code === "REAUTH_REQUIRED" ? "For safety, sign out and sign back in, then retry the refund." : (d?.error?.message ?? "Refund failed."));
    else setOk("Refund sent to the payment provider.");
    router.refresh();
  }

  const canConfirm = next.includes("confirmed");
  const unpaidPrepaid = p.paymentMethod === "razorpay" && p.paymentStatus !== "paid";
  const openExceptions = p.exceptions.filter((e) => e.status === "needs_review" || e.status === "refund_requested");
  const blockedByException = openExceptions.length > 0;
  const dispatchOf = (r: RefundRecord) => p.dispatches.find((d) => d.refundId === r.id && d.attempt === (r.attempt ?? 1));

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {ok && <Alert tone="success">{ok}</Alert>}
      {p.needsReview && (
        <Alert tone="warning" title="Flagged for review">
          A payment or shipment exception needs a human decision.
          {p.reviewBlocked ? (
            <p className="mt-2 text-sm">Cannot be cleared yet: {p.reviewBlocked}</p>
          ) : (
            <div className="mt-2"><Button size="sm" variant="secondary" onClick={() => act({ type: "clear_review" }, "Clear flag")} loading={busy === "Clear flag"}>Mark reviewed</Button></div>
          )}
        </Alert>
      )}

      {p.exceptions.length > 0 && (
        <section aria-labelledby="pe-title" className="rounded-md border border-warning/40 p-3">
          <h3 id="pe-title" className="font-sans text-sm font-semibold">Payment exceptions</h3>
          <p className="mt-1 text-xs text-ink-muted">Online payments the provider captured outside this order&apos;s normal flow. Nothing here changes fulfilment or refunds by itself.</p>
          <ul className="mt-2 space-y-3">
            {p.exceptions.map((e) => (
              <li key={e.id} className="rounded-md bg-ivory p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{formatINR(e.amount)} &middot; {e.kind === "duplicate_capture" ? "second online payment" : "online payment after COD switch"}</p>
                  <Badge tone={e.status === "needs_review" ? "warning" : e.status === "refund_requested" ? "info" : "success"}>{e.status === "needs_review" ? "Needs decision" : e.status === "refund_requested" ? "Refund requested" : e.status === "refunded" ? "Refunded" : "Handled outside the system"}</Badge>
                </div>
                <p className="mt-1 break-all font-mono text-xs text-ink-muted">{e.paymentId}</p>
                <p className="mt-1">{e.guidance}</p>
                {e.courierReview && <p className="mt-1 text-xs font-medium text-warning">This order was already shipped or delivered: review the courier&apos;s cash-on-delivery collection.</p>}
                {e.codCollected && <p className="mt-1 text-xs font-medium text-warning">Cash on delivery has been collected: the customer has paid twice.</p>}
                {e.status === "needs_review" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => act({ type: "exception_refund", exceptionId: e.id }, "Request refund of extra payment")} loading={busy === "Request refund of extra payment"}>Verify and request refund</Button>
                    <Button size="sm" variant="secondary" onClick={() => (setF({ exceptionId: e.id }), setError(null), setModal("ex_reconcile"))}>Already refunded elsewhere...</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {canConfirm && <Button onClick={() => act({ type: "confirm" }, "Confirm order")} loading={busy === "Confirm order"} disabled={unpaidPrepaid || p.needsReview || blockedByException} title={unpaidPrepaid ? "Prepaid orders can be confirmed once paid" : blockedByException ? "Resolve the payment exception first" : undefined}>Confirm order</Button>}
        {next.includes("processing") && <Button onClick={() => act({ type: "start_processing" }, "Start processing")} loading={busy === "Start processing"} disabled={blockedByException} title={blockedByException ? "Resolve the payment exception first" : undefined}>Start processing</Button>}
        {next.includes("shipped") && <Button onClick={() => (setError(null), setModal("ship"))} disabled={blockedByException} title={blockedByException ? "Resolve the payment exception first" : undefined}>Ship order</Button>}
        {next.includes("out_for_delivery") && <Button variant="secondary" onClick={() => act({ type: "out_for_delivery" }, "Out for delivery")} loading={busy === "Out for delivery"}>Mark out for delivery</Button>}
        {next.includes("delivered") && <Button onClick={() => act({ type: "deliver", codCollected: p.paymentMethod === "cod" }, "Mark delivered")} loading={busy === "Mark delivered"}>Mark delivered{p.paymentMethod === "cod" && p.paymentStatus === "pending" ? " + cash collected" : ""}</Button>}
        {p.paymentMethod === "cod" && p.paymentStatus === "pending" && p.status === "delivered" && <Button variant="secondary" onClick={() => act({ type: "collect_cod" }, "Record cash collected")} loading={busy === "Record cash collected"}>Record cash collected</Button>}
        {next.includes("cancelled") && <Button variant="danger" onClick={() => (setError(null), setModal("cancel"))}>Cancel order</Button>}
        <Button variant="ghost" onClick={() => setModal("note")}>Add note</Button>
        {["paid", "partially_refunded"].includes(p.paymentStatus) && p.refundable > 0 && <Button variant="secondary" onClick={() => (setError(null), setF({ amount: String(p.refundable / 100) }), setModal("refund"))}>Request refund</Button>}
        {p.hasCustomItems && <Button variant="secondary" onClick={() => (setF({ quoted: p.custom?.quotedTotal != null ? String(p.custom.quotedTotal / 100) : "", advance: String((p.custom?.advancePaid ?? 0) / 100), lead: p.custom?.leadTimeDays != null ? String(p.custom.leadTimeDays) : "", state: p.custom?.productionState ?? "enquiry" }), setModal("quote"))}>Custom quote / advance</Button>}
      </div>

      {p.refunds.length > 0 && (
        <div>
          <h3 className="mb-2 font-sans text-sm font-semibold">Refunds</h3>
          <ul className="space-y-2">
            {p.refunds.map((r) => {
              const d = dispatchOf(r);
              const online = p.paymentMethod === "razorpay" || !!r.exceptionId;
              const unlocked = r.state === "requested" || (r.state === "failed" && r.retrySafe);
              return (
                <li key={r.id} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {formatINR(r.amount)} &middot; {r.state === "processing" && r.uncertain ? "outcome unknown - locked" : r.state}
                        {r.exceptionId ? " · extra online payment" : ""}
                      </p>
                      <p className="text-xs text-ink-muted">{r.reason}{r.reference ? ` - ref ${r.reference}` : ""}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {unlocked && online && (
                        <Button size="sm" onClick={() => runRefund(r.id)} loading={busy === `refund-${r.id}`}>{r.state === "failed" ? "Send again (new attempt)" : "Send refund to provider"}{p.simulated ? " (simulated)" : ""}</Button>
                      )}
                      {r.state === "processing" && online && (
                        <Button size="sm" variant="secondary" onClick={() => act({ type: "refund_reconcile", refundId: r.id }, "Reconcile refund")} loading={busy === "Reconcile refund"}>Reconcile with provider</Button>
                      )}
                      {r.state === "processing" && r.uncertain && !r.providerRefundId && d?.lastCheck?.result === "not_found" && (
                        <Button size="sm" variant="ghost" onClick={() => (setF({ refundId: r.id }), setError(null), setModal("attest"))}>Record provider check...</Button>
                      )}
                      {(r.state === "requested" || r.state === "failed") && p.paymentMethod === "cod" && !r.exceptionId && (
                        <Button size="sm" variant="secondary" onClick={() => (setF({ refundId: r.id }), setModal("cod_ref"))}>Record bank/UPI refund</Button>
                      )}
                    </div>
                  </div>
                  {r.state === "processing" && r.uncertain && (
                    <p className="mt-2 text-xs text-warning">
                      We could not confirm whether the provider moved this money, so it stays locked and cannot be sent again. Use <strong>Reconcile with provider</strong>; it only applies what the provider proves.
                    </p>
                  )}
                  {r.state === "failed" && !r.retrySafe && online && (
                    <p className="mt-2 text-xs text-warning">This refund failed but it is not proven that the provider created nothing, so it cannot be sent again. Check the provider dashboard and contact the developer.</p>
                  )}
                  {d && (
                    <p className="mt-2 text-xs text-ink-muted">
                      Attempt {d.attempt} &middot; receipt <span className="font-mono">{d.receipt}</span> &middot; {d.outcome.replace(/_/g, " ")}
                      {d.providerRefundId ? <> &middot; <span className="font-mono">{d.providerRefundId}</span></> : null}
                      {d.lastCheck ? <><br />Last provider check: {d.lastCheck.result.replace(/_/g, " ")} - {d.lastCheck.detail}</> : null}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <details className="mt-2 text-xs text-ink-muted">
            <summary className="cursor-pointer">When is it safe to send a refund again?</summary>
            <p className="mt-1">Only when it has never been sent, or the provider confirmed it failed or rejected the request, or you recorded a documented provider check after the system search found nothing. A timeout, a dropped connection or elapsed time never unlocks a refund. Every new attempt uses a new receipt.</p>
          </details>
        </div>
      )}
      {p.evidence.filter((e) => e.state !== "applied").length > 0 && (
        <Alert tone="info" title="Provider refund events awaiting correlation">
          <ul className="mt-1 space-y-1 text-xs">
            {p.evidence.filter((e) => e.state !== "applied").map((e) => (
              <li key={e.providerRefundId}><span className="font-mono">{e.providerRefundId}</span> - {e.status} - {e.state.replace(/_/g, " ")}{e.note ? `: ${e.note}` : ""}</li>
            ))}
          </ul>
        </Alert>
      )}

      {p.returnStatus !== "none" && (
        <div className="rounded-md border border-line p-3">
          <h3 className="font-sans text-sm font-semibold">Return workflow: {p.returnStatus.replace(/_/g, " ")}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {p.returnStatus === "requested" && (
              <>
                <Button size="sm" onClick={() => act({ type: "return_decision", decision: "approve" }, "Approve return")}>Approve return</Button>
                <Button size="sm" variant="secondary" onClick={() => act({ type: "return_decision", decision: "reject" }, "Decline return")}>Decline</Button>
              </>
            )}
            {p.returnStatus === "approved" && <Button size="sm" onClick={() => setModal("return_received")}>Mark received...</Button>}
            {["received", "refund_pending", "rejected"].includes(p.returnStatus) && <Button size="sm" variant="secondary" onClick={() => act({ type: "return_close" }, "Close return")}>Close return</Button>}
          </div>
          <p className="mt-2 text-xs text-ink-muted">A return request is not a refund. After receiving the item, request the refund above; the return closes when it completes.</p>
        </div>
      )}

      <Dialog open={modal === "ship"} onClose={() => setModal(null)} title="Ship order" size="md">
        <div className="space-y-4">
          <Field label="Booking method">
            {(x) => (
              <Select id={x.id} value={String(f.mode ?? "manual")} onChange={(e) => set("mode", e.target.value)}>
                <option value="manual">Manual - I booked it myself (enter AWB)</option>
                <option value="shiprocket">Book through Shiprocket{p.simulated ? " (simulated)" : ""}</option>
              </Select>
            )}
          </Field>
          {(f.mode ?? "manual") === "manual" ? (
            <>
              <Field label="Courier" required>{(x) => <Input id={x.id} value={String(f.courier ?? "")} onChange={(e) => set("courier", e.target.value)} placeholder="Porter, Shiprocket Quick, Delhivery..." />}</Field>
              <Field label="AWB / tracking number" required>{(x) => <Input id={x.id} value={String(f.awb ?? "")} onChange={(e) => set("awb", e.target.value)} />}</Field>
              <Field label="Tracking link (optional, https)">{(x) => <Input id={x.id} type="url" value={String(f.url ?? "")} onChange={(e) => set("url", e.target.value)} />}</Field>
            </>
          ) : (
            <div className="space-y-3">
              <Alert tone="info">{p.simulated ? "Simulated mode: a clearly-marked fake AWB is generated. No courier is booked." : "The booking is made with Shiprocket now. Its progress is saved at each step: if the AWB step fails you can retry without creating a second order; if the outcome is unknown, booking is locked until you attach the existing Shiprocket order or enter an AWB manually."}</Alert>
              <details className="rounded-md border border-line p-3 text-sm">
                <summary className="cursor-pointer font-medium">A booking already exists in Shiprocket?</summary>
                <p className="mt-2 text-xs text-ink-muted">Enter the Shiprocket order id. It is verified with Shiprocket and must carry this order&apos;s number; then press <strong>Mark shipped</strong> to continue from where it stopped.</p>
                <div className="mt-2 flex gap-2">
                  <Input aria-label="Shiprocket order id" value={String(f.attachId ?? "")} onChange={(e) => set("attachId", e.target.value)} placeholder="Shiprocket order id" />
                  <Button type="button" size="sm" variant="secondary" onClick={() => act({ type: "booking_attach", shiprocketOrderId: String(f.attachId ?? "") }, "Attach booking")} loading={busy === "Attach booking"} disabled={String(f.attachId ?? "").trim().length < 3}>Attach</Button>
                </div>
              </details>
            </div>
          )}
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={() => act((f.mode ?? "manual") === "manual" ? { type: "ship", mode: "manual", courierName: f.courier, awbNumber: f.awb, trackingUrl: f.url || undefined } : { type: "ship", mode: "shiprocket" }, "Ship order")} loading={busy === "Ship order"}>Mark shipped</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={modal === "cancel"} onClose={() => setModal(null)} title="Cancel this order?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">Stock is released or restocked automatically. {p.paymentStatus === "paid" && p.paymentMethod === "razorpay" ? "A full refund request is created for you to send to the provider." : ""}</p>
          <Field label="Reason" required>{(x) => <Input id={x.id} value={String(f.reason ?? "")} onChange={(e) => set("reason", e.target.value)} />}</Field>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Keep order</Button><Button variant="danger" onClick={() => act({ type: "cancel", reason: String(f.reason ?? "") }, "Cancel order")} loading={busy === "Cancel order"}>Cancel order</Button></div>
        </div>
      </Dialog>

      <Dialog open={modal === "refund"} onClose={() => setModal(null)} title="Request refund" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">Up to {formatINR(p.refundable)} can still be refunded. This creates a request; sending it to the provider is a separate confirmed step.</p>
          <Field label="Amount (INR)" required>{(x) => <Input id={x.id} type="number" step="0.01" min="0.01" value={String(f.amount ?? "")} onChange={(e) => set("amount", e.target.value)} />}</Field>
          <Field label="Reason" required>{(x) => <Input id={x.id} value={String(f.reason ?? "")} onChange={(e) => set("reason", e.target.value)} />}</Field>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Close</Button><Button onClick={() => act({ type: "refund_request", amount: Math.round(Number(f.amount) * 100), reason: String(f.reason ?? "") }, "Request refund")} loading={busy === "Request refund"}>Create request</Button></div>
        </div>
      </Dialog>

      <Dialog open={modal === "cod_ref"} onClose={() => setModal(null)} title="Record cash-order refund" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">Pay the customer by bank transfer or UPI yourself, then record the reference here. The reference is stored for admins only.</p>
          <Field label="Transfer / UPI reference" required>{(x) => <Input id={x.id} value={String(f.reference ?? "")} onChange={(e) => set("reference", e.target.value)} />}</Field>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Close</Button><Button onClick={() => act({ type: "cod_refund_record", refundId: String(f.refundId), reference: String(f.reference ?? "") }, "Record refund")} loading={busy === "Record refund"}>Record</Button></div>
        </div>
      </Dialog>

      <Dialog open={modal === "attest"} onClose={() => setModal(null)} title="Record a provider check" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">The system search found no refund for this attempt, which is not proof that none exists. Open the payment provider dashboard, look at this payment&apos;s refunds, and describe exactly what you checked. If you confirm no refund exists, the refund becomes safe to send again as a new attempt. If a refund appears later it is flagged for review, never merged silently.</p>
          <Field label="What did you check, and what did you see?" required>{(x) => <Textarea id={x.id} value={String(f.note ?? "")} onChange={(e) => set("note", e.target.value)} maxLength={500} />}</Field>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Close</Button><Button onClick={() => act({ type: "refund_attest_absent", refundId: String(f.refundId), note: String(f.note ?? "") }, "Record provider check")} loading={busy === "Record provider check"} disabled={String(f.note ?? "").trim().length < 20}>No refund exists - allow a new attempt</Button></div>
        </div>
      </Dialog>

      <Dialog open={modal === "ex_reconcile"} onClose={() => setModal(null)} title="Extra payment already refunded elsewhere" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">Use this only if the extra online payment was already refunded (for example from the provider dashboard). The system checks the provider&apos;s own refund list and refuses if no completed refund covers the payment.</p>
          <Field label="How and when was it handled?" required>{(x) => <Textarea id={x.id} value={String(f.note ?? "")} onChange={(e) => set("note", e.target.value)} maxLength={500} />}</Field>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Close</Button><Button onClick={() => act({ type: "exception_reconcile", exceptionId: String(f.exceptionId), note: String(f.note ?? "") }, "Record as handled")} loading={busy === "Record as handled"} disabled={String(f.note ?? "").trim().length < 20}>Verify and record</Button></div>
        </div>
      </Dialog>

      <Dialog open={modal === "note"} onClose={() => setModal(null)} title="Internal note" size="sm">
        <div className="space-y-4">
          <Field label="Note (visible to staff only)">{(x) => <Textarea id={x.id} value={String(f.text ?? "")} onChange={(e) => set("text", e.target.value)} maxLength={1000} />}</Field>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Close</Button><Button onClick={() => act({ type: "note", text: String(f.text ?? "") }, "Add note")} loading={busy === "Add note"} disabled={!String(f.text ?? "").trim()}>Save note</Button></div>
        </div>
      </Dialog>

      <Dialog open={modal === "return_received"} onClose={() => setModal(null)} title="Return received" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">Inspect the item, then choose what happens to the stock. This is recorded in the audit log.</p>
          <Field label="Disposition">
            {(x) => (
              <Select id={x.id} value={String(f.disp ?? "restock")} onChange={(e) => set("disp", e.target.value)}>
                <option value="restock">Resellable - add back to stock</option>
                <option value="discard">Not resellable - do not restock</option>
              </Select>
            )}
          </Field>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Close</Button><Button onClick={() => act({ type: "return_received", disposition: String(f.disp ?? "restock") }, "Return received")} loading={busy === "Return received"}>Confirm</Button></div>
        </div>
      </Dialog>

      <Dialog open={modal === "quote"} onClose={() => setModal(null)} title="Made-to-order quote and advance" size="md">
        <div className="space-y-4">
          <Alert tone="info">The agreed quote replaces the indicative price. Record the advance you collect (online payment link or in person); this tool never charges anyone.</Alert>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Agreed total (INR)">{(x) => <Input id={x.id} type="number" min={0} step="0.01" value={String(f.quoted ?? "")} onChange={(e) => set("quoted", e.target.value)} />}</Field>
            <Field label="Advance received (INR)">{(x) => <Input id={x.id} type="number" min={0} step="0.01" value={String(f.advance ?? "0")} onChange={(e) => set("advance", e.target.value)} />}</Field>
            <Field label="Agreed lead time (days)">{(x) => <Input id={x.id} type="number" min={1} value={String(f.lead ?? "")} onChange={(e) => set("lead", e.target.value)} />}</Field>
            <Field label="Production stage">
              {(x) => (
                <Select id={x.id} value={String(f.state ?? "enquiry")} onChange={(e) => set("state", e.target.value)}>
                  <option value="enquiry">Enquiry</option><option value="quoted">Quoted</option><option value="in_production">In production</option><option value="ready">Ready to ship</option>
                </Select>
              )}
            </Field>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Close</Button>
            <Button onClick={() => act({ type: "custom_quote", quotedTotal: f.quoted === "" ? null : Math.round(Number(f.quoted) * 100), advancePaid: Math.round(Number(f.advance || 0) * 100), leadTimeDays: f.lead === "" ? null : Number(f.lead), productionState: f.state }, "Save quote")} loading={busy === "Save quote"}>Save</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export { Checkbox };
