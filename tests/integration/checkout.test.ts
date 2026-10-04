import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/firebase/admin";
import { C, newId } from "@/server/repos/common";
import { placeOrder } from "@/server/services/checkout";
import { applyPaymentCaptured, applyPaymentFailed, expireReservations, handleRazorpayWebhook, switchToCod, verifyCheckoutCallback } from "@/server/services/payment-events";
import { orderFromDoc, orderRef } from "@/server/services/order-core";
import { hmacHex, simulatedPayments, SIM_WEBHOOK_SECRET } from "@/server/providers/payments";
import { checkoutInput, ensureSettings, getProductUnits, getVariant, makeProduct } from "../helpers/fixtures";

const key = () => newId("idem").padEnd(20, "x");
const order = async (id: string) => orderFromDoc(await orderRef(id).get());

beforeAll(async () => {
  await ensureSettings();
});

describe("COD checkout", () => {
  it("allocates stock immediately, leaves payment pending (never paid), and snapshots prices", async () => {
    const f = await makeProduct({ stocks: [5] });
    const r = await placeOrder(checkoutInput(f.variants[0]!.id, 2), { userId: null, idempotencyKey: key() });
    expect(r.paymentMethod).toBe("cod");
    const o = await order(r.orderId);
    expect(o.paymentStatus).toBe("pending");
    expect(o.status).toBe("new");
    expect(o.stockState).toBe("committed");
    expect(o.items[0]).toMatchObject({ unitPrice: f.price, quantity: 2, lineTotal: f.price * 2 });
    const v = await getVariant(f.variants[0]!.id);
    expect(v.stock).toBe(3);
    expect(v.reserved).toBe(0);
    expect(await getProductUnits(f.productId)).toBe(3);
  });

  it("repeating the same idempotency key returns the same order and deducts stock once", async () => {
    const f = await makeProduct({ stocks: [5] });
    const k = key();
    const input = checkoutInput(f.variants[0]!.id, 1);
    const a = await placeOrder(input, { userId: null, idempotencyKey: k });
    const b = await placeOrder(input, { userId: null, idempotencyKey: k });
    expect(b.orderId).toBe(a.orderId);
    expect(b.reused).toBe(true);
    expect((await getVariant(f.variants[0]!.id)).stock).toBe(4);
  });

  it("rejects the same key reused with a different request", async () => {
    const f = await makeProduct({ stocks: [5] });
    const k = key();
    await placeOrder(checkoutInput(f.variants[0]!.id, 1), { userId: null, idempotencyKey: k });
    await expect(placeOrder(checkoutInput(f.variants[0]!.id, 2), { userId: null, idempotencyKey: k })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("concurrent identical submissions with one key still create exactly one order", async () => {
    const f = await makeProduct({ stocks: [5] });
    const k = key();
    const input = checkoutInput(f.variants[0]!.id, 1);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => placeOrder(input, { userId: null, idempotencyKey: k })));
    const ids = new Set(results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<{ orderId: string }>).value.orderId));
    expect(ids.size).toBe(1);
    expect((await getVariant(f.variants[0]!.id)).stock).toBe(4);
  });

  it("two simultaneous purchases of the last unit: exactly one wins", async () => {
    const f = await makeProduct({ stocks: [1] });
    const attempts = await Promise.allSettled([
      placeOrder(checkoutInput(f.variants[0]!.id, 1), { userId: null, idempotencyKey: key() }),
      placeOrder(checkoutInput(f.variants[0]!.id, 1, { contact: { name: "B", email: "b@example.test", phone: "+919876500000" } }), { userId: null, idempotencyKey: key() }),
    ]);
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    const loser = attempts.find((a) => a.status === "rejected") as PromiseRejectedResult;
    expect(["OUT_OF_STOCK", "CART_CHANGED"]).toContain(loser.reason.code);
    const v = await getVariant(f.variants[0]!.id);
    expect(v.stock).toBe(0);
    expect(v.stock).toBeGreaterThanOrEqual(0);
  });

  it("mixed COD and prepaid contenders for the last unit also cannot oversell", async () => {
    const f = await makeProduct({ stocks: [1] });
    const attempts = await Promise.allSettled([
      placeOrder(checkoutInput(f.variants[0]!.id, 1, { paymentMethod: "cod" }), { userId: null, idempotencyKey: key() }),
      placeOrder(checkoutInput(f.variants[0]!.id, 1, { paymentMethod: "razorpay" }), { userId: null, idempotencyKey: key() }),
    ]);
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    const v = await getVariant(f.variants[0]!.id);
    expect(v.stock - v.reserved).toBe(0);
  });

  it("refuses quantities above stock and unknown variants", async () => {
    const f = await makeProduct({ stocks: [2] });
    await expect(placeOrder(checkoutInput(f.variants[0]!.id, 3), { userId: null, idempotencyKey: key() })).rejects.toMatchObject({ code: "CART_CHANGED" });
    await expect(placeOrder(checkoutInput("var_nope", 1), { userId: null, idempotencyKey: key() })).rejects.toMatchObject({ code: "CART_CHANGED" });
    expect((await getVariant(f.variants[0]!.id)).stock).toBe(2);
  });

  it("blocks COD for blocked pincodes and unserviceable pincodes", async () => {
    const f = await makeProduct({ stocks: [3] });
    const base = checkoutInput(f.variants[0]!.id, 1);
    await expect(placeOrder({ ...base, address: { ...base.address, pincode: "682001" } }, { userId: null, idempotencyKey: key() })).rejects.toMatchObject({ status: 400 });
    await expect(placeOrder({ ...base, address: { ...base.address, pincode: "744101" } }, { userId: null, idempotencyKey: key() })).rejects.toMatchObject({ status: 400 });
  });

  it("never lets enquiry-only (made-to-measure) pieces be bought at list price", async () => {
    const f = await makeProduct({ stocks: [9], enquiryOnly: true, customizable: true });
    await expect(placeOrder(checkoutInput(f.variants[0]!.id, 1), { userId: null, idempotencyKey: key() })).rejects.toMatchObject({ code: "CART_CHANGED" });
  });

  it("maintains the transactional isLowStock flag", async () => {
    const f = await makeProduct({ stocks: [5], threshold: 3 });
    expect((await getVariant(f.variants[0]!.id)).isLowStock).toBe(false);
    await placeOrder(checkoutInput(f.variants[0]!.id, 2), { userId: null, idempotencyKey: key() });
    expect((await getVariant(f.variants[0]!.id)).isLowStock).toBe(true);
  });
});

describe("prepaid reservation lifecycle", () => {
  async function prepaid(stock = 3, qty = 1) {
    const f = await makeProduct({ stocks: [stock] });
    const r = await placeOrder(checkoutInput(f.variants[0]!.id, qty, { paymentMethod: "razorpay" }), { userId: null, idempotencyKey: key() });
    return { f, r, vid: f.variants[0]!.id };
  }
  const capture = (providerOrderId: string, amount: number, extra: Partial<Parameters<typeof applyPaymentCaptured>[0]> = {}) =>
    applyPaymentCaptured({ providerOrderId, paymentId: "pay_" + newId(), amount, currency: "INR", source: "webhook", ...extra });

  it("reserves (not deducts) stock and creates a provider order after the transaction", async () => {
    const { r, vid } = await prepaid(3, 2);
    expect(r.payment?.providerOrderId).toMatch(/^order_SIM/);
    const v = await getVariant(vid);
    expect(v).toMatchObject({ stock: 3, reserved: 2 });
    const o = await order(r.orderId);
    expect(o.stockState).toBe("reserved");
    expect(o.paymentStatus).toBe("pending");
  });

  it("captured payment commits the reservation exactly once, even if callback, webhook and reconcile all fire", async () => {
    const { r, vid } = await prepaid(3, 1);
    const pid = (await order(r.orderId)).payment.razorpayOrderId!;
    const results = await Promise.all([capture(pid, r.total, { paymentId: "pay_same", source: "callback" }), capture(pid, r.total, { paymentId: "pay_same", source: "webhook" }), capture(pid, r.total, { paymentId: "pay_same", source: "reconcile" })]);
    expect(results.filter((x) => x.applied)).toHaveLength(1);
    const v = await getVariant(vid);
    expect(v).toMatchObject({ stock: 2, reserved: 0 });
    const o = await order(r.orderId);
    expect(o.paymentStatus).toBe("paid");
    expect(o.stockState).toBe("committed");
  });

  it("a payment with the wrong amount is held for review and does not confirm the order", async () => {
    const { r, vid } = await prepaid(3, 1);
    const pid = (await order(r.orderId)).payment.razorpayOrderId!;
    const res = await capture(pid, r.total - 100);
    expect(res).toMatchObject({ applied: false, reason: "amount_mismatch" });
    const o = await order(r.orderId);
    expect(o.paymentStatus).toBe("pending");
    expect(o.needsReview).toBe(true);
    expect((await getVariant(vid)).reserved).toBe(1);
  });

  it("a failed event arriving AFTER a capture cannot downgrade the order", async () => {
    const { r } = await prepaid(3, 1);
    const pid = (await order(r.orderId)).payment.razorpayOrderId!;
    await capture(pid, r.total);
    await applyPaymentFailed({ providerOrderId: pid, paymentId: "pay_late_fail", reason: "late" });
    expect((await order(r.orderId)).paymentStatus).toBe("paid");
  });

  it("a failed payment keeps the hold and allows a bounded retry, then payment succeeds", async () => {
    const { r, vid } = await prepaid(3, 1);
    const first = (await order(r.orderId)).payment.razorpayOrderId!;
    await applyPaymentFailed({ providerOrderId: first, paymentId: "pay_f1", reason: "declined" });
    let o = await order(r.orderId);
    expect(o.paymentStatus).toBe("failed");
    expect((await getVariant(vid)).reserved).toBe(1);
    const { newPaymentAttempt } = await import("@/server/services/checkout");
    const s2 = await newPaymentAttempt(r.orderId);
    expect(s2.providerOrderId).not.toBe(first);
    o = await order(r.orderId);
    expect(o.payment.attempts).toBe(2);
    expect(o.paymentStatus).toBe("pending");
    await capture(s2.providerOrderId, r.total);
    expect((await order(r.orderId)).paymentStatus).toBe("paid");
  });

  it("stops offering retries after the maximum number of attempts", async () => {
    const { r } = await prepaid(3, 1);
    const { newPaymentAttempt } = await import("@/server/services/checkout");
    await newPaymentAttempt(r.orderId); // attempt 2
    await newPaymentAttempt(r.orderId); // attempt 3
    await expect(newPaymentAttempt(r.orderId)).rejects.toMatchObject({ code: "MAX_ATTEMPTS" });
  });

  it("expiry releases the hold exactly once and cancels the order; rerunning is a no-op", async () => {
    const { r, vid } = await prepaid(3, 2);
    const o = await order(r.orderId);
    await db().collection(C.reservations).doc(o.reservationId!).update({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    const [a, b] = await Promise.all([expireReservations(500), expireReservations(500)]);
    expect(a.released + b.released).toBeGreaterThanOrEqual(1);
    const v = await getVariant(vid);
    expect(v).toMatchObject({ stock: 3, reserved: 0 });
    const after = await order(r.orderId);
    expect(after.status).toBe("cancelled");
    expect(after.cancelReason).toBe("payment_expired");
    await expireReservations(500);
    expect(await getVariant(vid)).toMatchObject({ stock: 3, reserved: 0 });
    expect(await getProductUnits((await makeProductUnitsProbe(vid)))).toBe(3);
  });

  it("late payment after expiry re-allocates stock when still available", async () => {
    const { r, vid } = await prepaid(3, 1);
    const o = await order(r.orderId);
    await db().collection(C.reservations).doc(o.reservationId!).update({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    await expireReservations(500);
    const res = await capture(o.payment.razorpayOrderId!, r.total);
    expect(res).toMatchObject({ applied: true, outcome: "revived" });
    const after = await order(r.orderId);
    expect(after.status).toBe("new");
    expect(after.stockState).toBe("committed");
    expect(after.paymentStatus).toBe("paid");
    expect((await getVariant(vid)).stock).toBe(2);
  });

  it("late payment after expiry with the stock sold elsewhere goes to manual review with a refund request - never fulfilled", async () => {
    const { f, r, vid } = await prepaid(1, 1);
    const o = await order(r.orderId);
    await db().collection(C.reservations).doc(o.reservationId!).update({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    await expireReservations(500);
    await placeOrder(checkoutInput(f.variants[0]!.id, 1), { userId: null, idempotencyKey: key() }); // someone else buys the last unit (COD)
    const res = await capture(o.payment.razorpayOrderId!, r.total);
    expect(res).toMatchObject({ applied: true, outcome: "needs_review" });
    const after = await order(r.orderId);
    expect(after.needsReview).toBe(true);
    expect(after.status).toBe("cancelled");
    expect(after.payment.refunds.some((x) => x.state === "requested")).toBe(true);
    expect((await getVariant(vid)).stock).toBe(0); // not oversold
  });

  it("switching to COD after a failed payment commits the hold and adds no stock movement twice", async () => {
    const { r, vid } = await prepaid(3, 1);
    await applyPaymentFailed({ providerOrderId: (await order(r.orderId)).payment.razorpayOrderId!, paymentId: "pay_x", reason: "x" });
    await switchToCod(r.orderId);
    const o = await order(r.orderId);
    expect(o.paymentMethod).toBe("cod");
    expect(o.paymentStatus).toBe("pending");
    expect(await getVariant(vid)).toMatchObject({ stock: 2, reserved: 0 });
  });

  it("browser callback: tampered signature is rejected; valid one confirms only after provider verification", async () => {
    const { r } = await prepaid(3, 1);
    const pid = (await order(r.orderId)).payment.razorpayOrderId!;
    const { payment, signature } = await simulatedPayments().simulateCustomerPayment(pid, "success");
    await expect(verifyCheckoutCallback(r.orderId, { providerOrderId: pid, paymentId: payment.id, signature: "0".repeat(64) })).rejects.toMatchObject({ status: 400 });
    expect((await order(r.orderId)).paymentStatus).toBe("pending");
    const ok = await verifyCheckoutCallback(r.orderId, { providerOrderId: pid, paymentId: payment.id, signature });
    expect(ok.status).toBe("paid");
    expect((await order(r.orderId)).paymentStatus).toBe("paid");
  });
});

async function makeProductUnitsProbe(variantDocId: string): Promise<string> {
  return ((await db().collection(C.variants).doc(variantDocId).get()).data() as { productId: string }).productId;
}

describe("webhooks", () => {
  const signed = (obj: unknown, secret = SIM_WEBHOOK_SECRET()) => {
    const raw = JSON.stringify(obj);
    return { raw, sig: hmacHex(secret, raw) };
  };

  it("rejects a bad signature and a tampered body", async () => {
    const evt = { event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_x", amount: 100, currency: "INR", status: "captured" } } } };
    const { raw, sig } = signed(evt);
    expect((await handleRazorpayWebhook(raw, "deadbeef", "evt_1")).status).toBe(400);
    expect((await handleRazorpayWebhook(raw.replace("100", "101"), sig, "evt_1")).status).toBe(400);
    expect((await handleRazorpayWebhook(raw, null, "evt_1")).status).toBe(400);
  });

  it("processes a valid captured webhook once; a replay with the same event id is acknowledged as duplicate", async () => {
    const f = await makeProduct({ stocks: [3] });
    const r = await placeOrder(checkoutInput(f.variants[0]!.id, 1, { paymentMethod: "razorpay" }), { userId: null, idempotencyKey: key() });
    const pid = (await order(r.orderId)).payment.razorpayOrderId!;
    const evt = { event: "payment.captured", payload: { payment: { entity: { id: "pay_" + newId(), order_id: pid, amount: r.total, currency: "INR", status: "captured" } } } };
    const { raw, sig } = signed(evt);
    const eventId = "evt_" + newId();
    expect(await handleRazorpayWebhook(raw, sig, eventId)).toMatchObject({ status: 200, body: { ok: true } });
    expect(await handleRazorpayWebhook(raw, sig, eventId)).toMatchObject({ status: 200, body: { duplicate: true } });
    expect(await getVariant(f.variants[0]!.id)).toMatchObject({ stock: 2, reserved: 0 });
    // a different event id carrying the same payment is also harmless
    await handleRazorpayWebhook(raw, sig, "evt_" + newId());
    expect(await getVariant(f.variants[0]!.id)).toMatchObject({ stock: 2, reserved: 0 });
  });

  it("out-of-order delivery (failed event after captured event) leaves the order paid", async () => {
    const f = await makeProduct({ stocks: [3] });
    const r = await placeOrder(checkoutInput(f.variants[0]!.id, 1, { paymentMethod: "razorpay" }), { userId: null, idempotencyKey: key() });
    const pid = (await order(r.orderId)).payment.razorpayOrderId!;
    const cap = signed({ event: "payment.captured", payload: { payment: { entity: { id: "pay_ok", order_id: pid, amount: r.total, currency: "INR", status: "captured" } } } });
    const fail = signed({ event: "payment.failed", payload: { payment: { entity: { id: "pay_bad", order_id: pid, amount: r.total, currency: "INR", status: "failed" } } } });
    await handleRazorpayWebhook(cap.raw, cap.sig, "evt_" + newId());
    await handleRazorpayWebhook(fail.raw, fail.sig, "evt_" + newId());
    expect((await order(r.orderId)).paymentStatus).toBe("paid");
  });
});
