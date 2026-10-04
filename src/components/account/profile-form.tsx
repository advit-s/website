"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";

export function ProfileForm({ fullName, email, phone }: { fullName: string; email: string | null; phone: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(fullName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const r = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: name }) });
        const d = await r.json().catch(() => ({}));
        setBusy(false);
        if (r.ok) {
          setMsg({ tone: "success", text: "Profile saved." });
          router.refresh();
        } else setMsg({ tone: "error", text: d?.error?.fields?.fullName ?? d?.error?.message ?? "Could not save." });
      }}
    >
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Field label="Full name" required>
        {(f) => <Input id={f.id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" hint="Sign-in details are managed by Firebase Authentication.">
          {(f) => <Input id={f.id} value={email ?? "Not set"} readOnly disabled />}
        </Field>
        <Field label="Mobile">{(f) => <Input id={f.id} value={phone ?? "Not set"} readOnly disabled />}</Field>
      </div>
      <Button type="submit" loading={busy} disabled={name.trim() === fullName}>
        Save changes
      </Button>
    </form>
  );
}
