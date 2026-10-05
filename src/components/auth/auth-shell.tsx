import Image from "next/image";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";

/** Split-screen auth layout from the reference: editorial panel on the left, form on the right. */
export function AuthShell({ eyebrow, title, subtitle, children, panelLines }: { eyebrow: string; title: string; subtitle?: string; children: ReactNode; panelLines: string[] }) {
  return (
    <div className="container-rr py-6 sm:py-10">
      <div className="grid overflow-hidden border border-line bg-ivory shadow-sm lg:grid-cols-[1fr_1.1fr]">
        <aside className="on-dark relative isolate hidden min-h-[34rem] overflow-hidden bg-maroon text-white lg:block" aria-hidden>
          <Image src="/photos/hero.jpg" alt="" fill sizes="40vw" className="-z-10 object-cover object-[72%_center] opacity-90" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-maroon via-maroon/30 to-maroon/60" />
          <div className="flex h-full flex-col justify-between p-10">
            <div className="font-serif text-3xl leading-snug">
              {panelLines.map((l) => (
                <span key={l} className="block">
                  {l}
                </span>
              ))}
              <hr className="rule-gold mt-5 w-24" />
            </div>
            <div className="space-y-3">
              <Wordmark tone="light" size="md" />
              <p className="font-serif text-lg text-white/90">More than fashion, a timeless legacy.</p>
            </div>
          </div>
        </aside>
        <div className="px-5 py-10 sm:px-12 sm:py-14">
          <div className="mx-auto w-full max-w-md">
            <p className="t-eyebrow text-center text-wine">{eyebrow}</p>
            <hr className="rule-gold mx-auto my-4 w-28" />
            <h1 className="t-h1 text-center !text-[clamp(1.75rem,3.5vw,2.5rem)]">{title}</h1>
            {subtitle && <p className="mt-2 text-center text-ink-muted">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
