"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
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
}

type Modal = null | "ship" | "cancel" | "refund" | "cod_ref" | "note" | "quote" | "return_received";

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
      setError(d?.error?.fields ? Object.values(d.error.fields as Record<string, string>).join("; ") : (d?.error?.message ?? "Action failed."));
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

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {ok && <Alert tone="success">{ok}</Alert>}
      {p.needsReview && (
        <Alert tone="warning" title="Flagged for review">
          A payment or shipment exception needs a human decision.
          <div className="mt-2"><Button size="sm" variant="secondary" onClick={() => act({ type: "clear_review" }, "Clear flag")} loading={busy === "Clear flag"}>Mark reviewed</Button></div>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {canConfirm && <Button onClick={() => act({ type: "confirm" }, "Confirm order")} loading={busy === "Confirm order"} disabled={unpaidPrepaid || p.needsReview} title={unpaidPrepaid ? "Prepaid orders can be confirmed once paid" : undefined}>Confirm order</Button>}
        {next.includes("processing") && <Button onClick={() => act({ type: "start_processing" }, "Start processing")} loading={busy === "Start processing"}>Start processing</Button>}
        {next.includes("shipped") && <Button onClick={() => (setError(null), setModal("ship"))}>Ship order</Button>}
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
            {p.refunds.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-3 text-sm">
                <div>
                  <p className="font-medium">{formatINR(r.amount)} &middot; {r.state}</p>
                  <p className="text-xs text-ink-muted">{r.reason}{r.reference ? ` - ref ${r.reference}` : ""}</p>
                </div>
                {(r.state === "requested" || r.state === "failed") && p.paymentMethod === "razorpay" && (
                  <Button size="sm" onClick={() => runRefund(r.id)} loading={busy === `refund-${r.id}`}>{r.state === "failed" ? "Retry refund" : "Send refund to provider"}{p.simulated ? " (simulated)" : ""}</Button>
                )}
                {(r.state === "requested" || r.state === "failed") && p.paymentMethod === "cod" && (
                  <Button size="sm" variant="secondary" onClick={() => (setF({ refundId: r.id }), setModal("cod_ref"))}>Record bank/UPI refund</Button>
                )}
              </li>
            ))}
          </ul>
        </div>
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
            <Alert tone="info">{p.simulated ? "Simulated mode: a clearly-marked fake AWB is generated. No courier is booked." : "The booking is made with Shiprocket now. If it fails, nothing changes and you will see the real error; you can then enter an AWB manually."}</Alert>
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
