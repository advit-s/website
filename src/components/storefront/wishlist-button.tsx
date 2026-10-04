"use client";

import clsx from "clsx";
import { Heart } from "lucide-react";
import { useCart } from "@/components/providers/cart";
import { useToast } from "@/components/providers/toast";

export function WishlistButton({ productId, name, className, withLabel }: { productId: string; name: string; className?: string; withLabel?: boolean }) {
  const { wishlist, toggleWishlist, isAuthed } = useCart();
  const toast = useToast();
  const on = wishlist.has(productId);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}
      onClick={async () => {
        const nowOn = await toggleWishlist(productId);
        toast({
          message: nowOn ? "Saved to your wishlist." : "Removed from your wishlist.",
          tone: "success",
          action: nowOn ? { label: isAuthed ? "View" : "Sign in to keep", href: isAuthed ? "/wishlist" : "/login?next=/wishlist" } : undefined,
        });
      }}
      className={clsx("inline-flex items-center justify-center gap-2 text-maroon", withLabel ? "min-h-11 border border-line px-4 font-nav text-[0.78rem] uppercase tracking-[0.12em] hover:bg-beige/60" : "size-11 rounded-full bg-ivory/90 hover:bg-white", className)}
    >
      <Heart className={clsx("size-5", on && "fill-maroon")} aria-hidden />
      {withLabel && (on ? "Saved" : "Wishlist")}
    </button>
  );
}
