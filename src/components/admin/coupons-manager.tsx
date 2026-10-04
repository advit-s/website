"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "./admin-shell";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { formatINR } from "@/domain/money";

export interface CouponRow {
  code: string;
  type: "percent" | "fixed";
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  isActive: boolean;
  excludesCustom: boolean;
  description: string;
  startsAt: string | null;
  endsAt: string | null;
}

const blank = { code: "", type: "percent" as "percent" | "fixed", value: "10", min: "0", max: "", limit: "", per: "", active: true, excl: true, desc: "" };

export function CouponsManager({ coupons }: { coupons: CouponRow[] }) {
  const router = useRouter();
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(payload: Record<string, unknown>) {
    const r = await fetch("/api/admin/coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return { ok: r.ok, d: await r.json().catch(() => ({})) };
  }
  const num = (s: string) => (s.trim() === "" ? null : Math.round(Number(s) * 100));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const value = f.type === "percent" ? Math.round(Number(f.value)) : Math.round(Number(f.value) * 100);
    const { ok, d } = await post({
      code: f.code,
      type: f.type,
      value,
      minSubtotal: num(f.min) ?? 0,
      maxDiscount: f.type === "percent" ? num(f.max) : null,
      usageLimit: f.limit ? Math.round(Number(f.limit)) : null,
      perUserLimit: f.per ? Math.round(Number(f.per)) : null,
      isActive: f.active,
      excludesCustom: f.excl,
      description: f.desc,
    });
    setBusy(false);
    if (!ok) return setMsg({ tone: "error", text: d?.error?.fields ? Object.entries(d.error.fields as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join("; ") : (d?.error?.message ?? "Could not save the coupon.") });
    setMsg({ tone: "success", text: `Coupon ${f.code.toUpperCase()} saved.` });
    setF(blank);
    router.refresh();
  }

  async function toggle(c: CouponRow) {
    const { ok } = await post({ ...c, value: c.type === "percent" ? c.value / 100 : c.value, isActive: !c.isActive });
    if (ok) router.refresh();
  }

  return (
    <Card title="Coupons">
      <p className="mb-3 text-sm text-ink-muted">Discount rules are enforced by the server at checkout (dates, minimum spend, caps, usage limits). Used counts cannot be edited here.</p>
      {msg && <Alert tone={msg.tone} className="mb-3">{msg.text}</Alert>}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">Coupons</caption>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-muted"><th className="pb-2">Code</th><th className="pb-2">Discount</th><th className="pb-2">Rules</th><th className="pb-2">Used</th><th className="pb-2">Status</th></tr>
          </thead>
          <tbody>
            {coupons.length === 0 && <tr><td colSpan={5} className="py-2 text-ink-muted">No coupons yet.</td></tr>}
            {coupons.map((c) => (
              <tr key={c.code} className="border-t border-line/70 align-top">
                <td className="py-2 font-mono text-xs">{c.code}<div className="font-sans text-ink-muted">{c.description}</div></td>
                <td className="py-2">{c.type === "percent" ? `${c.value / 100}% off${c.maxDiscount ? ` (max ${formatINR(c.maxDiscount)})` : ""}` : `${formatINR(c.value)} off`}</td>
                <td className="py-2 text-xs text-ink-muted">Min spend {formatINR(c.minSubtotal)}{c.usageLimit ? `, ${c.usageLimit} uses` : ""}{c.perUserLimit ? `, ${c.perUserLimit} per customer` : ""}{c.excludesCustom ? ", not on made-to-order" : ""}</td>
                <td className="py-2">{c.usedCount}</td>
                <td className="py-2">
                  <button type="button" onClick={() => toggle(c)} className="text-left" aria-label={`${c.isActive ? "Deactivate" : "Activate"} ${c.code}`}>
                    <Badge tone={c.isActive ? "success" : "neutral"}>{c.isActive ? "Active - click to pause" : "Paused - click to activate"}</Badge>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={create} noValidate className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
        <Field label="Code">{(x) => <Input id={x.id} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} maxLength={30} placeholder="DIWALI10" />}</Field>
        <Field label="Type">
          {(x) => (
            <Select id={x.id} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as "percent" | "fixed" })}>
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed amount off</option>
            </Select>
          )}
        </Field>
        <Field label={f.type === "percent" ? "Percent (1-90)" : "Amount (INR)"}>{(x) => <Input id={x.id} type="number" min={1} step={f.type === "percent" ? 1 : 0.01} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />}</Field>
        <Field label="Minimum spend (INR)">{(x) => <Input id={x.id} type="number" min={0} value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} />}</Field>
        <Field label="Maximum discount (INR, percent only)">{(x) => <Input id={x.id} type="number" min={0} value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} disabled={f.type !== "percent"} />}</Field>
        <Field label="Total uses (blank = unlimited)">{(x) => <Input id={x.id} type="number" min={1} value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} />}</Field>
        <Field label="Uses per customer">{(x) => <Input id={x.id} type="number" min={1} value={f.per} onChange={(e) => setF({ ...f, per: e.target.value })} />}</Field>
        <Field label="Description" className="sm:col-span-2">{(x) => <Input id={x.id} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} maxLength={120} />}</Field>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-3">
          <Checkbox checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} label="Active" />
          <Checkbox checked={f.excl} onChange={(e) => setF({ ...f, excl: e.target.checked })} label="Not valid on made-to-order pieces" />
          <Button type="submit" className="ml-auto" loading={busy} disabled={!f.code}>Save coupon</Button>
        </div>
      </form>
    </Card>
  );
}
