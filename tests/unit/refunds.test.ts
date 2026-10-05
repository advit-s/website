import { describe, expect, it } from "vitest";
import { MAX_REFUND_ATTEMPTS, canRetry, matchByReceipt, receiptFor, refundTotals, refundable, type RefundObservation } from "@/domain/refunds";
import type { RefundRecord } from "@/domain/types";

const rec = (over: Partial<RefundRecord> = {}): RefundRecord => ({ id: "rf_abc", amount: 1000, state: "requested", reason: "r", providerRefundId: null, reference: null, requestedBy: "a", requestedAt: "t", updatedAt: "t", idempotencyKey: "k", ...over });

describe("refund receipts", () => {
  it("are stable per attempt, distinct across attempts and fit the provider limit", () => {
    expect(receiptFor("rf_abc", 1)).toBe("rf_abc.1");
    expect(receiptFor("rf_abc", 1)).toBe(receiptFor("rf_abc", 1));
    expect(receiptFor("rf_abc", 2)).not.toBe(receiptFor("rf_abc", 1));
    expect(receiptFor(`rf_${"a".repeat(20)}`, 3).length).toBeLessThanOrEqual(40);
  });
});

describe("refund totals and caps", () => {
  it("count only the order's own payment; exception refunds never reduce the order's refundable amount", () => {
    const refunds = [rec({ state: "completed", amount: 300 }), rec({ id: "b", state: "processing", amount: 200 }), rec({ id: "c", state: "requested", amount: 100 }), rec({ id: "d", state: "completed", amount: 5000, exceptionId: "ex1" })];
    expect(refundTotals(refunds)).toEqual({ completed: 300, open: 300, pending: true });
    expect(refundable(1000, refunds)).toBe(400);
    expect(refundable(1000, [rec({ state: "failed", amount: 999 })])).toBe(1000); // a failed refund frees its headroom
  });
});

describe("when a refund may be sent (again)", () => {
  it("never when completed or processing, whether or not the outcome is known", () => {
    expect(canRetry(rec({ state: "completed" }))).toEqual({ ok: false, reason: "completed" });
    expect(canRetry(rec({ state: "processing" }))).toEqual({ ok: false, reason: "in_progress" });
    expect(canRetry(rec({ state: "processing", uncertain: true }))).toEqual({ ok: false, reason: "uncertain" });
  });
  it("yes when never dispatched, or failed with provider-proven absence; no when failed without proof", () => {
    expect(canRetry(rec({ state: "requested" }))).toEqual({ ok: true });
    expect(canRetry(rec({ state: "failed", retrySafe: true, attempt: 1 }))).toEqual({ ok: true });
    expect(canRetry(rec({ state: "failed" }))).toEqual({ ok: false, reason: "not_retry_safe" });
  });
  it("is bounded", () => {
    expect(canRetry(rec({ state: "failed", retrySafe: true, attempt: MAX_REFUND_ATTEMPTS }))).toEqual({ ok: false, reason: "attempts_exhausted" });
  });
});

describe("matching a provider refund to ours", () => {
  const want = { receipt: "rf_abc.1", paymentId: "pay_1", amount: 1000 };
  const obs = (o: Partial<RefundObservation>): RefundObservation => ({ providerRefundId: "rfnd_1", paymentId: "pay_1", amount: 1000, status: "processed", receipt: "rf_abc.1", ...o });
  it("matches only on receipt + payment + exact amount", () => {
    expect(matchByReceipt([obs({})], want)).toEqual({ kind: "match", observation: obs({}) });
  });
  it("amount alone is never a match", () => {
    expect(matchByReceipt([obs({ receipt: "other" }), obs({ providerRefundId: "rfnd_2", receipt: null })], want)).toEqual({ kind: "none" });
  });
  it("flags duplicates, wrong payment and wrong amount instead of choosing", () => {
    expect(matchByReceipt([obs({}), obs({ providerRefundId: "rfnd_2" })], want).kind).toBe("ambiguous");
    expect(matchByReceipt([obs({ paymentId: "pay_other" })], want).kind).toBe("mismatch");
    expect(matchByReceipt([obs({ amount: 999 })], want).kind).toBe("mismatch");
  });
});
