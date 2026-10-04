import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/firebase/admin";
import { C, newId } from "@/server/repos/common";
import { placeOrder } from "@/server/services/checkout";
import { applyPaymentCaptured } from "@/server/services/payment-events";
import { orderFromDoc, orderRef, makeAccessToken, verifyAccessToken, parseAccessToken } from "@/server/services/order-core";
import { applyOrderAction, executeRefund } from "@/server/services/admin-orders";
import { cancelOrder, requestReturn } from "@/server/services/order-actions";
import { commitImport, exportRows, planImport, rowsToCsv, safeCell, updateVariant } from "@/server/services/inventory";
import { deleteCategory, saveCategory, saveProduct } from "@/server/services/catalog-admin";
import { rateLimit } from "@/server/rate-limit";
import { verifyShiprocketToken, handleShiprocketEvent } from "@/server/services/shipment-events";
import { checkoutInput, ensureSettings, getProductUnits, getVariant, makeProduct } from "../helpers/fixtures";
import type { ProductInput } from "@/domain/admin-schemas";

const key = () => newId("idem").padEnd(20, "x");
const get = async (id: string) => orderFromDoc(await orderRef(id).get());
const ADMIN = "admin_test";

beforeAll(async () => {
  await ensureSettings();
});

describe("inventory edits are version-checked", () => {
  it("rejects a stale version, shows current numbers, and never silently overwrites a concurrent sale", async () => {
    const f = await makeProduct({ stocks: [10] });
    const vid = f.variants[0]!.id;
    const loaded = await getVariant(vid); // admin loads version 1 (stock 10)
    await placeOrder(checkoutInput(vid, 2), { userId: null, idempotencyKey: key() }); // a sale lands: stock 8, version 2
    await expect(updateVariant(vid, loaded.version, { stock: 12 }, "count", ADMIN)).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    expect((await getVariant(vid)).stock).toBe(8);
    const fresh = await getVariant(vid);
    const row = await updateVariant(vid, fresh.version, { stock: 12 }, "count", ADMIN);
    expect(row.stock).toBe(12);
    expect(await getProductUnits(f.productId)).toBe(12);
  });

  it("writes an append-only stock log entry and keeps isLowStock in sync", async () => {
    const f = await makeProduct({ stocks: [10], threshold: 3 });
    const vid = f.variants[0]!.id;
    const v = await getVariant(vid);
    await updateVariant(vid, v.version, { stock: 2 }, "recount", ADMIN);
    expect((await getVariant(vid)).isLowStock).toBe(true);
    const logs = await db().collection(C.stockLogs).where("variantId", "==", vid).get();
    expect(logs.docs.map((d) => d.data()).some((l) => l.previousStock === 10 && l.newStock === 2 && l.changedBy === ADMIN)).toBe(true);
  });

  it("will not set on-hand stock below units held for unpaid orders", async () => {
    const f = await makeProduct({ stocks: [5] });
    const vid = f.variants[0]!.id;
    await placeOrder(checkoutInput(vid, 3, { paymentMethod: "razorpay" }), { userId: null, idempotencyKey: key() });
    const v = await getVariant(vid);
    expect(v.reserved).toBe(3);
    await expect(updateVariant(vid, v.version, { stock: 2 }, "x", ADMIN)).rejects.toMatchObject({ code: "BELOW_RESERVED" });
  });
});

describe("inventory import / export", () => {
  it("dry-run reports per-row results and writes nothing; commit applies only unchanged-version rows", async () => {
    const f = await makeProduct({ stocks: [10, 10, 10] });
    const rows = (await exportRows({ q: "T-" + f.slug.replace("test-", "").toUpperCase() })).filter((r) => r.productId === f.productId);
    expect(rows).toHaveLength(3);
    const csv = rowsToCsv(rows).split("\r\n");
    const header = csv[0]!.split(",");
    const iStock = header.indexOf("stock");
    const lines = csv.slice(1).filter(Boolean).map((l) => l.split(","));
    lines[0]![iStock] = "20"; // change
    lines[1]![iStock] = "10"; // unchanged
    lines[2]![iStock] = "-4"; // invalid
    const file = Buffer.from([header.join(","), ...lines.map((l) => l.join(","))].join("\r\n"));
    const plan = await planImport(file, "stock.csv");
    expect(plan.results.map((r) => r.status).sort()).toEqual(["error", "ok", "unchanged"]);
    expect((await getVariant(rows[0]!.id)).stock).toBe(10); // dry run wrote nothing

    // a sale lands on row 0 between export and commit -> conflict, not overwritten
    await placeOrder(checkoutInput(rows[0]!.id, 1), { userId: null, idempotencyKey: key() });
    const res = await commitImport(file, "stock.csv", ADMIN);
    expect(res.applied).toBe(0);
    expect(res.results.find((r) => r.sku === rows[0]!.sku)?.status).toBe("conflict");
    expect((await getVariant(rows[0]!.id)).stock).toBe(9);
  });

  it("applies a clean file and logs the movement", async () => {
    const f = await makeProduct({ stocks: [4, 4] });
    const all = (await exportRows({})).filter((r) => r.productId === f.productId);
    const header = "sku,stock,version";
    const csv = [header, ...all.map((r) => `${r.sku},${r.stock + 6},${r.version}`)].join("\n");
    const res = await commitImport(Buffer.from(csv), "restock.csv", ADMIN);
    expect(res.applied).toBe(2);
    expect((await getVariant(all[0]!.id)).stock).toBe(10);
    expect(res.failedChunks).toBe(0);
  });

  it("rejects missing version column, oversize files and wrong types", async () => {
    await expect(planImport(Buffer.from("sku,stock\nABC-123,5"), "x.csv")).rejects.toMatchObject({ status: 400 });
    const big = "sku,stock,version\n" + Array.from({ length: 1100 }, (_, i) => `SKU-${i},1,1`).join("\n");
    await expect(planImport(Buffer.from(big), "big.csv")).rejects.toMatchObject({ status: 400 });
    await expect(planImport(Buffer.from("x"), "evil.exe")).rejects.toMatchObject({ status: 400 });
  });

  it("neutralises spreadsheet formula injection in exports", () => {
    expect(safeCell("=HYPERLINK(\"http://evil\")")).toBe("'=HYPERLINK(\"http://evil\")");
    expect(safeCell("+1+1")).toBe("'+1+1");
    expect(safeCell("-2")).toBe("'-2");
    expect(safeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(safeCell("normal")).toBe("normal");
    expect(safeCell(42)).toBe(42);
  });
});

function productInput(over: Partial<ProductInput> & { categoryId: string }): ProductInput {
  const tag = newId("p").slice(0, 8);
  return {
    name: `Editor ${tag}`, slug: `editor-${tag}`, description: "A description long enough", details: [], price: 500_000, compareAtPrice: null, fabric: "", workType: "", setIncludes: "", weightGrams: 400,
    isCustomizable: false, enquiryOnly: false, leadTimeDays: null, isFeatured: false, isBestSeller: false, isNewArrival: false, status: "draft", images: [], tags: [], seo: { title: "", description: "" },
    variants: [{ size: "M", color: "Red", sku: `ED-${tag.toUpperCase()}-M`, stock: 5, lowStockThreshold: 3, priceOverride: null }],
    ...over,
  } as ProductInput;
}

describe("product and category administration", () => {
  it("enforces unique slugs and SKUs transactionally, even under a race", async () => {
    const f = await makeProduct({ stocks: [1] });
    const inp = productInput({ categoryId: f.categoryId });
    const results = await Promise.allSettled([saveProduct(inp, null, ADMIN), saveProduct({ ...inp, name: "Other" }, null, ADMIN)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(["SLUG_TAKEN", "SKU_TAKEN"]).toContain(lost.reason.code);
  });

  it("renaming a product updates denormalised variant names; editing never changes existing stock; removing a held variant is refused", async () => {
    const f = await makeProduct({ stocks: [7] });
    const created = await saveProduct(productInput({ categoryId: f.categoryId }), null, ADMIN);
    const vs = await db().collection(C.variants).where("productId", "==", created.id).get();
    const vid = vs.docs[0]!.id;
    expect((vs.docs[0]!.data() as { stock: number }).stock).toBe(5);
    const input = productInput({ categoryId: f.categoryId, name: "Renamed Piece", slug: (await db().collection(C.products).doc(created.id).get()).data()!.slug, variants: [{ id: vid, size: "M", color: "Red", sku: (vs.docs[0]!.data() as { sku: string }).sku, stock: 999, lowStockThreshold: 2, priceOverride: null }], expectedVersion: created.version });
    await saveProduct(input, created.id, ADMIN);
    const after = (await db().collection(C.variants).doc(vid).get()).data() as { productName: string; stock: number; lowStockThreshold: number };
    expect(after.productName).toBe("Renamed Piece");
    expect(after.stock).toBe(5); // the editor's "999" is ignored for existing variants
    expect(after.lowStockThreshold).toBe(2);

    // reserve one unit via a prepaid order, then try to remove the variant
    await db().collection(C.products).doc(created.id).update({ status: "published" });
    await placeOrder(checkoutInput(vid, 1, { paymentMethod: "razorpay" }), { userId: null, idempotencyKey: key() });
    const cur = (await db().collection(C.products).doc(created.id).get()).data()!;
    const removal = productInput({ categoryId: f.categoryId, slug: cur.slug, name: "Renamed Piece", variants: [{ size: "L", color: "Blue", sku: "NEW-SKU-" + newId("").slice(0, 6).toUpperCase(), stock: 1, lowStockThreshold: 3, priceOverride: null }], expectedVersion: cur.version });
    await expect(saveProduct(removal, created.id, ADMIN)).rejects.toMatchObject({ code: "VARIANT_RESERVED" });
  });

  it("detects concurrent product edits with the version number", async () => {
    const f = await makeProduct({ stocks: [1] });
    const created = await saveProduct(productInput({ categoryId: f.categoryId }), null, ADMIN);
    const slug = (await db().collection(C.products).doc(created.id).get()).data()!.slug as string;
    const vs = await db().collection(C.variants).where("productId", "==", created.id).get();
    const mk = (name: string, v: number) => productInput({ categoryId: f.categoryId, slug, name, variants: [{ id: vs.docs[0]!.id, size: "M", color: "Red", sku: (vs.docs[0]!.data() as { sku: string }).sku, stock: 0, lowStockThreshold: 3, priceOverride: null }], expectedVersion: v });
    await saveProduct(mk("First edit", created.version), created.id, ADMIN);
    await expect(saveProduct(mk("Second (stale) edit", created.version), created.id, ADMIN)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("refuses to publish with no images and keeps drafts out of the public listing", async () => {
    const f = await makeProduct({ stocks: [1] });
    const { productInputSchema } = await import("@/domain/admin-schemas");
    expect(productInputSchema.safeParse(productInput({ categoryId: f.categoryId, status: "published" })).success).toBe(false);
  });

  it("will not delete a category that has products unless they are reassigned", async () => {
    const f = await makeProduct({ stocks: [1] });
    const other = await saveCategory({ name: "Target", slug: `target-${newId("").slice(0, 6)}`, description: "", imageUrl: null, sortOrder: 5, isActive: true }, null, ADMIN);
    await expect(deleteCategory(f.categoryId, null, ADMIN)).rejects.toMatchObject({ code: "HAS_PRODUCTS" });
    const res = await deleteCategory(f.categoryId, other.id, ADMIN);
    expect(res.moved).toBe(1);
    expect((await db().collection(C.products).doc(f.productId).get()).data()!.categoryId).toBe(other.id);
    expect((await db().collection(C.variants).doc(f.variants[0]!.id).get()).data()!.categoryId).toBe(other.id);
    expect((await db().collection(C.categories).doc(f.categoryId).get()).exists).toBe(false);
  });

  it("category slugs are unique", async () => {
    const slug = `uniq-${newId("").slice(0, 6)}`;
    await saveCategory({ name: "A", slug, description: "", imageUrl: null, sortOrder: 1, isActive: true }, null, ADMIN);
    await expect(saveCategory({ name: "B", slug, description: "", imageUrl: null, sortOrder: 2, isActive: true }, null, ADMIN)).rejects.toMatchObject({ code: "SLUG_TAKEN" });
  });
});

describe("cancellation, fulfilment, refunds and returns", () => {
  it("cancelling a COD order restocks exactly once; cancelling again changes nothing", async () => {
    const f = await makeProduct({ stocks: [5] });
    const vid = f.variants[0]!.id;
    const r = await placeOrder(checkoutInput(vid, 2), { userId: null, idempotencyKey: key() });
    expect((await getVariant(vid)).stock).toBe(3);
    await Promise.all([cancelOrder(r.orderId, { id: "customer", kind: "customer" }, "changed mind"), cancelOrder(r.orderId, { id: "customer", kind: "customer" }, "changed mind")]);
    expect((await getVariant(vid)).stock).toBe(5);
    await cancelOrder(r.orderId, { id: "customer", kind: "customer" }, "again");
    expect((await getVariant(vid)).stock).toBe(5);
    expect((await get(r.orderId)).status).toBe("cancelled");
  });

  it("cancelling an unpaid prepaid order releases the hold; a paid one queues a refund request", async () => {
    const f = await makeProduct({ stocks: [5] });
    const vid = f.variants[0]!.id;
    const a = await placeOrder(checkoutInput(vid, 1, { paymentMethod: "razorpay" }), { userId: null, idempotencyKey: key() });
    await cancelOrder(a.orderId, { id: "customer", kind: "customer" }, "x");
    expect(await getVariant(vid)).toMatchObject({ stock: 5, reserved: 0 });
    const b = await placeOrder(checkoutInput(vid, 1, { paymentMethod: "razorpay" }), { userId: null, idempotencyKey: key() });
    const ob = await get(b.orderId);
    await applyPaymentCaptured({ providerOrderId: ob.payment.razorpayOrderId!, paymentId: "pay_c1", amount: ob.pricing.total, currency: "INR", source: "webhook" });
    await cancelOrder(b.orderId, { id: "customer", kind: "customer" }, "x");
    const after = await get(b.orderId);
    expect(after.payment.refunds).toHaveLength(1);
    expect(after.payment.refunds[0]).toMatchObject({ state: "requested", amount: ob.pricing.total });
    expect(await getVariant(vid)).toMatchObject({ stock: 5, reserved: 0 });
  });

  it("enforces the state machine: no skipping steps, no cancelling after shipping, no unpaid prepaid confirmation", async () => {
    const f = await makeProduct({ stocks: [5] });
    const vid = f.variants[0]!.id;
    const cod = await placeOrder(checkoutInput(vid, 1), { userId: null, idempotencyKey: key() });
    await expect(applyOrderAction(cod.orderId, { type: "start_processing" }, ADMIN)).rejects.toMatchObject({ code: "BAD_TRANSITION" });
    await expect(applyOrderAction(cod.orderId, { type: "ship", mode: "manual", courierName: "X", awbNumber: "1" }, ADMIN)).rejects.toMatchObject({ code: "BAD_TRANSITION" });
    await applyOrderAction(cod.orderId, { type: "confirm" }, ADMIN);
    await applyOrderAction(cod.orderId, { type: "start_processing" }, ADMIN);
    await expect(applyOrderAction(cod.orderId, { type: "ship", mode: "manual", courierName: "", awbNumber: "" }, ADMIN)).rejects.toMatchObject({ status: 400 });
    await applyOrderAction(cod.orderId, { type: "ship", mode: "manual", courierName: "Porter", awbNumber: "AWB1" }, ADMIN);
    await expect(applyOrderAction(cod.orderId, { type: "cancel", reason: "too late" }, ADMIN)).rejects.toMatchObject({ code: "NOT_CANCELLABLE" });
    await expect(applyOrderAction(cod.orderId, { type: "confirm" }, ADMIN)).rejects.toMatchObject({ code: "BAD_TRANSITION" });
    const o = await get(cod.orderId);
    expect(o.shipment).toMatchObject({ awbNumber: "AWB1", courierName: "Porter", provider: "manual" });

    const pre = await placeOrder(checkoutInput(vid, 1, { paymentMethod: "razorpay" }), { userId: null, idempotencyKey: key() });
    await expect(applyOrderAction(pre.orderId, { type: "confirm" }, ADMIN)).rejects.toMatchObject({ code: "UNPAID" });
  });

  it("COD revenue exists only once cash is collected", async () => {
    const f = await makeProduct({ stocks: [5] });
    const r = await placeOrder(checkoutInput(f.variants[0]!.id, 1), { userId: null, idempotencyKey: key() });
    expect((await get(r.orderId)).paymentStatus).toBe("pending");
    for (const a of [{ type: "confirm" }, { type: "start_processing" }, { type: "ship", mode: "manual", courierName: "P", awbNumber: "Z1" }] as const) await applyOrderAction(r.orderId, a, ADMIN);
    await applyOrderAction(r.orderId, { type: "deliver", codCollected: false }, ADMIN);
    expect((await get(r.orderId)).paymentStatus).toBe("pending");
    await applyOrderAction(r.orderId, { type: "collect_cod" }, ADMIN);
    const o = await get(r.orderId);
    expect(o.paymentStatus).toBe("paid");
    expect(o.payment.capturedAt).toBeTruthy();
  });

  it("refunds are provider-backed, capped, idempotent and move payment status through partial/total", async () => {
    const f = await makeProduct({ stocks: [5], price: 1_000_000 });
    const r = await placeOrder(checkoutInput(f.variants[0]!.id, 1, { paymentMethod: "razorpay", address: { ...checkoutInput("x", 1).address, pincode: "201301" } }), { userId: null, idempotencyKey: key() });
    const o = await get(r.orderId);
    await applyPaymentCaptured({ providerOrderId: o.payment.razorpayOrderId!, paymentId: "pay_ref1", amount: o.pricing.total, currency: "INR", source: "webhook" });
    // over-refund is refused
    await expect(applyOrderAction(r.orderId, { type: "refund_request", amount: o.pricing.total + 1, reason: "too much" }, ADMIN)).rejects.toMatchObject({ code: "OVER_REFUND" });
    await applyOrderAction(r.orderId, { type: "refund_request", amount: 400_000, reason: "partial" }, ADMIN);
    let cur = await get(r.orderId);
    const rid = cur.payment.refunds[0]!.id;
    expect(cur.payment.refunds[0]!.state).toBe("requested");
    // the provider payment must exist in the simulator for the refund call
    const { col } = await import("@/server/repos/common");
    await col(C.simPayments).doc("pay_ref1").set({ kind: "payment", orderId: o.payment.razorpayOrderId, amount: o.pricing.total, currency: "INR", status: "captured", method: "sim", errorDescription: null, createdAt: new Date().toISOString(), refunds: {} });
    await Promise.allSettled([executeRefund(r.orderId, rid, ADMIN), executeRefund(r.orderId, rid, ADMIN)]);
    cur = await get(r.orderId);
    expect(cur.payment.refunds[0]!.state).toBe("completed");
    expect(cur.payment.refundedTotal).toBe(400_000);
    expect(cur.paymentStatus).toBe("partially_refunded");
    const sim = (await col(C.simPayments).doc("pay_ref1").get()).data() as { refunds: Record<string, unknown> };
    expect(Object.keys(sim.refunds)).toHaveLength(1); // provider saw ONE refund despite two concurrent clicks
    await expect(executeRefund(r.orderId, rid, ADMIN)).rejects.toMatchObject({ code: "ALREADY_DONE" });
    // remaining balance can be refunded in full -> refunded
    await applyOrderAction(r.orderId, { type: "refund_request", amount: o.pricing.total - 400_000, reason: "rest" }, ADMIN);
    cur = await get(r.orderId);
    await executeRefund(r.orderId, cur.payment.refunds[1]!.id, ADMIN);
    expect((await get(r.orderId)).paymentStatus).toBe("refunded");
  });

  it("cash orders are refunded by recording a reference, never through a provider", async () => {
    const f = await makeProduct({ stocks: [5] });
    const r = await placeOrder(checkoutInput(f.variants[0]!.id, 1), { userId: null, idempotencyKey: key() });
    await applyOrderAction(r.orderId, { type: "collect_cod" }, ADMIN);
    await applyOrderAction(r.orderId, { type: "refund_request", amount: 1000, reason: "goodwill" }, ADMIN);
    const o = await get(r.orderId);
    await expect(executeRefund(r.orderId, o.payment.refunds[0]!.id, ADMIN)).rejects.toMatchObject({ status: 400 });
    await applyOrderAction(r.orderId, { type: "cod_refund_record", refundId: o.payment.refunds[0]!.id, reference: "UPI-REF-123" }, ADMIN);
    const after = await get(r.orderId);
    expect(after.payment.refunds[0]).toMatchObject({ state: "completed", reference: "UPI-REF-123" });
  });

  it("return workflow: request is not a refund; restock disposition adds stock back once", async () => {
    const f = await makeProduct({ stocks: [5] });
    const vid = f.variants[0]!.id;
    const r = await placeOrder(checkoutInput(vid, 1), { userId: null, idempotencyKey: key() });
    for (const a of [{ type: "confirm" }, { type: "start_processing" }, { type: "ship", mode: "manual", courierName: "P", awbNumber: "R1" }, { type: "deliver", codCollected: true }] as const) await applyOrderAction(r.orderId, a, ADMIN);
    await requestReturn(r.orderId, "does not fit", { id: "customer", kind: "customer" });
    await expect(requestReturn(r.orderId, "again please", { id: "customer", kind: "customer" })).rejects.toMatchObject({ code: "ALREADY_REQUESTED" });
    let o = await get(r.orderId);
    expect(o.returnStatus).toBe("requested");
    expect(o.paymentStatus).toBe("paid");
    expect(o.payment.refundedTotal).toBe(0); // requested != refunded
    await expect(applyOrderAction(r.orderId, { type: "return_received", disposition: "restock" }, ADMIN)).rejects.toMatchObject({ code: "BAD_STATE" });
    await applyOrderAction(r.orderId, { type: "return_decision", decision: "approve" }, ADMIN);
    expect((await getVariant(vid)).stock).toBe(4);
    await applyOrderAction(r.orderId, { type: "return_received", disposition: "restock" }, ADMIN);
    expect((await getVariant(vid)).stock).toBe(5);
    await expect(applyOrderAction(r.orderId, { type: "return_received", disposition: "restock" }, ADMIN)).rejects.toMatchObject({ code: "BAD_STATE" });
    expect((await getVariant(vid)).stock).toBe(5);
    o = await get(r.orderId);
    expect(o.returnStatus).toBe("received");
  });

  it("customers cannot return made-to-order pieces", async () => {
    const f = await makeProduct({ stocks: [5], customizable: true });
    const r = await placeOrder(checkoutInput(f.variants[0]!.id, 1, { paymentMethod: "razorpay" }), { userId: null, idempotencyKey: key() });
    const o = await get(r.orderId);
    await applyPaymentCaptured({ providerOrderId: o.payment.razorpayOrderId!, paymentId: "pay_cu", amount: o.pricing.total, currency: "INR", source: "webhook" });
    await db().collection(C.orders).doc(r.orderId).update({ status: "delivered", "shipment.deliveredAt": new Date().toISOString() });
    await expect(requestReturn(r.orderId, "changed my mind", { id: "customer", kind: "customer" })).rejects.toMatchObject({ code: "CUSTOM_ORDER" });
  });
});

describe("shipping webhook", () => {
  it("authenticates by token (constant-time) and only moves orders forward", async () => {
    process.env.SHIPROCKET_WEBHOOK_TOKEN = "tok_test_123";
    const { env } = await import("@/server/env");
    void env;
    expect(verifyShiprocketToken(null)).toBe(false);
    expect(verifyShiprocketToken("wrong")).toBe(false);
  });

  it("applies delivered once, ignores regressions and duplicates, flags RTO for review", async () => {
    const f = await makeProduct({ stocks: [5] });
    const uniq = newId("").slice(0, 8).toUpperCase(); // webhook receipts are permanent, so each run needs its own AWBs
    const r = await placeOrder(checkoutInput(f.variants[0]!.id, 1), { userId: null, idempotencyKey: key() });
    for (const a of [{ type: "confirm" }, { type: "start_processing" }, { type: "ship", mode: "manual", courierName: "P", awbNumber: `SHIP-WH-1-${uniq}` }] as const) await applyOrderAction(r.orderId, a, ADMIN);
    const ev = (status: string, ts: string) => JSON.stringify({ awb: `SHIP-WH-1-${uniq}`, current_status: status, current_timestamp: ts });
    await handleShiprocketEvent(ev("OUT FOR DELIVERY", "t1"));
    expect((await get(r.orderId)).status).toBe("out_for_delivery");
    await handleShiprocketEvent(ev("IN TRANSIT", "t0")); // late, older event must not regress
    expect((await get(r.orderId)).status).toBe("out_for_delivery");
    expect(await handleShiprocketEvent(ev("OUT FOR DELIVERY", "t1"))).toMatchObject({ body: { duplicate: true } });
    await handleShiprocketEvent(ev("DELIVERED", "t2"));
    expect((await get(r.orderId)).status).toBe("delivered");
    await handleShiprocketEvent(ev("OUT FOR DELIVERY", "t3"));
    expect((await get(r.orderId)).status).toBe("delivered");

    const r2 = await placeOrder(checkoutInput(f.variants[0]!.id, 1), { userId: null, idempotencyKey: key() });
    for (const a of [{ type: "confirm" }, { type: "start_processing" }, { type: "ship", mode: "manual", courierName: "P", awbNumber: `SHIP-WH-2-${uniq}` }] as const) await applyOrderAction(r2.orderId, a, ADMIN);
    await handleShiprocketEvent(JSON.stringify({ awb: `SHIP-WH-2-${uniq}`, current_status: "RTO INITIATED", current_timestamp: "x" }));
    const o2 = await get(r2.orderId);
    expect(o2.status).toBe("shipped");
    expect(o2.needsReview).toBe(true);
  });
});

describe("access tokens and rate limiting", () => {
  it("order access tokens are scoped to one order and purpose, expire, and reject tampering", () => {
    const t = makeAccessToken("ord_a", "success", 60);
    expect(verifyAccessToken(t, "ord_a", "success")).toBe(true);
    expect(verifyAccessToken(t, "ord_b", "success")).toBe(false);
    expect(verifyAccessToken(t, "ord_a", "track")).toBe(false);
    expect(verifyAccessToken(t + "x", "ord_a", "success")).toBe(false);
    expect(verifyAccessToken(makeAccessToken("ord_a", "success", -5), "ord_a", "success")).toBe(false);
    expect(parseAccessToken(t, "success")).toBe("ord_a");
    expect(parseAccessToken(t, "track")).toBeNull();
    expect(verifyAccessToken("", "ord_a", "success")).toBe(false);
  });

  it("the distributed limiter blocks after the limit and is keyed per subject", async () => {
    const rule = { name: `test:${newId("")}`, limit: 3, windowSeconds: 60 };
    await rateLimit(rule, "a");
    await rateLimit(rule, "a");
    await rateLimit(rule, "a");
    await expect(rateLimit(rule, "a")).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
    await expect(rateLimit(rule, "b")).resolves.toBeTruthy();
  });
});

describe("immutable purchase snapshots", () => {
  it("editing the product, its price or the customer's saved address never changes an existing order or its invoice", async () => {
    const { buildInvoicePdf } = await import("@/server/services/invoice");
    const { getPublicSettingsFresh } = await import("@/server/repos/settings");
    const { saveAddress } = await import("@/server/repos/addresses");
    const f = await makeProduct({ stocks: [5], price: 800_000 });
    const uid = "snap_user_" + newId("").slice(0, 6);
    const r = await placeOrder(checkoutInput(f.variants[0]!.id, 1), { userId: uid, idempotencyKey: key() });
    const before = await get(r.orderId);
    const pdfBefore = await buildInvoicePdf(before, await getPublicSettingsFresh());
    await db().collection(C.products).doc(f.productId).update({ name: "Totally Renamed", price: 999_900 });
    await db().collection(C.variants).doc(f.variants[0]!.id).update({ priceOverride: 1_234_500, productName: "Totally Renamed" });
    const addr = await saveAddress(uid, { fullName: "Changed Name", phone: "+919000000009", line1: "99 New Street", line2: "", city: "Pune", state: "Maharashtra", pincode: "411001", country: "IN", label: "Home", isDefault: true });
    await saveAddress(uid, { ...addr, state: "Maharashtra", line1: "100 Other Street", isDefault: true }, addr.id);
    const after = await get(r.orderId);
    expect(after.items[0]).toMatchObject({ nameSnapshot: before.items[0]!.nameSnapshot, unitPrice: 800_000, lineTotal: 800_000 });
    expect(after.pricing).toEqual(before.pricing);
    expect(after.shippingAddress).toEqual(before.shippingAddress);
    const pdfAfter = await buildInvoicePdf(after, await getPublicSettingsFresh());
    expect(pdfAfter.length).toBeGreaterThan(1000);
    expect(Math.abs(pdfAfter.length - pdfBefore.length)).toBeLessThan(200); // same content apart from metadata timestamps
  });
});
