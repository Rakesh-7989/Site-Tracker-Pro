import { test, expect } from "@playwright/test";

test.describe("Project tab rendering", () => {
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

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "team", label: "Team" },
    { id: "tasks", label: "Tasks" },
    { id: "updates", label: "Updates" },
    { id: "milestones", label: "Milestones" },
    { id: "issues", label: "Issues" },
    { id: "drawings", label: "Drawings" },
  ];

  for (const tab of TABS) {
    test(`${tab.label} tab renders without errors`, async ({ page }) => {
      const tabButton = page.getByRole("button", { name: tab.label, exact: false }).first();
      await expect(tabButton).toBeVisible();
      await tabButton.click();
      await page.waitForURL(new RegExp(`/projects/[^/]+/${tab.id}$`), { timeout: 10000 });
      await expect(page).not.toHaveText(/Something went wrong|Error loading/i);
    });
  }
});
