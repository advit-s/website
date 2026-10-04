import type { Metadata } from "next";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { ContactForm } from "@/components/storefront/contact-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Alert } from "@/components/ui/feedback";
import { getPublicSettings } from "@/server/repos/settings";
import { whatsappHref } from "@/lib/whatsapp";
import { isProduction } from "@/server/env";

export const metadata: Metadata = { title: "Contact us", description: "Message Raj Raani Collections about orders, sizing, styling or made-to-measure pieces." };
export const dynamic = "force-dynamic";

export default async function ContactPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await getPublicSettings();
  const st = s.store;
  const wa = whatsappHref(st.whatsappNumber, "Hello Raj Raani Collections, I have a question.");
  const waLive = wa.startsWith("http");
  const orderRef = sp.order && /^RRC-\d{4,8}$/i.test(sp.order) ? sp.order.toUpperCase() : undefined;
  const missing: string[] = [];
  if (!st.supportEmail) missing.push("support email");
  if (!st.phone) missing.push("phone");
  if (st.addressLines.length === 0) missing.push("store address");
  if (!st.hours) missing.push("opening hours");
  if (!st.whatsappNumber) missing.push("WhatsApp number");
  return (
    <div className="container-rr pb-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Contact" }]} />
      <header className="mb-8">
        <p className="t-eyebrow text-wine">Get in touch</p>
        <h1 className="t-h1 mt-1">Contact us</h1>
        <p className="mt-2 text-ink-muted">Have a question about an order, sizing or a made-to-measure piece? Send us a message.</p>
      </header>
      {!isProduction() && missing.length > 0 && (
        <Alert tone="warning" title="Owner setup needed" className="mb-8">
          The following are not configured yet and are hidden from customers: {missing.join(", ")}. Add them in Admin &gt; Settings &gt; Store information.
        </Alert>
      )}
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <section aria-labelledby="msg-h" className="border border-line bg-white p-6 sm:p-8">
          <h2 id="msg-h" className="t-eyebrow text-maroon">Send us a message</h2>
          <div className="mt-5">
            <ContactForm orderRef={orderRef} />
          </div>
        </section>
        <section aria-labelledby="store-h" className="space-y-5 border border-line bg-white p-6 sm:p-8">
          <h2 id="store-h" className="t-eyebrow text-maroon">Our store</h2>
          <ul className="space-y-4 text-sm">
            {st.addressLines.length > 0 && <li className="flex gap-3"><MapPin className="mt-0.5 size-5 shrink-0 text-wine" aria-hidden /><address className="not-italic">{st.addressLines.map((l) => <span key={l} className="block">{l}</span>)}</address></li>}
            {st.phone && <li className="flex gap-3"><Phone className="mt-0.5 size-5 shrink-0 text-wine" aria-hidden /><a href={`tel:${st.phone.replace(/\s/g, "")}`} className="hover:underline">{st.phone}</a></li>}
            {st.supportEmail && <li className="flex gap-3"><Mail className="mt-0.5 size-5 shrink-0 text-wine" aria-hidden /><a href={`mailto:${st.supportEmail}`} className="hover:underline">{st.supportEmail}</a></li>}
            {st.hours && <li className="flex gap-3"><Clock className="mt-0.5 size-5 shrink-0 text-wine" aria-hidden />{st.hours}</li>}
            {!st.addressLines.length && !st.phone && !st.supportEmail && !st.hours && <li className="text-ink-muted">Store contact details will appear here once the owner adds them. Use the form for now.</li>}
          </ul>
          <div id="whatsapp" className="scroll-mt-32 border-t border-line pt-5">
            {waLive ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[#1f6b3a] px-5 font-nav text-[0.8rem] uppercase tracking-[0.12em] text-white hover:bg-[#185530]">
                <MessageCircle className="size-5" aria-hidden /> WhatsApp us<span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              <Alert tone="info" title="WhatsApp is not connected yet">
                The store owner has not added a WhatsApp number, so there is no chat link to open. Please use the message form.
              </Alert>
            )}
            <p className="mt-2 text-xs text-ink-muted">Opening WhatsApp only prepares a message; nothing is sent until you press send.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
