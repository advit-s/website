"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "./admin-shell";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { publicSettingsSchema, privateSettingsSchema, type PrivateSettings, type PublicSettings } from "@/domain/settings";
import { formatINR } from "@/domain/money";
import type { IntegrationStatus } from "@/server/services/integrations";

function Money({ id, value, onChange, label, hint }: { id?: string; value: number; onChange: (paise: number) => void; label: string; hint?: string }) {
  const [text, setText] = useState(String(value / 100));
  useEffect(() => {
    setText(String(value / 100));
  }, [value]);
  return (
    <Field label={`${label} (INR)`} hint={hint}>
      {(f) => (
        <Input
          id={id ?? f.id}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(n) && n >= 0) onChange(Math.round(n * 100));
          }}
        />
      )}
    </Field>
  );
}

const nullable = (s: string) => (s.trim() === "" ? null : s.trim());
const pins = (s: string) => Array.from(new Set(s.split(/[\s,]+/).filter(Boolean)));

interface Props {
  initialPublic: PublicSettings;
  initialPrivate: PrivateSettings;
  updatedAt: string | null;
  products: { id: string; name: string }[];
  status: IntegrationStatus;
  unresolved: string[];
}

export function SettingsForm({ initialPublic, initialPrivate, updatedAt, products, status, unresolved }: Props) {
  const [pub, setPub] = useState(initialPublic);
  const [priv, setPriv] = useState(initialPrivate);
  const [base, setBase] = useState(JSON.stringify([initialPublic, initialPrivate]));
  const [stamp, setStamp] = useState(updatedAt);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const dirty = useMemo(() => JSON.stringify([pub, priv]) !== base, [pub, priv, base]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => (e.preventDefault(), (e.returnValue = ""));
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const up = <K extends keyof PublicSettings>(k: K, patch: Partial<PublicSettings[K]>) => setPub((p) => ({ ...p, [k]: { ...p[k], ...patch } }));
  const e = (path: string) => errs[path] ?? null;

  async function save() {
    const a = publicSettingsSchema.safeParse(pub);
    const b = privateSettingsSchema.safeParse(priv);
    const found: Record<string, string> = {};
    if (!a.success) a.error.issues.forEach((i) => (found[`public.${i.path.join(".")}`] ??= i.message));
    if (!b.success) b.error.issues.forEach((i) => (found[`private.${i.path.join(".")}`] ??= i.message));
    if (Object.keys(found).length) {
      setErrs(found);
      return setMsg({ tone: "error", text: `Please fix ${Object.keys(found).length} field(s): ${Object.entries(found).slice(0, 3).map(([k, v]) => `${k.replace(/^(public|private)\./, "")} - ${v}`).join("; ")}` });
    }
    setErrs({});
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ public: pub, private: priv, expectedUpdatedAt: stamp }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      if (d?.error?.fields) setErrs(Object.fromEntries(Object.entries(d.error.fields as Record<string, string>).map(([k, v]) => [`public.${k}`, v])));
      return setMsg({ tone: "error", text: d?.error?.message ?? "Could not save settings." });
    }
    setBase(JSON.stringify([pub, priv]));
    setStamp(d.updatedAt);
    setMsg({ tone: "success", text: "Settings saved. The storefront reflects them within a few seconds." });
  }

  const toggleFeatured = (id: string) => setPub((p) => ({ ...p, home: { ...p.home, featuredProductIds: p.home.featuredProductIds.includes(id) ? p.home.featuredProductIds.filter((x) => x !== id) : [...p.home.featuredProductIds, id].slice(0, 12) } }));

  const sections = [["store", "Store"], ["homepage", "Homepage"], ["delivery", "Delivery & COD"], ["payments", "Integrations"], ["notifications", "Notifications"], ["social", "Social"], ["legal", "Legal identity"]];

  return (
    <div className="space-y-5 pb-24">
      <nav aria-label="Settings sections" className="flex flex-wrap gap-2">
        {sections.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="inline-flex min-h-9 items-center rounded-sm border border-line bg-white px-3 text-sm hover:border-maroon">{label}</a>
        ))}
      </nav>
      {msg && <Alert tone={msg.tone} className="sticky top-16 z-20 shadow-sm">{msg.text}</Alert>}

      {unresolved.length > 0 && (
        <Alert tone="warning" title={`${unresolved.length} owner detail(s) still needed before launch`}>
          <ul className="list-disc pl-5">{unresolved.map((u) => <li key={u}>{u}</li>)}</ul>
          <p className="mt-1">These appear as visible placeholders on the legal pages and are launch blockers. Fill them in below, then have the policies reviewed by a professional.</p>
        </Alert>
      )}

      <div id="store" className="scroll-mt-20"><Card title="Store information">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Store name" required error={e("public.store.name")}>{(f) => <Input id={f.id} value={pub.store.name} onChange={(x) => up("store", { name: x.target.value })} />}</Field>
          <Field label="Tagline" error={e("public.store.tagline")}>{(f) => <Input id={f.id} value={pub.store.tagline} onChange={(x) => up("store", { tagline: x.target.value })} />}</Field>
          <Field label="Support email" error={e("public.store.supportEmail")}>{(f) => <Input id={f.id} type="email" value={pub.store.supportEmail ?? ""} onChange={(x) => up("store", { supportEmail: nullable(x.target.value) })} />}</Field>
          <Field label="Support phone" error={e("public.store.phone")}>{(f) => <Input id={f.id} type="tel" value={pub.store.phone ?? ""} onChange={(x) => up("store", { phone: nullable(x.target.value) })} />}</Field>
          <Field label="WhatsApp number" hint="Digits with country code, e.g. 919876543210. Until set, WhatsApp buttons lead to the Contact page." error={e("public.store.whatsappNumber")}>{(f) => <Input id={f.id} inputMode="numeric" value={pub.store.whatsappNumber ?? ""} onChange={(x) => up("store", { whatsappNumber: nullable(x.target.value.replace(/\D/g, "")) })} />}</Field>
          <Field label="Opening hours" error={e("public.store.hours")}>{(f) => <Input id={f.id} value={pub.store.hours ?? ""} onChange={(x) => up("store", { hours: nullable(x.target.value) })} placeholder="Mon-Sat, 10:00-19:00" />}</Field>
          <Field label="Store address (one line per row)" className="md:col-span-2" error={e("public.store.addressLines")}>{(f) => <Textarea id={f.id} className="min-h-20" value={pub.store.addressLines.join("\n")} onChange={(x) => up("store", { addressLines: x.target.value.split("\n").slice(0, 5) })} />}</Field>
        </div>
      </Card></div>

      <div id="homepage" className="scroll-mt-20"><Card title="Homepage, hero and announcement">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 md:col-span-2 rounded-md border border-line p-3">
            <Checkbox checked={pub.announcement.enabled} onChange={(x) => up("announcement", { enabled: x.target.checked })} label="Show announcement bar" />
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Announcement text" error={e("public.announcement.text")}>{(f) => <Input id={f.id} value={pub.announcement.text} maxLength={160} onChange={(x) => up("announcement", { text: x.target.value })} />}</Field>
              <Field label="Link (optional)" error={e("public.announcement.href")}>{(f) => <Input id={f.id} value={pub.announcement.href ?? ""} placeholder="/shop?collection=sale" onChange={(x) => up("announcement", { href: nullable(x.target.value) })} />}</Field>
            </div>
            <div className="rounded-sm bg-maroon px-3 py-2 text-xs text-white" aria-label="Announcement preview">{pub.announcement.enabled ? pub.announcement.text || "(empty)" : "Announcement hidden"}</div>
          </div>
          <Field label="Hero eyebrow" error={e("public.hero.eyebrow")}>{(f) => <Input id={f.id} value={pub.hero.eyebrow} onChange={(x) => up("hero", { eyebrow: x.target.value })} />}</Field>
          <Field label="Hero headline" required error={e("public.hero.headline")}>{(f) => <Input id={f.id} value={pub.hero.headline} onChange={(x) => up("hero", { headline: x.target.value })} />}</Field>
          <Field label="Hero sub-heading" error={e("public.hero.subhead")} className="md:col-span-2">{(f) => <Input id={f.id} value={pub.hero.subhead} onChange={(x) => up("hero", { subhead: x.target.value })} />}</Field>
          <Field label="Button label" error={e("public.hero.ctaLabel")}>{(f) => <Input id={f.id} value={pub.hero.ctaLabel} onChange={(x) => up("hero", { ctaLabel: x.target.value })} />}</Field>
          <Field label="Button link" error={e("public.hero.ctaHref")}>{(f) => <Input id={f.id} value={pub.hero.ctaHref} onChange={(x) => up("hero", { ctaHref: x.target.value })} />}</Field>
          <div className="md:col-span-2 rounded-md bg-maroon p-5 text-white" aria-label="Hero preview">
            <p className="text-xs uppercase tracking-[0.18em] text-gold">{pub.hero.eyebrow}</p>
            <p className="mt-1 font-serif text-3xl">{pub.hero.headline}</p>
            <p className="mt-1 text-white/85">{pub.hero.subhead}</p>
            <span className="mt-3 inline-block border border-gold px-4 py-2 text-xs uppercase tracking-widest">{pub.hero.ctaLabel}</span>
          </div>
          <Field label="Story heading" error={e("public.home.storyHeading")}>{(f) => <Input id={f.id} value={pub.home.storyHeading} onChange={(x) => up("home", { storyHeading: x.target.value })} />}</Field>
          <Field label="Made-to-measure heading" error={e("public.home.customHeading")}>{(f) => <Input id={f.id} value={pub.home.customHeading} onChange={(x) => up("home", { customHeading: x.target.value })} />}</Field>
          <Field label="Story text" error={e("public.home.storyBody")} className="md:col-span-2" hint="Write only facts you can stand behind - no invented history or awards.">{(f) => <Textarea id={f.id} value={pub.home.storyBody} maxLength={600} onChange={(x) => up("home", { storyBody: x.target.value })} />}</Field>
          <Field label="Made-to-measure text" error={e("public.home.customBody")} className="md:col-span-2">{(f) => <Textarea id={f.id} value={pub.home.customBody} maxLength={400} onChange={(x) => up("home", { customBody: x.target.value })} />}</Field>
          <div className="md:col-span-2"><Checkbox checked={pub.home.showBestsellers} onChange={(x) => up("home", { showBestsellers: x.target.checked })} label="Show the bestsellers row" /></div>
          <fieldset className="md:col-span-2">
            <legend className="mb-1 text-sm font-medium">Featured pieces on the homepage (up to 12; none selected = products marked Featured)</legend>
            <div className="grid max-h-56 gap-1 overflow-auto rounded-md border border-line p-2 sm:grid-cols-2">
              {products.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#4a1020]" checked={pub.home.featuredProductIds.includes(p.id)} onChange={() => toggleFeatured(p.id)} />{p.name}</label>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-muted">{pub.home.featuredProductIds.length} selected</p>
          </fieldset>
        </div>
      </Card></div>

      <div id="delivery" className="scroll-mt-20"><Card title="Delivery and cash on delivery">
        <Alert tone="info" className="mb-4">These are demo defaults. Set the figures you actually charge; they are shown to customers before payment and drive the shipping policy text.</Alert>
        <div className="grid gap-4 md:grid-cols-3">
          <Money label="Free delivery from" value={pub.delivery.freeShippingThreshold} onChange={(v) => up("delivery", { freeShippingThreshold: v })} hint="0 = never free" />
          <Money label="Delhi NCR delivery charge" value={pub.delivery.ncrFlatRate} onChange={(v) => up("delivery", { ncrFlatRate: v })} />
          <Money label="Rest of India delivery charge" value={pub.delivery.restOfIndiaFlatRate} onChange={(v) => up("delivery", { restOfIndiaFlatRate: v })} />
          <Field label="Heavy surcharge above (grams)" error={e("public.delivery.heavyAboveGrams")}>{(f) => <Input id={f.id} type="number" min={0} value={pub.delivery.heavyAboveGrams} onChange={(x) => up("delivery", { heavyAboveGrams: Math.max(0, Math.round(Number(x.target.value) || 0)) })} />}</Field>
          <Money label="Surcharge per started kg" value={pub.delivery.heavySurchargePerKg} onChange={(v) => up("delivery", { heavySurchargePerKg: v })} />
          <div />
          <Field label="NCR estimate (days, min - max)" error={e("public.delivery.ncrDays")}>
            {(f) => (
              <div className="flex items-center gap-2"><Input id={f.id} type="number" min={1} value={pub.delivery.ncrDays[0]} onChange={(x) => up("delivery", { ncrDays: [Math.max(1, Number(x.target.value) || 1), pub.delivery.ncrDays[1]] })} /> - <Input aria-label="NCR maximum days" type="number" min={1} value={pub.delivery.ncrDays[1]} onChange={(x) => up("delivery", { ncrDays: [pub.delivery.ncrDays[0], Math.max(1, Number(x.target.value) || 1)] })} /></div>
            )}
          </Field>
          <Field label="Rest of India estimate (business days)" error={e("public.delivery.restDays")}>
            {(f) => (
              <div className="flex items-center gap-2"><Input id={f.id} type="number" min={1} value={pub.delivery.restDays[0]} onChange={(x) => up("delivery", { restDays: [Math.max(1, Number(x.target.value) || 1), pub.delivery.restDays[1]] })} /> - <Input aria-label="Rest of India maximum days" type="number" min={1} value={pub.delivery.restDays[1]} onChange={(x) => up("delivery", { restDays: [pub.delivery.restDays[0], Math.max(1, Number(x.target.value) || 1)] })} /></div>
            )}
          </Field>
          <div />
          <Field label="Unserviceable pincodes" hint="Comma or space separated" className="md:col-span-3" error={e("public.delivery.unserviceablePincodes")}>{(f) => <Textarea id={f.id} className="min-h-16" value={pub.delivery.unserviceablePincodes.join(", ")} onChange={(x) => up("delivery", { unserviceablePincodes: pins(x.target.value) })} />}</Field>
          <Field label="Pincodes where COD is not offered" className="md:col-span-3" error={e("public.delivery.codBlockedPincodes")}>{(f) => <Textarea id={f.id} className="min-h-16" value={pub.delivery.codBlockedPincodes.join(", ")} onChange={(x) => up("delivery", { codBlockedPincodes: pins(x.target.value) })} />}</Field>
        </div>
        <hr className="my-5 border-line" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex items-end pb-2"><Checkbox checked={pub.cod.enabled} onChange={(x) => setPub((p) => ({ ...p, cod: { ...p.cod, enabled: x.target.checked } }))} label="Offer cash on delivery" /></div>
          <Money label="COD maximum order value" value={pub.cod.maxOrderValue} onChange={(v) => setPub((p) => ({ ...p, cod: { ...p.cod, maxOrderValue: v } }))} />
          <Money label="COD handling fee" value={pub.cod.fee} onChange={(v) => setPub((p) => ({ ...p, cod: { ...p.cod, fee: v } }))} />
          <Field label="Stock hold while paying (minutes)" error={e("public.checkout.reservationMinutes")}>{(f) => <Input id={f.id} type="number" min={5} max={60} value={pub.checkout.reservationMinutes} onChange={(x) => setPub((p) => ({ ...p, checkout: { ...p.checkout, reservationMinutes: Math.round(Number(x.target.value) || 15) } }))} />}</Field>
          <Field label="Max payment attempts per order" error={e("public.checkout.maxPaymentAttempts")}>{(f) => <Input id={f.id} type="number" min={1} max={6} value={pub.checkout.maxPaymentAttempts} onChange={(x) => setPub((p) => ({ ...p, checkout: { ...p.checkout, maxPaymentAttempts: Math.round(Number(x.target.value) || 3) } }))} />}</Field>
          <Field label="Max quantity per line" error={e("public.checkout.maxQuantityPerLine")}>{(f) => <Input id={f.id} type="number" min={1} max={10} value={pub.checkout.maxQuantityPerLine} onChange={(x) => setPub((p) => ({ ...p, checkout: { ...p.checkout, maxQuantityPerLine: Math.round(Number(x.target.value) || 5) } }))} />}</Field>
        </div>
        <p className="mt-3 text-xs text-ink-muted">Free delivery currently starts at {formatINR(pub.delivery.freeShippingThreshold)}.</p>
      </Card></div>

      <div id="payments" className="scroll-mt-20"><Card title="Integration status (read-only)">
        <p className="mb-3 text-sm text-ink-muted">Secrets are never shown or stored here; they are set in the hosting environment (see docs/DEPLOYMENT.md). Mode: <strong>{status.mode}</strong> &middot; environment: <strong>{status.appEnv}</strong>{status.usingEmulators ? " (local emulators)" : ""}.</p>
        <ul className="divide-y divide-line">
          {status.items.map((i) => (
            <li key={i.key} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
              <div><p className="font-medium">{i.label}</p><p className="text-xs text-ink-muted">{i.detail}</p></div>
              <Badge tone={i.state === "configured" ? "success" : i.state === "simulated" ? "warning" : "error"}>{i.state === "configured" ? "Configured" : i.state === "simulated" ? "Simulated" : "Missing"}</Badge>
            </li>
          ))}
        </ul>
      </Card></div>

      <div id="notifications" className="scroll-mt-20"><Card title="Notifications and assistant">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Order alert email (staff)" error={e("private.notifications.orderAlertEmail")}>{(f) => <Input id={f.id} type="email" value={priv.notifications.orderAlertEmail ?? ""} onChange={(x) => setPriv((p) => ({ ...p, notifications: { ...p.notifications, orderAlertEmail: nullable(x.target.value) } }))} />}</Field>
          <Field label="Customer message channel" hint="Only Preview is available until a messaging provider is chosen.">
            {(f) => (
              <Select id={f.id} value={priv.notifications.channel} onChange={(x) => setPriv((p) => ({ ...p, notifications: { ...p.notifications, channel: x.target.value as PrivateSettings["notifications"]["channel"] } }))}>
                <option value="preview">Preview only (nothing is sent)</option>
                <option value="email" disabled>Email (provider not connected)</option>
                <option value="sms" disabled>SMS (provider not connected)</option>
                <option value="whatsapp" disabled>WhatsApp (provider not connected)</option>
              </Select>
            )}
          </Field>
          <div className="flex items-end pb-2"><Checkbox checked={priv.assistant.customerEnabled} onChange={(x) => setPriv((p) => ({ ...p, assistant: { ...p.assistant, customerEnabled: x.target.checked } }))} label="Enable the customer shopping assistant" /></div>
          <Field label="Keep assistant conversations (days)" error={e("private.assistant.retentionDays")}>{(f) => <Input id={f.id} type="number" min={1} max={730} value={priv.assistant.retentionDays} onChange={(x) => setPriv((p) => ({ ...p, assistant: { ...p.assistant, retentionDays: Math.round(Number(x.target.value) || 365) } }))} />}</Field>
          <Field label="Customer assistant daily message cap" error={e("private.assistant.dailyMessageCap")}>{(f) => <Input id={f.id} type="number" min={10} value={priv.assistant.dailyMessageCap} onChange={(x) => setPriv((p) => ({ ...p, assistant: { ...p.assistant, dailyMessageCap: Math.round(Number(x.target.value) || 2000) } }))} />}</Field>
        </div>
      </Card></div>

      <div id="social" className="scroll-mt-20"><Card title="Social links">
        <div className="grid gap-4 md:grid-cols-2">
          {(["instagram", "facebook", "youtube", "pinterest"] as const).map((k) => (
            <Field key={k} label={k[0]!.toUpperCase() + k.slice(1)} hint="Full https:// address, or empty to hide" error={e(`public.social.${k}`)}>
              {(f) => <Input id={f.id} type="url" value={pub.social[k] ?? ""} onChange={(x) => up("social", { [k]: nullable(x.target.value) } as Partial<PublicSettings["social"]>)} />}
            </Field>
          ))}
        </div>
      </Card></div>

      <div id="legal" className="scroll-mt-20"><Card title="Legal identity and policy numbers">
        <Alert tone="warning" className="mb-4">Never enter details you cannot verify. These feed the Terms, Privacy, Shipping and Refund pages and the invoice header. The documents are drafts until reviewed by a qualified professional.</Alert>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Legal business name" error={e("public.policy.legalName")}>{(f) => <Input id={f.id} value={pub.policy.legalName ?? ""} onChange={(x) => up("policy", { legalName: nullable(x.target.value) })} />}</Field>
          <Field label="GSTIN" error={e("public.policy.gstin")}>{(f) => <Input id={f.id} value={pub.policy.gstin ?? ""} onChange={(x) => up("policy", { gstin: nullable(x.target.value.toUpperCase()) })} />}</Field>
          <Field label="Registered address" className="md:col-span-2" error={e("public.policy.registeredAddress")}>{(f) => <Textarea id={f.id} className="min-h-16" value={pub.policy.registeredAddress ?? ""} onChange={(x) => up("policy", { registeredAddress: nullable(x.target.value) })} />}</Field>
          <Field label="Jurisdiction (city, state)" error={e("public.policy.jurisdictionCity")}>{(f) => <Input id={f.id} value={pub.policy.jurisdictionCity ?? ""} onChange={(x) => up("policy", { jurisdictionCity: nullable(x.target.value) })} />}</Field>
          <Field label="Policies last updated" error={e("public.policy.lastUpdated")}>{(f) => <Input id={f.id} type="date" value={pub.policy.lastUpdated} onChange={(x) => up("policy", { lastUpdated: x.target.value })} />}</Field>
          <Field label="Return window (days)" error={e("public.policy.returnWindowDays")}>{(f) => <Input id={f.id} type="number" min={0} max={60} value={pub.policy.returnWindowDays} onChange={(x) => up("policy", { returnWindowDays: Math.round(Number(x.target.value) || 0) })} />}</Field>
          <Field label="Damage report window (hours)" error={e("public.policy.damageReportHours")}>{(f) => <Input id={f.id} type="number" min={1} max={240} value={pub.policy.damageReportHours} onChange={(x) => up("policy", { damageReportHours: Math.round(Number(x.target.value) || 48) })} />}</Field>
          <Field label="Refund time - minimum business days" error={e("public.policy.refundBusinessDaysMin")}>{(f) => <Input id={f.id} type="number" min={1} max={30} value={pub.policy.refundBusinessDaysMin} onChange={(x) => up("policy", { refundBusinessDaysMin: Math.round(Number(x.target.value) || 1) })} />}</Field>
          <Field label="Refund time - maximum business days" error={e("public.policy.refundBusinessDaysMax")}>{(f) => <Input id={f.id} type="number" min={1} max={30} value={pub.policy.refundBusinessDaysMax} onChange={(x) => up("policy", { refundBusinessDaysMax: Math.round(Number(x.target.value) || 1) })} />}</Field>
        </div>
        <fieldset className="mt-5 rounded-md border border-line p-3">
          <legend className="px-1 text-sm font-medium">Grievance officer (required by the DPDP Act notice)</legend>
          <Checkbox checked={pub.policy.grievanceOfficer !== null} onChange={(x) => up("policy", { grievanceOfficer: x.target.checked ? { name: "", email: "", phone: "", address: "" } : null })} label="Add grievance officer details" />
          {pub.policy.grievanceOfficer && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {(["name", "email", "phone", "address"] as const).map((k) => (
                <Field key={k} label={k[0]!.toUpperCase() + k.slice(1)} error={e(`public.policy.grievanceOfficer.${k}`)}>
                  {(f) => <Input id={f.id} value={pub.policy.grievanceOfficer![k]} onChange={(x) => up("policy", { grievanceOfficer: { ...pub.policy.grievanceOfficer!, [k]: x.target.value } })} />}
                </Field>
              ))}
            </div>
          )}
        </fieldset>
      </Card></div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:left-56">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <span className="text-sm" role="status" aria-live="polite">{dirty ? <span className="text-warning">Unsaved changes</span> : <span className="text-ink-muted">All changes saved</span>}</span>
          <Button className="ml-auto" onClick={save} loading={busy} disabled={!dirty}>Save settings</Button>
        </div>
      </div>
    </div>
  );
}
