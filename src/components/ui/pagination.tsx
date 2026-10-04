import Link from "next/link";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Server-rendered pagination preserving other query params via the `href(page)` callback. */
export function Pagination({ page, pages, href, label = "Pagination" }: { page: number; pages: number; href: (p: number) => string; label?: string }) {
  if (pages <= 1) return null;
  const nums = new Set<number>([1, pages, page, page - 1, page + 1, page - 2, page + 2].filter((n) => n >= 1 && n <= pages));
  const sorted = [...nums].sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1]! > 1) items.push("gap");
    items.push(n);
  });
  const cell = "grid size-11 place-items-center rounded-sm text-sm";
  return (
    <nav aria-label={label} className="mt-12 flex flex-wrap items-center justify-center gap-1">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" aria-label="Previous page" className={clsx(cell, "text-maroon hover:bg-beige/60")}>
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
      ) : (
        <span className={clsx(cell, "opacity-30")} aria-hidden>
          <ChevronLeft className="size-5" />
        </span>
      )}
      {items.map((n, i) =>
        n === "gap" ? (
          <span key={`g${i}`} className={clsx(cell, "text-ink-muted")} aria-hidden>
            &hellip;
          </span>
        ) : (
          <Link
            key={n}
            href={href(n)}
            aria-label={`Page ${n}`}
            aria-current={n === page ? "page" : undefined}
            className={clsx(cell, n === page ? "bg-maroon text-white" : "text-charcoal hover:bg-beige/60")}
          >
            {n}
          </Link>
        ),
      )}
      {page < pages ? (
        <Link href={href(page + 1)} rel="next" aria-label="Next page" className={clsx(cell, "text-maroon hover:bg-beige/60")}>
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      ) : (
        <span className={clsx(cell, "opacity-30")} aria-hidden>
          <ChevronRight className="size-5" />
        </span>
      )}
    </nav>
  );
}
