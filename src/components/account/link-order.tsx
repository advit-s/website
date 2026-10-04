"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";

export function LinkGuestOrder() {
  const router = useRouter();
  const [num, setNum] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  return (
    <details className="border border-line bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-maroon">Placed an order as a guest? Add it to this account</summary>
      <form
        className="mt-4 max-w-md space-y-3"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg(null);
          const r = await fetch("/api/account/link-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber: num }) });
          const d = await r.json().catch(() => ({}));
          setBusy(false);
          if (r.ok) {
            setMsg({ tone: "success", text: "Order added to your account." });
            setNum("");
            router.refresh();
          } else setMsg({ tone: "error", text: d?.error?.fields?.orderNumber ?? d?.error?.message ?? "Could not link that order." });
        }}
      >
        <p className="text-xs text-ink-muted">For your security this only works when the order&apos;s phone number or email matches a phone/email verified on this account. Guest orders are never linked automatically.</p>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Field label="Order number" hint="Looks like RRC-1042">{(f) => <Input id={f.id} value={num} onChange={(e) => setNum(e.target.value.toUpperCase())} />}</Field>
        <Button type="submit" variant="secondary" loading={busy} disabled={!num.trim()}>Add order</Button>
      </form>
    </details>
  );
}
