import type { Metadata } from "next";
import Link from "next/link";
import { requireUserPage } from "@/server/auth/session";
import { getProfile } from "@/server/repos/users";
import { listUserOrders, countUserOrders } from "@/server/repos/orders";
import { listAddresses } from "@/server/repos/addresses";
import { ProfileForm } from "@/components/account/profile-form";
import { Badge } from "@/components/ui/feedback";
import { formatINR } from "@/domain/money";
import { STATUS_LABEL } from "@/domain/order-state";

export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUserPage("/account");
  const [profile, recent, total, addresses] = await Promise.all([getProfile(user.uid), listUserOrders(user.uid, "all", null, 3), countUserOrders(user.uid), listAddresses(user.uid)]);
  const df = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
  return (
    <div className="space-y-10">
      <header>
        <h1 className="t-h1">Hello{profile?.fullName ? `, ${profile.fullName.split(" ")[0]}` : ""}</h1>
        <p className="mt-1 text-ink-muted">Manage your details, orders and delivery addresses.</p>
      </header>

      <section aria-labelledby="short-h" className="grid gap-4 sm:grid-cols-3">
        <h2 id="short-h" className="sr-only">
          Shortcuts
        </h2>
        <Link href="/account/orders" className="border border-line bg-white p-5 hover:border-maroon">
          <p className="t-eyebrow text-wine">Orders</p>
          <p className="mt-1 font-serif text-3xl text-maroon">{total}</p>
          <p className="text-sm text-ink-muted">View and track</p>
        </Link>
        <Link href="/account/addresses" className="border border-line bg-white p-5 hover:border-maroon">
          <p className="t-eyebrow text-wine">Addresses</p>
          <p className="mt-1 font-serif text-3xl text-maroon">{addresses.length}</p>
          <p className="text-sm text-ink-muted">Saved for checkout</p>
        </Link>
        <Link href="/wishlist" className="border border-line bg-white p-5 hover:border-maroon">
          <p className="t-eyebrow text-wine">Wishlist</p>
          <p className="mt-1 font-serif text-3xl text-maroon">&rarr;</p>
          <p className="text-sm text-ink-muted">Pieces you saved</p>
        </Link>
      </section>

      <section aria-labelledby="recent-h">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="recent-h" className="t-h3">
            Recent orders
          </h2>
          {total > 0 && (
            <Link href="/account/orders" className="text-sm text-maroon underline underline-offset-4">
              View all
            </Link>
          )}
        </div>
        {recent.items.length === 0 ? (
          <p className="border border-line bg-white p-5 text-ink-muted">
            No orders yet.{" "}
            <Link href="/shop" className="text-maroon underline underline-offset-4">
              Start shopping
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-line border border-line bg-white">
            {recent.items.map((o) => (
              <li key={o.id}>
                <Link href={`/account/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-beige/30">
                  <span>
                    <span className="font-medium">{o.orderNumber}</span>
                    <span className="ml-2 text-sm text-ink-muted">{df.format(new Date(o.placedAt))}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <Badge tone={o.status === "delivered" ? "success" : o.status === "cancelled" ? "error" : "info"}>{STATUS_LABEL[o.status]}</Badge>
                    <span className="text-sm font-medium">{formatINR(o.pricing.total)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="prof-h" className="max-w-xl">
        <h2 id="prof-h" className="t-h3 mb-4">
          Profile &amp; settings
        </h2>
        <ProfileForm fullName={profile?.fullName ?? ""} email={profile?.email ?? user.email} phone={profile?.phone ?? user.phone} />
      </section>
    </div>
  );
}
