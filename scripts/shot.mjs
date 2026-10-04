// Usage: node scripts/shot.mjs /path 1440 [name] [--full] [--cookie=value]
// Saves a screenshot to screenshots/<name>-<width>.png and prints console errors / horizontal overflow.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [, , path = "/", width = "1440", name, ...flags] = process.argv;
const full = !flags.includes("--viewport");
const base = process.env.BASE_URL ?? "http://localhost:3000";
const cookie = flags.find((f) => f.startsWith("--cookie="))?.slice(9);
mkdirSync("screenshots", { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(width), height: Number(width) < 600 ? 800 : 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
if (cookie) await ctx.addCookies([{ name: "__session", value: cookie, url: base }]);
const cartFlag = flags.find((f) => f.startsWith("--cart="))?.slice(7);
if (cartFlag) {
  const lines = cartFlag.split(",").map((v) => ({ variantId: v, quantity: 1 }));
  await ctx.addInitScript((l) => { try { if (!localStorage.getItem("rr.cart.v1")) localStorage.setItem("rr.cart.v1", JSON.stringify(l)); } catch {} }, lines);
}
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
const loginAs = flags.find((f) => f.startsWith("--login="))?.slice(8);
if (loginAs) {
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email address").fill(loginAs);
  await page.getByLabel("Password").first().fill(process.env.SEED_DEMO_PASSWORD ?? "Demo#Passw0rd");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
}
await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(600);
const slug = name ?? (path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home");
const file = `screenshots/${slug}-${width}.png`;
await page.screenshot({ path: file, fullPage: full });
const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
console.log(JSON.stringify({ file, overflow: overflow.sw > overflow.cw, scrollWidth: overflow.sw, clientWidth: overflow.cw, errors: errors.slice(0, 5) }));
await browser.close();
