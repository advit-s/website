import { beforeAll, afterEach, expect, it, vi } from "vitest";
import { db } from "@/server/firebase/admin";
import { C, newId } from "@/server/repos/common";
import { placeOrder } from "@/server/services/checkout";
import { applyPaymentCaptured, applyRefundEvent, switchToCod } from "@/server/services/payment-events";
import { executeRefund, applyOrderAction } from "@/server/services/admin-orders";
import { orderFromDoc, orderRef } from "@/server/services/order-core";
import { payments } from "@/server/providers/payments";
import { checkoutInput, ensureSettings, getVariant, makeProduct } from "../helpers/fixtures";

beforeAll(ensureSettings);
afterEach(() => vi.restoreAllMocks());
const getOrder = async (id: string) => orderFromDoc(await orderRef(id).get());

async function prepaid() {
  const f = await makeProduct({ stocks: [5] });
  const vid = f.variants[0]!.id;
  const r = await placeOrder(checkoutInput(vid, 1, { paymentMethod: "razorpay" }), { userId: null, idempotencyKey: newId("idem_") });
  return { vid, r, capture: { providerOrderId: r.payment!.providerOrderId, paymentId: newId("pay_"), amount: r.total, currency: "INR", source: "webhook" as const } };
}

it("late online capture after a COD switch cannot deduct stock twice or reset fulfilment", async () => {
  const { vid, r, capture } = await prepaid();
  await switchToCod(r.orderId);
  await orderRef(r.orderId).update({ status: "processing" });
  await applyPaymentCaptured(capture);
  expect((await getVariant(vid)).stock).toBe(4);
  const o = await getOrder(r.orderId);
  expect(o.status).toBe("processing");
  expect(o.paymentMethod).toBe("cod");
  expect(o.needsReview).toBe(true);
});

async function refundable() {
  const { r, capture } = await prepaid();
  await applyPaymentCaptured(capture);
  await applyOrderAction(r.orderId, { type: "refund_request", amount: 100, reason: "Partial refund" }, "admin_test");
  const o = await getOrder(r.orderId);
  return { r, capture, refund: o.payment.refunds[0]! };
}

it("a refund already dispatched cannot be dispatched a second time while its provider id is pending", async () => {
  const { r, refund } = await refundable();
  const o = await getOrder(r.orderId);
  await orderRef(r.orderId).update({ "payment.refunds": o.payment.refunds.map(x => ({ ...x, state: "processing" })) });
  await expect(executeRefund(r.orderId, refund.id, "admin_test")).rejects.toMatchObject({ code: "IN_PROGRESS" });
});

it("a refund timeout leaves an uncertain result locked for reconciliation, not available for retry", async () => {
  const { r, refund } = await refundable();
  // A transport timeout cannot tell us whether money already moved at the provider.
  vi.spyOn(payments(), "refund").mockRejectedValue(new Error("request timed out"));
  await expect(executeRefund(r.orderId, refund.id, "admin_test")).rejects.toMatchObject({ code: "REFUND_UNCERTAIN" });
  expect((await getOrder(r.orderId)).payment.refunds[0]!.state).toBe("processing");
  expect((await getOrder(r.orderId)).needsReview).toBe(true);
  await expect(executeRefund(r.orderId, refund.id, "admin_test")).rejects.toMatchObject({ code: "IN_PROGRESS" });
});

it("late failed refund events cannot undo a completed refund", async () => {
  const { r, capture, refund } = await refundable();
  await orderRef(r.orderId).update({
    "payment.refunds": [{ ...refund, providerRefundId: "rfnd_test", state: "completed" }],
    "payment.refundedTotal": refund.amount,
    paymentStatus: "partially_refunded",
  });
  await applyRefundEvent(capture.paymentId, "rfnd_test", "failed");
  expect((await getOrder(r.orderId)).payment.refunds[0]!.state).toBe("completed");
  expect((await getOrder(r.orderId)).payment.refundedTotal).toBe(refund.amount);
});

it("a captured callback with a mismatched amount does not report paid", async () => {
  const { r, capture } = await prepaid();
  const { verifyCheckoutCallback } = await import("@/server/services/payment-events");
  vi.spyOn(payments(), "verifyCheckoutSignature").mockReturnValue(true);
  vi.spyOn(payments(), "fetchPayment").mockResolvedValue({ id: capture.paymentId, orderId: capture.providerOrderId, amount: capture.amount - 1, currency: "INR", status: "captured", method: "upi", errorDescription: null });
  const result = await verifyCheckoutCallback(r.orderId, { providerOrderId: capture.providerOrderId, paymentId: capture.paymentId, signature: "verified-by-provider-adapter" });
  expect(result.status).toBe("pending");
  expect((await getOrder(r.orderId)).needsReview).toBe(true);
});

it("concurrent different payloads sharing an idempotency key cannot receive each other's order", async () => {
  const f = await makeProduct({ stocks: [10] });
  const key = newId("idem_");
  const results = await Promise.allSettled([1, 2].map(quantity => placeOrder(checkoutInput(f.variants[0]!.id, quantity), { userId: null, idempotencyKey: key })));
  expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find(x => x.status === "rejected") as PromiseRejectedResult;
  expect(rejected.reason.code).toBe("IDEMPOTENCY_KEY_REUSED");
  const stored = await db().collection(C.idempotency).where("orderId", "==", (results.find(x => x.status === "fulfilled") as PromiseFulfilledResult<{orderId: string}>).value.orderId).get();
  expect(stored.size).toBe(1);
});
