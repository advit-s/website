import type { Metadata } from "next";
import { CheckoutView } from "@/components/storefront/checkout-view";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { getSession } from "@/server/auth/session";
import { getProfile } from "@/server/repos/users";
import { listAddresses } from "@/server/repos/addresses";
import { getPublicSettings } from "@/server/repos/settings";
import { isSimulated } from "@/server/env";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const [session, settings] = await Promise.all([getSession(), getPublicSettings()]);
  const [profile, addresses] = session ? await Promise.all([getProfile(session.uid), listAddresses(session.uid)]) : [null, []];
  return (
    <div className="container-rr pb-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Cart", href: "/cart" }, { label: "Checkout" }]} />
      <header className="mb-8 border-b border-line pb-6">
        <p className="t-eyebrow text-wine">Checkout</p>
        <h1 className="t-h1 mt-1">Complete your order</h1>
        <p className="mt-1 text-ink-muted">One page: contact, delivery, payment and review.</p>
      </header>
      <CheckoutView
        initial={{
          user: session ? { name: profile?.fullName || session.name || "", email: profile?.email || session.email || "", phone: profile?.phone || session.phone || "" } : null,
          addresses,
          codEnabled: settings.cod.enabled,
          simulated: isSimulated(),
          holdMinutes: settings.checkout.reservationMinutes,
        }}
      />
    </div>
  );
}
