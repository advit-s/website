"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { BarChart3, Boxes, ClipboardList, ExternalLink, Layers, LogOut, Menu, MessageSquare, Package, Settings, Users } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Wordmark } from "@/components/brand/wordmark";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: BarChart3, exact: true },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/inventory", label: "Inventory", icon: Boxes },
  { href: "/admin/categories", label: "Categories", icon: Layers },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/assistant", label: "Assistant", icon: MessageSquare },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="space-y-0.5">
      {NAV.map(({ href, label, icon: Icon, ...rest }) => {
        const exact = "exact" in rest;
        const active = exact ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={clsx("flex min-h-10 items-center gap-3 rounded-sm px-3 text-sm", active ? "bg-maroon text-white" : "text-charcoal hover:bg-beige/70")}
          >
            <Icon className="size-4 shrink-0" aria-hidden /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ user, simulated, children }: { user: string; simulated: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const signOut = async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  };
  return (
    <div className="admin-shell min-h-dvh font-sans text-[0.9rem]">
      <a href="#admin-main" className="skip-link">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white px-3 sm:px-5">
        <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="grid size-10 place-items-center text-maroon lg:hidden">
          <Menu className="size-5" aria-hidden />
        </button>
        <Link href="/admin" aria-label="Admin home">
          <Wordmark size="sm" />
        </Link>
        <span className="ml-1 hidden rounded-sm bg-beige px-2 py-0.5 text-xs font-semibold uppercase tracking-wider sm:inline">Admin</span>
        {simulated && <span className="hidden rounded-sm bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning md:inline">Simulated integrations</span>}
        <div className="ml-auto flex items-center gap-1 sm:gap-3">
          <Link href="/" target="_blank" className="hidden min-h-10 items-center gap-1.5 px-2 text-sm text-maroon hover:underline sm:inline-flex">
            View store <ExternalLink className="size-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </Link>
          <span className="hidden max-w-[12rem] truncate text-sm text-ink-muted md:inline">{user}</span>
          <button type="button" onClick={signOut} className="inline-flex min-h-10 items-center gap-1.5 px-2 text-sm text-charcoal hover:text-maroon">
            <LogOut className="size-4" aria-hidden /> <span className="hidden sm:inline">Sign out</span>
            <span className="sr-only sm:hidden">Sign out</span>
          </button>
        </div>
      </header>
      <div className="lg:grid lg:grid-cols-[14rem_1fr]">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] overflow-y-auto border-r border-line bg-white p-3 lg:block">
          <NavList />
        </aside>
        <Dialog open={open} onClose={() => setOpen(false)} title="Admin menu" variant="drawer-left">
          <NavList onNavigate={() => setOpen(false)} />
        </Dialog>
        <main id="admin-main" tabIndex={-1} className="min-w-0 p-4 outline-none sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Reusable admin building blocks */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="!font-sans text-2xl font-semibold tracking-tight text-charcoal">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className, action }: { title?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={clsx("rounded-md border border-line bg-white", className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="!font-sans text-sm font-semibold uppercase tracking-wide text-charcoal">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export const tableCls = {
  wrap: "overflow-x-auto rounded-md border border-line bg-white",
  table: "w-full min-w-[40rem] border-collapse text-left text-sm",
  th: "whitespace-nowrap text-left border-b border-line bg-beige/40 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted",
  td: "border-b border-line/70 px-3 py-2.5 align-middle",
};
