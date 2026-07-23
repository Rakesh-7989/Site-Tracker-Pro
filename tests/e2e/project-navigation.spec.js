import { test, expect } from "@playwright/test";

test.describe("Project navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await page.locator("#email").fill("test-orgadmin@sitetrack.test");
    await page.locator("#pw").fill("SiteTrack-Test-Orgadmin-2026!");
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  });

  test("project list renders with cards", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    const cards = page.locator("a[href^='/projects/']");
    await expect(cards.first()).toBeVisible();
  });

  test("clicking a project navigates to detail page", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    const firstCard = page.locator("a[href^='/projects/']").first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await page.waitForURL(/\/projects\/(p\d+|[\w-]+)$/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: /Skyline|Green Valley|Metro|Heritage/i }).first()).toBeVisible();
  });

  test("tab bar renders core tabs on detail page", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    await page.locator("a[href^='/projects/']").first().click();
    await page.waitForURL(/\/projects\//, { timeout: 10000 });
    const tabBar = page.locator("div.flex.gap-1.min-w-max");
    await expect(tabBar).toBeVisible();
    for (const label of ["Overview", "Team", "Tasks", "Updates", "Drawings"]) {
      await expect(tabBar.getByText(label).first()).toBeVisible();
    }
  });
});
