import { test, expect } from "@playwright/test";

test.describe("Magic link & OTP", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
  });

  test("toggle to magic link hides password and shows send button", async ({ page }) => {
    await page.getByRole("button", { name: "Magic link", exact: true }).click();
    await expect(page.locator("#pw")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Send magic link/i })).toBeVisible();
  });

  test("invalid email in magic link mode shows validation error", async ({ page }) => {
    await page.getByRole("button", { name: "Magic link", exact: true }).click();
    await page.locator("#email").fill("bad");
    await page.getByRole("button", { name: /Send magic link/i }).click();
    await expect(page.getByText("Enter a valid email.")).toBeVisible();
  });

  test("valid email shows success message and OTP fallback", async ({ page }) => {
    await page.getByRole("button", { name: "Magic link", exact: true }).click();
    await page.locator("#email").fill("test@sitetrack.test");
    await page.getByRole("button", { name: /Send magic link/i }).click();
    await expect(page.getByText(/Sign-in link sent to/i)).toBeVisible();
    await expect(page.locator("#otp")).toBeVisible();
    await expect(page.getByRole("button", { name: /Verify/i })).toBeVisible();
  });

  test("OTP input accepts 6-digit code", async ({ page }) => {
    await page.getByRole("button", { name: "Magic link", exact: true }).click();
    await page.locator("#email").fill("test@sitetrack.test");
    await page.getByRole("button", { name: /Send magic link/i }).click();
    await expect(page.locator("#otp")).toBeVisible();
    await page.locator("#otp").fill("123456");
    await expect(page.locator("#otp")).toHaveValue("123456");
  });
});
