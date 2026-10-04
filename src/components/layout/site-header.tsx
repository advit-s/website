import Link from "next/link";
import { User } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { CartLink, CollectionsMenu, MobileNav, SearchButton, WishlistLink } from "./header-islands";
import { getActiveCategories } from "@/server/repos/catalog";
import { getPublicSettings } from "@/server/repos/settings";
import { getSession } from "@/server/auth/session";
import { whatsappHref } from "@/lib/whatsapp";
import { isSimulated } from "@/server/env";

const navLink = "inline-flex min-h-11 items-center font-nav text-[0.8rem] tracking-wide text-charcoal hover:text-maroon";

export async function SiteHeader() {
  const [categories, settings, session] = await Promise.all([getActiveCategories(), getPublicSettings(), getSession()]);
  const nav = categories.map((c) => ({ slug: c.slug, name: c.name }));
  const wa = whatsappHref(settings.store.whatsappNumber, "Hello Raj Raani Collections, I have a question.");
  const waExternal = wa.startsWith("http");

  return (
    <header className="sticky top-0 z-40 bg-ivory/95 backdrop-blur supports-[backdrop-filter]:bg-ivory/90">
      {/* Utility bar */}
      <div className="on-dark bg-maroon text-white">
        <div className="container-rr flex min-h-9 items-center justify-between gap-4 text-[0.72rem]">
          <p className="truncate">
            {settings.announcement.enabled ? (
              settings.announcement.href ? (
                <Link href={settings.announcement.href} className="underline-offset-4 hover:underline">
                  {settings.announcement.text}
                </Link>
              ) : (
                settings.announcement.text
              )
            ) : (
              "Easy returns · Cash on delivery available"
            )}
            {isSimulated() && <span className="ml-2 hidden rounded-sm bg-gold px-1.5 py-0.5 font-semibold text-maroon sm:inline">LOCAL DEMO</span>}
          </p>
          <nav aria-label="Utility" className="flex shrink-0 items-center gap-4">
            <Link href="/track-order" className="hidden hover:underline sm:inline">
              Track order
            </Link>
            <a href={wa} {...(waExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="hover:underline">
              WhatsApp<span className="sr-only">{waExternal ? " (opens in a new tab)" : " - set up on the contact page"}</span>
            </a>
            {session ? (
              <Link href={session.isAdmin ? "/admin" : "/account"} className="hover:underline">
                {session.isAdmin ? "Admin" : "My account"}
              </Link>
            ) : (
              <Link href="/login" className="hover:underline">
                Login / Register
              </Link>
            )}
          </nav>
        </div>
      </div>

      <div className="border-b border-line">
        <div className="container-rr flex h-[4.25rem] items-center justify-between gap-2 lg:h-[4.75rem]">
          <div className="flex items-center gap-1 lg:hidden">
            <MobileNav>
              <nav aria-label="Mobile" className="space-y-1 font-nav text-sm">
                <Link href="/shop" className="block py-3">
                  Shop all
                </Link>
                <Link href="/shop?collection=new" className="block py-3">
                  New arrivals
                </Link>
                <p className="t-eyebrow pt-4 text-ink-muted">Collections</p>
                {nav.map((c) => (
                  <Link key={c.slug} href={`/category/${c.slug}`} className="block py-2.5 pl-3 font-sans text-[0.95rem] text-charcoal">
                    {c.name}
                  </Link>
                ))}
                <hr className="my-3 border-line" />
                <Link href="/about" className="block py-3">
                  About us
                </Link>
                <Link href="/contact" className="block py-3">
                  Contact
                </Link>
                <Link href="/faq" className="block py-3">
                  FAQ
                </Link>
                <Link href="/track-order" className="block py-3">
                  Track order
                </Link>
                <Link href="/wishlist" className="block py-3">
                  Wishlist
                </Link>
                <Link href={session ? (session.isAdmin ? "/admin" : "/account") : "/login"} className="block py-3 text-maroon">
                  {session ? "My account" : "Login / Register"}
                </Link>
              </nav>
            </MobileNav>
          </div>

          <Link href="/" aria-label="Raj Raani Collections - home" className="shrink-0">
            <Wordmark size="md" className="[&>span:last-child]:max-[380px]:hidden" />
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
            <Link href="/" className={navLink}>
              Home
            </Link>
            <Link href="/shop" className={navLink}>
              Shop
            </Link>
            <Link href="/shop?collection=new" className={navLink}>
              New arrivals
            </Link>
            <CollectionsMenu categories={nav} />
            <Link href="/about" className={navLink}>
              About us
            </Link>
            <Link href="/contact" className={navLink}>
              Contact
            </Link>
          </nav>

          <div className="flex items-center">
            <SearchButton />
            <WishlistLink />
            <Link href={session ? "/account" : "/login"} aria-label={session ? "My account" : "Login"} className="hidden size-11 place-items-center text-maroon hover:text-wine sm:grid">
              <User className="size-[1.3rem]" aria-hidden />
            </Link>
            <CartLink />
          </div>
        </div>
      </div>
    </header>
  );
}
