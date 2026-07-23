import { test, expect } from "@playwright/test";

test.describe("Billing & plans", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await page.locator("#email").fill("test-orgadmin@sitetrack.test");
    await page.locator("#pw").fill("SiteTrack-Test-Orgadmin-2026!");
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  });

  test("billing view renders", async ({ page }) => {
    await page.goto("/org/billing");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Billing|billing|Subscription|Plan/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("plan details are displayed", async ({ page }) => {
    await page.goto("/org/billing");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Plan|plan|Current Plan|Starter|Pro|Enterprise|Free/i).first()).toBeVisible({ timeout: 10000 });
  });
});
