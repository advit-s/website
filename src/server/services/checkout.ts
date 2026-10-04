import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { C, col, newId, nowIso } from "../repos/common";
import { db } from "../firebase/admin";
import { fromDoc } from "../repos/catalog";
import { getPublicSettingsFresh } from "../repos/settings";
import { priceCart, loadCoupon, type PricedCart } from "./cart-pricing";
import { applyStock, readVariants, OutOfStockError, type StockLine } from "./stock";
import { addTimeline, formatOrderNumber, orderFromDoc, orderRef, sha256 } from "./order-core";
import { enqueueNotification } from "./notifications";
import { payments } from "../providers/payments";
import { isSimulated } from "../env";
import { invalidate } from "../cache";
import { badRequest, conflict, HttpError, notFound } from "../http";
import { computePricing } from "@/domain/pricing";
import { formatINR } from "@/domain/money";
import type { CheckoutInput } from "@/domain/validation";
import type { Order, OrderItem, Product, Variant } from "@/domain/types";

export interface PaymentSession {
  providerOrderId: string;
  amount: number;
  currency: "INR";
  keyId: string | null;
  simulated: boolean;
  expiresAt: string;
  attempt: number;
  maxAttempts: number;
}

export interface PlaceOrderResult {
  orderId: string;
  orderNumber: string;
  paymentMethod: Order["paymentMethod"];
  paymentStatus: Order["paymentStatus"];
  total: number;
  payment: PaymentSession | null;
  reused: boolean;
}

export interface PlaceOrderContext {
  userId: string | null;
  idempotencyKey: string;
}

const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val) ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : val,
  );

function cartProblem(priced: PricedCart): HttpError {
  const bad = priced.items.filter((i) => i.status !== "ok").map((i) => ({ variantId: i.variantId, name: i.name, status: i.status, available: i.available }));
  return conflict("CART_CHANGED", "Some items in your cart have changed. Please review your cart.", { items: bad });
}

/**
 * Create an order.
 *  - Prices, discounts, shipping and the payable total are recomputed here from Firestore; client totals are never read.
 *  - Everything that must be consistent (order number, stock, coupon redemption, idempotency record) is written in ONE transaction.
 *  - The payment provider is called AFTER the transaction (never inside a retrying callback).
 */
export async function placeOrder(input: CheckoutInput, ctx: PlaceOrderContext): Promise<PlaceOrderResult> {
  const settings = await getPublicSettingsFresh();
  const idemId = sha256(`${ctx.userId ?? "guest"}|${ctx.idempotencyKey}`);
  const idemRef = col(C.idempotency).doc(idemId);
  const requestHash = sha256(
    stable({
      lines: [...input.lines].sort((a, b) => a.variantId.localeCompare(b.variantId)),
      contact: input.contact,
      address: input.address,
      paymentMethod: input.paymentMethod,
      couponCode: input.couponCode ?? null,
    }),
  );

  const prior = await idemRef.get();
  if (prior.exists) return resumeFromIdempotency(prior.data() as { requestHash: string; orderId: string }, requestHash);

  const priced = await priceCart({ lines: input.lines, pincode: input.address.pincode, couponCode: input.couponCode ?? null, paymentMethod: input.paymentMethod });
  if (!priced.items.length) throw badRequest("Your cart is empty.");
  if (!priced.allOk) throw cartProblem(priced);
  if (!priced.pincode?.ok || !priced.zone) throw badRequest(priced.pincode && !priced.pincode.ok ? priced.pincode.message : "Enter a valid delivery pincode.");
  if (input.couponCode && priced.couponError) throw badRequest(priced.couponError);
  if (input.paymentMethod === "cod" && !priced.codAllowed) throw badRequest(priced.codReason ?? "Cash on delivery is not available for this order.");
  const expectedTotal = priced.pricing.total;
  const zone = priced.zone;
  const estimateText = priced.pincode.estimateText;

  const orderId = newId("ord_");
  const reservationId = input.paymentMethod === "razorpay" ? newId("rsv_") : null;
  const now = new Date();
  const identity = ctx.userId ?? `g_${sha256(input.contact.email).slice(0, 16)}`;
  const stockLines: StockLine[] = priced.items.map((i) => ({ variantId: i.variantId, productId: i.productId, quantity: i.quantity }));

  let outcome: { reusedOrderId: string } | { orderNumber: string };
  try {
    outcome = await db().runTransaction(async (tx) => {
      // ---- reads ----
      const idem = await tx.get(idemRef);
      if (idem.exists) return { reusedOrderId: (idem.data() as { orderId: string }).orderId };
      const counterRef = col(C.counters).doc("orders");
      const counter = await tx.get(counterRef);
      const variants = await readVariants(tx, stockLines);
      const productIds = Array.from(new Set(stockLines.map((l) => l.productId)));
      const productSnaps = await tx.getAll(...productIds.map((id) => col(C.products).doc(id)));
      const products = new Map<string, Product>(productSnaps.filter((s) => s.exists).map((s) => [s.id, fromDoc<Product>(s)]));
      const code = priced.pricing.couponCode;
      const couponRef = code ? col(C.coupons).doc(code) : null;
      const couponSnap = couponRef ? await tx.get(couponRef) : null;
      const redemptionRef = code ? col(C.couponRedemptions).doc(`${code}__${identity}`) : null;
      const redemptionSnap = redemptionRef ? await tx.get(redemptionRef) : null;

      // ---- re-verify prices against the documents we are about to commit against ----
      const items: OrderItem[] = [];
      for (const l of stockLines) {
        const v = variants.get(l.variantId) as Variant | undefined;
        const p = v ? products.get(v.productId) : undefined;
        if (!v || !p || p.status !== "published" || p.enquiryOnly) throw conflict("CART_CHANGED", "An item in your cart is no longer available.", { items: [{ variantId: l.variantId }] });
        const unit = v.priceOverride !== null && v.priceOverride !== undefined ? v.priceOverride : p.price;
        const img = [...p.images].sort((a, b) => a.order - b.order)[0];
        items.push({
          productId: p.id,
          variantId: v.id,
          sku: v.sku,
          nameSnapshot: p.name,
          imageSnapshot: img?.src ?? null,
          size: v.size,
          color: v.color,
          unitPrice: unit,
          quantity: l.quantity,
          lineTotal: unit * l.quantity,
          weightGrams: p.weightGrams,
          isCustomizable: p.isCustomizable,
          leadTimeDays: p.leadTimeDays,
        });
      }
      const freshCoupon = couponSnap?.exists ? ({ ...(couponSnap.data() as object), code: couponSnap.id } as NonNullable<Awaited<ReturnType<typeof loadCoupon>>>) : null;
      if (freshCoupon?.perUserLimit != null && redemptionSnap?.exists && ((redemptionSnap.data() as { count: number }).count ?? 0) >= freshCoupon.perUserLimit) {
        throw badRequest("You have already used this coupon the maximum number of times.");
      }
      const pricing = computePricing({
        lines: items.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity, weightGrams: i.weightGrams, isCustomizable: i.isCustomizable })),
        coupon: freshCoupon,
        zone,
        paymentMethod: input.paymentMethod,
        settings,
        now,
      });
      if (code && !pricing.couponCode) throw badRequest(pricing.couponError ?? "This coupon is no longer valid.");
      if (pricing.total !== expectedTotal) throw conflict("PRICE_CHANGED", "Prices changed while you were checking out. Please review your order.", { total: pricing.total });

      // ---- writes ----
      const n = counter.exists ? (counter.data() as { next: number }).next : 1001;
      const orderNumber = formatOrderNumber(n);
      tx.set(counterRef, { next: n + 1 });

      const cod = input.paymentMethod === "cod";
      applyStock(tx, variants, stockLines, cod ? "allocate" : "reserve", { orderId, reason: cod ? `COD order ${orderNumber}` : `reserve for ${orderNumber}`, actor: "system:checkout" });
      if (reservationId) {
        const rsv = settings.checkout.reservationMinutes * 60_000;
        tx.set(col(C.reservations).doc(reservationId), {
          orderId,
          items: stockLines,
          status: "active",
          paymentMethod: "razorpay",
          createdAt: nowIso(),
          expiresAt: new Date(now.getTime() + rsv).toISOString(),
          hardExpiresAt: new Date(now.getTime() + rsv * 2).toISOString(),
        });
      }
      if (couponRef && redemptionRef && code) {
        tx.update(couponRef, { usedCount: FieldValue.increment(1) });
        tx.set(redemptionRef, { code, identity, count: FieldValue.increment(1), lastOrderId: orderId, updatedAt: nowIso() }, { merge: true });
      }

      const placedAt = nowIso();
      const order: Omit<Order, "id"> = {
        orderNumber,
        userId: ctx.userId,
        contact: { name: input.contact.name, email: input.contact.email, phone: input.contact.phone },
        status: "new",
        paymentMethod: input.paymentMethod,
        paymentStatus: "pending",
        returnStatus: "none",
        items,
        pricing: { subtotal: pricing.subtotal, discount: pricing.discount, couponCode: pricing.couponCode, shipping: pricing.shipping, codFee: pricing.codFee, total: pricing.total, currency: "INR" },
        shippingAddress: { fullName: input.address.fullName, phone: input.address.phone, line1: input.address.line1, line2: input.address.line2 ?? "", landmark: input.address.landmark, city: input.address.city, state: input.address.state, pincode: input.address.pincode, country: "IN" },
        shipment: { zone, estimateText, provider: null, shiprocketOrderId: null, awbNumber: null, courierName: null, trackingUrl: null, shippedAt: null, deliveredAt: null },
        payment: { razorpayOrderId: null, providerOrderIds: [], razorpayPaymentId: null, attempts: 0, capturedAt: null, lastError: null, refunds: [], refundedTotal: 0 },
        reservationId,
        stockState: cod ? "committed" : "reserved",
        needsReview: false,
        integrationMode: isSimulated() ? "simulated" : "live",
        hasCustomItems: items.some((i) => i.isCustomizable),
        custom: null,
        cancelReason: null,
        idempotencyKey: ctx.idempotencyKey,
        placedAt,
        updatedAt: placedAt,
        version: 1,
      };
      tx.set(orderRef(orderId), order);
      addTimeline(tx, orderId, {
        type: "order.placed",
        label: cod ? "Order placed - cash on delivery" : "Order created - awaiting payment",
        detail: cod ? "Stock is set aside for you. Pay the courier on delivery." : "Stock is held for a short time while you pay.",
        customerVisible: true,
        actor: ctx.userId ? "customer" : "guest",
      });
      tx.set(idemRef, { requestHash, orderId, userId: ctx.userId, createdAt: placedAt });
      return { orderNumber };
    });
  } catch (e) {
    if (e instanceof OutOfStockError) {
      throw conflict("OUT_OF_STOCK", "Sorry, one of the items just sold out or has fewer units than you asked for.", { variantId: e.variantId, available: e.available });
    }
    throw e;
  }

  invalidate("catalog");
  if ("reusedOrderId" in outcome) {
    return resumeFromIdempotency({ requestHash, orderId: outcome.reusedOrderId }, requestHash);
  }

  const snap = await orderRef(orderId).get();
  const order = orderFromDoc(snap);
  if (order.paymentMethod === "cod") {
    await notifyPlaced(order);
    return { orderId, orderNumber: order.orderNumber, paymentMethod: "cod", paymentStatus: order.paymentStatus, total: order.pricing.total, payment: null, reused: false };
  }
  const payment = await ensurePaymentAttempt(orderId);
  return { orderId, orderNumber: order.orderNumber, paymentMethod: "razorpay", paymentStatus: order.paymentStatus, total: order.pricing.total, payment, reused: false };
}

async function resumeFromIdempotency(prior: { requestHash: string; orderId: string }, requestHash: string): Promise<PlaceOrderResult> {
  if (prior.requestHash !== requestHash) {
    throw new HttpError(422, "IDEMPOTENCY_KEY_REUSED", "This request key was already used for a different order. Please refresh and try again.");
  }
  const snap = await orderRef(prior.orderId).get();
  if (!snap.exists) throw notFound("Order not found.");
  const order = orderFromDoc(snap);
  const payment = order.paymentMethod === "razorpay" && order.paymentStatus !== "paid" && order.status !== "cancelled" ? await ensurePaymentAttempt(order.id).catch(() => null) : null;
  return { orderId: order.id, orderNumber: order.orderNumber, paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus, total: order.pricing.total, payment, reused: true };
}

export async function notifyPlaced(order: Order): Promise<void> {
  await enqueueNotification({
    kind: "order.placed",
    to: { email: order.contact.email, phone: order.contact.phone },
    data: { orderNumber: order.orderNumber, total: formatINR(order.pricing.total), paymentNote: order.paymentMethod === "cod" ? "Pay by cash on delivery." : "" },
    dedupeKey: `placed_${order.id}`,
  });
  await enqueueNotification({ kind: "admin.new_order", to: { admin: true }, data: { orderNumber: order.orderNumber, total: formatINR(order.pricing.total), method: order.paymentMethod }, dedupeKey: `admin_new_${order.id}` });
}

function sessionFrom(order: Order, expiresAt: string, maxAttempts: number): PaymentSession | null {
  if (!order.payment.razorpayOrderId) return null;
  return {
    providerOrderId: order.payment.razorpayOrderId,
    amount: order.pricing.total,
    currency: "INR",
    keyId: payments().publicKeyId(),
    simulated: payments().mode === "simulated",
    expiresAt,
    attempt: order.payment.attempts,
    maxAttempts,
  };
}

/**
 * Make sure an unpaid prepaid order has a live provider order for its current attempt.
 * Provider call happens outside any transaction; the order is then updated with a version/identity guard
 * so two concurrent callers cannot leave an orphaned provider order referenced.
 */
export async function ensurePaymentAttempt(orderId: string, opts: { newAttempt?: boolean } = {}): Promise<PaymentSession> {
  const settings = await getPublicSettingsFresh();
  const maxAttempts = settings.checkout.maxPaymentAttempts;
  const snap = await orderRef(orderId).get();
  if (!snap.exists) throw notFound("Order not found.");
  const order = orderFromDoc(snap);
  if (order.paymentMethod !== "razorpay") throw badRequest("This order is not a prepaid order.");
  if (order.paymentStatus === "paid") throw conflict("ALREADY_PAID", "This order has already been paid.");
  if (order.status === "cancelled" || !order.reservationId) throw conflict("ORDER_EXPIRED", "This order expired before payment. Please place it again.");
  const rsv = await col(C.reservations).doc(order.reservationId).get();
  const rsvData = rsv.data() as { status: string; expiresAt: string; hardExpiresAt: string } | undefined;
  if (!rsvData || rsvData.status !== "active" || rsvData.expiresAt <= nowIso()) throw conflict("ORDER_EXPIRED", "Your stock hold expired before payment. Please place the order again.");

  const wantsNew = opts.newAttempt === true;
  if (order.payment.razorpayOrderId && !wantsNew && order.paymentStatus === "pending") {
    return sessionFrom(order, rsvData.expiresAt, maxAttempts)!;
  }
  if (order.payment.attempts >= maxAttempts) {
    throw conflict("MAX_ATTEMPTS", "You have reached the maximum number of payment attempts for this order. Try cash on delivery (if available) or place a new order.");
  }

  const provider = payments();
  const po = await provider.createOrder({ amount: order.pricing.total, receipt: `${order.orderNumber}-${order.payment.attempts + 1}`, notes: { orderNumber: order.orderNumber, orderId } });

  let expiresAt = rsvData.expiresAt;
  const updated = await db().runTransaction(async (tx) => {
    const cur = orderFromDoc(await tx.get(orderRef(orderId)));
    const rs = await tx.get(col(C.reservations).doc(order.reservationId!));
    if (cur.payment.razorpayOrderId !== order.payment.razorpayOrderId || cur.paymentStatus === "paid" || cur.status === "cancelled") return null; // someone else won the race
    const windowMs = settings.checkout.reservationMinutes * 60_000;
    const rd = rs.data() as { expiresAt: string; hardExpiresAt: string };
    // A retry extends the hold by one window, never past the hard cap (bounded: no stock held forever).
    const extended = new Date(Math.min(new Date(rd.hardExpiresAt).getTime(), Date.now() + windowMs)).toISOString();
    if (wantsNew && extended > rd.expiresAt) {
      tx.update(rs.ref, { expiresAt: extended });
      expiresAt = extended;
    }
    tx.update(orderRef(orderId), {
      "payment.razorpayOrderId": po.providerOrderId,
      "payment.providerOrderIds": FieldValue.arrayUnion(po.providerOrderId),
      "payment.attempts": cur.payment.attempts + 1,
      "payment.lastError": null,
      paymentStatus: "pending",
      updatedAt: nowIso(),
      version: cur.version + 1,
    });
    addTimeline(tx, orderId, { type: "payment.attempt", label: `Payment attempt ${cur.payment.attempts + 1} started`, detail: null, customerVisible: false, actor: "system" });
    return { ...cur, payment: { ...cur.payment, razorpayOrderId: po.providerOrderId, attempts: cur.payment.attempts + 1 } } as Order;
  });
  if (!updated) {
    const again = orderFromDoc(await orderRef(orderId).get());
    return sessionFrom(again, expiresAt, maxAttempts)!;
  }
  return sessionFrom(updated, expiresAt, maxAttempts)!;
}

export async function newPaymentAttempt(orderId: string): Promise<PaymentSession> {
  return ensurePaymentAttempt(orderId, { newAttempt: true });
}
