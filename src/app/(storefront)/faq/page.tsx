import type { Metadata } from "next";
import Link from "next/link";
import { Accordion } from "@/components/ui/accordion";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { getPublicSettings } from "@/server/repos/settings";
import { faqGroups } from "@/config/faq";

export const metadata: Metadata = { title: "Frequently asked questions", description: "Answers about orders, payments, shipping, returns, sizing, customisation, cash on delivery and care." };
export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const groups = faqGroups(await getPublicSettings());
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: groups.flatMap((g) => g.items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } }))),
  };
  return (
    <div className="container-rr pb-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "FAQ" }]} />
      <div className="mx-auto max-w-3xl">
        <h1 className="t-h1">Frequently asked questions</h1>
        <p className="mt-2 text-ink-muted">Can&apos;t find your answer? <Link href="/contact" className="text-maroon underline underline-offset-4">Contact us</Link>.</p>
        <nav aria-label="Topics" className="mt-6 flex flex-wrap gap-2">
          {groups.map((g) => (
            <a key={g.id} href={`#${g.id}`} className="inline-flex min-h-10 items-center rounded-sm border border-line bg-white px-3 text-sm hover:border-maroon">
              {g.title}
            </a>
          ))}
        </nav>
        <div className="mt-8 space-y-12">
          {groups.map((g) => (
            <section key={g.id} id={g.id} aria-labelledby={`${g.id}-h`} className="scroll-mt-32">
              <h2 id={`${g.id}-h`} className="t-h2 mb-3">
                {g.title}
              </h2>
              <Accordion items={g.items.map((i) => ({ id: i.id, question: i.q, answer: <p>{i.a}</p> }))} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
