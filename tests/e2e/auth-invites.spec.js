import { test, expect } from "@playwright/test";

test.describe("Invite flows", () => {
  test("staff join page without token shows invalid link", async ({ page }) => {
    await page.goto("/staff/join");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Invalid invite link")).toBeVisible();
    await expect(page.getByText("This page needs a valid staff-invite link.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Back to staff sign in/i })).toBeVisible();
  });

  test("staff join page with valid token renders the form", async ({ page }) => {
    await page.goto("/staff/join?token=test-token-123");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Join the staff team")).toBeVisible();
    await expect(page.locator("#nm")).toBeVisible();
    await expect(page.locator("#em")).toBeVisible();
    await expect(page.locator("#pw")).toBeVisible();
    await expect(page.locator("#cf")).toBeVisible();
    await expect(page.getByRole("button", { name: /Join & continue/i })).toBeVisible();
  });

  test("accept invite page without email shows generic message", async ({ page }) => {
    await page.goto("/accept-invite");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Check your email")).toBeVisible();
    await expect(page.getByText("Your org admin has invited you")).toBeVisible();
    await expect(page.getByRole("link", { name: /Go to sign in/i })).toBeVisible();
  });

  test("accept invite page with email renders invitation", async ({ page }) => {
    await page.goto("/accept-invite?email=test@firm.com");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("You're invited!")).toBeVisible();
    await expect(page.getByText("test@firm.com")).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign in to SiteTrack Pro/i })).toBeVisible();
  });

  test("login screen has link to register page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("link", { name: /Create one/i })).toHaveAttribute("href", "/register");
  });

  test("staff login links back to org login", async ({ page }) => {
    await page.goto("/staff/login");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("link", { name: /Use org login/i })).toHaveAttribute("href", "/login");
  });
});
