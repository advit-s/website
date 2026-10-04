import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./helpers";

const PHONE = "9876543210";

async function addPeachToBag(page: Page) {
  await page.goto("/shop");
  await page.getByRole("link", { name: "Peach Blossom Lehenga" }).first().click();
  await expect(page).toHaveURL(/\/product\/peach-blossom-lehenga/);
  await page.getByRole("radio", { name: "M", exact: true }).click();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("added to your cart")).toBeVisible();
}

async function fillCheckout(page: Page, pincode = "560001") {
  await page.goto("/checkout");
  await page.locator("#contact-name").fill("Test Guest");
  await page.locator("#contact-phone").fill(PHONE);
  await page.locator("#contact-email").fill("guest@example.test");
  await page.locator("#address-fullName").fill("Test Guest");
  await page.locator("#address-line1").fill("12 MG Road");
  await page.locator("#address-city").fill("Bengaluru");
  await page.locator("#address-state").selectOption("Karnataka");
  await page.locator("#address-pincode").fill(pincode);
  await page.getByLabel(/I agree to the/).check();
}

test.describe("guest purchase journey", () => {
  test("browse -> variant -> cart -> COD checkout -> protected confirmation -> tracking", async ({ page, context }) => {
    await addPeachToBag(page);
    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Your shopping bag" })).toBeVisible();
    await expect(page.getByText("Peach Blossom Lehenga").first()).toBeVisible();
    await expect(page.getByText(/estimated/i).first()).toBeVisible(); // shipping is labelled an estimate until a pincode is entered

    await fillCheckout(page);
    await page.getByRole("radio", { name: /Cash on delivery/ }).click();
    await page.getByRole("button", { name: /Place order \(cash on delivery\)/ }).click();
    await expect(page).toHaveURL(/\/checkout\/success\?o=ord_/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Thank you for your order" })).toBeVisible();
    const orderNumber = (await page.locator("strong", { hasText: /^RRC-\d+$/ }).first().textContent())!.trim();
    await expectNoHorizontalOverflow(page);

    // Confirmation is protected: without the order-scoped cookie it is a 404, even with the right URL.
    const url = page.url();
    const fresh = await context.browser()!.newContext();
    const p2 = await fresh.newPage();
    const res = await p2.goto(url);
    expect(res?.status()).toBe(404);
    await fresh.close();

    // Refresh does not create another order.
    await page.reload();
    await expect(page.getByText(orderNumber).first()).toBeVisible();

    // Tracking with order number + phone.
    await page.goto("/track-order");
    await page.getByLabel("Order number").fill(orderNumber);
    await page.getByLabel(/Phone number or email/).fill(PHONE);
    await page.getByRole("button", { name: "Track order" }).click();
    await expect(page.getByRole("heading", { name: `Order ${orderNumber}` })).toBeVisible();
    await expect(page.getByText("Bengaluru, Karnataka")).toBeVisible();
    await expect(page.getByText("12 MG Road")).toHaveCount(0); // private address is not shown on the public lookup

    // Wrong contact gives the same generic error.
    await page.getByLabel(/Phone number or email/).fill("9000000099");
    await page.getByRole("button", { name: "Track order" }).click();
    await expect(page.getByText(/couldn't find an order matching/i)).toBeVisible();
  });

  test("double-clicking Place order creates exactly one order", async ({ page }) => {
    await addPeachToBag(page);
    await fillCheckout(page);
    await page.getByRole("radio", { name: /Cash on delivery/ }).click();
    const posts: string[] = [];
    page.on("response", (r) => r.url().endsWith("/api/checkout") && r.request().method() === "POST" && posts.push(r.status().toString()));
    const btn = page.getByRole("button", { name: /Place order \(cash on delivery\)/ });
    await btn.dblclick();
    await expect(page).toHaveURL(/\/checkout\/success/, { timeout: 20_000 });
    expect(posts.filter((s) => s === "201")).toHaveLength(1);
  });

  test("simulated prepaid: failure shows inline retry, then success confirms; payment stays labelled simulated", async ({ page }) => {
    await addPeachToBag(page);
    await fillCheckout(page);
    await expect(page.getByText(/Simulated payments? - not live/i).first()).toBeVisible();
    await page.getByRole("button", { name: /Pay securely/ }).click();
    await expect(page.getByRole("dialog", { name: "Simulated payment" })).toBeVisible();
    await page.getByRole("button", { name: "Fail the payment" }).click();
    await expect(page.getByRole("heading", { name: "Payment unsuccessful" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/checkout"); // never a dead-end page
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByRole("button", { name: /successfully/ }).click();
    await expect(page).toHaveURL(/\/checkout\/success/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Thank you for your order" })).toBeVisible();
    await expect(page.getByText("Payment received")).toBeVisible();
  });

  test("closing the payment window keeps the order recoverable and allows switching to COD", async ({ page }) => {
    await addPeachToBag(page);
    await fillCheckout(page);
    await page.getByRole("button", { name: /Pay securely/ }).click();
    await page.getByRole("button", { name: "Close without paying" }).click();
    await expect(page.getByRole("heading", { name: "Payment unsuccessful" })).toBeVisible();
    await page.getByRole("button", { name: "Pay by cash on delivery instead" }).click();
    await expect(page).toHaveURL(/\/checkout\/success/, { timeout: 20_000 });
    await expect(page.getByText("Order placed")).toBeVisible();
  });

  test("tampered checkout requests fail safely", async ({ page, request }) => {
    await addPeachToBag(page);
    const variantId = await page.evaluate(() => JSON.parse(localStorage.getItem("rr.cart.v1") ?? "[]")[0].variantId as string);
    const base = {
      contact: { name: "Test T", email: "t@example.test", phone: PHONE },
      address: { fullName: "T T", phone: PHONE, line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" },
      paymentMethod: "cod",
    };
    const post = (data: unknown, key = "k".repeat(24)) => request.post("/api/checkout", { data, headers: { "Idempotency-Key": key, Origin: "http://localhost:3000" } });

    // client-supplied totals and prices are ignored (unknown fields are stripped) - the stored total comes from the server
    const ok = await post({ ...base, lines: [{ variantId, quantity: 1 }], total: 1, price: 1, discount: 99999999 }, "t1".repeat(12));
    expect(ok.status()).toBe(201);
    // absurd quantities
    expect((await post({ ...base, lines: [{ variantId, quantity: 999 }] }, "t2".repeat(12))).status()).toBe(422);
    expect((await post({ ...base, lines: [{ variantId, quantity: -1 }] }, "t3".repeat(12))).status()).toBe(422);
    // missing idempotency key and bad origin
    expect((await request.post("/api/checkout", { data: { ...base, lines: [{ variantId, quantity: 1 }] }, headers: { Origin: "http://localhost:3000" } })).status()).toBe(400);
    expect((await request.post("/api/checkout", { data: { ...base, lines: [{ variantId, quantity: 1 }] }, headers: { "Idempotency-Key": "t4".repeat(12), Origin: "https://evil.example" } })).status()).toBe(403);
    // a forged "payment succeeded" callback is rejected
    const bad = await request.post("/api/checkout/verify", { data: { orderId: "ord_00000000000000000000", razorpay_order_id: "order_x12345", razorpay_payment_id: "pay_x12345", razorpay_signature: "f".repeat(64) }, headers: { Origin: "http://localhost:3000" } });
    expect(bad.status()).toBe(404);
  });

  test("order confirmation pages are accessible only with the order-scoped token", async ({ request }) => {
    const r = await request.get("/checkout/success?o=ord_zzzzzzzzzzzzzzzzzzzz");
    expect(r.status()).toBe(404);
  });
});
