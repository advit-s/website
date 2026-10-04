// Usage: node scripts/console-check.mjs /path [--login=email]  -> prints console errors with source locations
import { chromium } from "@playwright/test";
const [, , path = "/", ...flags] = process.argv;
const base = process.env.BASE_URL ?? "http://localhost:3000";
const loginAs = flags.find((f) => f.startsWith("--login="))?.slice(8);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.on("console", (m) => m.type() === "error" && console.log("[console.error]", m.text().slice(0, 300), JSON.stringify(m.location())));
page.on("pageerror", (e) => console.log("[pageerror]", String(e.stack ?? e).slice(0, 800)));
page.on("requestfailed", (r) => console.log("[requestfailed]", r.url(), r.failure()?.errorText));
page.on("response", (r) => r.status() >= 400 && console.log("[http", r.status() + "]", r.url()));
if (loginAs) {
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email address").fill(loginAs);
  await page.getByLabel("Password").first().fill(process.env.SEED_DEMO_PASSWORD ?? "Demo#Passw0rd");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => console.log("login did not navigate"));
}
await page.goto(base + path, { waitUntil: "load", timeout: 60000 }).catch((e) => console.log("goto:", e.message.split("\n")[0]));
await page.waitForTimeout(2500);
console.log("final url:", page.url());
await browser.close();
