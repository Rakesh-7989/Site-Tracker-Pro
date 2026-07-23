import { test, expect } from "@playwright/test";

test.describe("Password reset", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
  });

  test("forgot password without email prompts user to enter email first", async ({ page }) => {
    await page.getByRole("button", { name: /Forgot password/i }).click();
    await expect(page.getByText("Enter your email above first, then tap Forgot password.")).toBeVisible();
  });

  test("forgot password with valid email shows reset confirmation", async ({ page }) => {
    await page.locator("#email").fill("test@sitetrack.test");
    await page.getByRole("button", { name: /Forgot password/i }).click();
    await expect(page.getByText(/Password reset link sent to test@sitetrack\.test/i)).toBeVisible();
  });

  test("navigate to reset page renders password reset form", async ({ page }) => {
    await page.goto("/auth/reset");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Set a new password")).toBeVisible();
    await expect(page.getByText("Verifying your reset link…")).toBeVisible();
  });
});
