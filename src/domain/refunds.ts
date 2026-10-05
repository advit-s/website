/**
 * Pure refund bookkeeping shared by services, UI and tests.
 *
 * Safety model (see docs/DECISIONS.md D-32):
 *  - A refund is dispatched to the provider at most once per ATTEMPT. Each attempt has its own receipt.
 *  - `processing` means "money may have moved". It is never unlocked by time. It leaves `processing` only through
 *    verified provider evidence (fetch / list / authenticated webhook) or an explicit, audited manual attestation.
 *  - A failed refund may be sent again only when `retrySafe` is true (see `canRetry`).
 */
import type { Paise } from "./money";
import type { RefundRecord } from "./types";

export const MAX_REFUND_ATTEMPTS = 3;

/** Razorpay limits `receipt` to 40 characters. Ids are `rf_` + 20 hex chars (23), so `<id>.<n>` always fits. */
export const receiptFor = (refundId: string, attempt: number): string => `${refundId}.${attempt}`.slice(0, 40);

/** Refunds that belong to the order's own payment (exception refunds return a separate capture). */
export const isOrderRefund = (r: RefundRecord): boolean => !r.exceptionId;

export interface RefundTotals {
  completed: Paise;
  open: Paise;
  pending: boolean;
}

export function refundTotals(refunds: RefundRecord[]): RefundTotals {
  let completed = 0;
  let open = 0;
  let pending = false;
  for (const r of refunds) {
    if (!isOrderRefund(r)) continue;
    if (r.state === "completed") completed += r.amount;
    else if (r.state === "requested" || r.state === "processing") open += r.amount;
  }
  for (const r of refunds) if (r.state === "processing") pending = true;
  return { completed, open, pending };
}

/** Amount that can still be requested on the order's own payment. */
export const refundable = (orderTotal: Paise, refunds: RefundRecord[]): Paise => {
  const t = refundTotals(refunds);
  return Math.max(0, orderTotal - t.completed - t.open);
};

export type RetryVerdict = { ok: true } | { ok: false; reason: "completed" | "in_progress" | "uncertain" | "not_retry_safe" | "attempts_exhausted" };

/**
 * When may a refund be (re)sent to the provider?
 *  - requested: yes (never dispatched).
 *  - failed AND retrySafe: yes, with a NEW receipt - the provider confirmed failure of the last attempt, or definitively
 *    rejected the create call, or an admin attested (after a documented provider check) that no refund exists.
 *  - processing: never. completed: never.
 */
export function canRetry(r: RefundRecord): RetryVerdict {
  if (r.state === "completed") return { ok: false, reason: "completed" };
  if (r.state === "processing") return { ok: false, reason: r.uncertain ? "uncertain" : "in_progress" };
  if (r.state === "failed" && !r.retrySafe) return { ok: false, reason: "not_retry_safe" };
  if ((r.attempt ?? 0) >= MAX_REFUND_ATTEMPTS) return { ok: false, reason: "attempts_exhausted" };
  return { ok: true };
}

export type DispatchOutcome = "intent" | "accepted" | "rejected" | "unknown" | "provider_processed" | "provider_failed" | "attested_absent";

/** What a provider refund looks like to our matcher. */
export interface RefundObservation {
  providerRefundId: string;
  paymentId: string;
  amount: Paise;
  status: "pending" | "processed" | "failed";
  receipt: string | null;
}

export type MatchResult =
  | { kind: "match"; observation: RefundObservation }
  | { kind: "none" }
  | { kind: "ambiguous"; reason: string }
  | { kind: "mismatch"; reason: string };

/**
 * Decide whether the provider's refunds for a payment contain OUR refund. Identity is the receipt we generated
 * (plus payment id and exact amount). Amount alone is never enough. Zero matches is NOT proof of absence.
 */
export function matchByReceipt(list: RefundObservation[], want: { receipt: string; paymentId: string; amount: Paise }): MatchResult {
  const byReceipt = list.filter((x) => x.receipt === want.receipt);
  if (byReceipt.length > 1) return { kind: "ambiguous", reason: "More than one provider refund carries this receipt." };
  const only = byReceipt[0];
  if (!only) return { kind: "none" };
  if (only.paymentId !== want.paymentId) return { kind: "mismatch", reason: "A provider refund with this receipt belongs to a different payment." };
  if (only.amount !== want.amount) return { kind: "mismatch", reason: `A provider refund with this receipt has a different amount (${only.amount} vs ${want.amount}).` };
  return { kind: "match", observation: only };
}
