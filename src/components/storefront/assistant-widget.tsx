"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SimulationBadge } from "@/components/ui/feedback";
import { Media } from "@/components/ui/media";
import { formatINR } from "@/domain/money";

interface Msg {
  role: "user" | "assistant";
  text: string;
  products?: { name: string; slug: string; price: number; image: string | null }[];
  handoffUrl?: string | null;
  error?: boolean;
}

const KEY = "rr.assistant.session";
const newSession = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);

/** Customer shopping assistant. Read-only: it can suggest pieces and explain policies, and hands off to WhatsApp when unsure. */
export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const session = useRef<string>("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      session.current = sessionStorage.getItem(KEY) || (sessionStorage.setItem(KEY, newSession()), sessionStorage.getItem(KEY)!);
    } catch {
      session.current = newSession();
    }
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs, busy]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.current, message: q }) });
      const d = await r.json();
      if (!r.ok) setMsgs((m) => [...m, { role: "assistant", text: d?.error?.message ?? "Sorry, something went wrong.", error: true }]);
      else {
        setSimulated(Boolean(d.simulated));
        setMsgs((m) => [...m, { role: "assistant", text: d.reply, products: d.products, handoffUrl: d.handoffUrl }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "I couldn't reach the server. Please try again.", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 inline-flex min-h-12 items-center gap-2 rounded-full bg-maroon px-4 text-sm font-medium text-white shadow-lg hover:bg-wine max-lg:bottom-20 print:hidden"
        aria-haspopup="dialog"
      >
        <MessageCircle className="size-5" aria-hidden /> <span className="max-sm:sr-only">Ask our stylist</span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Shopping assistant" variant="drawer-right">
        <div className="flex h-full min-h-[60dvh] flex-col">
          <p className="mb-3 text-xs text-ink-muted">An AI assistant. It can suggest pieces and explain our policies, but it can make mistakes and cannot see your orders. Please don&apos;t share personal details here.</p>
          {simulated && <div className="mb-3"><SimulationBadge what="assistant" /></div>}
          <div className="flex-1 space-y-3 overflow-y-auto" role="log" aria-live="polite" aria-label="Conversation">
            {msgs.length === 0 && (
              <div className="space-y-2 text-sm">
                <p>Hello! Ask me about colours, budgets, sizing, delivery or returns. For example:</p>
                {["Maroon lehenga under 20000", "How long does delivery take?", "Can I return a lehenga?"].map((s) => (
                  <button key={s} type="button" onClick={() => setText(s)} className="block w-full border border-line bg-white px-3 py-2 text-left hover:border-maroon">{s}</button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <p className={`inline-block max-w-[92%] whitespace-pre-line rounded-md px-3 py-2 text-left text-sm ${m.role === "user" ? "bg-maroon text-white" : m.error ? "bg-error-bg text-error" : "bg-white border border-line"}`}>{m.text}</p>
                {m.products && m.products.length > 0 && (
                  <ul className="mt-2 grid grid-cols-2 gap-2 text-left">
                    {m.products.map((p) => (
                      <li key={p.slug}>
                        <Link href={`/product/${p.slug}`} onClick={() => setOpen(false)} className="block border border-line bg-white p-1.5 hover:border-maroon">
                          <Media src={p.image} alt="" ratio="4/5" sizes="120px" />
                          <span className="mt-1 block text-xs font-medium leading-snug">{p.name}</span>
                          <span className="text-xs text-ink-muted">{formatINR(p.price)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {m.handoffUrl && (
                  <a href={m.handoffUrl} {...(m.handoffUrl.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="mt-2 inline-flex min-h-10 items-center gap-2 border border-maroon px-3 text-sm text-maroon hover:bg-maroon hover:text-white">
                    <MessageCircle className="size-4" aria-hidden /> Continue on WhatsApp{m.handoffUrl.startsWith("http") ? <span className="sr-only"> (opens in a new tab)</span> : null}
                  </a>
                )}
              </div>
            ))}
            {busy && <p className="text-sm text-ink-muted" role="status">Thinking&hellip;</p>}
            <div ref={end} />
          </div>
          <form onSubmit={send} className="mt-3 flex gap-2 border-t border-line pt-3">
            <label htmlFor="assistant-input" className="sr-only">Your question</label>
            <input id="assistant-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Ask a question" autoComplete="off" className="min-h-11 flex-1 rounded-sm border border-taupe bg-white px-3 text-sm focus:border-maroon" />
            <Button type="submit" disabled={busy || !text.trim()} aria-label="Send">
              <Send className="size-4" aria-hidden />
            </Button>
          </form>
        </div>
      </Dialog>
    </>
  );
}
