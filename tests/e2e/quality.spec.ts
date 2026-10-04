import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginWithEmail } from "./helpers";

const PUBLIC = ["/", "/shop", "/shop?collection=sale", "/category/bridal-lehengas", "/product/royal-rose-bridal-lehenga", "/cart", "/wishlist", "/checkout", "/track-order", "/about", "/contact", "/faq", "/login", "/register", "/forgot-password", "/terms", "/privacy", "/shipping-policy", "/refund-policy"];
const WIDTHS = [320, 390, 768, 1440];

async function seedCart(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("rr.cart.v1", JSON.stringify([{ variantId: "var_lh_peach_blossom_m_peach", quantity: 1 }]));
    } catch {
      /* ignore */
    }
  });
}

test.describe("responsive layout: no horizontal overflow, no console errors", () => {
  test.setTimeout(180_000); // many pages visited per test; dev server compiles routes on first hit
  for (const width of WIDTHS) {
    test(`public pages at ${width}px`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: 800 }, baseURL: "http://localhost:3000" });
      const page = await ctx.newPage();
      await seedCart(page);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
      for (const path of PUBLIC) {
        await page.goto(path, { waitUntil: "networkidle" });
        const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        expect(o.sw, `overflow on ${path} at ${width}px`).toBeLessThanOrEqual(o.cw);
      }
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }

  test("admin pages at 390px", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, baseURL: "http://localhost:3000" });
    const page = await ctx.newPage();
    await loginWithEmail(page, "admin@rajraani.test");
    for (const path of ["/admin", "/admin/orders", "/admin/products", "/admin/products/new", "/admin/inventory", "/admin/categories", "/admin/customers", "/admin/assistant", "/admin/settings"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      // wide tables scroll inside their own container, never the page
      expect(o.sw, `page overflow on ${path}`).toBeLessThanOrEqual(o.cw);
    }
    await ctx.close();
  });
});

test.describe("accessibility (axe-core, WCAG 2.0/2.1 A + AA)", () => {
  for (const path of PUBLIC) {
    test(`public ${path}`, async ({ page }) => {
      await seedCart(page);
      await page.goto(path, { waitUntil: "networkidle" });
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const bad = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      expect(bad, `axe violations on ${path}`).toEqual([]);
    });
  }
  for (const path of ["/admin", "/admin/orders", "/admin/inventory", "/admin/products/new", "/admin/categories", "/admin/settings", "/admin/assistant"]) {
    test(`admin ${path}`, async ({ page }) => {
      await loginWithEmail(page, "admin@rajraani.test");
      await page.goto(path, { waitUntil: "networkidle" });
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const bad = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      expect(bad, `axe violations on ${path}`).toEqual([]);
    });
  }
});

test.describe("keyboard and semantics", () => {
  test("skip link is the first tab stop and moves focus to main content", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });

  test("search dialog traps focus, closes on Escape and returns focus to its opener", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const opener = page.getByRole("button", { name: "Search products" });
    await opener.focus();
    await page.keyboard.press("Enter");
    const dlg = page.getByRole("dialog", { name: "Search" });
    await expect(dlg).toBeVisible();
    await expect(page.getByLabel("Search lehengas, colours, fabrics")).toBeFocused();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      // focus may only be inside the modal (or leave the page entirely); never on the inert page behind it
      expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement?.closest("dialog") != null)).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dlg).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("product tabs use arrow-key navigation and expose tab/tabpanel semantics", async ({ page }) => {
    await page.goto("/product/royal-rose-bridal-lehenga", { waitUntil: "networkidle" });
    const tabs = page.getByRole("tablist", { name: "Product information" }).getByRole("tab");
    await expect(tabs).toHaveCount(5);
    await tabs.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("End");
    await expect(tabs.nth(4)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Shipping & returns" })).toBeVisible();
    await page.getByRole("tab", { name: "Reviews" }).click();
    await expect(page.getByText("No reviews yet.")).toBeVisible(); // honest empty state, nothing invented
  });

  test("FAQ accordions toggle with the keyboard and set aria-expanded", async ({ page }) => {
    await page.goto("/faq", { waitUntil: "networkidle" });
    const btn = page.getByRole("button", { name: "Do I need an account to order?" });
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await btn.focus();
    await page.keyboard.press("Enter");
    await expect(btn).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText(/You can check out as a guest/)).toBeVisible();
    await page.keyboard.press("Space");
    await expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  test("focus is clearly visible on interactive controls", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByRole("tabpanel").getByLabel("Email address").focus();
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement as Element);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test("touch targets for primary controls are at least 44px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/shop", { waitUntil: "networkidle" });
    for (const name of ["Search products", "Cart", "Open menu"]) {
      const box = await page.getByRole("button", { name }).or(page.getByRole("link", { name: new RegExp(name) })).first().boundingBox();
      expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(43.5);
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(43.5);
    }
  });
});

test.describe("security headers", () => {
  test("pages send CSP, framing, sniffing, referrer and HSTS headers; X-Powered-By is removed", async ({ request }) => {
    const r = await request.get("/");
    const h = r.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("session cookie is HttpOnly + SameSite=Lax; no secret-looking values reach the client bundle", async ({ page, context }) => {
    await loginWithEmail(page, "customer@rajraani.test");
    const c = (await context.cookies()).find((x) => x.name === "__session")!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe("Lax");
    const html = await (await page.request.get("/")).text();
    for (const secret of ["RAZORPAY_KEY_SECRET", "ANTHROPIC_API_KEY", "FIREBASE_PRIVATE_KEY", "SHIPROCKET_PASSWORD", "ORDER_TOKEN_SECRET"]) expect(html).not.toContain(secret);
  });

  test("robots and sitemap exist; private paths are excluded from the sitemap; manifest is valid", async ({ request }) => {
    const sm = await (await request.get("/sitemap.xml")).text();
    expect(sm).toContain("/product/royal-rose-bridal-lehenga");
    expect(sm).not.toContain("unpublished-sample-lehenga");
    for (const p of ["/admin", "/account", "/cart", "/checkout", "/login", "/track-order"]) expect(sm).not.toContain(`<loc>http://localhost:3000${p}`);
    expect((await request.get("/robots.txt")).status()).toBe(200);
    const m = await (await request.get("/manifest.webmanifest")).json();
    expect(m.name).toBe("Raj Raani Collections");
  });
});
