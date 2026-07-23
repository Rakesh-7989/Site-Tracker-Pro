import { test, expect } from "@playwright/test";

test.describe("Admin panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await page.locator("#email").fill("test-orgadmin@sitetrack.test");
    await page.locator("#pw").fill("SiteTrack-Test-Orgadmin-2026!");
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  });

  test("admin dashboard renders", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Admin Console|Admin Dashboard|admin/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("user management renders", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Users|User Management|Members/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("org management renders", async ({ page }) => {
    await page.goto("/admin/orgs");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Organizations|Orgs|Organization/i).first()).toBeVisible({ timeout: 10000 });
  });
});
