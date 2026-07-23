import { test, expect } from "@playwright/test";

async function openLegacyLogin(page) {
  await page.goto("/?shell=legacy");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/Local mode/i).first()).toBeVisible();
}

async function loginAs(page, roleLabel) {
  await openLegacyLogin(page);
  const loadDemo = page.getByRole("button", { name: /Load demo data|Reload demo/i }).first();
  if (await loadDemo.count()) {
    await loadDemo.click();
    await expect(page.getByText(/Demo loaded/i).first()).toBeVisible();
  }
  await page.getByRole("button", { name: new RegExp(roleLabel, "i") }).first().click();
  await page.getByRole("button", { name: /Continue in developer mode/i }).click();
  await page.waitForLoadState("networkidle");
}

test.describe("DPR compose", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await loginAs(page, "Site Engineer");
    await page.goto("/dpr");
    await page.waitForLoadState("domcontentloaded");
  });

  test("renders DPR composer with heading and nav link", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Daily Progress Report/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /View history/i })).toBeVisible();
  });

  test("language selector is visible", async ({ page }) => {
    await expect(page.locator("#dpr-lang")).toBeVisible();
  });

  test("voice record button exists", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Record voice note/i })).toBeVisible();
  });

  test("photo upload area exists", async ({ page }) => {
    await expect(page.locator("input[type='file']")).toBeVisible();
  });

  test("WhatsApp digest preview section exists", async ({ page }) => {
    await expect(page.getByText(/send to the promoter/i)).toBeVisible();
  });
});
