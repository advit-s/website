"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash2, ShoppingBag } from "lucide-react";
import { useCart } from "@/components/providers/cart";
import { useToast } from "@/components/providers/toast";
import { Media } from "@/components/ui/media";
import { Price } from "@/components/ui/price";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import type { ListingProduct } from "@/domain/catalog";

export interface WishVariant {
  id: string;
  productId: string;
  size: string;
  color: string;
  available: number;
}

/** Wishlist grid. The catalogue (public DTOs) comes from the server; which items are saved comes from the cart provider (guest storage or account). */
export function WishlistView() {
  const { wishlist, wishlistReady, toggleWishlist, add, isAuthed } = useCart();
  const [products, setProducts] = useState<ListingProduct[]>([]);
  const [variants, setVariants] = useState<WishVariant[]>([]);
  const idsKey = [...wishlist].sort().join(",");
  useEffect(() => {
    if (!wishlistReady) return;
    if (!idsKey) {
      setProducts([]);
      return;
    }
    let live = true;
    fetch(`/api/catalog/by-ids?ids=${encodeURIComponent(idsKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d) {
          setProducts(d.products);
          setVariants(d.variants);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [idsKey, wishlistReady]);
  const toast = useToast();
  const [picking, setPicking] = useState<ListingProduct | null>(null);
  const [choice, setChoice] = useState("");
  useEffect(() => setChoice(""), [picking]);

  if (!wishlistReady) return <Skeleton className="h-64 w-full" />;
  const saved = products.filter((p) => wishlist.has(p.id));

  return (
    <div className="space-y-6">
      {!isAuthed && (
        <Alert tone="info" title="Sign in to keep your wishlist">
          Your wishlist is saved on this device only.{" "}
          <Link href="/login?next=/wishlist" className="underline underline-offset-4">
            Sign in
          </Link>{" "}
          or{" "}
          <Link href="/register?next=/wishlist" className="underline underline-offset-4">
            create an account
          </Link>{" "}
          to save it, and your bag will come with you.
        </Alert>
      )}
      <p className="text-sm text-ink-muted" role="status">
        {saved.length} {saved.length === 1 ? "item" : "items"} saved
      </p>
      {saved.length === 0 ? (
        <EmptyState title="Your wishlist is empty" action={<ButtonLink href="/shop">Browse the collection</ButtonLink>}>
          Tap the heart on any piece to save it here.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {saved.map((p) => (
            <li key={p.id}>
              <Link href={`/product/${p.slug}`} className="block">
                <Media src={p.image?.src} alt={p.name} ratio="4/5" />
              </Link>
              <h3 className="mt-3 font-sans text-[0.95rem] font-medium leading-snug">
                <Link href={`/product/${p.slug}`} className="hover:text-maroon hover:underline">
                  {p.name}
                </Link>
              </h3>
              <Price price={p.price} compareAt={p.compareAtPrice} size="sm" from={p.enquiryOnly} />
              <div className="mt-3 flex gap-2">
                {p.enquiryOnly ? (
                  <ButtonLink href={`/product/${p.slug}#enquiry`} size="sm" className="flex-1">
                    Enquire
                  </ButtonLink>
                ) : (
                  <Button size="sm" className="flex-1" onClick={() => setPicking(p)} disabled={p.availableUnits <= 0}>
                    <ShoppingBag className="size-4" aria-hidden /> {p.availableUnits <= 0 ? "Sold out" : "Move to bag"}
                  </Button>
                )}
                <button type="button" aria-label={`Remove ${p.name} from wishlist`} onClick={() => toggleWishlist(p.id)} className="grid size-9 place-items-center border border-line text-ink-muted hover:border-error hover:text-error">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={picking !== null} onClose={() => setPicking(null)} title="Choose size and colour" size="sm">
        {picking && (
          <div className="space-y-4">
            <p className="text-sm">{picking.name}</p>
            <div role="radiogroup" aria-label="Variant" className="grid gap-2">
              {variants
                .filter((v) => v.productId === picking.id)
                .map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={choice === v.id}
                    disabled={v.available <= 0}
                    onClick={() => setChoice(v.id)}
                    className={`flex min-h-11 items-center justify-between border px-4 text-sm ${choice === v.id ? "border-maroon bg-maroon text-white" : "border-line bg-white hover:border-maroon"} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <span>
                      {v.size} &middot; {v.color}
                    </span>
                    <span>{v.available <= 0 ? "Sold out" : v.available <= 3 ? `Only ${v.available} left` : ""}</span>
                  </button>
                ))}
            </div>
            <Button
              className="w-full"
              disabled={!choice}
              onClick={async () => {
                await add(choice, 1);
                await toggleWishlist(picking.id);
                toast({ message: `${picking.name} moved to your bag.`, tone: "success", action: { label: "View bag", href: "/cart" } });
                setPicking(null);
              }}
            >
              Move to bag
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
