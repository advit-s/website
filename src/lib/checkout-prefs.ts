/** Small browser-side conveniences shared by the cart and checkout (never the source of truth for prices). */
const K = { pin: "rr.pincode", coupon: "rr.coupon", seen: "rr.seen-prices", pending: "rr.pending-order" } as const;

function get(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
function set(k: string, v: string | null) {
  try {
    if (v === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
}

export const prefs = {
  pincode: () => get(K.pin) ?? "",
  setPincode: (v: string) => set(K.pin, v || null),
  coupon: () => get(K.coupon) ?? "",
  setCoupon: (v: string) => set(K.coupon, v || null),
  seenPrices: (): Record<string, number> => {
    try {
      return JSON.parse(get(K.seen) ?? "{}") as Record<string, number>;
    } catch {
      return {};
    }
  },
  setSeenPrices: (m: Record<string, number>) => set(K.seen, JSON.stringify(m)),
  pendingOrder: () => get(K.pending),
  setPendingOrder: (id: string | null) => set(K.pending, id),
};

export const newKey = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `k${Date.now()}${Math.random().toString(36).slice(2)}`.padEnd(20, "0"));
