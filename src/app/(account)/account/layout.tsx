import Link from "next/link";
import { StorefrontShell } from "@/components/layout/storefront-shell";
import { requireUserPage } from "@/server/auth/session";
import { AccountNav } from "@/components/account/account-nav";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // The middleware only does an early redirect; this is the authoritative check (verified, non-revoked cookie).
  const user = await requireUserPage("/account");
  return (
    <StorefrontShell>
      <div className="container-rr py-8">
        <div className="grid gap-8 md:grid-cols-[14rem_1fr] lg:gap-12">
          <aside aria-label="Account">
            <p className="t-eyebrow text-wine">My account</p>
            <p className="mt-1 truncate text-sm text-ink-muted">{user.name || user.email || user.phone}</p>
            <AccountNav isAdmin={user.isAdmin} />
            {user.isAdmin && (
              <Link href="/admin" className="mt-4 inline-block text-sm text-maroon underline underline-offset-4">
                Go to admin
              </Link>
            )}
          </aside>
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </StorefrontShell>
  );
}
