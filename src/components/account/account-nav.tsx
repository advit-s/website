"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useState } from "react";
import { LogOut } from "lucide-react";

const items = [
  { href: "/account", label: "Overview", exact: true },
  { href: "/account/orders", label: "My orders" },
  { href: "/account/addresses", label: "Saved addresses" },
  { href: "/wishlist", label: "Wishlist" },
];

export function AccountNav({ isAdmin: _isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <nav aria-label="Account sections" className="mt-4 flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {items.map((i) => {
        const active = i.exact ? path === i.href : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={clsx("flex min-h-11 shrink-0 items-center rounded-sm px-3 text-sm", active ? "bg-maroon text-white" : "text-charcoal hover:bg-beige/60")}>
            {i.label}
          </Link>
        );
      })}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" });
          try {
            window.localStorage.removeItem("rr.cart.v1");
          } catch {
            /* ignore */
          }
          router.replace("/");
          router.refresh();
        }}
        className="flex min-h-11 shrink-0 items-center gap-2 rounded-sm px-3 text-sm text-charcoal hover:bg-beige/60 disabled:opacity-50"
      >
        <LogOut className="size-4" aria-hidden /> Sign out
      </button>
    </nav>
  );
}
