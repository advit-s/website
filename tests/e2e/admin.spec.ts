import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { expectNoHorizontalOverflow, loginWithEmail } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
let page: Page;

/** Navigate and wait for hydration so the first click is not lost to a not-yet-interactive page (dev server). */
async function ready(p: Page, url: string) {
  const res = await p.goto(url, { waitUntil: "networkidle" });
  return res;
}


test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3000" });
  page = await ctx.newPage();
  await loginWithEmail(page, "admin@rajraani.test");
});
test.afterAll(async () => page?.context().close());

test("every admin screen renders for an admin without errors or horizontal overflow", async () => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  for (const path of ["/admin", "/admin/orders", "/admin/products", "/admin/products/new", "/admin/inventory", "/admin/categories", "/admin/customers", "/admin/assistant", "/admin/assistant?tab=activity", "/admin/assistant?tab=settings", "/admin/settings"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("main h1").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
  expect(errors).toEqual([]);
});

test("dashboard separates paid revenue from pending prepaid and uncollected COD", async () => {
  await ready(page, "/admin");
  await expect(page.getByText("Paid revenue", { exact: true })).toBeVisible();
  await expect(page.getByText(/Not revenue/i).first()).toBeVisible();
  await expect(page.getByText(/dates use India Standard Time/)).toBeVisible();
});

test("a new category appears in the storefront navigation without a deployment", async () => {
  await ready(page, "/admin/categories");
  await page.getByRole("button", { name: "Add category" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(`Test Collection ${stamp}`);
  await expect(page.getByRole("textbox", { name: "Slug (web address)" })).toHaveValue(`test-collection-${stamp}`);
  await page.getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("cell", { name: `Test Collection ${stamp}`, exact: true })).toBeVisible();
  await page.waitForTimeout(2500); // public cache TTL (2s locally)
  const shop = await page.context().newPage();
  await ready(shop, "/");
  await shop.getByRole("button", { name: "Collections" }).click();
  await expect(shop.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: `Test Collection ${stamp}` })).toBeVisible();
  const cat = await ready(shop, `/category/test-collection-${stamp}`);
  expect(cat?.status()).toBe(200);
  await shop.close();
  // duplicate slug is refused
  await page.getByRole("button", { name: "Add category" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Duplicate");
  await page.getByRole("textbox", { name: "Slug (web address)" }).fill(`test-collection-${stamp}`);
  await page.getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("alert").first()).toContainText(/already uses this slug/i);
});

test("product editor: validation, draft stays private, publish with an uploaded image goes live, edits reflect, unsaved-change indicator", async () => {
  await ready(page, "/admin/products/new");
  // empty submission shows validation errors, nothing saved
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/Please fix \d+ field/)).toBeVisible();
  await expect(page.getByText("Add a description").first()).toBeVisible();

  const name = `E2E Lehenga ${stamp}`;
  await page.getByRole("textbox", { name: "Product name" }).fill(name);
  await page.getByRole("spinbutton", { name: "Selling price (INR)" }).fill("12999");
  await page.getByLabel("Compare-at / MRP (INR)").fill("14999");
  await page.getByRole("textbox", { name: "Description", exact: true }).fill("A test lehenga created by the end-to-end suite.");
  await page.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: `Test Collection ${stamp}` });
  await page.getByLabel("Size, variant 1").fill("M");
  await page.getByLabel("Colour, variant 1").fill("Teal");
  await page.getByLabel("SKU, variant 1").fill(`E2E-${stamp.toUpperCase()}-M`);
  await page.getByLabel("Opening stock, variant 1").fill("6");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/prod_/, { timeout: 15000 });
  await expect(page.getByText("All changes saved")).toBeVisible();
  const slug = `e2e-lehenga-${stamp}`;

  // drafts are invisible to the public
  const pub = await page.context().newPage();
  expect((await ready(pub, `/product/${slug}`))?.status()).toBe(404);

  // publishing without an image is refused
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Add at least one image before publishing").first()).toBeVisible();

  // upload a real image (validated + re-encoded server-side), add alt text, publish
  const png = await sharp({ create: { width: 600, height: 750, channels: 3, background: { r: 74, g: 16, b: 32 } } }).png().toBuffer();
  await page.locator("#img-files").setInputFiles({ name: "test.png", mimeType: "image/png", buffer: png });
  await expect(page.getByLabel("Alt text for image 1")).toBeVisible({ timeout: 15000 });
  await page.getByLabel("Alt text for image 1").fill("Teal lehenga test image");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Saved and published.")).toBeVisible({ timeout: 15000 });

  await page.waitForTimeout(2500);
  expect((await ready(pub, `/product/${slug}`))?.status()).toBe(200);
  await expect(pub.getByRole("heading", { name })).toBeVisible();
  await expect(pub.getByText("₹12,999").first()).toBeVisible();
  const img = pub.locator("main img").first();
  await expect(img).toBeVisible();

  // a non-image disguised with an image type is rejected by the server
  await page.locator("#img-files").setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("MZ\x90\x00 not an image at all") });
  await expect(page.getByText(/not a valid image|could not be processed|Only JPEG/i).first()).toBeVisible({ timeout: 15000 });

  // edit the price: storefront follows
  await page.getByRole("spinbutton", { name: "Selling price (INR)" }).fill("11999");
  await page.getByRole("button", { name: /Update & publish|Save changes/ }).first().click();
  await expect(page.getByText(/Saved/).first()).toBeVisible();
  await page.waitForTimeout(2500);
  await ready(pub, `/product/${slug}`);
  await expect(pub.getByText("₹11,999").first()).toBeVisible();
  await pub.close();
});

test("inventory: inline edit saves, a stale row is rejected with live numbers, import dry-run reports rows", async () => {
  await ready(page, `/admin/inventory?q=E2E-${stamp.toUpperCase()}`);
  const row = page.getByRole("row").filter({ hasText: `E2E-${stamp.toUpperCase()}-M` });
  await expect(row).toBeVisible();
  const stock = row.getByLabel(/On-hand stock for/);
  await expect(stock).toHaveValue("6");
  await stock.fill("9");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByText("Saved.")).toBeVisible();

  // change the same variant behind the page's back (as a sale would), then save from the stale row
  const sku = `E2E-${stamp.toUpperCase()}-M`;
  const rows = await (await page.request.get(`/api/admin/inventory/export?format=csv&q=${sku}`)).text();
  const [header, line] = rows.trim().split(/\r?\n/);
  const cols = header!.split(",");
  const cells = line!.split(",");
  const variantVersion = Number(cells[cols.indexOf("version")]);
  const { id } = await page.evaluate(async (s) => {
    const html = await (await fetch(`/admin/inventory?q=${s}`)).text();
    return { id: /id="st-([^"]+)"/.exec(html)?.[1] ?? "" };
  }, sku);
  const bump = await page.request.patch(`/api/admin/inventory/${id}`, { data: { expectedVersion: variantVersion, stock: 20 }, headers: { Origin: "http://localhost:3000" } });
  expect(bump.status()).toBe(200);
  await stock.fill("11");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByRole("alert")).toContainText(/changed since you loaded it/i);
  await expect(stock).toHaveValue("20"); // live value shown, nothing overwritten

  // import dry-run
  const csv = `sku,stock,version\n${sku},30,${variantVersion}\nNOPE-000,5,1\n`;
  await page.getByRole("button", { name: "Import" }).click();
  await page.locator("#imp-file").setInputFiles({ name: "stock.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Preview (dry run)" }).click();
  await expect(page.getByText(/Nothing has been written/)).toBeVisible();
  await expect(page.getByText(/changed since export/i)).toBeVisible(); // stale version flagged
  await expect(page.getByText("No variant with this SKU")).toBeVisible();
  await expect(page.getByRole("button", { name: /Apply 0 change/ })).toBeDisabled();
});

test("orders: queue filters, detail, status progression and customer-visible timeline", async () => {
  await ready(page, "/admin/orders?tab=pending");
  await expect(page.getByRole("link", { name: /^RRC-\d+$/ }).first()).toBeVisible();
  await ready(page, "/admin/orders?q=RRC-1002");
  await page.getByRole("link", { name: "RRC-1002" }).click();
  await expect(page.getByRole("heading", { name: "Order RRC-1002" })).toBeVisible();
  // confirm -> processing
  await page.getByRole("button", { name: "Confirm order" }).click();
  await expect(page.getByRole("button", { name: "Start processing" })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Start processing" }).click();
  await expect(page.getByRole("button", { name: "Ship order" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Confirmed").first()).toBeVisible();
  // an unpaid prepaid order cannot be confirmed from the UI
  await ready(page, "/admin/orders?q=RRC-1005");
  await page.getByRole("link", { name: "RRC-1005" }).click();
  await expect(page.getByRole("button", { name: "Confirm order" })).toBeDisabled();
});

test("settings changes appear on the storefront and unresolved legal details are surfaced", async () => {
  await ready(page, "/admin/settings");
  await expect(page.getByText(/owner detail\(s\) still needed before launch/)).toBeVisible();
  const text = `Announcement ${stamp}`;
  await page.getByLabel("Announcement text").fill(text);
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/Settings saved/)).toBeVisible();
  await page.waitForTimeout(2500);
  const s = await page.context().newPage();
  await ready(s, "/");
  await expect(s.getByText(text).first()).toBeVisible();
  await s.close();
  // restore
  await page.getByLabel("Announcement text").fill("Demo store - sample catalogue and simulated checkout");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/Settings saved/)).toBeVisible();
});
