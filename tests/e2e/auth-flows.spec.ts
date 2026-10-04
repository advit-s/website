import { expect, test } from "@playwright/test";

const panel = (p: import("@playwright/test").Page) => p.getByRole("tabpanel");
const EMU = "http://127.0.0.1:9099/emulator/v1/projects/demo-rajraani";

async function latestSmsCode(phone: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${EMU}/verificationCodes`);
    const d = (await r.json()) as { verificationCodes: { phoneNumber: string; code: string }[] };
    const hit = [...d.verificationCodes].reverse().find((c) => c.phoneNumber === phone);
    if (hit) return hit.code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("No SMS code found in the Auth emulator");
}
async function latestOobLink(email: string, type: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${EMU}/oobCodes`);
    const d = (await r.json()) as { oobCodes: { email: string; requestType: string; oobCode: string }[] };
    const hit = [...d.oobCodes].reverse().find((c) => c.email === email && c.requestType === type);
    if (hit) return hit.oobCode;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("No action code found in the Auth emulator");
}

test.describe("phone OTP (inline, no OTP route), registration and password reset", () => {
  test("phone sign-in: inline OTP, wrong code error, correct code signs in", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Phone" }).click();
    await panel(page).getByLabel("Mobile number").fill("90000 00002");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByRole("group", { name: "Verify with OTP" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/login"); // inline: no separate OTP page
    const code = await latestSmsCode("+919000000002");
    const wrong = code === "000000" ? "111111" : "000000";
    await panel(page).getByLabel("Digit 1").fill(wrong[0]!);
    for (let i = 1; i < 6; i++) await panel(page).getByLabel(`Digit ${i + 1}`).fill(wrong[i]!);
    await page.getByRole("button", { name: "Verify OTP" }).click();
    await expect(panel(page).getByRole("alert")).toContainText(/not correct/i);
    for (let i = 0; i < 6; i++) await panel(page).getByLabel(`Digit ${i + 1}`).fill(code[i]!);
    await page.getByRole("button", { name: "Verify OTP" }).click();
    await page.waitForURL(/\/account/, { timeout: 30000 });
  });

  test("email registration validates inputs, creates the account server-side profile and lands in /account", async ({ page }) => {
    const email = `new.${Date.now().toString(36)}@example.test`;
    await page.goto("/register", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Email" }).click();
    await panel(page).getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter your full name.")).toBeVisible();
    await expect(page.getByText("Please accept the Terms to continue.")).toBeVisible();
    await panel(page).getByLabel("Full name").fill("New Customer");
    await panel(page).getByLabel("Email address").fill(email);
    await panel(page).getByLabel(/^Password/).fill("weak");
    await panel(page).getByLabel("Confirm password").fill("different");
    await panel(page).getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
    await expect(page.getByText("Passwords do not match.")).toBeVisible();
    await panel(page).getByLabel(/^Password/).fill("Strong#Pass1");
    await panel(page).getByLabel("Confirm password").fill("Strong#Pass1");
    await panel(page).getByLabel(/I agree to the/).check();
    await panel(page).getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/account/, { timeout: 30000 });
    await expect(page.getByRole("heading", { name: /Hello, New/ })).toBeVisible();
  });

  test("registering an existing email shows a helpful error", async ({ page }) => {
    await page.goto("/register", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Email" }).click();
    await panel(page).getByLabel("Full name").fill("Someone");
    await panel(page).getByLabel("Email address").fill("customer@rajraani.test");
    await panel(page).getByLabel(/^Password/).fill("Strong#Pass1");
    await panel(page).getByLabel("Confirm password").fill("Strong#Pass1");
    await panel(page).getByLabel(/I agree to the/).check();
    await panel(page).getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert").first()).toContainText(/already exists/i);
  });

  test("password reset: request, then token link sets a new password; invalid/expired token shows an error state on the same route", async ({ page }) => {
    const email = `reset.${Date.now().toString(36)}@example.test`;
    // create the account first
    await page.goto("/register", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Email" }).click();
    await panel(page).getByLabel("Full name").fill("Reset Me");
    await panel(page).getByLabel("Email address").fill(email);
    await panel(page).getByLabel(/^Password/).fill("Original#Pass1");
    await panel(page).getByLabel("Confirm password").fill("Original#Pass1");
    await panel(page).getByLabel(/I agree to the/).check();
    await panel(page).getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/account/, { timeout: 30000 });
    await page.context().clearCookies();

    await page.goto("/forgot-password", { waitUntil: "networkidle" });
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    const oob = await latestOobLink(email, "PASSWORD_RESET");
    await page.goto(`/forgot-password?mode=resetPassword&oobCode=${oob}`, { waitUntil: "networkidle" });
    await expect(page.getByText(`Choose a new password for ${email}`)).toBeVisible();
    await page.getByLabel(/^New password/).fill("Brand#NewPass2");
    await page.getByLabel("Confirm new password").fill("Brand#NewPass2");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();

    // the code is single-use: reusing it shows the invalid-link state
    await page.goto(`/forgot-password?mode=resetPassword&oobCode=${oob}`, { waitUntil: "networkidle" });
    await expect(page.getByText("This link can't be used")).toBeVisible();
    await page.goto("/forgot-password?mode=resetPassword&oobCode=garbage", { waitUntil: "networkidle" });
    await expect(page.getByText("This link can't be used")).toBeVisible();

    // the new password works, the old one does not
    await page.goto("/login", { waitUntil: "networkidle" });
    await panel(page).getByLabel("Email address").fill(email);
    await panel(page).getByLabel("Password").first().fill("Original#Pass1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").first()).toContainText(/do not match/i);
    await panel(page).getByLabel("Password").first().fill("Brand#NewPass2");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/account/, { timeout: 30000 });
  });

  test("guest orders can be deliberately linked only when a VERIFIED identifier matches", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await panel(page).getByLabel("Email address").fill("customer2@rajraani.test");
    await panel(page).getByLabel("Password").first().fill("Demo#Passw0rd");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/account/);
    const bad = await page.request.post("/api/account/link-order", { data: { orderNumber: "RRC-1001" }, headers: { Origin: "http://localhost:3000" } });
    expect(bad.status()).toBe(404); // RRC-1001 belongs to a different guest (phone/email do not match this account)
  });
});
