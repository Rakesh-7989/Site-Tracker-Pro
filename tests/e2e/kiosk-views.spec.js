import { test, expect } from "@playwright/test";

test.describe("Kiosk views", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await page.locator("#email").fill("test-orgadmin@sitetrack.test");
    await page.locator("#pw").fill("SiteTrack-Test-Orgadmin-2026!");
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  });

  test("daily snapshot kiosk renders", async ({ page }) => {
    await page.goto("/kiosk/snapshot");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Daily Snapshot|Snapshot Kiosk|daily snapshot/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("labour kiosk renders (PlanGate may show upsell)", async ({ page }) => {
    await page.goto("/kiosk/labour");
    await page.waitForLoadState("networkidle");
    const labourContent = page.getByText(/Labour Kiosk|labour kiosk|PlanGate|Upgrade/i).first();
    await expect(labourContent).toBeVisible({ timeout: 10000 });
  });

  test("site wall kiosk renders", async ({ page }) => {
    await page.goto("/kiosk/site");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Site Wall|site wall|Site Kiosk|site kiosk/i).first()).toBeVisible({ timeout: 10000 });
  });
});
