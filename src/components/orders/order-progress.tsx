import clsx from "clsx";
import { Check, X } from "lucide-react";
import type { FulfilmentStatus } from "@/domain/types";

const STEPS: { id: FulfilmentStatus; label: string }[] = [
  { id: "new", label: "Placed" },
  { id: "confirmed", label: "Confirmed" },
  { id: "processing", label: "Processing" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
];
const RANK: Record<FulfilmentStatus, number> = { new: 0, confirmed: 1, processing: 2, shipped: 3, out_for_delivery: 3, delivered: 4, cancelled: -1 };

/** Stepper driven by the single fulfilment status. "Out for delivery" is a sub-state of Shipped. */
export function OrderProgress({ status }: { status: FulfilmentStatus }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-3 rounded-sm border border-error/30 bg-error-bg p-3 text-error" role="status">
        <X className="size-5" aria-hidden /> <span className="font-medium">This order was cancelled.</span>
      </div>
    );
  }
  const at = RANK[status];
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Order progress">
      {STEPS.map((s, i) => {
        const done = i < at || status === "delivered";
        const current = i === at && status !== "delivered";
        const label = s.id === "shipped" && status === "out_for_delivery" ? "Out for delivery" : s.label;
        return (
          <li key={s.id} className="relative flex flex-col items-center text-center" aria-current={current ? "step" : undefined}>
            {i > 0 && <span aria-hidden className={clsx("absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2", i <= at ? "bg-maroon" : "bg-line")} />}
            <span className={clsx("relative z-10 grid size-8 place-items-center rounded-full border-2 text-xs", done ? "border-maroon bg-maroon text-white" : current ? "border-maroon bg-ivory text-maroon" : "border-line bg-ivory text-ink-muted")}>
              {done ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className={clsx("mt-1.5 text-[0.7rem] leading-tight sm:text-xs", done || current ? "font-medium text-charcoal" : "text-ink-muted")}>
              {label}
              <span className="sr-only">{done ? " (completed)" : current ? " (current)" : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function UpdatesList({ events }: { events: { label: string; detail?: string | null; at: string }[] }) {
  if (!events.length) return null;
  const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  return (
    <ol className="space-y-3 border-l-2 border-line pl-4">
      {[...events].reverse().map((e, i) => (
        <li key={i} className="relative">
          <span aria-hidden className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-maroon" />
          <p className="text-sm font-medium">{e.label}</p>
          {e.detail && <p className="text-sm text-ink-muted">{e.detail}</p>}
          <p className="text-xs text-ink-muted">{fmt.format(new Date(e.at))} IST</p>
        </li>
      ))}
    </ol>
  );
}
