"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import clsx from "clsx";

interface Toast {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
  action?: { label: string; href: string };
}

const Ctx = createContext<{ toast: (t: Omit<Toast, "id">) => void } | null>(null);

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used inside <ToastProvider>");
  return c.toast;
}

/** Polite live region; messages auto-dismiss after 6 s but can be closed (and pause is unnecessary: actions remain reachable on-page). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((p) => p.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setItems((p) => [...p.slice(-2), { ...t, id }]);
      setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" role="region" aria-label="Notifications" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end">
        {items.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-sm border bg-white px-4 py-3 text-sm shadow-lg rr-fade",
              t.tone === "success" && "border-success/40",
              t.tone === "error" && "border-error/50",
              t.tone === "info" && "border-line",
            )}
          >
            <p className="flex-1 text-charcoal">{t.message}</p>
            {t.action && (
              <Link href={t.action.href} className="shrink-0 font-nav text-xs font-semibold uppercase tracking-wider text-maroon underline underline-offset-4">
                {t.action.label}
              </Link>
            )}
            <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="grid size-8 shrink-0 place-items-center text-ink-muted hover:text-maroon">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
