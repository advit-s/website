"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Heart, Minus, Plus, ShieldCheck, Trash2, Truck, RotateCcw, MessageCircle } from "lucide-react";
import { useCart } from "@/components/providers/cart";
import { useToast } from "@/components/providers/toast";
import { prefs } from "@/lib/checkout-prefs";
import { usePricedCart } from "./use-priced-cart";
import { Media } from "@/components/ui/media";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { formatINR } from "@/domain/money";

export function CartView({ returnWindowDays }: { returnWindowDays: number }) {
  const { setQuantity, remove, toggleWishlist, wishlist, isAuthed } = useCart();
  const toast = useToast();
  const [pin, setPin] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [priceNotices, setPriceNotices] = useState<string[]>([]);

  useEffect(() => {
    setPin(prefs.pincode());
    const c = prefs.coupon();
    setCoupon(c);
    setCouponInput(c);
    setHydrated(true);
  }, []);

  const { priced, error, loading, ready, lines } = usePricedCart({ pincode: hydrated ? pin : undefined, couponCode: hydrated ? coupon : undefined });

  // "Price changed since you last looked" notice: compare against prices seen on a previous visit.
  useEffect(() => {
    if (!priced) return;
    const seen = prefs.seenPrices();
    const notes: string[] = [];
    const next = { ...seen };
    for (const i of priced.items) {
      if (i.status === "unavailable") continue;
      if (seen[i.variantId] != null && seen[i.variantId] !== i.unitPrice) notes.push(`${i.name} (${i.size}) is now ${formatINR(i.unitPrice)}, was ${formatINR(seen[i.variantId]!)}.`);
      next[i.variantId] = i.unitPrice;
    }
    prefs.setSeenPrices(next);
    if (notes.length) setPriceNotices(notes);
  }, [priced]);

  if (!ready || !hydrated) return <CartSkeleton />;

  if (lines.length === 0) {
    return (
      <EmptyState
        title="Your bag is empty"
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href="/shop">Start shopping</ButtonLink>
            {!isAuthed && (
              <ButtonLink href="/login?next=/cart" variant="secondary">
                Sign in to see a saved bag
              </ButtonLink>
            )}
          </div>
        }
      >
        Browse the collection and add pieces you love.
      </EmptyState>
    );
  }

  const p = priced;
  const count = p ? p.items.reduce((n, i) => n + i.quantity, 0) : lines.reduce((n, l) => n + l.quantity, 0);
  const problems = p ? p.items.filter((i) => i.status !== "ok") : [];
  const pct = p && p.freeShippingThreshold > 0 ? Math.min(100, Math.round(((p.pricing.subtotal - p.pricing.discount) / p.freeShippingThreshold) * 100)) : 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_24rem] lg:gap-12">
      <section aria-label="Items in your bag" className="min-w-0 space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {priceNotices.length > 0 && (
          <Alert tone="warning" title="Prices have changed since you last looked">
            <ul className="list-disc pl-5">
              {priceNotices.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Alert>
        )}
        {problems.length > 0 && (
          <Alert tone="warning" title="Some items need your attention">
            Stock has changed for {problems.length} item{problems.length === 1 ? "" : "s"}. Update or remove them below before checking out.
          </Alert>
        )}

        <ul className="space-y-4">
          {!p && (
            <li>
              <Skeleton className="h-40 w-full" />
            </li>
          )}
          {p?.items.map((i) => {
            const bad = i.status !== "ok";
            return (
              <li key={i.variantId} className="grid grid-cols-[6.5rem_1fr] gap-4 border border-line bg-white p-3 sm:grid-cols-[8rem_1fr] sm:p-4">
                <Link href={`/product/${i.slug}`} aria-label={i.name} tabIndex={-1}>
                  <Media src={i.image?.src} alt="" ratio="4/5" sizes="128px" />
                </Link>
                <div className="min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-sans text-base font-medium leading-snug">
                        <Link href={`/product/${i.slug}`} className="hover:text-maroon hover:underline">
                          {i.name}
                        </Link>
                      </h3>
                      <p className="text-sm text-ink-muted">
                        Size {i.size} &middot; {i.color}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold">{formatINR(i.unitPrice)}</p>
                  </div>
                  {i.isCustomizable && i.leadTimeDays != null && <p className="text-xs text-ink-muted">Made to order: about {i.leadTimeDays} days production, plus delivery.</p>}
                  {i.status === "out_of_stock" && <p className="text-sm font-medium text-error">Sold out. Please remove it to continue.</p>}
                  {i.status === "unavailable" && <p className="text-sm font-medium text-error">No longer available for online purchase.</p>}
                  {i.status === "reduced" && (
                    <p className="text-sm font-medium text-warning">
                      Only {i.available} available.{" "}
                      <button type="button" className="underline underline-offset-4" onClick={() => setQuantity(i.variantId, i.available)}>
                        Update to {i.available}
                      </button>
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    {!bad || i.status === "reduced" ? (
                      <div className="inline-flex items-center border border-line" role="group" aria-label={`Quantity for ${i.name}`}>
                        <button type="button" aria-label="Decrease quantity" className="grid size-11 place-items-center disabled:opacity-40" disabled={i.requested <= 1} onClick={() => setQuantity(i.variantId, i.requested - 1)}>
                          <Minus className="size-4" aria-hidden />
                        </button>
                        <span className="grid min-w-10 place-items-center text-sm" aria-live="polite">
                          {i.requested}
                        </span>
                        <button type="button" aria-label="Increase quantity" className="grid size-11 place-items-center disabled:opacity-40" disabled={i.requested >= Math.min(10, i.available)} onClick={() => setQuantity(i.variantId, i.requested + 1)}>
                          <Plus className="size-4" aria-hidden />
                        </button>
                      </div>
                    ) : null}
                    <button type="button" onClick={() => remove(i.variantId)} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-muted underline underline-offset-4 hover:text-error">
                      <Trash2 className="size-4" aria-hidden /> Remove
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!wishlist.has(i.productId)) await toggleWishlist(i.productId);
                        await remove(i.variantId);
                        toast({ message: "Moved to your wishlist.", tone: "success", action: { label: "View", href: "/wishlist" } });
                      }}
                      className="inline-flex min-h-11 items-center gap-1.5 text-sm text-maroon underline underline-offset-4"
                    >
                      <Heart className="size-4" aria-hidden /> Move to wishlist
                    </button>
                    {!bad && <p className="ml-auto text-sm font-medium">{formatINR(i.lineTotal)}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <form
          className="border border-line bg-white p-4 sm:p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const c = couponInput.trim().toUpperCase();
            setCoupon(c);
            prefs.setCoupon(c);
          }}
        >
          <h2 className="t-h3 !text-lg">Have a coupon?</h2>
          <div className="mt-3 flex gap-2">
            <label htmlFor="coupon" className="sr-only">
              Coupon code
            </label>
            <Input id="coupon" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} placeholder="Enter coupon code" maxLength={30} autoCapitalize="characters" />
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </div>
          {p?.coupon && (
            <p className="mt-2 text-sm text-success" role="status">
              {p.coupon.code} applied: {p.coupon.description}.{" "}
              <button type="button" className="underline underline-offset-4" onClick={() => (setCoupon(""), setCouponInput(""), prefs.setCoupon(""))}>
                Remove
              </button>
            </p>
          )}
          {p?.couponError && coupon && (
            <p className="mt-2 text-sm text-error" role="alert">
              {p.couponError}
            </p>
          )}
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/shop" className="inline-flex min-h-11 items-center gap-2 text-maroon underline underline-offset-4">
            &larr; Continue shopping
          </Link>
        </div>
      </section>

      <aside aria-label="Order summary" className="h-fit border border-line bg-white p-5 lg:sticky lg:top-32">
        <h2 className="t-eyebrow text-maroon">Order summary</h2>
        <hr className="rule-gold my-3" />
        {p ? (
          <>
            {p.freeShippingThreshold > 0 && (
              <div className="mb-4">
                <p className="text-sm" aria-live="polite">
                  {p.pricing.freeShippingRemaining === 0 ? "You have free delivery." : `Add ${formatINR(p.pricing.freeShippingRemaining)} more for free delivery.`}
                </p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-beige" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to free delivery">
                  <div className="h-full bg-maroon transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal ({count} item{count === 1 ? "" : "s"})</dt>
                <dd>{formatINR(p.pricing.subtotal)}</dd>
              </div>
              {p.pricing.discount > 0 && (
                <div className="flex justify-between text-success">
                  <dt>Discount</dt>
                  <dd>&minus; {formatINR(p.pricing.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt>Delivery{p.pricing.shippingEstimated ? " (estimated)" : ""}</dt>
                <dd>{p.pricing.shipping === 0 ? "Free" : formatINR(p.pricing.shipping)}</dd>
              </div>
            </dl>
            {p.pricing.shippingEstimated && (
              <p className="mt-2 text-xs text-ink-muted">Delivery is an estimate until you enter your pincode; the final charge is shown at checkout before you pay.</p>
            )}
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                prefs.setPincode(pin);
              }}
            >
              <label htmlFor="cart-pin" className="sr-only">
                Delivery pincode
              </label>
              <Input id="cart-pin" inputMode="numeric" maxLength={6} placeholder="Pincode" value={pin} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setPin(v); prefs.setPincode(v); }} className="min-h-10" />
            </form>
            {p.pincode && !p.pincode.ok && <p className="mt-1 text-xs text-error" role="alert">{p.pincode.message}</p>}
            {p.pincode?.ok && <p className="mt-1 text-xs text-success">{p.pincode.estimateText}</p>}
            <hr className="my-4 border-line" />
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-xl text-maroon">Total</span>
              <span className="font-serif text-2xl text-maroon" aria-live="polite">{formatINR(p.pricing.total)}</span>
            </div>
            <p className="text-right text-xs text-ink-muted">Inclusive of applicable taxes</p>
            {p.hasCustom && <p className="mt-2 text-xs text-ink-muted">Includes made-to-order pieces; production time is added to delivery time.</p>}
          </>
        ) : (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
        {p?.allOk ? (
          <ButtonLink href="/checkout" size="lg" className="mt-5 w-full">
            Checkout <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        ) : (
          <Button size="lg" className="mt-5 w-full" disabled loading={loading && !p}>
            {problems.length ? "Fix items to continue" : "Checkout"}
          </Button>
        )}
        <ul className="mt-5 grid gap-3 text-xs text-ink-muted">
          <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-wine" aria-hidden /> Payments handled by Razorpay; we never see your card details.</li>
          <li className="flex items-center gap-2"><Truck className="size-4 text-wine" aria-hidden /> Delivery within India only.</li>
          <li className="flex items-center gap-2"><RotateCcw className="size-4 text-wine" aria-hidden /> {returnWindowDays}-day returns on ready-to-ship pieces.</li>
          <li className="flex items-center gap-2"><MessageCircle className="size-4 text-wine" aria-hidden /> Questions? <Link href="/contact" className="underline underline-offset-4">Contact us</Link></li>
        </ul>
      </aside>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_24rem]" role="status" aria-label="Loading your bag">
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
