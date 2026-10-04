import { expect, test } from "@playwright/test";
import { loginWithEmail } from "./helpers";

test.describe("shared login and role routing", () => {
  test("customer lands on /account and gets an HttpOnly session cookie", async ({ page, context }) => {
    await loginWithEmail(page, "customer@rajraani.test");
    expect(new URL(page.url()).pathname).toBe("/account");
    const cookie = (await context.cookies()).find((c) => c.name === "__session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
  });

  test("admin claim routes to /admin", async ({ page }) => {
    await loginWithEmail(page, "admin@rajraani.test");
    expect(new URL(page.url()).pathname).toBe("/admin");
  });

  test("open-redirect attempts fall back to the role default", async ({ page }) => {
    await loginWithEmail(page, "customer@rajraani.test", "//evil.example/steal");
    expect(new URL(page.url()).host).toBe("localhost:3000");
    expect(new URL(page.url()).pathname).toBe("/account");
  });

  test("wrong password shows an inline error and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill("customer@rajraani.test");
    await page.getByLabel("Password").first().fill("Wrong#Pass1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("tabpanel").getByRole("alert")).toContainText(/do not match/i);
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("there is no /admin/login page", async ({ page }) => {
    // signed out: the early redirect sends the visitor to the one shared login
    await page.goto("/admin/login");
    expect(new URL(page.url()).pathname).toBe("/login");
    // signed in as admin: the route simply does not exist
    await loginWithEmail(page, "admin@rajraani.test");
    const res = await page.goto("/admin/login");
    expect(res?.status()).toBe(404);
  });

  test("unauthenticated /admin redirects to the shared /login with a return path", async ({ page }) => {
    await page.goto("/admin");
    expect(new URL(page.url()).pathname).toBe("/login");
    expect(new URL(page.url()).searchParams.get("next")).toBe("/admin");
  });
});
