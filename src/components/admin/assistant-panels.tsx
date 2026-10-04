"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, SimulationBadge } from "@/components/ui/feedback";
import { Checkbox, Field, Input } from "@/components/ui/field";

interface Turn {
  role: "user" | "assistant";
  text: string;
  tools?: string[];
  simulated?: boolean;
}

export function AdminChat({ mode }: { mode: "live" | "simulated" | "unconfigured" }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const conv = useRef(Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16));

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    setTurns((t) => [...t, { role: "user", text: q }]);
    setBusy(true);
    const r = await fetch("/api/admin/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: conv.current, message: q }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setTurns((t) => [...t, r.ok ? { role: "assistant", text: d.reply, tools: d.tools, simulated: d.simulated } : { role: "assistant", text: d?.error?.message ?? "Request failed.", simulated: false }]);
  }

  return (
    <div className="space-y-4">
      {mode === "simulated" && <div className="space-y-2"><SimulationBadge what="assistant" /><p className="text-sm text-ink-muted">No AI provider is connected, so answers come from a local rule-based responder that calls the same read-only tools. Try: &ldquo;revenue today&rdquo;, &ldquo;pending orders&rdquo;, &ldquo;low stock&rdquo;, or an order number.</p></div>}
      {mode === "unconfigured" && <Alert tone="warning" title="AI provider not configured">Set ANTHROPIC_API_KEY and ANTHROPIC_MODEL in the server environment (docs/OWNER_SETUP.md). Until then the assistant is unavailable.</Alert>}
      <Alert tone="info">Read-only. This assistant can look up orders, revenue and stock. It cannot refund, edit prices, cancel or delete anything - use the admin screens for that.</Alert>
      <div className="min-h-64 space-y-3 rounded-md border border-line bg-white p-4" role="log" aria-live="polite" aria-label="Conversation">
        {turns.length === 0 && <p className="text-sm text-ink-muted">Ask a question about your store.</p>}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "text-right" : ""}>
            <p className={`inline-block max-w-[90%] whitespace-pre-line rounded-md px-3 py-2 text-left text-sm ${t.role === "user" ? "bg-maroon text-white" : "border border-line bg-ivory"}`}>{t.text}</p>
            {t.tools && t.tools.length > 0 && <p className="mt-1 text-xs text-ink-muted">Looked up: {t.tools.join(", ")}</p>}
          </div>
        ))}
        {busy && <p className="text-sm text-ink-muted" role="status">Working&hellip;</p>}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <label htmlFor="admin-q" className="sr-only">Question</label>
        <Input id="admin-q" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="e.g. How much did we sell this week?" disabled={mode === "unconfigured"} />
        <Button type="submit" disabled={busy || !text.trim() || mode === "unconfigured"} aria-label="Send"><Send className="size-4" aria-hidden /></Button>
      </form>
    </div>
  );
}

export function AssistantSettings({ initial, mode }: { initial: { customerEnabled: boolean; retentionDays: number; dailyMessageCap: number }; mode: string }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await fetch("/api/admin/assistant/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
        const d = await r.json().catch(() => ({}));
        setBusy(false);
        setMsg(r.ok ? { tone: "success", text: "Saved." } : { tone: "error", text: d?.error?.fields ? Object.values(d.error.fields as Record<string, string>).join("; ") : (d?.error?.message ?? "Could not save.") });
      }}
    >
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <p className="text-sm text-ink-muted">Provider status: <strong>{mode === "live" ? "connected" : mode === "simulated" ? "simulated (no AI provider)" : "not configured"}</strong>. The model id and API key are set in the server environment, never here.</p>
      <Checkbox checked={s.customerEnabled} onChange={(e) => setS({ ...s, customerEnabled: e.target.checked })} label="Show the shopping assistant to customers" />
      <Field label="Keep conversations for (days)" hint="Shown to customers in the Privacy Policy. Automatic deletion is a scheduled job (docs/DEPLOYMENT.md).">
        {(f) => <Input id={f.id} type="number" min={1} max={730} value={s.retentionDays} onChange={(e) => setS({ ...s, retentionDays: Math.round(Number(e.target.value) || 365) })} />}
      </Field>
      <Field label="Daily message cap (all visitors)" hint="Hard limit that bounds AI spend.">
        {(f) => <Input id={f.id} type="number" min={10} value={s.dailyMessageCap} onChange={(e) => setS({ ...s, dailyMessageCap: Math.round(Number(e.target.value) || 2000) })} />}
      </Field>
      <Button type="submit" loading={busy}>Save</Button>
    </form>
  );
}
