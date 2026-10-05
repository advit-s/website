import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/firebase/admin";
import { C, newId } from "@/server/repos/common";
import { placeOrder } from "@/server/services/checkout";
import { applyPaymentCaptured, switchToCod } from "@/server/services/payment-events";
import { applyOrderAction, executeRefund } from "@/server/services/admin-orders";
import { listPaymentExceptions } from "@/server/services/payment-exceptions";
import { reconcileRefund } from "@/server/services/refunds";
import { orderFromDoc, orderRef } from "@/server/services/order-core";
import { payments, simulatedPayments } from "@/server/providers/payments";
import { shipping } from "@/server/providers/shipping";
import { checkoutInput, ensureSettings, getVariant, makeProduct } from "../helpers/fixtures";

beforeAll(ensureSettings);
afterEach(() => vi.restoreAllMocks());
const getOrder = async (id: string) => orderFromDoc(await orderRef(id).get());

/** A prepaid checkout that the customer then switched to COD, while an earlier online attempt is still open at the provider. */
async function codSwitched() {
  const f = await makeProduct({ stocks: [5] });
  const vid = f.variants[0]!.id;
  const r = await placeOrder(checkoutInput(vid, 1, { paymentMethod: "razorpay" }), { userId: null, idempotencyKey: newId("idem_") });
  await switchToCod(r.orderId);
  const sim = await simulatedPayments().simulateCustomerPayment(r.payment!.providerOrderId, "success");
  const capture = { providerOrderId: r.payment!.providerOrderId, paymentId: sim.payment.id, amount: sim.payment.amount, currency: "INR", source: "webhook" as const };
  return { vid, r, capture };
}
const exceptions = (orderId: string) => listPaymentExceptions(orderId);

describe("payment captured after a COD switch", () => {
  it("repeated capture delivery keeps one exception, allocates stock once and preserves fulfilment", async () => {
    const { vid, r, capture } = await codSwitched();
    await orderRef(r.orderId).update({ status: "processing" });
    for (const source of ["webhook", "callback", "reconcile", "webhook"] as const) await applyPaymentCaptured({ ...capture, source });
    expect((await getVariant(vid)).stock).toBe(4); // COD commit only; never a second deduction
    const o = await getOrder(r.orderId);
    expect(o).toMatchObject({ status: "processing", paymentMethod: "cod", paymentStatus: "pending", needsReview: true });
    const ex = await exceptions(r.orderId);
    expect(ex).toHaveLength(1);
    expect(ex[0]).toMatchObject({ kind: "after_cod_switch", paymentId: capture.paymentId, amount: capture.amount, status: "needs_review", fulfilmentAtCapture: "processing", courierReview: false });
    expect(o.payment.exceptionPaymentIds).toContain(capture.paymentId);
  });

  it("blocks confirmation, processing and shipping until resolved, and never books a courier meanwhile", async () => {
    const { r, capture } = await codSwitched();
    await applyPaymentCaptured(capture);
    await expect(applyOrderAction(r.orderId, { type: "confirm" }, "admin_test")).rejects.toMatchObject({ code: "PAYMENT_EXCEPTION" });
    await orderRef(r.orderId).update({ status: "confirmed" });
    await expect(applyOrderAction(r.orderId, { type: "start_processing" }, "admin_test")).rejects.toMatchObject({ code: "PAYMENT_EXCEPTION" });
    await orderRef(r.orderId).update({ status: "processing" });
    const book = vi.spyOn(shipping(), "book");
    await expect(applyOrderAction(r.orderId, { type: "ship", mode: "shiprocket" }, "admin_test")).rejects.toMatchObject({ code: "PAYMENT_EXCEPTION" });
    await expect(applyOrderAction(r.orderId, { type: "ship", mode: "manual", courierName: "X", awbNumber: "AWB1" }, "admin_test")).rejects.toMatchObject({ code: "PAYMENT_EXCEPTION" });
    expect(book).not.toHaveBeenCalled();
    expect((await getOrder(r.orderId)).status).toBe("processing");
  });

  it("an already-shipped order keeps its history and is flagged for courier review", async () => {
    const { r, capture } = await codSwitched();
    await orderRef(r.orderId).update({ status: "shipped", "shipment.awbNumber": "AWB-EXIST", "shipment.provider": "manual", "shipment.courierName": "DTDC" });
    await applyPaymentCaptured(capture);
    const o = await getOrder(r.orderId);
    expect(o.status).toBe("shipped");
    expect(o.shipment.awbNumber).toBe("AWB-EXIST");
    const [ex] = await exceptions(r.orderId);
    expect(ex).toMatchObject({ courierReview: true, fulfilmentAtCapture: "shipped" });
    expect(ex!.guidance).toMatch(/courier/i);
    // delivery can still be recorded: the parcel is physically on its way
    await applyOrderAction(r.orderId, { type: "deliver", codCollected: false }, "admin_test");
    expect((await getOrder(r.orderId)).status).toBe("delivered");
  });

  it("generic clear_review cannot bypass an unresolved exception or an uncertain refund", async () => {
    const { r, capture } = await codSwitched();
    await applyPaymentCaptured(capture);
    await expect(applyOrderAction(r.orderId, { type: "clear_review" }, "admin_test")).rejects.toMatchObject({ code: "REVIEW_BLOCKED" });
    expect((await getOrder(r.orderId)).needsReview).toBe(true);
  });
});

describe("resolution", () => {
  it("refunds the extra payment on verified provider evidence, then unblocks fulfilment; the COD order's own totals are untouched", async () => {
    const { vid, r, capture } = await codSwitched();
    await applyPaymentCaptured(capture);
    const [ex] = await exceptions(r.orderId);

    await applyOrderAction(r.orderId, { type: "exception_refund", exceptionId: ex!.id }, "admin_test");
    let o = await getOrder(r.orderId);
    const refund = o.payment.refunds[0]!;
    expect(refund).toMatchObject({ amount: capture.amount, exceptionId: ex!.id, paymentId: capture.paymentId, state: "requested" });
    expect((await exceptions(r.orderId))[0]!.status).toBe("refund_requested");
    // still blocked while the money is not back, and a second request is refused
    await expect(applyOrderAction(r.orderId, { type: "confirm" }, "admin_test")).rejects.toMatchObject({ code: "PAYMENT_EXCEPTION" });
    await expect(applyOrderAction(r.orderId, { type: "exception_refund", exceptionId: ex!.id }, "admin_test")).rejects.toMatchObject({ code: "NOT_OPEN" });

    await executeRefund(r.orderId, refund.id, "admin_test");
    o = await getOrder(r.orderId);
    expect(o.payment.refunds[0]!.state).toBe("completed");
    expect(o.payment.refundedTotal).toBe(0); // the order's own payment is not refunded
    expect(o.paymentStatus).toBe("pending"); // still an unpaid COD order
    expect((await exceptions(r.orderId))[0]!.status).toBe("refunded");
    expect((await getVariant(vid)).stock).toBe(4);

    await applyOrderAction(r.orderId, { type: "clear_review" }, "admin_test");
    await applyOrderAction(r.orderId, { type: "confirm" }, "admin_test");
    expect((await getOrder(r.orderId)).status).toBe("confirmed");
  });

  it("refuses to refund when the provider's record disagrees", async () => {
    const { r, capture } = await codSwitched();
    await applyPaymentCaptured(capture);
    const [ex] = await exceptions(r.orderId);
    vi.spyOn(payments(), "fetchPayment").mockResolvedValue({ id: capture.paymentId, orderId: capture.providerOrderId, amount: capture.amount - 1, currency: "INR", status: "captured", method: "upi", errorDescription: null });
    await expect(applyOrderAction(r.orderId, { type: "exception_refund", exceptionId: ex!.id }, "admin_test")).rejects.toMatchObject({ code: "PROVIDER_MISMATCH" });
    vi.spyOn(payments(), "fetchPayment").mockResolvedValue({ id: capture.paymentId, orderId: "order_of_someone_else", amount: capture.amount, currency: "INR", status: "captured", method: "upi", errorDescription: null });
    await expect(applyOrderAction(r.orderId, { type: "exception_refund", exceptionId: ex!.id }, "admin_test")).rejects.toMatchObject({ code: "PROVIDER_MISMATCH" });
    expect((await getOrder(r.orderId)).payment.refunds).toHaveLength(0);
  });

  it("an uncertain exception refund stays locked and is recovered with the same machinery", async () => {
    const { r, capture } = await codSwitched();
    await applyPaymentCaptured(capture);
    const [ex] = await exceptions(r.orderId);
    await applyOrderAction(r.orderId, { type: "exception_refund", exceptionId: ex!.id }, "admin_test");
    const refund = (await getOrder(r.orderId)).payment.refunds[0]!;
    const real = payments().refund.bind(payments());
    vi.spyOn(payments(), "refund").mockImplementation(async (p) => {
      await real(p);
      throw new Error("timeout");
    });
    await expect(executeRefund(r.orderId, refund.id, "admin_test")).rejects.toMatchObject({ code: "REFUND_UNCERTAIN" });
    vi.restoreAllMocks();
    await expect(applyOrderAction(r.orderId, { type: "clear_review" }, "admin_test")).rejects.toMatchObject({ code: "REVIEW_BLOCKED" });
    expect((await reconcileRefund(r.orderId, refund.id, "admin_test")).outcome).toBe("completed");
    expect((await exceptions(r.orderId))[0]!.status).toBe("refunded");
    const refunds = Object.values(((await db().collection(C.simPayments).doc(capture.paymentId).get()).data() as { refunds: Record<string, unknown> }).refunds);
    expect(refunds).toHaveLength(1);
  });

  it("'already refunded elsewhere' is accepted only when the provider shows the refund", async () => {
    const { r, capture } = await codSwitched();
    await applyPaymentCaptured(capture);
    const [ex] = await exceptions(r.orderId);
    const note = "Refunded from the Razorpay dashboard on 5 Oct, reference in the ticket.";
    await expect(applyOrderAction(r.orderId, { type: "exception_reconcile", exceptionId: ex!.id, note }, "admin_test")).rejects.toMatchObject({ code: "NOT_REFUNDED" });
    await expect(applyOrderAction(r.orderId, { type: "exception_reconcile", exceptionId: ex!.id, note: "short" }, "admin_test")).rejects.toThrow();
    // refund it directly at the provider (outside the app) and record that
    await payments().refund({ paymentId: capture.paymentId, amount: capture.amount, receipt: "dashboard-manual-1" });
    await applyOrderAction(r.orderId, { type: "exception_reconcile", exceptionId: ex!.id, note }, "admin_test");
    expect((await exceptions(r.orderId))[0]).toMatchObject({ status: "reconciled_manually", resolvedBy: "admin_test" });
    await applyOrderAction(r.orderId, { type: "clear_review" }, "admin_test");
    expect((await getOrder(r.orderId)).needsReview).toBe(false);
  });
});

describe("a second capture on an already-paid order", () => {
  it("opens a duplicate_capture exception instead of being silently ignored, and the same payment arriving twice does not", async () => {
    const f = await makeProduct({ stocks: [5] });
    const r = await placeOrder(checkoutInput(f.variants[0]!.id, 1, { paymentMethod: "razorpay" }), { userId: null, idempotencyKey: newId("idem_") });
    const pay = async () => (await simulatedPayments().simulateCustomerPayment(r.payment!.providerOrderId, "success")).payment;
    const first = await pay();
    const cap = (p: { id: string; amount: number }) => ({ providerOrderId: r.payment!.providerOrderId, paymentId: p.id, amount: p.amount, currency: "INR", source: "webhook" as const });
    await applyPaymentCaptured(cap(first));
    await applyPaymentCaptured({ ...cap(first), source: "callback" }); // same payment, second channel: normal
    expect(await exceptions(r.orderId)).toHaveLength(0);
    expect((await getOrder(r.orderId)).needsReview).toBe(false);

    const second = await pay();
    expect((await applyPaymentCaptured(cap(second)))).toMatchObject({ applied: false, reason: "duplicate_capture" });
    await applyPaymentCaptured(cap(second));
    const ex = await exceptions(r.orderId);
    expect(ex).toHaveLength(1);
    expect(ex[0]).toMatchObject({ kind: "duplicate_capture", paymentId: second.id });
    const o = await getOrder(r.orderId);
    expect(o).toMatchObject({ paymentStatus: "paid", needsReview: true });
    expect(o.payment.razorpayPaymentId).toBe(first.id); // the order's own payment is untouched
  });
});
