"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import { Minus, Plus, Ruler, ShoppingBag, Truck, Banknote, RotateCcw } from "lucide-react";
import { useCart, MAX_LINE_QTY } from "@/components/providers/cart";
import { useToast } from "@/components/providers/toast";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Price } from "@/components/ui/price";
import { WishlistButton } from "./wishlist-button";
import { formatINR } from "@/domain/money";
import type { PincodeCheck } from "@/domain/pincode";

export interface PanelVariant {
  id: string;
  size: string;
  color: string;
  price: number;
  available: number;
  lowStock: boolean;
}

interface Props {
  product: { id: string; name: string; price: number; compareAtPrice: number | null; isCustomizable: boolean; enquiryOnly: boolean; leadTimeDays: number | null };
  variants: PanelVariant[];
  sizeGuide: ReactNode;
  returnWindowDays: number;
  freeShippingThreshold: number;
  codEnabled: boolean;
}

export function PurchasePanel({ product, variants, sizeGuide, returnWindowDays, freeShippingThreshold, codEnabled }: Props) {
  const { add, lines } = useCart();
  const toast = useToast();
  const colors = useMemo(() => Array.from(new Set(variants.map((v) => v.color))), [variants]);
  const firstColor = colors.find((c) => variants.some((v) => v.color === c && v.available > 0)) ?? colors[0] ?? "";
  const [color, setColor] = useState(firstColor);
  const sizesForColor = variants.filter((v) => v.color === color);
  const [size, setSize] = useState<string | null>(sizesForColor.length === 1 ? sizesForColor[0]!.size : null);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [touched, setTouched] = useState(false);
  const selected = variants.find((v) => v.color === color && v.size === size) ?? null;
  const inCart = selected ? (lines.find((l) => l.variantId === selected.id)?.quantity ?? 0) : 0;
  const maxQty = selected ? Math.max(0, Math.min(MAX_LINE_QTY, selected.available) - inCart) : MAX_LINE_QTY;
  const displayPrice = selected?.price ?? product.price;
  const soldOutAll = variants.every((v) => v.available <= 0);

  useEffect(() => {
    setQty((q) => Math.max(1, Math.min(q, Math.max(1, maxQty))));
  }, [maxQty]);

  const onAdd = async () => {
    setTouched(true);
    if (!selected) return;
    if (maxQty <= 0) {
      toast({ message: "You already have the maximum available quantity in your cart.", tone: "info", action: { label: "View cart", href: "/cart" } });
      return;
    }
    setAdding(true);
    await add(selected.id, qty);
    setAdding(false);
    toast({ message: `${product.name} (${selected.size}, ${selected.color}) added to your cart.`, tone: "success", action: { label: "View cart", href: "/cart" } });
  };

  // Mobile sticky buy bar appears once the main button scrolls out of view.
  const anchor = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = anchor.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setStuck(!e!.isIntersecting && e!.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const needsSize = touched && !selected;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Price price={displayPrice} compareAt={selected ? null : product.compareAtPrice} size="lg" from={product.enquiryOnly} />
        <p className="text-sm text-ink-muted">{product.enquiryOnly ? "Indicative price - the final quote is agreed with you before any payment." : "Price shown is inclusive of applicable taxes."}</p>
      </div>

      {!product.enquiryOnly && (
        <>
          {colors.length > 1 && (
            <fieldset>
              <legend className="mb-2 text-sm">
                Colour: <span className="font-medium">{color}</span>
              </legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
                {colors.map((c) => {
                  const any = variants.some((v) => v.color === c && v.available > 0);
                  return (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={c === color}
                      onClick={() => {
                        setColor(c);
                        const sizes = variants.filter((v) => v.color === c);
                        setSize((cur) => (sizes.some((v) => v.size === cur) ? cur : sizes.length === 1 ? sizes[0]!.size : null));
                      }}
                      className={clsx("min-h-11 border px-4 text-sm", c === color ? "border-maroon bg-maroon text-white" : "border-line bg-white hover:border-maroon", !any && c !== color && "text-ink-muted line-through")}
                    >
                      {c}
                      {!any && <span className="sr-only"> (sold out)</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <fieldset>
            <div className="mb-2 flex items-center justify-between">
              <legend className="text-sm">
                Size{selected ? <>: <span className="font-medium">{selected.size}</span></> : null}
              </legend>
              <button type="button" onClick={() => setShowGuide(true)} className="inline-flex min-h-9 items-center gap-1.5 text-sm text-maroon underline underline-offset-4">
                <Ruler className="size-4" aria-hidden /> Size guide
              </button>
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Size" aria-describedby={needsSize ? "size-err" : undefined}>
              {sizesForColor.map((v) => {
                const out = v.available <= 0;
                return (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={v.size === size}
                    aria-disabled={out}
                    disabled={out}
                    onClick={() => setSize(v.size)}
                    className={clsx(
                      "relative grid min-h-11 min-w-12 place-items-center border px-3 text-sm",
                      v.size === size ? "border-maroon bg-maroon text-white" : "border-line bg-white hover:border-maroon",
                      out && "cursor-not-allowed bg-beige/40 text-ink-muted line-through hover:border-line",
                    )}
                  >
                    {v.size}
                    {out && <span className="sr-only"> (sold out)</span>}
                  </button>
                );
              })}
            </div>
            {needsSize && (
              <p id="size-err" role="alert" className="mt-2 text-sm font-medium text-error">
                Please choose a size.
              </p>
            )}
            {selected && selected.available > 0 && selected.lowStock && <p className="mt-2 text-sm font-medium text-warning">Only {selected.available} left in this size.</p>}
            {selected && selected.available <= 0 && <p className="mt-2 text-sm text-error">This combination is sold out.</p>}
          </fieldset>

          {product.isCustomizable && product.leadTimeDays != null && (
            <Alert tone="info" title="Made to order">
              This piece is prepared after you order. Production takes about {product.leadTimeDays} days, <strong>in addition to</strong> delivery time.
            </Alert>
          )}

          <div ref={anchor} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm">Quantity</span>
              <div className="inline-flex items-center border border-line bg-white" role="group" aria-label="Quantity">
                <button type="button" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty(qty - 1)} className="grid size-11 place-items-center disabled:opacity-40">
                  <Minus className="size-4" aria-hidden />
                </button>
                <span className="grid min-w-10 place-items-center text-sm" aria-live="polite">
                  {qty}
                </span>
                <button type="button" aria-label="Increase quantity" disabled={qty >= maxQty} onClick={() => setQty(qty + 1)} className="grid size-11 place-items-center disabled:opacity-40">
                  <Plus className="size-4" aria-hidden />
                </button>
              </div>
            </div>
            <Button size="lg" className="w-full" onClick={onAdd} loading={adding} disabled={soldOutAll || (selected != null && selected.available <= 0)}>
              <ShoppingBag className="size-4" aria-hidden /> {soldOutAll ? "Sold out" : "Add to cart"}
            </Button>
            <WishlistButton productId={product.id} name={product.name} withLabel className="w-full" />
          </div>
        </>
      )}

      <PincodeChecker enquiryOnly={product.enquiryOnly} />

      <ul className="grid grid-cols-3 gap-2 border-y border-line py-4 text-center text-xs text-ink-muted">
        <li className="flex flex-col items-center gap-1.5">
          <Truck className="size-5 text-wine" aria-hidden /> Free delivery over {formatINR(freeShippingThreshold)}
        </li>
        <li className="flex flex-col items-center gap-1.5">
          <Banknote className="size-5 text-wine" aria-hidden /> {codEnabled ? "COD on eligible pincodes" : "Secure online payment"}
        </li>
        <li className="flex flex-col items-center gap-1.5">
          <RotateCcw className="size-5 text-wine" aria-hidden /> {returnWindowDays}-day returns*
        </li>
      </ul>
      <p className="-mt-3 text-xs text-ink-muted">*Ready-to-ship pieces only. Made-to-measure pieces are not returnable.</p>

      <Dialog open={showGuide} onClose={() => setShowGuide(false)} title="Size guide" size="lg">
        {sizeGuide}
      </Dialog>

      {!product.enquiryOnly && (
        <div className={clsx("fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ivory p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] lg:hidden", stuck ? "block" : "hidden")}>
          <div className="container-rr flex items-center gap-3 !px-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{product.name}</p>
              <p className="text-sm text-maroon">{formatINR(displayPrice)}</p>
            </div>
            <Button
              onClick={() => {
                if (!selected) {
                  setTouched(true);
                  anchor.current?.scrollIntoView({ block: "center", behavior: "smooth" });
                } else void onAdd();
              }}
              loading={adding}
              disabled={soldOutAll}
            >
              {selected ? "Add to cart" : "Choose size"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PincodeChecker({ enquiryOnly }: { enquiryOnly: boolean }) {
  const [pin, setPin] = useState("");
  const [state, setState] = useState<{ loading: boolean; result: PincodeCheck | null; error: string | null }>({ loading: false, result: null, error: null });
  const check = async () => {
    setState({ loading: true, result: null, error: null });
    try {
      const r = await fetch(`/api/pincode?pin=${encodeURIComponent(pin)}`);
      const data = await r.json();
      if (!r.ok) setState({ loading: false, result: null, error: data?.error?.message ?? "Could not check this pincode." });
      else setState({ loading: false, result: data as PincodeCheck, error: null });
    } catch {
      setState({ loading: false, result: null, error: "Could not reach the server. Please try again." });
    }
  };
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void check();
      }}
    >
      <label htmlFor="pin" className="block text-sm font-medium">
        Delivery pincode
      </label>
      <div className="flex gap-2">
        <Input id="pin" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="6-digit pincode" aria-describedby="pin-result" />
        <Button type="submit" variant="secondary" loading={state.loading} disabled={pin.length !== 6}>
          Check
        </Button>
      </div>
      <div id="pin-result" aria-live="polite" className="min-h-5 text-sm">
        {state.error && <p className="text-error">{state.error}</p>}
        {state.result && !state.result.ok && <p className="text-error">{state.result.message}</p>}
        {state.result?.ok && (
          <p className="text-success">
            {enquiryOnly ? "We deliver to this pincode. Delivery time is in addition to production lead time." : state.result.estimateText}
            {state.result.codAllowed ? " Cash on delivery is available." : " Cash on delivery is not available for this pincode."}
          </p>
        )}
      </div>
    </form>
  );
}
