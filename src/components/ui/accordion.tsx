"use client";

import clsx from "clsx";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";

export interface AccordionItem {
  id: string;
  question: string;
  answer: ReactNode;
}

/** Disclosure pattern: each header is a button with aria-expanded controlling a labelled region. Multiple may be open. */
export function Accordion({ items, defaultOpen = [] }: { items: AccordionItem[]; defaultOpen?: string[] }) {
  const base = useId();
  const [open, setOpen] = useState<Set<string>>(new Set(defaultOpen));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((it) => {
        const isOpen = open.has(it.id);
        return (
          <div key={it.id}>
            <h3 className="m-0">
              <button
                type="button"
                id={`${base}-h-${it.id}`}
                aria-expanded={isOpen}
                aria-controls={`${base}-p-${it.id}`}
                onClick={() => toggle(it.id)}
                className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left font-sans text-base font-medium text-charcoal hover:text-maroon"
              >
                {it.question}
                <Plus className={clsx("size-5 shrink-0 text-maroon transition-transform duration-200", isOpen && "rotate-45")} aria-hidden />
              </button>
            </h3>
            <div id={`${base}-p-${it.id}`} role="region" aria-labelledby={`${base}-h-${it.id}`} hidden={!isOpen} className="pb-5 pr-9 text-ink-muted">
              {it.answer}
            </div>
          </div>
        );
      })}
    </div>
  );
}
