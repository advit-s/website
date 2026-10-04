import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { getActiveCategories } from "@/server/repos/catalog";
import { getPublicSettings } from "@/server/repos/settings";
import { whatsappHref } from "@/lib/whatsapp";
import { FacebookIcon, InstagramIcon, PinterestIcon, WhatsAppIcon, YoutubeIcon } from "@/components/ui/brand-icons";

const h = "t-eyebrow text-gold";
const a = "block py-1.5 text-sm text-white/85 underline-offset-4 hover:text-white hover:underline";

export async function SiteFooter() {
  const [categories, s] = await Promise.all([getActiveCategories(), getPublicSettings()]);
  const wa = whatsappHref(s.store.whatsappNumber, "Hello Raj Raani Collections, I have a question.");
  const waExternal = wa.startsWith("http");
  const socials = [
    { href: s.social.instagram, label: "Instagram", Icon: InstagramIcon },
    { href: s.social.facebook, label: "Facebook", Icon: FacebookIcon },
    { href: s.social.youtube, label: "YouTube", Icon: YoutubeIcon },
    { href: s.social.pinterest, label: "Pinterest", Icon: PinterestIcon },
  ].filter((x): x is { href: string; label: string; Icon: typeof InstagramIcon } => Boolean(x.href));

  return (
    <footer className="on-dark mt-24 bg-maroon text-white">
      <div className="container-rr grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr]">
        <div className="space-y-4">
          <Wordmark tone="light" size="md" />
          <p className="max-w-xs text-sm text-white/80">{s.store.tagline}.</p>
          {s.store.hours && <p className="text-sm text-white/80">{s.store.hours}</p>}
        </div>
        <nav aria-label="Shop">
          <h2 className={h}>Shop</h2>
          <Link href="/shop" className={a}>
            All products
          </Link>
          <Link href="/shop?collection=new" className={a}>
            New arrivals
          </Link>
          {categories.slice(0, 5).map((c) => (
            <Link key={c.slug} href={`/category/${c.slug}`} className={a}>
              {c.name}
            </Link>
          ))}
        </nav>
        <nav aria-label="Help">
          <h2 className={h}>Help</h2>
          <Link href="/track-order" className={a}>
            Track order
          </Link>
          <Link href="/shipping-policy" className={a}>
            Shipping policy
          </Link>
          <Link href="/refund-policy" className={a}>
            Returns &amp; refunds
          </Link>
          <Link href="/faq" className={a}>
            FAQ
          </Link>
          <Link href="/contact" className={a}>
            Contact us
          </Link>
        </nav>
        <nav aria-label="About">
          <h2 className={h}>About</h2>
          <Link href="/about" className={a}>
            Our story
          </Link>
          <Link href="/about#craftsmanship" className={a}>
            Craftsmanship
          </Link>
          <Link href="/category/custom-made" className={a}>
            Made to measure
          </Link>
          <Link href="/terms" className={a}>
            Terms &amp; conditions
          </Link>
          <Link href="/privacy" className={a}>
            Privacy &amp; cookies
          </Link>
        </nav>
        <div className="space-y-3">
          <h2 className={h}>Talk to us</h2>
          <a href={wa} {...(waExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="inline-flex min-h-11 items-center gap-2 text-sm text-white hover:underline">
            <WhatsAppIcon /> Chat on WhatsApp
            <span className="sr-only">{waExternal ? " (opens in a new tab)" : ""}</span>
          </a>
          {s.store.supportEmail && (
            <p className="text-sm">
              <a href={`mailto:${s.store.supportEmail}`} className="underline underline-offset-4">
                {s.store.supportEmail}
              </a>
            </p>
          )}
          {s.store.phone && <p className="text-sm">{s.store.phone}</p>}
          {socials.length > 0 && (
            <ul className="flex gap-1 pt-2" aria-label="Social media">
              {socials.map(({ href, label, Icon }) => (
                <li key={label}>
                  <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} (opens in a new tab)`} className="grid size-11 place-items-center text-white/90 hover:text-gold">
                    <Icon />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="container-rr flex flex-col gap-2 py-5 text-xs text-white/75 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Raj Raani Collections. All rights reserved.</p>
          <p>We deliver within India only.</p>
        </div>
      </div>
    </footer>
  );
}
