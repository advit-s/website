import type { Metadata } from "next";
import { CartView } from "@/components/storefront/cart-view";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { getPublicSettings } from "@/server/repos/settings";

export const metadata: Metadata = { title: "Your shopping bag", robots: { index: false, follow: true } };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const s = await getPublicSettings();
  return (
    <div className="container-rr pb-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Cart" }]} />
      <header className="mb-8">
        <h1 className="t-h1">Your shopping bag</h1>
        <p className="mt-1 text-ink-muted">Prices, stock and delivery are re-checked by our server every time you change your bag.</p>
      </header>
      <CartView returnWindowDays={s.policy.returnWindowDays} />
    </div>
  );
}
