"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/feedback";

const NEXT: Record<string, { to: "draft" | "published" | "archived"; label: string }[]> = {
  draft: [{ to: "published", label: "Publish" }, { to: "archived", label: "Archive" }],
  published: [{ to: "draft", label: "Unpublish" }, { to: "archived", label: "Archive" }],
  archived: [{ to: "draft", label: "Restore to draft" }],
};

export function StatusToggle({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go(to: string) {
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/admin/products/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: to }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(d?.error?.message ?? "Could not change status.");
    router.refresh();
  }
  return (
    <div className="space-y-1">
      <Badge tone={status === "published" ? "success" : status === "draft" ? "warning" : "neutral"}>{status}</Badge>
      <div className="flex flex-wrap gap-x-3">
        {(NEXT[status] ?? []).map((n) => (
          <button key={n.to} type="button" disabled={busy} onClick={() => go(n.to)} className="text-xs text-maroon underline underline-offset-4 disabled:opacity-50">
            {n.label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-xs text-error">{error}</p>}
    </div>
  );
}
