import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { loginWithEmail } from "./helpers";

const ORIGIN = { Origin: "http://localhost:3000" };

async function ctxFor(browser: Browser, email: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3000" });
  const page = await ctx.newPage();
  await loginWithEmail(page, email);
  await page.close();
  return ctx;
}

test.describe("authorisation boundaries", () => {
  test("customer A cannot read, download, cancel or poll customer B's order - by page or by direct API call", async ({ browser }) => {
    const b = await ctxFor(browser, "customer2@rajraani.test");
    const pb = await b.newPage();
    await pb.goto("/account/orders");
    const href = await pb.locator('a[href^="/account/orders/ord_"]').first().getAttribute("href");
    expect(href).toBeTruthy();
    const orderId = href!.split("/").pop()!;
    expect((await b.request.get(`/api/orders/${orderId}/invoice`)).status()).toBe(200); // the owner can
    await b.close();

    const a = await ctxFor(browser, "customer@rajraani.test");
    const pa = await a.newPage();
    const res = await pa.goto(`/account/orders/${orderId}`);
    expect(res?.status()).toBe(404);
    expect((await a.request.get(`/api/orders/${orderId}/invoice`)).status()).toBe(404);
    expect((await a.request.get(`/api/checkout/status?orderId=${orderId}`)).status()).toBe(404);
    expect((await a.request.post(`/api/orders/${orderId}/cancel`, { data: { reason: "x" }, headers: ORIGIN })).status()).toBe(404);
    expect((await a.request.post(`/api/orders/${orderId}/return`, { data: { reason: "not mine" }, headers: ORIGIN })).status()).toBe(404);
    expect((await a.request.get("/admin/orders/" + orderId)).url()).toContain("/account"); // redirected away from admin
    await a.close();
  });

  test("a customer session cannot use any admin endpoint; anonymous callers are unauthenticated", async ({ browser, request }) => {
    const c = await ctxFor(browser, "customer@rajraani.test");
    const calls: [string, string, unknown?][] = [
      ["GET", "/api/admin/settings"],
      ["POST", "/api/admin/categories", { name: "Hack", slug: "hack" }],
      ["POST", "/api/admin/products", {}],
      ["PATCH", "/api/admin/inventory/anything", { expectedVersion: 1, stock: 999 }],
      ["POST", "/api/admin/orders/anything/actions", { type: "confirm" }],
      ["POST", "/api/admin/orders/anything/refund", { refundId: "rf_x" }],
      ["POST", "/api/admin/assistant", { conversationId: "abcdefgh12", message: "hi" }],
      ["GET", "/api/admin/inventory/export?format=csv"],
    ];
    for (const [m, url, data] of calls) {
      const r = await c.request.fetch(url, { method: m, data, headers: ORIGIN });
      expect(r.status(), `${m} ${url} as customer`).toBe(403);
      const anon = await request.fetch(url, { method: m, data, headers: ORIGIN });
      expect(anon.status(), `${m} ${url} anonymous`).toBe(401);
    }
    const p = await c.newPage();
    await p.goto("/admin");
    expect(new URL(p.url()).pathname).toBe("/account");
    await c.close();
  });

  test("browser-style direct Firestore writes cannot forge orders, roles, inventory, logs or read drafts", async ({ request }) => {
    const base = "http://127.0.0.1:8080/v1/projects/demo-rajraani/databases/(default)/documents";
    const doc = (fields: object) => ({ fields });
    for (const [col, body] of [
      ["orders", doc({ userId: { nullValue: null }, total: { integerValue: "1" }, paymentStatus: { stringValue: "paid" } })],
      ["users", doc({ role: { stringValue: "admin" } })],
      ["productVariants", doc({ stock: { integerValue: "99999" } })],
      ["stockLogs", doc({ delta: { integerValue: "1" } })],
      ["assistantLogs", doc({ messages: { arrayValue: {} } })],
    ] as const) {
      const r = await request.post(`${base}/${col}`, { data: body });
      expect(r.status(), `anonymous create in ${col}`).toBe(403);
    }
    expect((await request.get(`${base}/products/lh_draft_sample`)).status()).toBe(403);
    expect((await request.get(`${base}/orders`)).status()).toBe(403);
    expect((await request.get(`${base}/settings/private`)).status()).toBe(403);
  });

  test("revoking an admin's tokens ends their admin session", async ({ browser }) => {
    if (getApps().length === 0) {
      process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
      initializeApp({ projectId: "demo-rajraani" });
    }
    const admin = await ctxFor(browser, "admin@rajraani.test");
    expect((await admin.request.get("/api/admin/settings")).status()).toBe(200);
    await new Promise((r) => setTimeout(r, 2200)); // token validity is second-granular
    const u = await getAuth().getUserByEmail("admin@rajraani.test");
    await getAuth().revokeRefreshTokens(u.uid);
    expect((await admin.request.get("/api/admin/settings")).status()).toBe(401);
    const p = await admin.newPage();
    await p.goto("/admin");
    expect(new URL(p.url()).pathname).toBe("/login");
    await admin.close();
  });

  test("session cookie cannot be forged and an invalid cookie is treated as signed out", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: "http://localhost:3000" });
    await ctx.addCookies([{ name: "__session", value: "eyJhbGciOiJub25lIn0.eyJhZG1pbiI6dHJ1ZSwidWlkIjoieCJ9.", url: "http://localhost:3000" }]);
    expect((await ctx.request.get("/api/admin/settings")).status()).toBe(401);
    const p = await ctx.newPage();
    await p.goto("/admin");
    expect(new URL(p.url()).pathname).toBe("/login");
    await ctx.close();
  });

  test("webhook endpoints reject unsigned or wrongly-signed requests", async ({ request }) => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    expect((await request.post("/api/webhooks/razorpay", { data: body, headers: { "content-type": "application/json" } })).status()).toBe(400);
    expect((await request.post("/api/webhooks/razorpay", { data: body, headers: { "content-type": "application/json", "x-razorpay-signature": "0".repeat(64) } })).status()).toBe(400);
    expect((await request.post("/api/webhooks/shiprocket", { data: body, headers: { "content-type": "application/json" } })).status()).toBe(401);
    expect((await request.post("/api/dev/simulate-payment", { data: { orderId: "ord_x", outcome: "success" }, headers: ORIGIN })).status()).toBe(404);
    expect((await request.post("/api/jobs/expire")).status()).toBe(401);
  });

  test("cross-origin mutations are blocked", async ({ request }) => {
    const r = await request.post("/api/contact", { data: { name: "x", email: "a@b.co", message: "hello there!" }, headers: { Origin: "https://evil.example" } });
    expect(r.status()).toBe(403);
  });
});
