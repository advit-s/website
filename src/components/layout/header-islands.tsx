"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, Heart, Menu, Search, ShoppingBag } from "lucide-react";
import clsx from "clsx";
import { useCart } from "@/components/providers/cart";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function CartLink() {
  const { count, ready } = useCart();
  return (
    <Link href="/cart" aria-label={`Cart${ready ? `, ${count} item${count === 1 ? "" : "s"}` : ""}`} className="relative grid size-11 place-items-center text-maroon hover:text-wine">
      <ShoppingBag className="size-[1.3rem]" aria-hidden />
      {ready && count > 0 && (
        <span className="absolute right-1 top-1 grid min-w-[1.1rem] place-items-center rounded-full bg-maroon px-1 text-[0.65rem] font-semibold leading-[1.1rem] text-white">{count}</span>
      )}
    </Link>
  );
}

export function WishlistLink() {
  const { wishlist, wishlistReady } = useCart();
  return (
    <Link href="/wishlist" aria-label={`Wishlist${wishlistReady ? `, ${wishlist.size} item${wishlist.size === 1 ? "" : "s"}` : ""}`} className="relative hidden size-11 place-items-center text-maroon hover:text-wine sm:grid">
      <Heart className="size-[1.3rem]" aria-hidden />
      {wishlistReady && wishlist.size > 0 && (
        <span className="absolute right-1 top-1 grid min-w-[1.1rem] place-items-center rounded-full bg-maroon px-1 text-[0.65rem] font-semibold leading-[1.1rem] text-white">{wishlist.size}</span>
      )}
    </Link>
  );
}

export function SearchButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);
  return (
    <>
      <button type="button" aria-label="Search products" onClick={() => setOpen(true)} className="grid size-11 place-items-center text-maroon hover:text-wine">
        <Search className="size-[1.3rem]" aria-hidden />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Search">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const term = q.trim();
            setOpen(false);
            router.push(term ? `/shop?q=${encodeURIComponent(term)}` : "/shop");
          }}
          className="flex gap-2"
        >
          <label htmlFor="site-search" className="sr-only">
            Search lehengas, colours, fabrics
          </label>
          <Input ref={inputRef} id="site-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lehengas, colours, fabrics" maxLength={80} autoComplete="off" />
          <Button type="submit">Search</Button>
        </form>
        <p className="mt-3 text-xs text-ink-muted">Try &ldquo;maroon&rdquo;, &ldquo;silk&rdquo; or &ldquo;bridal&rdquo;.</p>
      </Dialog>
    </>
  );
}

export interface NavCategory {
  slug: string;
  name: string;
}

export function CollectionsMenu({ categories }: { categories: NavCategory[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={wrap} className="relative">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="inline-flex min-h-11 items-center gap-1 font-nav text-[0.8rem] tracking-wide text-charcoal hover:text-maroon">
        Collections
        <ChevronDown className={clsx("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <ul id={id} hidden={!open} className="absolute left-0 top-full z-40 mt-1 min-w-60 border border-line bg-ivory py-2 shadow-lg">
        {categories.map((c) => (
          <li key={c.slug}>
            <Link href={`/category/${c.slug}`} onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-charcoal hover:bg-beige/60 hover:text-maroon">
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="grid size-11 place-items-center text-maroon lg:hidden">
        <Menu className="size-6" aria-hidden />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Menu" variant="drawer-left">
        <div onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>{children}</div>
      </Dialog>
    </>
  );
}
