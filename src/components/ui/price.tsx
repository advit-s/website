import clsx from "clsx";
import { formatINR, percentOff, type Paise } from "@/domain/money";

export function Price({ price, compareAt, size = "md", from }: { price: Paise; compareAt?: Paise | null; size?: "sm" | "md" | "lg"; from?: boolean }) {
  const off = percentOff(price, compareAt);
  return (
    <p className={clsx("flex flex-wrap items-baseline gap-x-2 gap-y-0.5", size === "lg" ? "text-2xl" : size === "md" ? "text-base" : "text-sm")}>
      {from && <span className="text-xs uppercase tracking-wider text-ink-muted">From</span>}
      <span className={clsx("font-semibold text-charcoal", size === "lg" && "font-serif text-3xl text-maroon")}>{formatINR(price)}</span>
      {off > 0 && compareAt != null && (
        <>
          <s className="text-ink-muted" aria-label={`Original price ${formatINR(compareAt)}`}>
            {formatINR(compareAt)}
          </s>
          <span className="text-xs font-semibold uppercase tracking-wider text-success">{off}% off</span>
        </>
      )}
    </p>
  );
}
