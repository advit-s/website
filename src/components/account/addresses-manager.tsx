"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { INDIAN_STATES } from "@/domain/validation";
import type { SavedAddress } from "@/domain/types";

const blank = { id: "", label: "Home", fullName: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", isDefault: false };

export function AddressesManager({ initial }: { initial: SavedAddress[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<typeof blank | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SavedAddress | null>(null);

  async function call(method: string, body: unknown) {
    const r = await fetch("/api/account/addresses", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setErrors({});
    setFormError(null);
    const { id, ...rest } = editing;
    const r = await call("POST", { ...(id ? { id } : {}), ...rest, country: "IN" });
    setBusy(false);
    if (!r.ok) {
      if (r.data?.error?.fields) setErrors(r.data.error.fields);
      else setFormError(r.data?.error?.message ?? "Could not save this address.");
      return;
    }
    setEditing(null);
    router.refresh();
  }

  const set = (k: keyof typeof blank, v: string | boolean) => setEditing((a) => (a ? { ...a, [k]: v } : a));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t-h1">Saved addresses</h1>
        <Button onClick={() => setEditing({ ...blank, isDefault: initial.length === 0 })}>
          <Plus className="size-4" aria-hidden /> Add address
        </Button>
      </div>
      {initial.length === 0 ? (
        <p className="border border-line bg-white p-6 text-ink-muted">You have no saved addresses yet. Add one to check out faster. Orders you have already placed keep the address they were sent to.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {initial.map((a) => (
            <li key={a.id} className="flex flex-col justify-between border border-line bg-white p-5">
              <div>
                <p className="flex items-center gap-2 font-medium">
                  {a.label}
                  {a.isDefault && (
                    <span className="inline-flex items-center gap-1 rounded-sm bg-rose px-2 py-0.5 text-xs text-maroon">
                      <Star className="size-3" aria-hidden /> Default
                    </span>
                  )}
                </p>
                <address className="mt-2 text-sm not-italic text-ink-muted">
                  {a.fullName}
                  <br />
                  {a.line1}
                  {a.line2 ? <><br />{a.line2}</> : null}
                  <br />
                  {a.city}, {a.state} {a.pincode}
                  <br />
                  {a.phone}
                </address>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
                <button type="button" className="min-h-9 text-sm text-maroon underline underline-offset-4" onClick={() => setEditing({ id: a.id, label: a.label, fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2, city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault })}>
                  Edit
                </button>
                {!a.isDefault && (
                  <button
                    type="button"
                    className="min-h-9 text-sm text-maroon underline underline-offset-4"
                    onClick={async () => {
                      await call("PATCH", { id: a.id, action: "default" });
                      router.refresh();
                    }}
                  >
                    Make default
                  </button>
                )}
                <button type="button" className="min-h-9 text-sm text-error underline underline-offset-4" onClick={() => setConfirmDelete(a)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? "Edit address" : "Add address"} size="lg">
        {editing && (
          <form onSubmit={save} noValidate className="space-y-4">
            {formError && <Alert tone="error">{formError}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Label" required error={errors.label}>{(f) => <Input id={f.id} value={editing.label} onChange={(e) => set("label", e.target.value)} maxLength={30} />}</Field>
              <Field label="Recipient name" required error={errors.fullName}>{(f) => <Input id={f.id} value={editing.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="name" />}</Field>
              <Field label="Phone" required error={errors.phone}>{(f) => <Input id={f.id} type="tel" value={editing.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" />}</Field>
              <Field label="Pincode" required error={errors.pincode}>{(f) => <Input id={f.id} inputMode="numeric" maxLength={6} value={editing.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} autoComplete="postal-code" />}</Field>
              <Field label="Address line 1" required error={errors.line1} className="sm:col-span-2">{(f) => <Input id={f.id} value={editing.line1} onChange={(e) => set("line1", e.target.value)} autoComplete="address-line1" />}</Field>
              <Field label="Address line 2" className="sm:col-span-2">{(f) => <Input id={f.id} value={editing.line2} onChange={(e) => set("line2", e.target.value)} autoComplete="address-line2" />}</Field>
              <Field label="City" required error={errors.city}>{(f) => <Input id={f.id} value={editing.city} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" />}</Field>
              <Field label="State" required error={errors.state}>
                {(f) => (
                  <Select id={f.id} value={editing.state} onChange={(e) => set("state", e.target.value)}>
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Checkbox checked={editing.isDefault} onChange={(e) => set("isDefault", e.target.checked)} label="Use as my default address" />
            <p className="text-xs text-ink-muted">Changing a saved address never changes orders you have already placed.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Save address
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Remove this address?" size="sm">
        <p className="text-sm text-ink-muted">{confirmDelete?.line1}, {confirmDelete?.city} will be removed from your saved addresses. Past orders are not affected.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
            Keep
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (confirmDelete) await call("DELETE", { id: confirmDelete.id });
              setConfirmDelete(null);
              router.refresh();
            }}
          >
            Remove
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
