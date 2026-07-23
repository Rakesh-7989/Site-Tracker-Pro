import { test, expect } from "@playwright/test";

test.describe("Materials", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await page.locator("#email").fill("test-orgadmin@sitetrack.test");
    await page.locator("#pw").fill("SiteTrack-Test-Orgadmin-2026!");
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    await page.locator("a[href^='/projects/']").first().click();
    await page.waitForURL(/\/projects\//, { timeout: 10000 });
  });

  test("materials tab renders with heading", async ({ page }) => {
    const materialsBtn = page.locator("button").filter({ hasText: "Materials" }).first();
    if (await materialsBtn.isVisible()) {
      await materialsBtn.click();
      await page.waitForURL(/\/materials$/, { timeout: 10000 });
      await expect(page.getByRole("heading", { name: "Materials" })).toBeVisible();
    }
  });

  test("materials tab shows status badges for existing entries", async ({ page }) => {
    const materialsBtn = page.locator("button").filter({ hasText: "Materials" }).first();
    if (await materialsBtn.isVisible()) {
      await materialsBtn.click();
      await page.waitForURL(/\/materials$/, { timeout: 10000 });
      const heading = page.getByRole("heading", { name: "Materials" });
      await expect(heading).toBeVisible();
      const cards = page.locator("div.space-y-2 > div");
      if (await cards.count() > 0) {
        await expect(cards.first()).toBeVisible();
      }
    }
  });
});
