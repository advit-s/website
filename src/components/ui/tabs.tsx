"use client";

import clsx from "clsx";
import { useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface TabDef {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * WAI-ARIA tabs: roving tabindex, arrow/Home/End navigation, automatic activation,
 * panels labelled by their tab. Inactive panels are hidden but stay in the DOM for SEO.
 */
export function Tabs({ tabs, initial, label, variant = "line" }: { tabs: TabDef[]; initial?: string; label: string; variant?: "line" | "pill" }) {
  const base = useId();
  const [active, setActive] = useState(initial && tabs.some((t) => t.id === initial) ? initial : tabs[0]!.id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (to: number) => {
    const t = tabs[(to + tabs.length) % tabs.length]!;
    setActive(t.id);
    refs.current[t.id]?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      move(i + 1);
    }
    else if (e.key === "ArrowLeft") {
      e.preventDefault();
      move(i - 1);
    }
    else if (e.key === "Home") {
      e.preventDefault();
      move(0);
    }
    else if (e.key === "End") {
      e.preventDefault();
      move(tabs.length - 1);
    }
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className={clsx("no-scrollbar flex overflow-x-auto", variant === "line" ? "border-b border-line gap-1 sm:gap-6" : "gap-2")}>
        {tabs.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              role="tab"
              type="button"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={clsx(
                "min-h-11 shrink-0 px-3 font-nav text-[0.78rem] uppercase tracking-[0.12em] transition-colors",
                variant === "line" && (selected ? "-mb-px border-b-2 border-maroon text-maroon" : "border-b-2 border-transparent text-ink-muted hover:text-maroon"),
                variant === "pill" && (selected ? "rounded-sm bg-maroon text-white" : "rounded-sm bg-beige/60 text-charcoal hover:bg-beige"),
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-panel-${t.id}`} aria-labelledby={`${base}-tab-${t.id}`} hidden={t.id !== active} tabIndex={0} className="pt-6 outline-offset-4">
          {t.content}
        </div>
      ))}
    </div>
  );
}
