// SiteTrack Pro v3 auth panel E2E.
//
// These checks stay client-side only: they validate rendering, input state, and
// local validation without sending real auth emails or creating accounts.

import { test, expect } from "@playwright/test";

test.describe("Login screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
  });

  test("renders password sign-in by default", async ({ page }) => {
    await expect(page.getByText("SiteTrack Pro").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Every site, every drawing/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Password", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Magic link", exact: true })).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#pw")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Sign in$/i })).toBeVisible();
    await expect(page.getByText("Access lane")).toHaveCount(0);
    await expect(page.getByText("Workspace access")).toBeVisible();
  });

  test("invalid email and missing password surface friendly errors", async ({ page }) => {
    await page.locator("#email").fill("not-an-email");
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await expect(page.getByText("Enter a valid email.")).toBeVisible();

    await page.locator("#email").fill("real@firm.in");
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await expect(page.getByText("Password is required.")).toBeVisible();
  });

  test("password visibility toggle works", async ({ page }) => {
    await page.locator("#pw").fill("mySecret123");
    await expect(page.locator("#pw")).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(page.locator("#pw")).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(page.locator("#pw")).toHaveAttribute("type", "password");
  });

  test("magic-link mode hides password and keeps client-side validation", async ({ page }) => {
    await page.getByRole("button", { name: /Magic link/i }).click();
    await expect(page.locator("#pw")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Send magic link/i })).toBeVisible();
    await page.locator("#email").fill("bad");
    await page.getByRole("button", { name: /Send magic link/i }).click();
    await expect(page.getByText("Enter a valid email.")).toBeVisible();
  });

  test("forgot password asks for an email first", async ({ page }) => {
    await page.getByRole("button", { name: /Forgot password/i }).click();
    await expect(page.getByText("Enter your email above first, then tap Forgot password.")).toBeVisible();
  });
});

test.describe("Staff login screen", () => {
  test("renders a separate staff-only sign-in page", async ({ page }) => {
    await page.goto("/staff/login");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("SiteTrack staff console sign-in")).toBeVisible();
    await expect(page.getByText("Staff console")).toBeVisible();
    await expect(page.getByRole("button", { name: "Password", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Magic link", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Use org login" })).toHaveAttribute("href", "/login");
  });
});

test.describe("Login responsive layout", () => {
  test("mobile hides the large brand panel", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("SiteTrack Pro").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Every site, every drawing/i })).toBeHidden();
  });

  test("desktop shows the large brand panel", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /Every site, every drawing/i })).toBeVisible();
  });
});
