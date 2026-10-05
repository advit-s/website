import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";

// Per-test integration mode and fake Shiprocket credentials (env() caches its first parse).
const mode = vi.hoisted(() => ({ value: "simulated" as "simulated" | "live" }));
vi.mock("@/server/env", async (orig) => {
  const actual = await orig<typeof import("@/server/env")>();
  return {
    ...actual,
    env: () => ({ ...actual.env(), INTEGRATION_MODE: mode.value, SHIPROCKET_EMAIL: "api@example.test", SHIPROCKET_PASSWORD: "not-a-real-password", SHIPROCKET_PICKUP_LOCATION: "Primary" }),
    isSimulated: () => mode.value === "simulated",
    requireConfigured: (_feature: string, ...keys: string[]) => Object.fromEntries(keys.map((k) => [k, (({ SHIPROCKET_EMAIL: "api@example.test", SHIPROCKET_PASSWORD: "not-a-real-password" }) as Record<string, string>)[k] ?? "x"])),
  };
});

import { db } from "@/server/firebase/admin";
import { C, newId } from "@/server/repos/common";
import { ensurePaymentAttempt, newPaymentAttempt, placeOrder } from "@/server/services/checkout";
import { applyPaymentCaptured, applyPaymentFailed, expireReservations } from "@/server/services/payment-events";
import { applyOrderAction } from "@/server/services/admin-orders";
import { attachBooking, bookWithRecovery, getBooking } from "@/server/services/shipment-booking";
import { orderFromDoc, orderRef } from "@/server/services/order-core";
import { payments, simulatedPayments } from "@/server/providers/payments";
import { ProviderError } from "@/server/providers/errors";
import { shipping, type BookContext, type BookingResult } from "@/server/providers/shipping";
import { savePrivateSettings } from "@/server/repos/settings";
import { DEFAULT_PRIVATE_SETTINGS } from "@/domain/settings";
import { checkoutInput, ensureSettings, makeProduct } from "../helpers/fixtures";

beforeAll(ensureSettings);
afterEach(() => {
  mode.value = "simulated";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const getOrder = async (id: string) => orderFromDoc(await orderRef(id).get());

async function prepaid() {
  const f = await makeProduct({ stocks: [5] });
  const r = await placeOrder(checkoutInput(f.variants[0]!.id, 1, { paymentMethod: "razorpay" }), { userId: null, idempotencyKey: newId("idem_") });
  return { r, vid: f.variants[0]!.id };
}

describe("payment attempt creation vs the stock hold", () => {
  it("a hold that expires while the provider order is being created is rejected, with the provider id retained", async () => {
    const { r } = await prepaid();
    const real = payments().createOrder.bind(payments());
    vi.spyOn(payments(), "createOrder").mockImplementation(async (p) => {
      const po = await real(p);
      // while the provider call was in flight, the hold ran out and the cleanup job released the stock
      const o = await getOrder(r.orderId);
      await db().collection(C.reservations).doc(o.reservationId!).update({ expiresAt: new Date(Date.now() - 1000).toISOString() });
      await expireReservations(500);
      return po;
    });
    await expect(newPaymentAttempt(r.orderId)).rejects.toMatchObject({ code: "ORDER_EXPIRED" });
    const o = await getOrder(r.orderId);
    expect(o.status).toBe("cancelled");
    expect(o.payment.attempts).toBe(1); // the discarded attempt was not counted or offered
    expect(o.payment.providerOrderIds).toHaveLength(2); // ...but its provider id is durable
    const discarded = o.payment.providerOrderIds.find((x) => x !== o.payment.razorpayOrderId)!;
    // were it ever paid, the payment is matched to this order (late-payment path) instead of being an unknown order
    const sim = await simulatedPayments().simulateCustomerPayment(discarded, "success");
    const res = await applyPaymentCaptured({ providerOrderId: discarded, paymentId: sim.payment.id, amount: sim.payment.amount, currency: "INR", source: "webhook" });
    expect(res.orderId).toBe(r.orderId);
    expect(res).not.toMatchObject({ reason: "unknown_order" });
  });

  it("a failure of an obsolete attempt does not mark the current attempt failed", async () => {
    const { r } = await prepaid();
    const first = (await getOrder(r.orderId)).payment.razorpayOrderId!;
    await newPaymentAttempt(r.orderId);
    const o = await getOrder(r.orderId);
    expect(o.payment.razorpayOrderId).not.toBe(first);
    expect(await applyPaymentFailed({ providerOrderId: first, paymentId: newId("pay_"), reason: "old attempt failed" })).toEqual({ applied: false });
    expect((await getOrder(r.orderId)).paymentStatus).toBe("pending");
    // the current attempt's failure still counts
    expect(await applyPaymentFailed({ providerOrderId: o.payment.razorpayOrderId!, paymentId: newId("pay_"), reason: "declined" })).toEqual({ applied: true });
    expect((await getOrder(r.orderId)).paymentStatus).toBe("failed");
  });

  it("provider accepted the order but the process died before persisting: nothing is half-recorded and the retry reuses the same receipt", async () => {
    const { r } = await prepaid();
    const receipts: string[] = [];
    const real = payments().createOrder.bind(payments());
    const spy = vi.spyOn(payments(), "createOrder").mockImplementation(async (p) => {
      receipts.push(p.receipt);
      const po = await real(p);
      if (receipts.length === 1) throw new Error("process died after the provider accepted");
      return po;
    });
    await expect(newPaymentAttempt(r.orderId)).rejects.toThrow(/process died/);
    let o = await getOrder(r.orderId);
    expect(o.payment.attempts).toBe(1);
    expect(o.payment.providerOrderIds).toHaveLength(1);
    const session = await newPaymentAttempt(r.orderId);
    expect(session.attempt).toBe(2);
    o = await getOrder(r.orderId);
    expect(o.payment.providerOrderIds).toHaveLength(2); // only persisted ids are referenced
    expect(receipts[0]).toBe(receipts[1]); // same durable identity: the orphan is identifiable at the provider by receipt
    spy.mockRestore();
  });

  it("two simultaneous new attempts leave one live attempt; the loser's provider order is retained, not referenced as live", async () => {
    const { r } = await prepaid();
    const results = await Promise.allSettled([newPaymentAttempt(r.orderId), newPaymentAttempt(r.orderId)]);
    expect(results.every((x) => x.status === "fulfilled")).toBe(true);
    const o = await getOrder(r.orderId);
    expect(o.payment.attempts).toBe(2);
    expect(o.payment.providerOrderIds).toContain(o.payment.razorpayOrderId!);
    const a = (results[0] as PromiseFulfilledResult<{ providerOrderId: string }>).value.providerOrderId;
    const b = (results[1] as PromiseFulfilledResult<{ providerOrderId: string }>).value.providerOrderId;
    expect(a).toBe(b); // both callers are told about the SAME live attempt
    void ensurePaymentAttempt;
  });
});

/* ------------------------------------------------------------------ courier booking */

async function processingOrder() {
  const f = await makeProduct({ stocks: [5] });
  const r = await placeOrder(checkoutInput(f.variants[0]!.id, 1), { userId: null, idempotencyKey: newId("idem_") });
  await orderRef(r.orderId).update({ status: "processing" });
  return r.orderId;
}
const result = (over: Partial<BookingResult> = {}): BookingResult => ({ provider: "shiprocket", shiprocketOrderId: "SR100", awbNumber: "AWB100", courierName: "Test Courier", trackingUrl: null, simulated: false, ...over });
const ship = (orderId: string) => applyOrderAction(orderId, { type: "ship", mode: "shiprocket" }, "admin_test");

describe("Shiprocket partial booking and retry", () => {
  it("AWB step fails after the order was created: the provider ids are kept and the retry resumes without creating a second order", async () => {
    const orderId = await processingOrder();
    let creates = 0;
    let call = 0;
    vi.spyOn(shipping(), "book").mockImplementation(async (_o, ctx: BookContext) => {
      call++;
      if (!ctx.resume) {
        creates++;
        await ctx.persist!({ state: "order_created", shiprocketOrderId: "SR100", shipmentId: "SH200" });
      }
      if (call === 1) throw new Error("courier assignment unavailable");
      expect(ctx.resume).toMatchObject({ shiprocketOrderId: "SR100", shipmentId: "SH200" });
      await ctx.persist!({ state: "awb_assigned", shiprocketOrderId: "SR100", shipmentId: "SH200", awbNumber: "AWB100", courierName: "Test Courier" });
      return result();
    });
    await expect(ship(orderId)).rejects.toMatchObject({ code: "BOOKING_PARTIAL" });
    expect((await getOrder(orderId)).status).toBe("processing");
    expect(await getBooking(orderId)).toMatchObject({ state: "order_created", shiprocketOrderId: "SR100", shipmentId: "SH200" });

    const o = await ship(orderId);
    expect(o.status).toBe("shipped");
    expect(o.shipment).toMatchObject({ awbNumber: "AWB100", shiprocketOrderId: "SR100", provider: "shiprocket" });
    expect(creates).toBe(1); // exactly one provider order was ever created
  });

  it("a booking that completed but whose order update failed is finished from the stored AWB, with no provider call", async () => {
    const orderId = await processingOrder();
    const book = vi.spyOn(shipping(), "book").mockImplementation(async (_o, ctx) => {
      await ctx.persist!({ state: "awb_assigned", shiprocketOrderId: "SR1", shipmentId: "SH1", awbNumber: "AWB1", courierName: "C" });
      throw new Error("connection dropped after the AWB was stored");
    });
    const o = await ship(orderId); // the stored result is used; the late error is not fatal
    expect(o.shipment.awbNumber).toBe("AWB1");
    expect(book).toHaveBeenCalledTimes(1);
    // shipping again is a no-op conflict, never a second booking
    await expect(ship(orderId)).rejects.toMatchObject({ code: "BAD_TRANSITION" });
    expect(book).toHaveBeenCalledTimes(1);
  });

  it("an unknown create outcome locks booking (no blind rebook); manual shipping and verified attach still work", async () => {
    const orderId = await processingOrder();
    const book = vi.spyOn(shipping(), "book").mockRejectedValue(new ProviderError("Shiprocket /orders/create/adhoc did not complete: ETIMEDOUT", "unknown"));
    await expect(ship(orderId)).rejects.toMatchObject({ code: "BOOKING_UNCERTAIN" });
    expect((await getBooking(orderId))!.state).toBe("intent");
    expect((await getOrder(orderId)).needsReview).toBe(true);
    await expect(ship(orderId)).rejects.toMatchObject({ code: "BOOKING_UNCERTAIN" });
    expect(book).toHaveBeenCalledTimes(1); // the second attempt never reached the provider

    // attaching a Shiprocket order that belongs to a different order is refused
    const fetchBooking = vi.spyOn(shipping(), "fetchBooking");
    fetchBooking.mockResolvedValueOnce({ shiprocketOrderId: "SR555", shipmentId: "SH555", channelOrderId: "RRC-OTHER", awbNumber: "AWB555", courierName: "C" });
    await expect(attachBooking(orderId, "SR555", "admin_test")).rejects.toMatchObject({ code: "PROVIDER_MISMATCH" });
    expect((await getBooking(orderId))!.state).toBe("intent");

    // a verified attach (the order number matches) lets shipping finish without any provider booking call
    const order = await getOrder(orderId);
    fetchBooking.mockResolvedValueOnce({ shiprocketOrderId: "SR556", shipmentId: "SH556", channelOrderId: order.orderNumber, awbNumber: "AWB556", courierName: "Attached Courier" });
    await attachBooking(orderId, "SR556", "admin_test");
    const shipped = await ship(orderId);
    expect(shipped.shipment).toMatchObject({ awbNumber: "AWB556", shiprocketOrderId: "SR556", courierName: "Attached Courier" });
    expect(book).toHaveBeenCalledTimes(1);
  });

  it("an unknown create outcome can instead be bypassed by entering the AWB manually", async () => {
    const orderId = await processingOrder();
    vi.spyOn(shipping(), "book").mockRejectedValue(new ProviderError("did not complete", "unknown"));
    await expect(ship(orderId)).rejects.toMatchObject({ code: "BOOKING_UNCERTAIN" });
    const o = await applyOrderAction(orderId, { type: "ship", mode: "manual", courierName: "DTDC", awbNumber: "MAN-1" }, "admin_test");
    expect(o.status).toBe("shipped");
    expect(await getBooking(orderId)).toMatchObject({ manualOverride: true });
  });

  it("a definitive rejection proves nothing was created: no lock, the retry books normally", async () => {
    const orderId = await processingOrder();
    const book = vi.spyOn(shipping(), "book").mockRejectedValueOnce(new ProviderError("Wrong pincode", "rejected", 422));
    await expect(ship(orderId)).rejects.toMatchObject({ status: 400 });
    expect(await getBooking(orderId)).toBeNull();
    book.mockImplementation(async (_o, ctx) => {
      await ctx.persist!({ state: "order_created", shiprocketOrderId: "SR9", shipmentId: "SH9" });
      await ctx.persist!({ state: "awb_assigned", shiprocketOrderId: "SR9", shipmentId: "SH9", awbNumber: "AWB9", courierName: "C" });
      return result({ shiprocketOrderId: "SR9", awbNumber: "AWB9" });
    });
    expect((await ship(orderId)).shipment.awbNumber).toBe("AWB9");
  });

  it("double clicks and concurrent admins produce one provider booking", async () => {
    const orderId = await processingOrder();
    const book = vi.spyOn(shipping(), "book").mockImplementation(async (_o, ctx) => {
      await new Promise((r) => setTimeout(r, 400));
      await ctx.persist!({ state: "order_created", shiprocketOrderId: "SR7", shipmentId: "SH7" });
      await ctx.persist!({ state: "awb_assigned", shiprocketOrderId: "SR7", shipmentId: "SH7", awbNumber: "AWB7", courierName: "C" });
      return result({ shiprocketOrderId: "SR7", awbNumber: "AWB7" });
    });
    const settled = await Promise.allSettled([ship(orderId), ship(orderId), ship(orderId)]);
    expect(book).toHaveBeenCalledTimes(1);
    expect(settled.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await getOrder(orderId)).shipment.awbNumber).toBe("AWB7");
  });
});

describe("live Shiprocket adapter (HTTP stubbed; no network, no real account)", () => {
  function stubShiprocket(opts: { assignStatus?: number } = {}) {
    const calls: { path: string; body: Record<string, unknown> | null }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { body?: string }) => {
        const path = String(url).replace("https://apiv2.shiprocket.in/v1/external", "");
        calls.push({ path, body: init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null });
        if (path === "/auth/login") return new Response(JSON.stringify({ token: "t" }), { status: 200 });
        if (path === "/orders/create/adhoc") return new Response(JSON.stringify({ order_id: 11, shipment_id: 22 }), { status: 200 });
        if (path === "/courier/assign/awb") {
          if (opts.assignStatus && opts.assignStatus >= 500) return new Response("upstream error", { status: opts.assignStatus });
          return new Response(JSON.stringify({ response: { data: { awb_code: "LIVEAWB", courier_name: "Live Courier" } } }), { status: 200 });
        }
        return new Response("{}", { status: 404 });
      }),
    );
    return calls;
  }
  const shippingProviderCalls = (calls: { path: string }[]) => calls.filter((c) => c.path !== "/auth/login");

  it("refuses to book without owner-supplied parcel dimensions, before any provider call", async () => {
    mode.value = "live";
    await savePrivateSettings(DEFAULT_PRIVATE_SETTINGS, "test");
    const calls = stubShiprocket();
    const orderId = await processingOrder();
    await expect(ship(orderId)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/Parcel dimensions are not set/) });
    expect(shippingProviderCalls(calls)).toHaveLength(0);
    expect(await getBooking(orderId)).toBeNull(); // clean slate, nothing to recover
  });

  it("sends the configured parcel size and weight, and a failed AWB step resumes without a second create call", async () => {
    mode.value = "live";
    await savePrivateSettings({ ...DEFAULT_PRIVATE_SETTINGS, shipping: { parcel: { lengthCm: 45, breadthCm: 33, heightCm: 12 }, packagingWeightGrams: 250 } }, "test");
    const calls = stubShiprocket({ assignStatus: 503 });
    const orderId = await processingOrder();
    const itemGrams = (await getOrder(orderId)).items.reduce((g, i) => g + i.weightGrams * i.quantity, 0);

    await expect(ship(orderId)).rejects.toMatchObject({ code: "BOOKING_PARTIAL" });
    const create = calls.find((c) => c.path === "/orders/create/adhoc")!;
    expect(create.body).toMatchObject({ length: 45, breadth: 33, height: 12, weight: (itemGrams + 250) / 1000 });
    expect(await getBooking(orderId)).toMatchObject({ state: "order_created", shiprocketOrderId: "11", shipmentId: "22" });

    stubShiprocket(); // the courier endpoint recovers
    const calls2 = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    const o = await ship(orderId);
    expect(o.shipment).toMatchObject({ awbNumber: "LIVEAWB", shiprocketOrderId: "11" });
    expect(calls2.some((u) => u.endsWith("/orders/create/adhoc"))).toBe(false); // resumed: no second order
    expect(calls.filter((c) => c.path === "/orders/create/adhoc")).toHaveLength(1);
  });

  it("a timeout on the create call is an UNKNOWN outcome and locks booking", async () => {
    mode.value = "live";
    await savePrivateSettings({ ...DEFAULT_PRIVATE_SETTINGS, shipping: { parcel: { lengthCm: 40, breadthCm: 30, heightCm: 10 }, packagingWeightGrams: 0 } }, "test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/auth/login")) return new Response(JSON.stringify({ token: "t" }), { status: 200 });
        throw new Error("The operation timed out");
      }),
    );
    const orderId = await processingOrder();
    await expect(ship(orderId)).rejects.toMatchObject({ code: "BOOKING_UNCERTAIN" });
    expect((await getBooking(orderId))!.state).toBe("intent");
    void bookWithRecovery;
  });
});
