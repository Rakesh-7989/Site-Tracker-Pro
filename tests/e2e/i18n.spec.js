import { test, expect } from "@playwright/test";

test.describe("Internationalization", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
  });

  test("language switcher is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Language|language|EN|TE|HI/i }).first()).toBeVisible();
  });

  test("switch to Telugu changes UI text", async ({ page }) => {
    await page.getByRole("button", { name: /Language|language/i }).first().click();
    await page.getByRole("button", { name: /Telugu|TE/i }).first().click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/సైన్ ఇన్|ప్రవేశించండి|ఇమెయిల్/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("switch to Hindi changes UI text", async ({ page }) => {
    await page.getByRole("button", { name: /Language|language/i }).first().click();
    await page.getByRole("button", { name: /Hindi|HI/i }).first().click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/साइन इन|प्रवेश करें|ईमेल/i).first()).toBeVisible({ timeout: 10000 });
  });
});
