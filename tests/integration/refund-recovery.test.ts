import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/firebase/admin";
import { C, newId, nowIso } from "@/server/repos/common";
import { placeOrder } from "@/server/services/checkout";
import { applyPaymentCaptured } from "@/server/services/payment-events";
import { applyOrderAction, executeRefund } from "@/server/services/admin-orders";
import { applyRefundEvent, applyRefundObservation, attestRefundNotCreated, getRefundRecovery, reconcileRefund, reconcileRefunds } from "@/server/services/refunds";
import { orderFromDoc, orderRef } from "@/server/services/order-core";
import { payments, ProviderError, simulatedPayments } from "@/server/providers/payments";
import { receiptFor } from "@/domain/refunds";
import { checkoutInput, ensureSettings, makeProduct } from "../helpers/fixtures";

beforeAll(ensureSettings);
afterEach(() => vi.restoreAllMocks());
const getOrder = async (id: string) => orderFromDoc(await orderRef(id).get());
const providerRefunds = async (paymentId: string) => Object.values(((await db().collection(C.simPayments).doc(paymentId).get()).data() as { refunds?: Record<string, unknown> }).refunds ?? {});

/** A captured, paid prepaid order whose payment exists in the (simulated) provider. */
async function paidOrder() {
  const f = await makeProduct({ stocks: [5] });
  const r = await placeOrder(checkoutInput(f.variants[0]!.id, 1, { paymentMethod: "razorpay" }), { userId: null, idempotencyKey: newId("idem_") });
  const sim = await simulatedPayments().simulateCustomerPayment(r.payment!.providerOrderId, "success");
  await applyPaymentCaptured({ providerOrderId: r.payment!.providerOrderId, paymentId: sim.payment.id, amount: sim.payment.amount, currency: "INR", source: "webhook" });
  return { orderId: r.orderId, paymentId: sim.payment.id, total: r.total };
}
async function requestedRefund(amount = 100) {
  const p = await paidOrder();
  await applyOrderAction(p.orderId, { type: "refund_request", amount, reason: "Customer request" }, "admin_test");
  const refund = (await getOrder(p.orderId)).payment.refunds[0]!;
  return { ...p, refund, amount };
}
const refundOf = async (orderId: string, id: string) => (await getOrder(orderId)).payment.refunds.find((r) => r.id === id)!;

describe("dispatch record and concurrency", () => {
  it("writes a durable dispatch record with a stable receipt before the provider is called", async () => {
    const { orderId, refund } = await requestedRefund();
    let seen: unknown = null;
    const real = payments().refund.bind(payments());
    vi.spyOn(payments(), "refund").mockImplementation(async (p) => {
      // At the moment the provider is called, the lock and the dispatch record must already be persisted.
      seen = { rec: await refundOf(orderId, refund.id), dispatch: (await getRefundRecovery(orderId)).dispatches[0] };
      return real(p);
    });
    await executeRefund(orderId, refund.id, "admin_test");
    const s = seen as { rec: { state: string; receipt: string }; dispatch: { outcome: string; receipt: string; paymentId: string; refundId: string } };
    expect(s.rec.state).toBe("processing");
    expect(s.rec.receipt).toBe(receiptFor(refund.id, 1));
    expect(s.dispatch).toMatchObject({ outcome: "intent", receipt: receiptFor(refund.id, 1), refundId: refund.id });
    const after = (await getRefundRecovery(orderId)).dispatches[0]!;
    expect(after.outcome).toBe("provider_processed");
    expect(after.providerRefundId).toMatch(/^rfnd_SIM/);
  });

  it("concurrent dispatch moves money exactly once", async () => {
    const { orderId, paymentId, refund } = await requestedRefund();
    const results = await Promise.allSettled([executeRefund(orderId, refund.id, "a1"), executeRefund(orderId, refund.id, "a2"), executeRefund(orderId, refund.id, "a3")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await providerRefunds(paymentId)).toHaveLength(1);
    const o = await getOrder(orderId);
    expect(o.payment.refundedTotal).toBe(refund.amount);
    expect(o.payment.refunds[0]!.state).toBe("completed");
  });
});

describe("uncertain outcomes stay locked and are recovered by verified evidence", () => {
  it("provider accepted the refund but the response was lost: locked, not re-sendable, recovered by receipt, one money movement", async () => {
    const { orderId, paymentId, refund } = await requestedRefund();
    const real = payments().refund.bind(payments());
    vi.spyOn(payments(), "refund").mockImplementation(async (p) => {
      await real(p); // money moved at the provider...
      throw new Error("socket hang up"); // ...but we never saw the answer
    });
    await expect(executeRefund(orderId, refund.id, "admin_test")).rejects.toMatchObject({ code: "REFUND_UNCERTAIN" });
    let rec = await refundOf(orderId, refund.id);
    expect(rec).toMatchObject({ state: "processing", uncertain: true, providerRefundId: null });
    expect((await getOrder(orderId)).needsReview).toBe(true);
    expect((await getRefundRecovery(orderId)).dispatches[0]!.outcome).toBe("unknown");

    // no retry, no matter how many times, and no time-based unlock
    await expect(executeRefund(orderId, refund.id, "admin_test")).rejects.toMatchObject({ code: "IN_PROGRESS" });
    // age everything by 30 days: elapsed time must never unlock an uncertain refund
    const past = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    await orderRef(orderId).collection("refundDispatches").doc(`${refund.id}_1`).update({ startedAt: past, updatedAt: past });
    const aged = await getOrder(orderId);
    await orderRef(orderId).update({ "payment.refunds": aged.payment.refunds.map((r) => ({ ...r, updatedAt: past })) });
    await expect(executeRefund(orderId, refund.id, "admin_test")).rejects.toMatchObject({ code: "IN_PROGRESS" });
    vi.restoreAllMocks();

    const rep = await reconcileRefund(orderId, refund.id, "admin_test");
    expect(rep.outcome).toBe("completed");
    rec = await refundOf(orderId, refund.id);
    expect(rec).toMatchObject({ state: "completed", uncertain: false });
    expect(rec.providerRefundId).toMatch(/^rfnd_SIM/);
    expect((await getOrder(orderId)).payment.refundedTotal).toBe(refund.amount);
    expect(await providerRefunds(paymentId)).toHaveLength(1);
    // reconciling again changes nothing
    expect((await reconcileRefund(orderId, refund.id, "admin_test")).outcome).toBe("not_pending");
    expect((await getOrder(orderId)).payment.refundedTotal).toBe(refund.amount);
  });

  it("process crash after the provider accepted: the scheduled job finds the refund by receipt", async () => {
    const { orderId, paymentId, refund, amount } = await requestedRefund();
    // Reproduce the crash window: lock + dispatch record persisted, provider called, nothing recorded afterwards.
    const receipt = receiptFor(refund.id, 1);
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    const o = await getOrder(orderId);
    await orderRef(orderId).update({ "payment.refunds": o.payment.refunds.map((r) => ({ ...r, state: "processing", receipt, attempt: 1, paymentId, uncertain: false, retrySafe: false })), "payment.refundsPending": true });
    await orderRef(orderId).collection("refundDispatches").doc(`${refund.id}_1`).set({ refundId: refund.id, attempt: 1, orderId, paymentId, amount, receipt, outcome: "intent", providerRefundId: null, providerStatus: null, startedAt: old, startedBy: "admin_test", updatedAt: old });
    await payments().refund({ paymentId, amount, receipt });

    const job = await reconcileRefunds(200, 60_000);
    expect(job.resolved).toBeGreaterThanOrEqual(1);
    expect(await refundOf(orderId, refund.id)).toMatchObject({ state: "completed" });
    expect(await providerRefunds(paymentId)).toHaveLength(1);
  });

  it("the scheduled job does not race a dispatch that just started", async () => {
    const { orderId, paymentId, refund, amount } = await requestedRefund();
    const receipt = receiptFor(refund.id, 1);
    const o = await getOrder(orderId);
    await orderRef(orderId).update({ "payment.refunds": o.payment.refunds.map((r) => ({ ...r, state: "processing", receipt, attempt: 1, paymentId })), "payment.refundsPending": true });
    const now = nowIso();
    await orderRef(orderId).collection("refundDispatches").doc(`${refund.id}_1`).set({ refundId: refund.id, attempt: 1, orderId, paymentId, amount, receipt, outcome: "intent", providerRefundId: null, providerStatus: null, startedAt: now, startedBy: "x", updatedAt: now });
    const spy = vi.spyOn(payments(), "listPaymentRefunds");
    await reconcileRefunds(200, 120_000);
    expect(spy).not.toHaveBeenCalledWith(paymentId);
    expect((await refundOf(orderId, refund.id)).state).toBe("processing");
  });

  it("nothing found at the provider keeps the refund locked; only a system search + written provider check makes it retry-safe, with a new receipt", async () => {
    const { orderId, paymentId, refund } = await requestedRefund();
    vi.spyOn(payments(), "refund").mockRejectedValue(new Error("ETIMEDOUT")); // provider never received it
    await expect(executeRefund(orderId, refund.id, "admin_test")).rejects.toMatchObject({ code: "REFUND_UNCERTAIN" });
    vi.restoreAllMocks();

    // attestation is refused before a system search
    await expect(attestRefundNotCreated(orderId, refund.id, "admin_test", "I looked at the dashboard and saw nothing at all")).rejects.toMatchObject({ code: "RECONCILE_FIRST" });
    const rep = await reconcileRefund(orderId, refund.id, "admin_test");
    expect(rep.outcome).toBe("not_found");
    expect((await refundOf(orderId, refund.id)).state).toBe("processing"); // absence is not proof
    await expect(attestRefundNotCreated(orderId, refund.id, "admin_test", "too short")).rejects.toThrow();
    await attestRefundNotCreated(orderId, refund.id, "admin_test", "Checked Razorpay dashboard > Payments > refunds: no refund on this payment.");
    expect(await refundOf(orderId, refund.id)).toMatchObject({ state: "failed", retrySafe: true, uncertain: false });

    await executeRefund(orderId, refund.id, "admin_test");
    const done = await refundOf(orderId, refund.id);
    expect(done).toMatchObject({ state: "completed", attempt: 2, receipt: receiptFor(refund.id, 2) });
    expect(await providerRefunds(paymentId)).toHaveLength(1);
    expect((await getOrder(orderId)).payment.refundedTotal).toBe(refund.amount);
  });

  it("a definitive provider rejection is safe to retry with a new receipt", async () => {
    const { orderId, paymentId, refund } = await requestedRefund();
    vi.spyOn(payments(), "refund").mockRejectedValueOnce(new ProviderError("The refund amount is greater than the payment amount", "rejected", 400));
    await expect(executeRefund(orderId, refund.id, "admin_test")).rejects.toMatchObject({ status: 400 });
    expect(await refundOf(orderId, refund.id)).toMatchObject({ state: "failed", retrySafe: true });
    await executeRefund(orderId, refund.id, "admin_test");
    expect(await refundOf(orderId, refund.id)).toMatchObject({ state: "completed", attempt: 2 });
    expect(await providerRefunds(paymentId)).toHaveLength(1);
  });

  it("a failed refund that is not proven to be absent cannot be retried", async () => {
    const { orderId, refund } = await requestedRefund();
    const o = await getOrder(orderId);
    await orderRef(orderId).update({ "payment.refunds": o.payment.refunds.map((r) => ({ ...r, state: "failed" })) });
    await expect(executeRefund(orderId, refund.id, "admin_test")).rejects.toMatchObject({ code: "RETRY_NOT_SAFE" });
  });

  it("ambiguous provider matches never change state; amount alone is never a match", async () => {
    const { orderId, paymentId, refund, amount } = await requestedRefund();
    vi.spyOn(payments(), "refund").mockRejectedValue(new Error("ECONNRESET"));
    await expect(executeRefund(orderId, refund.id, "admin_test")).rejects.toMatchObject({ code: "REFUND_UNCERTAIN" });
    vi.restoreAllMocks();
    const receipt = receiptFor(refund.id, 1);

    // an unrelated refund of the same amount exists: NOT adopted
    vi.spyOn(payments(), "listPaymentRefunds").mockResolvedValue([{ id: "rfnd_other", paymentId, amount, status: "processed", receipt: "someone-else" }]);
    expect((await reconcileRefund(orderId, refund.id, "admin_test")).outcome).toBe("not_found");
    expect((await refundOf(orderId, refund.id)).state).toBe("processing");

    // two refunds claiming our receipt: ambiguous
    vi.spyOn(payments(), "listPaymentRefunds").mockResolvedValue([
      { id: "rfnd_a", paymentId, amount, status: "processed", receipt },
      { id: "rfnd_b", paymentId, amount, status: "processed", receipt },
    ]);
    expect((await reconcileRefund(orderId, refund.id, "admin_test")).outcome).toBe("ambiguous");
    expect((await refundOf(orderId, refund.id)).state).toBe("processing");

    // our receipt, wrong amount: mismatch
    vi.spyOn(payments(), "listPaymentRefunds").mockResolvedValue([{ id: "rfnd_c", paymentId, amount: amount + 1, status: "processed", receipt }]);
    expect((await reconcileRefund(orderId, refund.id, "admin_test")).outcome).toBe("mismatch");
    expect((await refundOf(orderId, refund.id)).state).toBe("processing");
    expect((await getOrder(orderId)).payment.refundedTotal).toBe(0);
    expect((await getOrder(orderId)).needsReview).toBe(true);
  });

  it("an unreachable provider changes nothing", async () => {
    const { orderId, refund } = await requestedRefund();
    vi.spyOn(payments(), "refund").mockRejectedValue(new Error("ECONNRESET"));
    await expect(executeRefund(orderId, refund.id, "admin_test")).rejects.toMatchObject({ code: "REFUND_UNCERTAIN" });
    vi.restoreAllMocks();
    vi.spyOn(payments(), "listPaymentRefunds").mockRejectedValue(new ProviderError("down", "unknown"));
    expect((await reconcileRefund(orderId, refund.id, "admin_test")).outcome).toBe("provider_unavailable");
    expect(await refundOf(orderId, refund.id)).toMatchObject({ state: "processing", uncertain: true });
  });
});

describe("webhook evidence", () => {
  async function lockedUncertain() {
    const t = await requestedRefund();
    const real = payments().refund.bind(payments());
    vi.spyOn(payments(), "refund").mockImplementation(async (p) => {
      await real(p);
      throw new Error("socket hang up");
    });
    await expect(executeRefund(t.orderId, t.refund.id, "admin_test")).rejects.toMatchObject({ code: "REFUND_UNCERTAIN" });
    vi.restoreAllMocks();
    const provider = (await payments().listPaymentRefunds(t.paymentId))[0]!;
    return { ...t, providerRefundId: provider.id, receipt: provider.receipt ?? null };
  }

  it("an early webhook without a receipt is retained as evidence and replayed after correlation", async () => {
    const t = await lockedUncertain();
    const first = await applyRefundEvent(t.paymentId, t.providerRefundId, "processed", { amount: t.amount, receipt: null });
    expect(first).toBe("evidence_kept");
    expect((await refundOf(t.orderId, t.refund.id)).state).toBe("processing"); // not applied on guesswork
    const ev = (await getRefundRecovery(t.orderId)).evidence[0]!;
    expect(ev).toMatchObject({ providerRefundId: t.providerRefundId, state: "unresolved", status: "processed" });

    await reconcileRefund(t.orderId, t.refund.id, "admin_test"); // adopts by receipt, then replays
    expect(await refundOf(t.orderId, t.refund.id)).toMatchObject({ state: "completed", providerRefundId: t.providerRefundId });
    expect((await getRefundRecovery(t.orderId)).evidence[0]!.state).toBe("applied");
    expect((await getOrder(t.orderId)).payment.refundedTotal).toBe(t.amount);
  });

  it("an early webhook carrying our receipt is correlated immediately (receipt + payment + exact amount)", async () => {
    const t = await lockedUncertain();
    expect(await applyRefundEvent(t.paymentId, t.providerRefundId, "processed", { amount: t.amount, receipt: t.receipt })).toBe("completed");
    expect(await refundOf(t.orderId, t.refund.id)).toMatchObject({ state: "completed", providerRefundId: t.providerRefundId });
  });

  it("duplicate and replayed webhooks change totals once", async () => {
    const t = await lockedUncertain();
    for (let i = 0; i < 3; i++) await applyRefundEvent(t.paymentId, t.providerRefundId, "processed", { amount: t.amount, receipt: t.receipt });
    const o = await getOrder(t.orderId);
    expect(o.payment.refundedTotal).toBe(t.amount);
    expect(o.payment.refunds).toHaveLength(1);
    expect(o.paymentStatus).toBe("partially_refunded");
  });

  it("a stale failed event cannot undo a completed refund", async () => {
    const t = await lockedUncertain();
    await applyRefundEvent(t.paymentId, t.providerRefundId, "processed", { amount: t.amount, receipt: t.receipt });
    expect(await applyRefundEvent(t.paymentId, t.providerRefundId, "failed", { amount: t.amount, receipt: t.receipt })).toBe("ignored");
    expect(await refundOf(t.orderId, t.refund.id)).toMatchObject({ state: "completed" });
    expect((await getOrder(t.orderId)).payment.refundedTotal).toBe(t.amount);
    expect((await getRefundRecovery(t.orderId)).evidence.find((e) => e.state === "ignored_stale")).toBeTruthy();
  });

  it("an event that names the wrong payment or amount is not applied and flags the order", async () => {
    const t = await lockedUncertain();
    // right id, wrong amount
    expect(await applyRefundEvent(t.paymentId, t.providerRefundId, "processed", { amount: t.amount + 5, receipt: t.receipt })).toBe("mismatch");
    expect(await refundOf(t.orderId, t.refund.id)).toMatchObject({ state: "processing" });
    expect((await getOrder(t.orderId)).needsReview).toBe(true);
    // right receipt, wrong payment (observation applied directly, as a fetch/list result would be)
    const res = await applyRefundObservation(t.orderId, { providerRefundId: t.providerRefundId, paymentId: "pay_other", amount: t.amount, status: "processed", receipt: t.receipt }, "list");
    expect(res).toBe("mismatch");
    expect((await getOrder(t.orderId)).payment.refundedTotal).toBe(0);
  });

  it("an event for a payment we do not know is kept, not dropped or applied", async () => {
    const id = newId("rfnd_");
    expect(await applyRefundEvent(newId("pay_"), id, "processed", { amount: 500, receipt: "x" })).toBe("evidence_kept");
    expect((await db().collection("unmatchedRefundEvidence").doc(id).get()).exists).toBe(true);
  });

  it("a refund that surfaces for an attempt already declared absent is flagged, never merged", async () => {
    const { orderId, paymentId, refund } = await requestedRefund();
    vi.spyOn(payments(), "refund").mockRejectedValueOnce(new Error("ETIMEDOUT"));
    await expect(executeRefund(orderId, refund.id, "admin_test")).rejects.toMatchObject({ code: "REFUND_UNCERTAIN" });
    await reconcileRefund(orderId, refund.id, "admin_test");
    await attestRefundNotCreated(orderId, refund.id, "admin_test", "Checked the Razorpay dashboard for this payment: no refund present.");
    await executeRefund(orderId, refund.id, "admin_test"); // attempt 2 completes
    // ...and later the provider reports a refund carrying the OLD receipt
    const res = await applyRefundEvent(paymentId, "rfnd_late_old", "processed", { amount: refund.amount, receipt: receiptFor(refund.id, 1) });
    expect(res).toBe("superseded");
    const o = await getOrder(orderId);
    expect(o.payment.refundedTotal).toBe(refund.amount); // not doubled
    expect(o.needsReview).toBe(true);
  });
});

describe("caps", () => {
  it("a retried refund re-checks the cap against newer requests", async () => {
    const p = await paidOrder();
    await applyOrderAction(p.orderId, { type: "refund_request", amount: p.total, reason: "Full refund" }, "admin_test");
    const first = (await getOrder(p.orderId)).payment.refunds[0]!;
    vi.spyOn(payments(), "refund").mockRejectedValueOnce(new ProviderError("bad request", "rejected", 400));
    await expect(executeRefund(p.orderId, first.id, "a")).rejects.toThrow();
    // the failed refund no longer counts as open, so a second full request fits...
    await applyOrderAction(p.orderId, { type: "refund_request", amount: p.total, reason: "Second" }, "admin_test");
    // ...but then the first can no longer be retried without exceeding the order total
    await expect(executeRefund(p.orderId, first.id, "a")).rejects.toMatchObject({ code: "OVER_REFUND" });
  });
});
