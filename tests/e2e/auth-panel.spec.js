// SiteTrack Pro — Auth panel E2E (Session 30)
//
// Verifies the production sign-in / sign-up panel works the way the user
// expects: tab switching, real-time validation, password strength meter,
// eye toggle, friendly error mapping, OTP fallback, responsive layout.
//
// These tests DO NOT actually submit credentials to Supabase — they only
// exercise client-side UI state and the friendly() error mapping. The
// real auth path is covered by manual QA against the production URL.
//
// They run against whatever VITE_BACKEND is set to. When backend is
// enabled (the default for the dev server reading .env.local), the
// cloud-auth panel is tested. When backend is disabled, the local-mode
// developer fallback is tested.

import { test, expect } from "@playwright/test";

const BACKEND_ENABLED_HINT_SEL = 'button[role="tab"]';   // Sign in / Start a firm tabs only render in cloud mode

async function backendEnabled(page) {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  return (await page.locator(BACKEND_ENABLED_HINT_SEL).count()) > 0;
}

test.describe("Auth panel — cloud mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    test.skip(
      (await page.locator(BACKEND_ENABLED_HINT_SEL).count()) === 0,
      "Backend not configured — cloud panel tests skipped",
    );
  });

  test("sign-in panel renders by default with magic-link tab active", async ({ page }) => {
    await expect(page.locator("h2")).toHaveText("Welcome back.");
    await expect(page.locator('button[role="tab"][aria-selected="true"]')).toHaveText("Sign in");
    await expect(page.getByRole("button", { name: "Magic link" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send sign-in link" })).toBeVisible();
    // Demo role tiles must NOT appear in cloud mode (Session 30)
    await expect(page.getByRole("button", { name: /^Continue as Architect$/ })).toHaveCount(0);
    await expect(page.locator("text=Or try a demo role below")).toHaveCount(0);
  });

  test("invalid email shows inline error pill after blur", async ({ page }) => {
    await page.locator("#loginEmail").fill("not-an-email");
    await page.locator("#loginEmail").blur();
    await expect(page.getByText("Enter a valid email like name@firm.in")).toBeVisible();
  });

  test("valid email clears the error pill", async ({ page }) => {
    await page.locator("#loginEmail").fill("bad");
    await page.locator("#loginEmail").blur();
    await expect(page.getByText("Enter a valid email like name@firm.in")).toBeVisible();
    await page.locator("#loginEmail").fill("real@firm.in");
    await page.locator("#loginEmail").blur();
    await expect(page.getByText("Enter a valid email like name@firm.in")).toHaveCount(0);
  });

  test("password tab reveals password input with eye toggle", async ({ page }) => {
    await page.getByRole("button", { name: "Password" }).click();
    await expect(page.locator("#loginPassword")).toBeVisible();
    await expect(page.locator("#loginPassword")).toHaveAttribute("type", "password");
    await expect(page.getByRole("button", { name: "Forgot password?" })).toBeVisible();

    await page.locator("#loginPassword").fill("mySecret123");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(page.locator("#loginPassword")).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(page.locator("#loginPassword")).toHaveAttribute("type", "password");
  });

  test("forgot password with empty email shows friendly error", async ({ page }) => {
    await page.getByRole("button", { name: "Password" }).click();
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByText("Enter the email on your account first.")).toBeVisible();
  });

  test("sign-up tab swaps the panel to firm-creation form", async ({ page }) => {
    await page.getByRole("tab", { name: "Start a firm" }).click();
    await expect(page.locator("h2")).toHaveText("Start your firm.");
    await expect(page.locator("#firmName")).toBeVisible();
    await expect(page.locator("#signupEmail")).toBeVisible();
    await expect(page.locator("#signupPassword")).toBeVisible();
    await expect(page.getByRole("button", { name: /Create account/ })).toBeVisible();
    // Three public plans visible
    const plans = page.locator('button[aria-pressed]');
    await expect(plans).toHaveCount(3);
  });

  test("signup short password triggers Min 8 chars pill", async ({ page }) => {
    await page.getByRole("tab", { name: "Start a firm" }).click();
    await page.locator("#signupPassword").fill("abc");
    await page.locator("#signupPassword").blur();
    await expect(page.getByText("Min 8 characters required.")).toBeVisible();
  });

  test("signup password strength meter goes Weak → Strong", async ({ page }) => {
    await page.getByRole("tab", { name: "Start a firm" }).click();

    await page.locator("#signupPassword").fill("abcdefgh");
    await expect(page.getByText(/^Weak$/)).toBeVisible();

    await page.locator("#signupPassword").fill("AbcdEfgh1234!");
    await expect(page.getByText(/^Strong$/)).toBeVisible();
  });

  test("signup plan picker — selecting Business sets aria-pressed", async ({ page }) => {
    await page.getByRole("tab", { name: "Start a firm" }).click();
    const businessPlan = page.locator('button[aria-pressed]', { hasText: "Business" });
    await businessPlan.click();
    await expect(businessPlan).toHaveAttribute("aria-pressed", "true");
    const freeTrial = page.locator('button[aria-pressed]', { hasText: "Free trial" });
    await expect(freeTrial).toHaveAttribute("aria-pressed", "false");
  });

  test("mode tabs preserve email value across switches", async ({ page }) => {
    await page.locator("#loginEmail").fill("keep@firm.in");
    await page.getByRole("tab", { name: "Start a firm" }).click();
    await expect(page.locator("#signupEmail")).toHaveValue("keep@firm.in");
    await page.getByRole("tab", { name: "Sign in" }).click();
    await expect(page.locator("#loginEmail")).toHaveValue("keep@firm.in");
  });
});

test.describe("Auth panel — local-mode developer fallback", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    test.skip(
      (await page.locator(BACKEND_ENABLED_HINT_SEL).count()) > 0,
      "Backend enabled — local-mode tests skipped",
    );
  });

  test("local-mode fallback shows developer role picker, NO cloud auth tabs", async ({ page }) => {
    await expect(page.getByText("Cloud sign-in unavailable")).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue in developer mode/ })).toBeVisible();
    // Cloud-mode tabs must not exist
    await expect(page.locator('button[role="tab"]')).toHaveCount(0);
  });

  test("local-mode role picker — selecting Architect highlights tile", async ({ page }) => {
    const architectTile = page.getByRole("button", { name: /Architect/ }).first();
    await architectTile.click();
    await expect(architectTile).toHaveClass(/border-safety-500/);
  });
});

test.describe("Auth panel — responsive", () => {
  test("mobile (375px) hides the brand panel and shows mobile brand", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    // Mobile brand visible
    await expect(page.locator(".md\\:hidden .font-display").first()).toBeVisible();
    // Left brand panel hidden (md:hidden vs md:flex)
    const leftBrand = page.locator(".hidden.md\\:flex.md\\:w-2\\/5");
    await expect(leftBrand).toBeHidden();
  });

  test("tablet (768px) shows the brand panel + form side-by-side", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const leftBrand = page.locator(".hidden.md\\:flex.md\\:w-2\\/5");
    await expect(leftBrand).toBeVisible();
    await expect(leftBrand.locator("h1")).toContainText("Every site");
  });
});
