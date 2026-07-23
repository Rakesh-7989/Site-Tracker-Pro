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

test.describe("DPR history", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await loginAs(page, "Site Engineer");
    await page.goto("/dpr/history");
    await page.waitForLoadState("domcontentloaded");
  });

  test("history view renders with heading and stats", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /DPR History/i })).toBeVisible();
    await expect(page.getByText(/total/i)).toBeVisible();
    await expect(page.getByText(/sent|delivered|failed/i).first()).toBeVisible();
  });

  test("status badges show status labels", async ({ page }) => {
    for (const label of ["queued", "sending", "sent", "delivered", "read", "failed"]) {
      const badge = page.locator(`[data-dpr-status='${label}']`);
      const count = await badge.count();
      if (count > 0) {
        await expect(badge.first()).toBeVisible();
      }
    }
  });

  test("DPR list renders entries or empty state", async ({ page }) => {
    const hasEntries = await page.locator("[data-dpr-status]").count();
    if (hasEntries > 0) {
      await expect(page.getByText(/total/i)).toBeVisible();
    } else {
      await expect(page.getByText(/No DPRs yet/i)).toBeVisible();
    }
  });
});
