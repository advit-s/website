"use client";

import clsx from "clsx";
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** "drawer-left" | "drawer-right" slide in from a side (mobile filters, nav); "modal" is centred. */
  variant?: "modal" | "drawer-left" | "drawer-right";
  size?: "sm" | "md" | "lg";
}

/**
 * Built on the native <dialog> element: showModal() gives a real focus trap, inert background, Escape to close
 * and focus restoration to the opener. We add a labelled title, a close button and backdrop-click dismissal.
 */
export function Dialog({ open, onClose, title, children, variant = "modal", size = "md" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={clsx(
        "m-0 border-0 bg-ivory p-0 text-charcoal backdrop:bg-charcoal/55 [&:not([open])]:hidden",
        variant === "modal" && clsx("m-auto max-h-[90dvh] w-[calc(100%-2rem)] rounded-md shadow-2xl", size === "sm" && "max-w-md", size === "md" && "max-w-xl", size === "lg" && "max-w-3xl"),
        variant === "drawer-left" && "fixed inset-y-0 left-0 h-dvh max-h-none w-[min(22rem,92vw)]",
        variant === "drawer-right" && "fixed inset-y-0 right-0 left-auto h-dvh max-h-none w-[min(26rem,94vw)]",
      )}
    >
      <div className="flex max-h-[inherit] min-h-0 flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="t-h3 !text-xl">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 place-items-center rounded-sm text-maroon hover:bg-beige/60">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </dialog>
  );
}
