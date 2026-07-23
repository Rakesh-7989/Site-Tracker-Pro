import { test, expect } from "@playwright/test";

test.describe("Offline behavior", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await page.locator("#email").fill("test-orgadmin@sitetrack.test");
    await page.locator("#pw").fill("SiteTrack-Test-Orgadmin-2026!");
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  });

  test("offline banner appears when network drops", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);
    await expect(page.getByText(/offline|Offline|You are offline|No internet/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("banner disappears when back online", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);
    await expect(page.getByText(/offline|Offline/i).first()).toBeVisible({ timeout: 10000 });
    await page.context().setOffline(false);
    await page.waitForTimeout(1000);
    await expect(page.getByText(/offline|Offline/i)).toHaveCount(0);
  });
});
