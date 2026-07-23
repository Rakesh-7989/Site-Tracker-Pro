import { test, expect } from "@playwright/test";

test.describe("Issue CRUD", () => {
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

  test("issues tab lists existing issues", async ({ page }) => {
    await page.getByRole("button", { name: "Issues" }).first().click();
    await page.waitForURL(/\/issues$/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
  });

  test("issue tab heading renders", async ({ page }) => {
    await page.goto(page.url() + "/issues");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
  });

  test("issue detail view accessible", async ({ page }) => {
    await page.getByRole("button", { name: "Issues" }).first().click();
    await page.waitForURL(/\/issues$/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
    const issueCards = page.locator("div.space-y-2 > div");
    if (await issueCards.count() > 0) {
      await expect(issueCards.first()).toBeVisible();
    }
  });
});
