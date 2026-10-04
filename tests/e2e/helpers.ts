import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo#Passw0rd";

export async function loginWithEmail(page: Page, email: string, next?: string) {
  await page.goto("/login" + (next ? `?next=${encodeURIComponent(next)}` : ""));
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").first().fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
}

export async function expectNoHorizontalOverflow(page: Page) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(o.sw, "horizontal overflow").toBeLessThanOrEqual(o.cw);
}
