import { test, expect } from "@playwright/test";

test.describe("Password login", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
  });

  test("valid credentials redirect to dashboard", async ({ page }) => {
    await page.locator("#email").fill("test-orgadmin@sitetrack.test");
    await page.locator("#pw").fill("SiteTrack-Test-Orgadmin-2026!");
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.locator("nav,header,.sidebar,.topbar").first()).toBeVisible();
  });

  test("invalid password shows error", async ({ page }) => {
    await page.locator("#email").fill("test-orgadmin@sitetrack.test");
    await page.locator("#pw").fill("wrong-password");
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await expect(page.getByText(/invalid|incorrect|wrong|error|failed/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("empty fields show validation errors", async ({ page }) => {
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await expect(page.getByText("Password is required.")).toBeVisible();
  });

  test("invalid email format shows error", async ({ page }) => {
    await page.locator("#email").fill("not-an-email");
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await expect(page.getByText("Enter a valid email.")).toBeVisible();
  });
});
