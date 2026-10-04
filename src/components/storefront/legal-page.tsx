import { Alert } from "@/components/ui/feedback";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import type { LegalDoc } from "@/config/legal";

/** Readable long-form document. Shows a DRAFT banner outside production and lists unresolved owner details. */
export function LegalPage({ doc, updated }: { doc: LegalDoc; updated: string }) {
  const draft = process.env.APP_ENV !== "production";
  return (
    <div className="container-rr pb-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: doc.title }]} />
      <div className="mx-auto max-w-3xl">
        <h1 className="t-h1">{doc.title}</h1>
        <p className="mt-2 text-sm text-ink-muted">Last updated {updated}</p>
        {draft && (
          <Alert tone="warning" title="Draft - not yet reviewed" className="mt-6">
            This text is a draft based on the project templates. It must be reviewed by a qualified professional and completed with the owner&apos;s business details before launch.
            {doc.unresolved.length > 0 && (
              <>
                {" "}
                Still missing: {doc.unresolved.join("; ")}.
              </>
            )}
          </Alert>
        )}
        <p className="mt-8 text-lg">{doc.intro}</p>
        <nav aria-label="On this page" className="mt-8 border-y border-line py-4">
          <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="inline-flex min-h-9 items-center text-maroon underline-offset-4 hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-8 space-y-10">
          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-32">
              <h2 id={`${s.id}-h`} className="t-h3">
                {s.title}
              </h2>
              <div className="mt-3 space-y-3 text-charcoal">
                {s.paragraphs.map((p, i) => (
                  <p key={i} className={p.includes("to be provided by the owner]") ? "rounded-sm bg-warning-bg px-2 py-1" : undefined}>
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
