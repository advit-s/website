"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface CartLine {
  variantId: string;
  quantity: number;
}

const CART_KEY = "rr.cart.v1";
const WISH_KEY = "rr.wishlist.v1";
export const MAX_LINE_QTY = 10;

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) - the in-memory state still works for this visit */
  }
}

function sanitizeLines(v: unknown): CartLine[] {
  if (!Array.isArray(v)) return [];
  const out: CartLine[] = [];
  for (const l of v) {
    if (l && typeof l === "object" && typeof (l as CartLine).variantId === "string" && Number.isInteger((l as CartLine).quantity)) {
      const q = Math.min(MAX_LINE_QTY, Math.max(1, (l as CartLine).quantity));
      out.push({ variantId: (l as CartLine).variantId.slice(0, 120), quantity: q });
    }
  }
  return out.slice(0, 50);
}

interface Ctx {
  lines: CartLine[];
  count: number;
  ready: boolean;
  isAuthed: boolean;
  add: (variantId: string, quantity?: number) => Promise<void>;
  setQuantity: (variantId: string, quantity: number) => Promise<void>;
  remove: (variantId: string) => Promise<void>;
  clear: () => Promise<void>;
  /** Replace local state with server-provided lines (after the server clamps/merges). */
  replace: (lines: CartLine[]) => void;
  wishlist: Set<string>;
  toggleWishlist: (productId: string) => Promise<boolean>;
  wishlistReady: boolean;
}

const CartContext = createContext<Ctx | null>(null);

export function useCart(): Ctx {
  const c = useContext(CartContext);
  if (!c) throw new Error("useCart must be used inside <CartProvider>");
  return c;
}

async function api(method: string, url: string, body?: unknown): Promise<Response> {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
}

/**
 * Cart + wishlist state. Guests: browser storage only (a convenience, never the source of truth - prices and stock are
 * always revalidated by the server). Signed-in customers: persisted in Firestore through /api/cart and /api/wishlist.
 */
export function CartProvider({ isAuthed, children }: { isAuthed: boolean; children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [wishlistReady, setWishlistReady] = useState(false);
  const authed = useRef(isAuthed);
  authed.current = isAuthed;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isAuthed) {
        try {
          const [c, w] = await Promise.all([api("GET", "/api/cart"), api("GET", "/api/wishlist")]);
          if (!cancelled && c.ok) setLines(sanitizeLines(((await c.json()) as { lines: unknown }).lines));
          if (!cancelled && w.ok) setWishlist(new Set(((await w.json()) as { productIds: string[] }).productIds));
        } catch {
          /* offline: start empty */
        }
      } else {
        setLines(sanitizeLines(readLocal<unknown>(CART_KEY, [])));
        setWishlist(new Set(readLocal<string[]>(WISH_KEY, []).filter((x) => typeof x === "string")));
      }
      if (!cancelled) {
        setReady(true);
        setWishlistReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthed]);

  // Keep tabs in sync for guests.
  useEffect(() => {
    if (isAuthed) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === CART_KEY) setLines(sanitizeLines(readLocal<unknown>(CART_KEY, [])));
      if (e.key === WISH_KEY) setWishlist(new Set(readLocal<string[]>(WISH_KEY, [])));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isAuthed]);

  const persist = useCallback(async (next: CartLine[], change?: { variantId: string; quantity: number }) => {
    setLines(next);
    if (authed.current) {
      if (change) {
        const r = await api("PUT", "/api/cart", change);
        if (r.ok) setLines(sanitizeLines(((await r.json()) as { lines: unknown }).lines));
      }
    } else writeLocal(CART_KEY, next);
  }, []);

  const setQuantity = useCallback(
    async (variantId: string, quantity: number) => {
      const q = Math.max(0, Math.min(MAX_LINE_QTY, Math.floor(quantity)));
      const without = lines.filter((l) => l.variantId !== variantId);
      await persist(q === 0 ? without : [...lines.filter((l) => l.variantId !== variantId), { variantId, quantity: q }].sort(stable(lines)), { variantId, quantity: q });
    },
    [lines, persist],
  );

  const add = useCallback(
    async (variantId: string, quantity = 1) => {
      const existing = lines.find((l) => l.variantId === variantId)?.quantity ?? 0;
      await setQuantity(variantId, existing + quantity);
    },
    [lines, setQuantity],
  );

  const remove = useCallback((variantId: string) => setQuantity(variantId, 0), [setQuantity]);

  const clear = useCallback(async () => {
    setLines([]);
    if (authed.current) await api("DELETE", "/api/cart");
    else writeLocal(CART_KEY, []);
  }, []);

  const toggleWishlist = useCallback(
    async (productId: string) => {
      const on = !wishlist.has(productId);
      const next = new Set(wishlist);
      if (on) next.add(productId);
      else next.delete(productId);
      setWishlist(next);
      if (authed.current) {
        const r = await api("PUT", "/api/wishlist", { productId, on });
        if (!r.ok) setWishlist(wishlist); // roll back
      } else writeLocal(WISH_KEY, [...next]);
      return on;
    },
    [wishlist],
  );

  const value = useMemo<Ctx>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      ready,
      isAuthed,
      add,
      setQuantity,
      remove,
      clear,
      replace: setLines,
      wishlist,
      toggleWishlist,
      wishlistReady,
    }),
    [lines, ready, isAuthed, add, setQuantity, remove, clear, wishlist, toggleWishlist, wishlistReady],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** Keep existing line order stable when a quantity changes. */
function stable(order: CartLine[]) {
  const idx = new Map(order.map((l, i) => [l.variantId, i]));
  return (a: CartLine, b: CartLine) => (idx.get(a.variantId) ?? 999) - (idx.get(b.variantId) ?? 999);
}

/** Read guest storage (used by the login flow to merge into the account) and clear it afterwards. */
export function takeGuestState(): { lines: CartLine[]; wishlist: string[] } {
  const lines = sanitizeLines(readLocal<unknown>(CART_KEY, []));
  const wishlist = readLocal<string[]>(WISH_KEY, []).filter((x) => typeof x === "string").slice(0, 100);
  return { lines, wishlist };
}
export function clearGuestState() {
  try {
    window.localStorage.removeItem(CART_KEY);
    window.localStorage.removeItem(WISH_KEY);
  } catch {
    /* ignore */
  }
}
