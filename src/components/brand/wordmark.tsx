import clsx from "clsx";

/**
 * Text-based RR wordmark (no raster logo has been supplied - see docs/ASSETS.md). The crown/monogram is drawn
 * in SVG so it stays sharp; replace with the owner's official logo file when provided.
 */
export function Wordmark({ tone = "dark", size = "md", className }: { tone?: "dark" | "light"; size?: "sm" | "md" | "lg"; className?: string }) {
  const c = tone === "dark" ? "text-maroon" : "text-white";
  const s = size === "lg" ? { mono: 56, t1: "text-xl", t2: "text-[0.6rem]" } : size === "sm" ? { mono: 34, t1: "text-sm", t2: "text-[0.5rem]" } : { mono: 44, t1: "text-base", t2: "text-[0.55rem]" };
  return (
    <span className={clsx("inline-flex items-center gap-3", c, className)}>
      <svg width={s.mono} height={s.mono} viewBox="0 0 48 48" aria-hidden fill="none" stroke="currentColor">
        <path d="M14 11l3.5 4L24 8l6.5 7 3.5-4-1.5 8h-17z" stroke="#d4af37" strokeWidth="1.6" strokeLinejoin="round" fill="none" />
        <text x="24" y="40" textAnchor="middle" fontFamily="var(--font-playfair), Georgia, serif" fontSize="26" fontWeight="500" fill="currentColor" stroke="none" letterSpacing="-2">
          RR
        </text>
      </svg>
      <span className="flex flex-col leading-none">
        <span className={clsx("font-nav font-medium tracking-[0.34em]", s.t1)}>RAJ RAANI</span>
        <span className={clsx("mt-1 font-nav tracking-[0.42em]", s.t2)}>COLLECTIONS</span>
      </span>
    </span>
  );
}
