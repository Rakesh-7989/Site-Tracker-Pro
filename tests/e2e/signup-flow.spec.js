// SiteTrack Pro public signup E2E.
//
// The current signup path creates a reviewed access request, not a direct
// Supabase Auth user. These checks avoid network submission side effects.

import { test, expect } from "@playwright/test";

test.describe("Signup request page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/signup");
    await page.waitForLoadState("domcontentloaded");
  });

  test("shows the current three public plan tiers", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Basic/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Popular Pro/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Business/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Request access on the Pro plan/i })).toBeDisabled();
  });

  test("plan picker updates the request CTA", async ({ page }) => {
    await page.getByRole("button", { name: /Business/i }).click();
    await expect(page.getByRole("button", { name: /Request access on the Business plan/i })).toBeDisabled();
  });

  test("billing toggle changes displayed cadence", async ({ page }) => {
    await expect(page.getByText(/year/i).first()).toBeVisible();
    await page.getByRole("button", { name: /^Monthly$/i }).click();
    await expect(page.getByText(/mo/i).first()).toBeVisible();
  });

  test("client-side validation catches missing firm/contact fields", async ({ page }) => {
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: /Request access on the Pro plan/i }).click();
    await expect(page.getByText("Please enter your firm name and your name.")).toBeVisible();
  });

  test("client-side validation catches invalid email", async ({ page }) => {
    await page.getByPlaceholder("e.g. Sri Sai Constructions").fill("E2E Builders");
    await page.getByPlaceholder("e.g. Rakesh B.").fill("E2E Tester");
    await page.getByPlaceholder("you@firm.com").fill("bad-email");
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: /Request access on the Pro plan/i }).click();
    await expect(page.getByText("Please enter a valid work email.")).toBeVisible();
  });

  test("links to sign-in and legal pages are present", async ({ page }) => {
    await expect(page.getByRole("banner").getByRole("link", { name: /^Sign in$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms of Service" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy Policy" })).toBeVisible();
  });
});
