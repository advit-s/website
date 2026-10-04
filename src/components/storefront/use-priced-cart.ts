"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "@/components/providers/cart";
import type { PricedCart } from "@/server/services/cart-pricing";

/** Fetches the server-priced view of the current cart. Re-runs when lines, pincode, coupon or payment method change. */
export function usePricedCart(opts: { pincode?: string; couponCode?: string; paymentMethod?: "razorpay" | "cod" }) {
  const { lines, ready } = useCart();
  const [priced, setPriced] = useState<PricedCart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!ready) return;
    if (lines.length === 0) {
      setPriced(null);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    try {
      const r = await fetch("/api/cart/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, pincode: opts.pincode?.length === 6 ? opts.pincode : undefined, couponCode: opts.couponCode || undefined, paymentMethod: opts.paymentMethod }),
      });
      const data = await r.json();
      if (mine !== seq.current) return; // a newer request superseded this one
      if (!r.ok) setError(data?.error?.message ?? "Could not load your bag.");
      else {
        setPriced(data as PricedCart);
        setError(null);
      }
    } catch {
      if (mine === seq.current) setError("Could not reach the server. Check your connection.");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [lines, ready, opts.pincode, opts.couponCode, opts.paymentMethod]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { priced, error, loading, refresh, ready, lines };
}
