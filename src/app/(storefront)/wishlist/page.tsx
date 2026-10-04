import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { WishlistView } from "@/components/storefront/wishlist-view";

export const metadata: Metadata = { title: "Your wishlist", robots: { index: false, follow: true } };

export default function WishlistPage() {
  return (
    <div className="container-rr pb-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Wishlist" }]} />
      <h1 className="t-h1 mb-6">Your wishlist</h1>
      <WishlistView />
    </div>
  );
}
