/** All money in this app is integer paise (1 INR = 100 paise). Rupee formatting happens only at display time. */
export type Paise = number;

export function isPaise(n: unknown): n is Paise {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
}

export function assertPaise(n: unknown, label = "amount"): asserts n is Paise {
  if (!isPaise(n)) throw new RangeError(`${label} must be a non-negative integer number of paise`);
}

/** Convert a rupee amount (e.g. from a form or a PDF sample) to paise, rounding half-up. */
export function rupeesToPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees) || rupees < 0) throw new RangeError("rupees must be a non-negative finite number");
  return Math.round(rupees * 100);
}

export function paiseToRupees(p: Paise): number {
  return p / 100;
}

const whole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "₹42,999" (or "₹1,299.50" when there are paise). */
export function formatINR(p: Paise): string {
  return p % 100 === 0 ? whole.format(p / 100) : exact.format(p / 100);
}

/** Percentage off, rounded to an integer, or 0 if not a markdown. */
export function percentOff(price: Paise, compareAt: Paise | null | undefined): number {
  if (compareAt == null || compareAt <= price || compareAt === 0) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

/** Basis-point percentage of an amount, rounded half-up. 1000 bps = 10%. */
export function bps(amount: Paise, basisPoints: number): Paise {
  return Math.round((amount * basisPoints) / 10_000);
}
