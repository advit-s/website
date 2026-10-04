"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";

type Errors = Record<string, string>;
const MEASURES = [
  ["bust", "Bust"],
  ["waist", "Waist"],
  ["hip", "Hip"],
  ["blouseLength", "Blouse length"],
  ["lehengaLength", "Lehenga length"],
] as const;

export function CustomEnquiry({ productId, productName, leadTimeDays, whatsappConfigured }: { productId: string; productName: string; leadTimeDays: number | null; whatsappConfigured: boolean }) {
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ reference: string; whatsappUrl: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const measurements: Record<string, number> = {};
    for (const [k] of MEASURES) {
      const v = String(fd.get(k) ?? "").trim();
      if (v) measurements[k] = Number(v);
    }
    const body = {
      productId,
      name: String(fd.get("name") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      email: String(fd.get("email") ?? ""),
      occasion: String(fd.get("occasion") ?? ""),
      occasionDate: String(fd.get("occasionDate") ?? ""),
      measurements,
      notes: String(fd.get("notes") ?? "") || undefined,
      consent: fd.get("consent") === "on" ? true : false,
      website: String(fd.get("website") ?? ""),
    };
    try {
      const r = await fetch("/api/custom-enquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json();
      if (r.ok) setDone({ reference: data.reference, whatsappUrl: data.whatsappUrl });
      else if (data?.error?.fields) setErrors(data.error.fields as Errors);
      else setFormError(data?.error?.message ?? "We could not send your enquiry. Please try again.");
    } catch {
      setFormError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const external = done.whatsappUrl.startsWith("http");
    return (
      <div className="space-y-4" role="status">
        <Alert tone="success" title={`Enquiry ${done.reference} saved`}>
          We have recorded your enquiry. Nothing has been charged. {external ? "Open WhatsApp to send us the pre-filled message - it is only sent when you press send." : "WhatsApp is not configured for this store yet, so we will contact you on the phone number you gave."}
        </Alert>
        {external ? (
          <a href={done.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 bg-maroon px-6 font-nav text-[0.8rem] uppercase tracking-[0.12em] text-white hover:bg-wine">
            <MessageCircle className="size-4" aria-hidden /> Open WhatsApp draft<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label={`Custom enquiry for ${productName}`}>
      <p className="text-sm text-ink-muted">
        Tell us about the occasion and, if you have them, your measurements. We will talk through fit, finish and price on WhatsApp before anything is charged.
        {leadTimeDays != null && <> Production usually takes about {leadTimeDays} days, plus delivery.</>}
        {!whatsappConfigured && <> (WhatsApp is not configured in this demo; your enquiry is still saved.)</>}
      </p>
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" required error={errors.name}>
          {(p) => <Input id={p.id} name="name" autoComplete="name" aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </Field>
        <Field label="Mobile number" required error={errors.phone} hint="Indian 10-digit number">
          {(p) => <Input id={p.id} name="phone" type="tel" inputMode="tel" autoComplete="tel" aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </Field>
        <Field label="Email (optional)" error={errors.email}>
          {(p) => <Input id={p.id} name="email" type="email" autoComplete="email" aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </Field>
        <Field label="Occasion" required error={errors.occasion}>
          {(p) => <Input id={p.id} name="occasion" placeholder="e.g. Wedding, sangeet" aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </Field>
        <Field label="Occasion date" required error={errors.occasionDate}>
          {(p) => <Input id={p.id} name="occasionDate" type="date" min={tomorrow} aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Measurements in cm (optional)</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {MEASURES.map(([k, label]) => (
            <Field key={k} label={label} error={errors[`measurements.${k}`]}>
              {(p) => <Input id={p.id} name={k} type="number" inputMode="decimal" min={20} max={250} step="0.5" aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
            </Field>
          ))}
        </div>
      </fieldset>
      <Field label="Anything else? (optional)" error={errors.notes}>
        {(p) => <Textarea id={p.id} name="notes" maxLength={600} aria-describedby={p.describedBy} className="min-h-20" />}
      </Field>
      {/* honeypot: hidden from people and assistive tech */}
      <div aria-hidden className="absolute -left-[9999px]">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div>
        <Checkbox name="consent" label="I agree to be contacted about this enquiry using the details above." />
        {errors.consent && (
          <p role="alert" className="mt-1 text-xs font-medium text-error">
            {errors.consent}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" loading={busy}>
        Send enquiry
      </Button>
    </form>
  );
}
