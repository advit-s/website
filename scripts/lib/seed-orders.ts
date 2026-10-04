import { placeOrder } from "@/server/services/checkout";
import { applyPaymentCaptured, applyPaymentFailed, expireReservations } from "@/server/services/payment-events";
import { applyOrderAction } from "@/server/services/admin-orders";
import { cancelOrder } from "@/server/services/order-actions";
import { requestReturn } from "@/server/services/order-actions";
import { orderFromDoc, orderRef } from "@/server/services/order-core";
import { drainOutbox } from "@/server/services/notifications";
import { db } from "@/server/firebase/admin";
import { C } from "@/server/repos/common";
import type { CheckoutInput } from "@/domain/validation";

const addr = (name: string, city: string, state: string, pincode: string, phone: string) => ({ fullName: name, phone, line1: "12 Sector 18", line2: "", city, state: state as never, pincode, country: "IN" as const });

function input(variantId: string, qty: number, who: { name: string; email: string; phone: string }, a: ReturnType<typeof addr>, method: "cod" | "razorpay", coupon?: string): CheckoutInput {
  return { lines: [{ variantId, quantity: qty }], contact: who, address: a, paymentMethod: method, couponCode: coupon } as CheckoutInput;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

async function backdate(orderId: string, days: number) {
  const ref = orderRef(orderId);
  const o = orderFromDoc(await ref.get());
  const placed = daysAgo(days);
  const patch: Record<string, unknown> = { placedAt: placed };
  if (o.payment.capturedAt) patch["payment.capturedAt"] = new Date(new Date(placed).getTime() + 3_600_000).toISOString();
  if (o.shipment.deliveredAt) patch["shipment.deliveredAt"] = new Date(new Date(placed).getTime() + 3 * 86_400_000).toISOString();
  if (o.shipment.shippedAt) patch["shipment.shippedAt"] = new Date(new Date(placed).getTime() + 86_400_000).toISOString();
  await ref.update(patch);
}

/** Demo orders in every interesting state, created through the REAL services so stock, reservations and timelines are consistent. */
export async function seedOrders(uids: Record<string, string>): Promise<number> {
  const priya = { name: "Priya Demo", email: "customer@rajraani.test", phone: "+919000000002" };
  const anika = { name: "Anika Demo", email: "customer2@rajraani.test", phone: "+919000000003" };
  const guest = { name: "Meera Guest", email: "meera.guest@example.test", phone: "+919876500011" };
  const key = (n: string) => `seed${n}`.padEnd(24, "0");
  const peach = "var_lh_peach_blossom_m_peach";
  const ivory = "var_lh_ivory_dream_m_ivory";
  const midnight = "var_lh_midnight_charm_m_midnight";
  const royal = "var_lh_royal_rose_m_maroon";
  const blush = "var_lh_blush_garden_m_blush";
  let n = 0;

  // 1. Guest COD, fully delivered and cash collected (5 days ago)
  let r = await placeOrder(input(peach, 1, guest, addr("Meera Guest", "Noida", "Uttar Pradesh", "201301", "+919876500011"), "cod"), { userId: null, idempotencyKey: key("1") });
  for (const a of [{ type: "confirm" }, { type: "start_processing" }, { type: "ship", mode: "manual", courierName: "Porter (manual booking)", awbNumber: "PRT-DEMO-1001" }, { type: "deliver", codCollected: true }] as const) await applyOrderAction(r.orderId, a, "system:seed");
  await backdate(r.orderId, 5);
  n++;

  // 2. Customer COD, new (today) - the "to confirm" queue
  r = await placeOrder(input(ivory, 1, priya, addr("Priya Demo", "Noida", "Uttar Pradesh", "201301", "+919000000002"), "cod"), { userId: uids.customer ?? null, idempotencyKey: key("2") });
  n++;

  // 3. Customer prepaid, paid and confirmed (1 day ago)
  r = await placeOrder(input(midnight, 1, priya, addr("Priya Demo", "Bengaluru", "Karnataka", "560001", "+919000000002"), "razorpay", "WELCOME10"), { userId: uids.customer ?? null, idempotencyKey: key("3") });
  let o = orderFromDoc(await orderRef(r.orderId).get());
  await applyPaymentCaptured({ providerOrderId: o.payment.razorpayOrderId!, paymentId: "pay_SIMseed3", amount: o.pricing.total, currency: "INR", source: "reconcile" });
  await applyOrderAction(r.orderId, { type: "confirm" }, "system:seed");
  await applyOrderAction(r.orderId, { type: "start_processing" }, "system:seed");
  await backdate(r.orderId, 1);
  n++;

  // 4. Customer2 prepaid, shipped with tracking (3 days ago)
  r = await placeOrder(input(blush, 1, anika, addr("Anika Demo", "Mumbai", "Maharashtra", "400001", "+919000000003"), "razorpay"), { userId: uids.customer2 ?? null, idempotencyKey: key("4") });
  o = orderFromDoc(await orderRef(r.orderId).get());
  await applyPaymentCaptured({ providerOrderId: o.payment.razorpayOrderId!, paymentId: "pay_SIMseed4", amount: o.pricing.total, currency: "INR", source: "reconcile" });
  for (const a of [{ type: "confirm" }, { type: "start_processing" }, { type: "ship", mode: "manual", courierName: "Delhivery (manual)", awbNumber: "DLV-DEMO-2002", trackingUrl: "https://example.test/track/DLV-DEMO-2002" }] as const) await applyOrderAction(r.orderId, a, "system:seed");
  await backdate(r.orderId, 3);
  n++;

  // 5. Prepaid awaiting payment (stock held)
  r = await placeOrder(input(peach, 1, guest, addr("Meera Guest", "Pune", "Maharashtra", "411001", "+919876500011"), "razorpay"), { userId: null, idempotencyKey: key("5") });
  n++;

  // 6. Prepaid with a FAILED payment attempt
  r = await placeOrder(input(ivory, 1, anika, addr("Anika Demo", "Jaipur", "Rajasthan", "302001", "+919000000003"), "razorpay"), { userId: uids.customer2 ?? null, idempotencyKey: key("6") });
  o = orderFromDoc(await orderRef(r.orderId).get());
  await applyPaymentFailed({ providerOrderId: o.payment.razorpayOrderId!, paymentId: "pay_SIMseed6", reason: "Simulated payment failure" });
  n++;

  // 7. Cancelled COD order (stock restocked)
  r = await placeOrder(input(peach, 1, priya, addr("Priya Demo", "Noida", "Uttar Pradesh", "201301", "+919000000002"), "cod"), { userId: uids.customer ?? null, idempotencyKey: key("7") });
  await cancelOrder(r.orderId, { id: "customer", kind: "customer" }, "Ordered by mistake");
  await backdate(r.orderId, 2);
  n++;

  // 8. Delivered 2 days ago, return requested
  r = await placeOrder(input(midnight, 1, priya, addr("Priya Demo", "Noida", "Uttar Pradesh", "201301", "+919000000002"), "cod"), { userId: uids.customer ?? null, idempotencyKey: key("8") });
  for (const a of [{ type: "confirm" }, { type: "start_processing" }, { type: "ship", mode: "manual", courierName: "Porter (manual booking)", awbNumber: "PRT-DEMO-3003" }, { type: "deliver", codCollected: true }] as const) await applyOrderAction(r.orderId, a, "system:seed");
  await backdate(r.orderId, 4);
  await requestReturn(r.orderId, "Colour is deeper than I expected", { id: "customer", kind: "customer" });
  n++;

  // 9. Made-to-order (prepaid) with quote and advance
  r = await placeOrder(input(royal, 1, guest, addr("Meera Guest", "Gurugram", "Haryana", "122001", "+919876500011"), "razorpay"), { userId: null, idempotencyKey: key("9") });
  o = orderFromDoc(await orderRef(r.orderId).get());
  await applyPaymentCaptured({ providerOrderId: o.payment.razorpayOrderId!, paymentId: "pay_SIMseed9", amount: o.pricing.total, currency: "INR", source: "reconcile" });
  await applyOrderAction(r.orderId, { type: "confirm" }, "system:seed");
  await applyOrderAction(r.orderId, { type: "custom_quote", quotedTotal: 4_299_900, leadTimeDays: 21, advancePaid: 1_500_000, productionState: "in_production" }, "system:seed");
  n++;

  await expireReservations(); // none should be due, proves the job is wired
  await drainOutbox(100);
  await db().collection(C.counters).doc("seed").set({ ordersSeeded: n });
  return n;
}
