import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="container-rr py-24 text-center">
        <p className="t-eyebrow text-wine">Error 404</p>
        <h1 className="t-h1 mt-3">We could not find that page</h1>
        <p className="mx-auto mt-3 max-w-md text-ink-muted">The link may be old, or the piece may no longer be available. Try browsing the collection instead.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/shop">Shop all</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Back to home
          </ButtonLink>
        </div>
        <p className="mt-8 text-sm text-ink-muted">
          Need help? <Link href="/contact" className="text-maroon underline underline-offset-4">Contact us</Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
