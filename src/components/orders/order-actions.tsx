"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Textarea, Field } from "@/components/ui/field";

/** Cancellation (before shipping) and return requests (within the policy window). Server re-checks every rule. */
export function OrderActions({ orderId, canCancel, canReturn }: { orderId: string; canCancel: boolean; canReturn: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"cancel" | "return" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/orders/${orderId}/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setError(data?.error?.fields?.reason ?? data?.error?.message ?? "Something went wrong.");
      return;
    }
    setMode(null);
    setReason("");
    router.refresh();
  }

  return (
    <section className="border border-line bg-white p-5" aria-labelledby="act-h">
      <h2 id="act-h" className="t-h3 !text-lg">
        Need to change something?
      </h2>
      <div className="mt-3 flex flex-wrap gap-3">
        {canCancel && (
          <Button variant="secondary" onClick={() => setMode("cancel")}>
            Cancel order
          </Button>
        )}
        {canReturn && (
          <Button variant="secondary" onClick={() => setMode("return")}>
            Request a return
          </Button>
        )}
      </div>
      <Dialog open={mode !== null} onClose={() => setMode(null)} title={mode === "cancel" ? "Cancel this order?" : "Request a return"} size="sm">
        <div className="space-y-4">
          {mode === "cancel" ? (
            <p className="text-sm text-ink-muted">You can cancel until the order ships. If you have paid online, a refund will be requested to your original payment method.</p>
          ) : (
            <p className="text-sm text-ink-muted">Ready-to-ship items can be returned unused and with tags. A return request is reviewed by our team; it is not a refund until approved and processed.</p>
          )}
          {error && <Alert tone="error">{error}</Alert>}
          <Field label={mode === "cancel" ? "Reason (optional)" : "Reason for return"} required={mode === "return"}>
            {(f) => <Textarea id={f.id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={mode === "cancel" ? 200 : 500} />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMode(null)}>
              Keep order
            </Button>
            <Button variant={mode === "cancel" ? "danger" : "primary"} onClick={submit} loading={busy}>
              {mode === "cancel" ? "Cancel order" : "Send request"}
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
