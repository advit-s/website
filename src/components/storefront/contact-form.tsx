"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/field";

export function ContactForm({ orderRef }: { orderRef?: string }) {
  const [fe, setFe] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    setFe({});
    const r = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        email: fd.get("email"),
        phone: fd.get("phone") || undefined,
        message: (orderRef ? `[Regarding order ${orderRef}] ` : "") + String(fd.get("message") ?? ""),
        website: fd.get("website") ?? "",
      }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) {
      setState("sent");
      e.currentTarget.reset();
    } else if (d?.error?.fields) setFe(d.error.fields);
    else {
      setState("error");
      setErr(d?.error?.message ?? "We could not send your message. Please try again or use WhatsApp.");
    }
  }

  if (state === "sent") {
    return (
      <Alert tone="success" title="Message received">
        Thank you - we have saved your message and will reply to the email address you gave. If it is urgent, message us on WhatsApp.
        <div className="mt-2"><button type="button" className="underline underline-offset-4" onClick={() => setState("idle")}>Send another message</button></div>
      </Alert>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {state === "error" && err && <Alert tone="error">{err}</Alert>}
      {orderRef && <Alert tone="info">This message will mention order {orderRef}.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={fe.name}>{(f) => <Input id={f.id} name="name" autoComplete="name" aria-invalid={f.invalid} aria-describedby={f.describedBy} />}</Field>
        <Field label="Email address" required error={fe.email}>{(f) => <Input id={f.id} name="email" type="email" autoComplete="email" aria-invalid={f.invalid} aria-describedby={f.describedBy} />}</Field>
        <Field label="Phone number (optional)" error={fe.phone} className="sm:col-span-2">{(f) => <Input id={f.id} name="phone" type="tel" autoComplete="tel" aria-invalid={f.invalid} aria-describedby={f.describedBy} />}</Field>
      </div>
      <Field label="Message" required error={fe.message}>{(f) => <Textarea id={f.id} name="message" maxLength={2000} aria-invalid={f.invalid} aria-describedby={f.describedBy} />}</Field>
      <div aria-hidden className="absolute -left-[9999px]">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        <Send className="size-4" aria-hidden /> Send message
      </Button>
    </form>
  );
}
