import { test, expect } from "@playwright/test";

test.describe("Session & org switcher", () => {
  test("sign in then sign out redirects to login", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await page.locator("#email").fill("test-orgadmin@sitetrack.test");
    await page.locator("#pw").fill("SiteTrack-Test-Orgadmin-2026!");
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.locator("nav,header,.sidebar,.topbar").first()).toBeVisible();

    await page.getByRole("button", { name: /Sign out/i }).click();
    await page.waitForURL(/\/login/, { timeout: 15000 });
    await expect(page.locator("#email")).toBeVisible();
  });

  test("session persists across page reloads", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await page.locator("#email").fill("test-orgadmin@sitetrack.test");
    await page.locator("#pw").fill("SiteTrack-Test-Orgadmin-2026!");
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("nav,header,.sidebar,.topbar").first()).toBeVisible();
  });

  test("staff login page renders correctly", async ({ page }) => {
    await page.goto("/staff/login");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("SiteTrack staff console sign-in")).toBeVisible();
    await expect(page.getByRole("button", { name: "Password", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Magic link", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Use org login" })).toHaveAttribute("href", "/login");
  });
});
