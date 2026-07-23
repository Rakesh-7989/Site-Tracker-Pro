import { test, expect } from "@playwright/test";

test.describe("Responsive layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await page.locator("#email").fill("test-orgadmin@sitetrack.test");
    await page.locator("#pw").fill("SiteTrack-Test-Orgadmin-2026!");
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  });

  test("mobile shows bottom nav, hides sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    const bottomNav = page.locator("nav.fixed.bottom-0,div.fixed.bottom-0,nav[class*='bottom']").first();
    await expect(bottomNav).toBeVisible();
    const sidebar = page.locator("aside,nav[class*='sidebar'],div[class*='sidebar']").first();
    await expect(sidebar).toBeHidden();
  });

  test("desktop shows sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    const sidebar = page.locator("aside,nav[class*='sidebar'],div[class*='sidebar']").first();
    await expect(sidebar).toBeVisible();
  });
});
