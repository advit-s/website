import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Truck, RotateCcw, Banknote, MessageCircle } from "lucide-react";
import { getHomeData } from "@/server/repos/catalog";
import { getPublicSettings } from "@/server/repos/settings";
import { ProductGrid } from "@/components/storefront/product-card";
import { ButtonLink } from "@/components/ui/button";
import { Media } from "@/components/ui/media";
import { mediaUrl } from "@/lib/media";
import { formatINR } from "@/domain/money";
import { whatsappHref } from "@/lib/whatsapp";
import { isSimulated } from "@/server/env";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [home, s] = await Promise.all([getHomeData(), getPublicSettings()]);
  const wa = whatsappHref(s.store.whatsappNumber, "Hello Raj Raani Collections, I would like to enquire about a made-to-measure lehenga.");
  const waExternal = wa.startsWith("http");
  const policy = s.policy;

  return (
    <>
      {/* Hero */}
      <section aria-labelledby="hero-title" className="on-dark relative isolate overflow-hidden bg-maroon text-white">
        <Image src="/demo/hero.svg" alt={s.hero.imageAlt} fill priority unoptimized sizes="100vw" className="-z-10 object-cover object-[70%_center]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-maroon/85 via-maroon/45 to-transparent sm:from-maroon/70" />
        <div className="container-rr flex min-h-[26rem] items-center py-16 sm:min-h-[32rem] lg:min-h-[38rem]">
          <div className="max-w-xl rr-fade">
            <p className="t-eyebrow text-gold">{s.hero.eyebrow}</p>
            <h1 id="hero-title" className="t-display mt-4 !text-white">
              {s.hero.headline}
            </h1>
            <p className="mt-4 max-w-md font-serif text-xl text-white/90 sm:text-2xl">{s.hero.subhead}</p>
            <div className="mt-8">
              <ButtonLink href={s.hero.ctaHref} variant="gold" size="lg">
                {s.hero.ctaLabel} <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            </div>
          </div>
        </div>
        <span className="absolute bottom-3 right-4 rounded-sm bg-white/80 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-ink-muted">Demo illustration</span>
      </section>

      {/* Shop by category */}
      <section aria-labelledby="cat-title" className="container-rr py-14 sm:py-16">
        <h2 id="cat-title" className="sr-only">
          Shop by category
        </h2>
        <ul className="no-scrollbar -mx-4 flex gap-5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-y-8 sm:overflow-visible sm:px-0 lg:grid-cols-6">
          {home.categories.map((c) => (
            <li key={c.id} className="w-28 shrink-0 text-center sm:w-auto">
              <Link href={`/category/${c.slug}`} className="group block">
                <span className="relative mx-auto block aspect-[4/5] w-24 overflow-hidden rounded-[50%/42%] border border-gold/60 bg-beige sm:w-32 lg:w-36">
                  <Image src={mediaUrl(c.imageUrl)} alt="" fill unoptimized sizes="150px" className="object-cover object-top transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none" />
                </span>
                <span className="mt-3 block font-nav text-[0.78rem] tracking-wide text-charcoal group-hover:text-maroon">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Story band */}
      <section aria-labelledby="story-title" className="on-dark relative isolate overflow-hidden bg-maroon text-white">
        <Image src="/demo/story.svg" alt="" fill unoptimized sizes="100vw" className="-z-10 object-cover opacity-60" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-maroon via-maroon/80 to-maroon/20" />
        <div className="container-rr grid items-center gap-8 py-14 md:grid-cols-[1.2fr_1fr] md:py-20">
          <div className="max-w-xl">
            <h2 id="story-title" className="t-h1 !text-white">
              {s.home.storyHeading}
            </h2>
            <p className="mt-4 text-white/85">{s.home.storyBody}</p>
            <ButtonLink href="/about" variant="gold" className="mt-7">
              Our story <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
          <ul className="space-y-3 font-serif text-xl text-white/95 md:text-right md:text-2xl">
            <li>Heritage</li>
            <li>Craftsmanship</li>
            <li>Modern elegance</li>
          </ul>
        </div>
      </section>

      {/* Featured */}
      {home.featured.length > 0 && (
        <section aria-labelledby="feat-title" className="container-rr pt-16">
          <SectionHeading id="feat-title" title="Featured pieces" href="/shop?collection=featured" />
          <ProductGrid products={home.featured.slice(0, 8)} priorityCount={0} />
        </section>
      )}

      {/* Bestsellers */}
      {s.home.showBestsellers && home.bestsellers.length > 0 && (
        <section aria-labelledby="best-title" className="container-rr pt-16">
          <SectionHeading id="best-title" title="Our bestsellers" href="/shop?collection=bestsellers" />
          <ProductGrid products={home.bestsellers} />
        </section>
      )}

      {/* New arrivals */}
      {home.newArrivals.length > 0 && (
        <section aria-labelledby="new-title" className="container-rr pt-16">
          <SectionHeading id="new-title" title="New arrivals" href="/shop?collection=new" />
          <ProductGrid products={home.newArrivals} />
        </section>
      )}

      {/* Custom-made enquiry */}
      <section aria-labelledby="custom-title" className="container-rr pt-20">
        <div className="grid items-stretch overflow-hidden border border-line bg-rose md:grid-cols-2">
          <div className="flex flex-col justify-center gap-4 p-8 sm:p-12">
            <p className="t-eyebrow text-wine">Made to measure</p>
            <h2 id="custom-title" className="t-h1">
              {s.home.customHeading}
            </h2>
            <p className="text-ink-muted">{s.home.customBody}</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <ButtonLink href="/category/custom-made">Explore custom pieces</ButtonLink>
              <a
                href={wa}
                {...(waExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="inline-flex min-h-11 items-center gap-2 border border-maroon px-6 font-nav text-[0.78rem] font-medium uppercase tracking-[0.12em] text-maroon hover:bg-maroon hover:text-white"
              >
                <MessageCircle className="size-4" aria-hidden /> WhatsApp us
                {waExternal && <span className="sr-only"> (opens in a new tab)</span>}
              </a>
            </div>
            <p className="text-xs text-ink-muted">Nothing is charged until you have agreed a quote and lead time with us.</p>
          </div>
          <Media src="/demo/made-to-measure-bridal-lehenga-1.svg" alt="Demo illustration of a made-to-measure bridal lehenga" ratio="4/5" sizes="(min-width:768px) 50vw, 100vw" className="max-h-[34rem] md:aspect-auto md:h-full" demo />
        </div>
      </section>

      {/* Service assurances (all values come from policy settings) */}
      <section aria-label="Our promises" className="container-rr pt-20">
        <ul className="grid gap-6 border-y border-line py-8 sm:grid-cols-2 lg:grid-cols-4">
          <li className="flex items-start gap-3">
            <Truck className="mt-0.5 size-6 shrink-0 text-wine" aria-hidden />
            <div>
              <p className="font-medium">Delivery across India</p>
              <p className="text-sm text-ink-muted">Free delivery on orders above {formatINR(s.delivery.freeShippingThreshold)}.</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <RotateCcw className="mt-0.5 size-6 shrink-0 text-wine" aria-hidden />
            <div>
              <p className="font-medium">{policy.returnWindowDays}-day returns</p>
              <p className="text-sm text-ink-muted">On ready-to-ship pieces, unused with tags. <Link href="/refund-policy" className="underline underline-offset-4">Details</Link></p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <Banknote className="mt-0.5 size-6 shrink-0 text-wine" aria-hidden />
            <div>
              <p className="font-medium">{s.cod.enabled ? "Cash on delivery" : "Secure online payment"}</p>
              <p className="text-sm text-ink-muted">{s.cod.enabled ? `Available up to ${formatINR(s.cod.maxOrderValue)}, on eligible pincodes.` : "UPI, cards and netbanking via Razorpay."}</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <MessageCircle className="mt-0.5 size-6 shrink-0 text-wine" aria-hidden />
            <div>
              <p className="font-medium">Talk to a person</p>
              <p className="text-sm text-ink-muted">Fit and styling questions answered on WhatsApp.</p>
            </div>
          </li>
        </ul>
        {isSimulated() && <p className="mt-4 text-center text-xs text-ink-muted">Local demo: sample catalogue, illustrative images and simulated payments.</p>}
      </section>
    </>
  );
}

function SectionHeading({ id, title, href }: { id: string; title: string; href: string }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4 border-b border-line pb-3">
      <h2 id={id} className="t-h2">
        {title}
      </h2>
      <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap font-nav text-[0.78rem] uppercase tracking-[0.12em] text-maroon underline-offset-4 hover:underline">
        View all <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
