import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductPageData, toPublicVariants } from "@/server/repos/catalog";
import { getPublicSettings } from "@/server/repos/settings";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { PurchasePanel } from "@/components/storefront/purchase-panel";
import { CustomEnquiry } from "@/components/storefront/custom-enquiry";
import { ProductGrid } from "@/components/storefront/product-card";
import { Tabs } from "@/components/ui/tabs";
import { Badge, Alert } from "@/components/ui/feedback";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SIZE_GUIDE } from "@/config/size-guide";
import { shippingDoc, refundDoc } from "@/config/legal";
import { mediaUrl } from "@/lib/media";
import { whatsappHref } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getProductPageData((await params).slug);
  if (!data) return { title: "Product not found", robots: { index: false } };
  const { product: p } = data;
  return {
    title: p.seo.title || p.name,
    description: p.seo.description || p.description.slice(0, 155),
    alternates: { canonical: `/product/${p.slug}` },
    openGraph: { title: p.name, description: p.description.slice(0, 155), images: p.images[0] ? [{ url: mediaUrl(p.images[0].src) }] : undefined },
  };
}

function SizeGuideTable() {
  return (
    <div className="space-y-4">
      {SIZE_GUIDE.isPlaceholder && <Alert tone="warning" title="Draft measurements">These figures are a starting chart pending the owner&apos;s confirmation. If you are unsure, ask us on WhatsApp before ordering.</Alert>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] border-collapse text-sm">
          <caption className="sr-only">Body measurements in centimetres by size</caption>
          <thead>
            <tr className="bg-beige/60 text-left">
              {SIZE_GUIDE.columns.map((c) => (
                <th key={c} scope="col" className="border border-line px-3 py-2 font-medium">
                  {c}
                  {c !== "Size" && ` (${SIZE_GUIDE.unit})`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SIZE_GUIDE.rows.map((r) => (
              <tr key={r[0]}>
                {r.map((cell, i) =>
                  i === 0 ? (
                    <th key={i} scope="row" className="border border-line px-3 py-2 text-left font-medium">
                      {cell}
                    </th>
                  ) : (
                    <td key={i} className="border border-line px-3 py-2">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
        {SIZE_GUIDE.howToMeasure.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [data, settings] = await Promise.all([getProductPageData(slug), getPublicSettings()]);
  if (!data) notFound();
  const { product: p, category, variants, related } = data;
  const pv = toPublicVariants(p, variants);
  const images = [...p.images].sort((a, b) => a.order - b.order).map((i) => ({ src: i.src, alt: i.alt }));
  const ship = shippingDoc(settings);
  const refund = refundDoc(settings);
  const waConfigured = Boolean(settings.store.whatsappNumber);
  const wa = whatsappHref(settings.store.whatsappNumber, `Hello Raj Raani Collections, I have a question about ${p.name}.`);
  const lowest = pv.length ? Math.min(...pv.map((v) => v.price)) : p.price;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description,
    image: images.map((i) => new URL(mediaUrl(i.src), process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString()),
    sku: variants[0]?.sku,
    category: category?.name,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "INR",
      lowPrice: lowest / 100,
      highPrice: Math.max(...pv.map((v) => v.price), p.price) / 100,
      availability: p.availableUnits > 0 || p.enquiryOnly ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
    // No aggregateRating / review: reviews are deferred and never fabricated.
  };

  const tabs = [
    {
      id: "description",
      label: "Description",
      content: (
        <div className="max-w-3xl space-y-4">
          <p className="whitespace-pre-line">{p.description}</p>
          {p.setIncludes && (
            <p>
              <strong>Includes:</strong> {p.setIncludes}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "details",
      label: "Details",
      content: (
        <dl className="grid max-w-3xl gap-x-8 gap-y-3 sm:grid-cols-[10rem_1fr]">
          {p.fabric && (<><dt className="font-medium">Fabric</dt><dd>{p.fabric}</dd></>)}
          {p.workType && (<><dt className="font-medium">Work</dt><dd>{p.workType}</dd></>)}
          {p.weightGrams > 0 && (<><dt className="font-medium">Approx. weight</dt><dd>{(p.weightGrams / 1000).toFixed(1)} kg</dd></>)}
          {p.leadTimeDays != null && p.isCustomizable && (<><dt className="font-medium">Production time</dt><dd>About {p.leadTimeDays} days, in addition to delivery</dd></>)}
          {p.details.length > 0 && (
            <>
              <dt className="font-medium">Notes</dt>
              <dd>
                <ul className="list-disc space-y-1 pl-5">
                  {p.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </dd>
            </>
          )}
        </dl>
      ),
    },
    { id: "size", label: "Size guide", content: <div className="max-w-2xl"><SizeGuideTable /></div> },
    {
      id: "reviews",
      label: "Reviews",
      content: (
        <div className="max-w-xl space-y-2">
          <p className="font-medium">No reviews yet.</p>
          <p className="text-ink-muted">Customer reviews are not open yet. When they are, only genuine reviews from verified purchases will appear here. Questions about fit or fabric? <a href={wa} {...(wa.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="text-maroon underline underline-offset-4">Ask us on WhatsApp</a>.</p>
        </div>
      ),
    },
    {
      id: "shipping",
      label: "Shipping & returns",
      content: (
        <div className="max-w-3xl space-y-5">
          {[...ship.sections.slice(0, 3), ...refund.sections.slice(0, 3)].map((s) => (
            <div key={s.id}>
              <h3 className="font-sans text-base font-semibold">{s.title.replace(/^\d+\.\s*/, "")}</h3>
              {s.paragraphs.map((t) => (
                <p key={t} className="mt-1 text-ink-muted">{t}</p>
              ))}
            </div>
          ))}
          <p className="text-sm">
            Full details: <Link href="/shipping-policy" className="text-maroon underline underline-offset-4">Shipping policy</Link> &middot; <Link href="/refund-policy" className="text-maroon underline underline-offset-4">Returns &amp; refunds</Link>
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="container-rr pb-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Shop", href: "/shop" }, ...(category ? [{ label: category.name, href: `/category/${category.slug}` }] : []), { label: p.name }]} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
        <ProductGallery images={images} demo={p.isDemo} />
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            {p.isBestSeller && <Badge tone="maroon">Bestseller</Badge>}
            {p.isNewArrival && <Badge tone="gold">New</Badge>}
            {p.enquiryOnly && <Badge tone="info">Made to measure</Badge>}
            {p.isDemo && <Badge tone="warning">Demo product</Badge>}
          </div>
          <h1 className="t-h1 !text-[clamp(1.75rem,3.5vw,2.5rem)]">{p.name}</h1>
          {(p.fabric || p.workType) && <p className="mt-2 text-lg text-ink-muted">{[p.fabric, p.workType].filter(Boolean).join(" · ")}</p>}
          <div className="mt-5">
            <PurchasePanel
              product={{ id: p.id, name: p.name, price: p.price, compareAtPrice: p.compareAtPrice, isCustomizable: p.isCustomizable, enquiryOnly: p.enquiryOnly, leadTimeDays: p.leadTimeDays }}
              variants={pv}
              sizeGuide={<SizeGuideTable />}
              returnWindowDays={settings.policy.returnWindowDays}
              freeShippingThreshold={settings.delivery.freeShippingThreshold}
              codEnabled={settings.cod.enabled}
            />
          </div>
        </div>
      </div>

      {p.isCustomizable && (
        <section id="enquiry" aria-labelledby="enquiry-title" className="mt-14 border border-line bg-white p-6 sm:p-10">
          <h2 id="enquiry-title" className="t-h2">
            {p.enquiryOnly ? "Request a quote" : "Want it made to your measurements?"}
          </h2>
          <div className="mt-5 max-w-3xl">
            <CustomEnquiry productId={p.id} productName={p.name} leadTimeDays={p.leadTimeDays} whatsappConfigured={waConfigured} />
          </div>
        </section>
      )}

      <section className="mt-14" aria-label="Product information">
        <Tabs tabs={tabs} label="Product information" />
      </section>

      {related.length > 0 && (
        <section className="mt-16" aria-labelledby="related-title">
          <h2 id="related-title" className="t-h2 mb-7 text-center">
            You may also like
          </h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
