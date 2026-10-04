import clsx from "clsx";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, FlaskConical } from "lucide-react";

type Tone = "info" | "success" | "warning" | "error";

const tones: Record<Tone, { box: string; Icon: typeof Info }> = {
  info: { box: "border-info/30 bg-info-bg text-info", Icon: Info },
  success: { box: "border-success/30 bg-success-bg text-success", Icon: CheckCircle2 },
  warning: { box: "border-warning/30 bg-warning-bg text-warning", Icon: AlertTriangle },
  error: { box: "border-error/30 bg-error-bg text-error", Icon: XCircle },
};

/** Status messages never rely on colour alone: every tone has an icon and text. */
export function Alert({ tone = "info", title, children, className }: { tone?: Tone; title?: string; children?: ReactNode; className?: string }) {
  const { box, Icon } = tones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={clsx("flex gap-3 rounded-sm border p-3.5 text-sm", box, className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-charcoal">{children}</div>}
      </div>
    </div>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: Tone | "neutral" | "maroon" | "gold"; children: ReactNode; className?: string }) {
  const map = {
    neutral: "bg-beige text-charcoal",
    maroon: "bg-maroon text-white",
    gold: "bg-gold-ink/10 text-gold-ink border border-gold-ink/30",
    info: "bg-info-bg text-info",
    success: "bg-success-bg text-success",
    warning: "bg-warning-bg text-warning",
    error: "bg-error-bg text-error",
  } as const;
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider", map[tone], className)}>
      {children}
    </span>
  );
}

/** Marks any surface driven by a local simulation instead of a live provider. */
export function SimulationBadge({ what, className }: { what: string; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-sm border border-warning/40 bg-warning-bg px-2 py-1 text-xs font-semibold text-warning", className)}>
      <FlaskConical className="size-3.5" aria-hidden />
      Simulated {what} - not live
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-sm bg-beige/70", className)} aria-hidden />;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-ink-muted">
      <span className="size-4 animate-spin rounded-full border-2 border-maroon border-t-transparent" aria-hidden />
      {label}
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <hr className="rule-gold mx-auto mb-6 w-24" />
      <h2 className="t-h3">{title}</h2>
      {children && <p className="mt-2 text-ink-muted">{children}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
