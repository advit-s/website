import type { Metadata } from "next";
import Image from "next/image";
import { Gem, Heart, Leaf, Flower2, PencilRuler, Scissors, Shirt, Sparkles, Truck, ShieldCheck, MessageCircle, RotateCcw } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Alert } from "@/components/ui/feedback";
import { getPublicSettings } from "@/server/repos/settings";
import { isProduction } from "@/server/env";

export const metadata: Metadata = { title: "About us", description: "The story, philosophy and craft behind Raj Raani Collections." };
export const dynamic = "force-dynamic";

const values = [
  { icon: Flower2, title: "Heritage first", text: "Silhouettes and motifs rooted in Indian occasion dressing." },
  { icon: Gem, title: "Considered quality", text: "Fabrics, linings and finishing chosen for how a piece wears across a long day." },
  { icon: Heart, title: "Inclusive elegance", text: "Sizes from XS to XXL, and made-to-measure for a fit that is truly yours." },
  { icon: Leaf, title: "Made with care", text: "Honest descriptions, with natural variation in hand work explained up front." },
];
const steps = [
  { icon: Sparkles, title: "Inspiration", text: "Drawn from India's textile and bridal traditions." },
  { icon: PencilRuler, title: "Design", text: "Silhouettes sketched with modern comfort in mind." },
  { icon: Shirt, title: "Material selection", text: "Fabrics, linings and trims chosen together." },
  { icon: Scissors, title: "Crafting", text: "Cutting, embroidery and finishing." },
  { icon: Gem, title: "The final piece", text: "Inspected and packed for you." },
];

export default async function AboutPage() {
  const s = await getPublicSettings();
  return (
    <>
      <section className="on-dark relative isolate overflow-hidden bg-maroon text-white" aria-labelledby="about-h">
        <Image src="/demo/hero.svg" alt="" fill unoptimized sizes="100vw" className="-z-10 object-cover object-[75%_center] opacity-80" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-maroon via-maroon/70 to-transparent" />
        <div className="container-rr py-16 sm:py-24">
          <p className="t-eyebrow text-gold">About us</p>
          <h1 id="about-h" className="t-display mt-3 max-w-2xl !text-white">More than fashion, a timeless legacy</h1>
          <p className="mt-4 max-w-lg text-lg text-white/90">At Raj Raani Collections we celebrate the grace of Indian couture, where tradition, artistry and modern elegance come together.</p>
        </div>
      </section>
      <div className="container-rr pt-4">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "About us" }]} />
        {!isProduction() && <Alert tone="warning" title="Owner content needed" className="mb-6">The story below is neutral placeholder copy. Replace it with the founders&apos; own words (Admin &gt; Settings &gt; Homepage). We do not invent business history, awards or numbers.</Alert>}
      </div>

      <section className="container-rr grid items-center gap-10 py-12 md:grid-cols-2" aria-labelledby="story-h">
        <div className="relative aspect-[4/3] overflow-hidden bg-beige">
          <Image src="/demo/story.svg" alt="Demo illustration of embroidered fabric" fill unoptimized sizes="(min-width:768px) 50vw, 100vw" className="object-cover" />
          <span className="absolute bottom-2 left-2 rounded-sm bg-white/85 px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-ink-muted">Demo illustration</span>
        </div>
        <div>
          <p className="t-eyebrow text-wine">Our story</p>
          <h2 id="story-h" className="t-h1 mt-2">{s.home.storyHeading}</h2>
          <p className="mt-4 text-ink-muted">{s.home.storyBody}</p>
          <ButtonLink href="/shop" className="mt-6">Explore the collection</ButtonLink>
        </div>
      </section>

      <section className="bg-rose py-14" aria-labelledby="phil-h">
        <div className="container-rr">
          <p className="t-eyebrow text-wine">Our philosophy</p>
          <h2 id="phil-h" className="t-h1 mt-2 max-w-xl">Tradition in every thread, elegance in every you</h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {values.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <Icon className="size-8 text-wine" aria-hidden />
                <h3 className="mt-3 font-sans text-base font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="craftsmanship" className="container-rr scroll-mt-28 py-14" aria-labelledby="craft-h">
        <p className="t-eyebrow text-wine">Craftsmanship</p>
        <h2 id="craft-h" className="t-h1 mt-2 max-w-2xl">Hand work, honestly described</h2>
        <p className="mt-4 max-w-2xl text-ink-muted">Embroidery such as zari, zardozi, thread work and mirror work is worked by hand, which is why no two pieces are identical. We describe each piece&apos;s fabric and work on its page and tell you plainly that small variation in sheen and placement is part of hand embroidery, not a defect.</p>
      </section>

      <section className="border-y border-line bg-white py-14" aria-labelledby="proc-h">
        <div className="container-rr">
          <p className="t-eyebrow text-center text-wine">Our design process</p>
          <h2 id="proc-h" className="t-h2 mt-2 text-center">From inspiration to creation</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-full border border-gold/70 text-wine"><Icon className="size-6" aria-hidden /></span>
                <h3 className="mt-3 font-sans text-base font-semibold">{i + 1}. {title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container-rr py-14" aria-labelledby="why-h">
        <p className="t-eyebrow text-wine">Why choose Raj Raani Collections</p>
        <h2 id="why-h" className="t-h1 mt-2">What you can rely on</h2>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <li className="flex gap-3"><Truck className="mt-1 size-6 shrink-0 text-wine" aria-hidden /><div><p className="font-medium">Delivery across India</p><p className="text-sm text-ink-muted">Tracked, with clear estimates before you pay.</p></div></li>
          <li className="flex gap-3"><ShieldCheck className="mt-1 size-6 shrink-0 text-wine" aria-hidden /><div><p className="font-medium">Secure payments</p><p className="text-sm text-ink-muted">Handled by Razorpay; cash on delivery where available.</p></div></li>
          <li className="flex gap-3"><RotateCcw className="mt-1 size-6 shrink-0 text-wine" aria-hidden /><div><p className="font-medium">{s.policy.returnWindowDays}-day returns</p><p className="text-sm text-ink-muted">On ready-to-ship pieces.</p></div></li>
          <li className="flex gap-3"><MessageCircle className="mt-1 size-6 shrink-0 text-wine" aria-hidden /><div><p className="font-medium">A person to talk to</p><p className="text-sm text-ink-muted">Fit and styling help before you buy.</p></div></li>
        </ul>
      </section>

      <section className="on-dark bg-maroon py-14 text-center text-white">
        <div className="container-rr">
          <h2 className="t-h1 !text-white">Be part of our story</h2>
          <p className="mx-auto mt-2 max-w-md text-white/85">Explore the latest collections and the timeless beauty of Indian couture.</p>
          <ButtonLink href="/shop" variant="gold" className="mt-6">Shop now</ButtonLink>
        </div>
      </section>
    </>
  );
}
