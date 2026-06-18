// SiteTrack Pro legacy demo-role E2E.
//
// v3 production routes require a real Supabase session. The local role picker
// still lives behind the legacy shell and is useful for demo regression checks,
// so these tests opt into it explicitly.

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

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
});

test("Super Admin lands on Admin Console and sees Operations nav", async ({ page }) => {
  await loginAs(page, "Super Admin");
  await page.getByRole("button", { name: /^Admin Console$/i }).click();
  await expect(page.getByRole("heading", { name: /Admin Console/i })).toBeVisible({ timeout: 10000 });
  for (const label of ["Admin Console", "Organizations", "Users", "Billing & MRR", "System Settings"]) {
    await expect(page.getByText(label).first()).toBeVisible();
  }
});

test("Architect can access all projects in their org", async ({ page }) => {
  await loginAs(page, "Architect");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/i })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Skyline Tower Phase II").first()).toBeVisible();
});

test("PM can open a project and see Daily Report button", async ({ page }) => {
  await loginAs(page, "Project Manager");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/i })).toBeVisible({ timeout: 10000 });
  await page.getByText("Skyline Tower Phase II").first().click();
  await expect(page.getByRole("heading", { name: "Skyline Tower Phase II" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Daily Report/i })).toBeVisible();
});

test("Contractor cannot see Invoices tab in a project", async ({ page }) => {
  await loginAs(page, "Contractor");
  await page.getByText("Skyline Tower Phase II").first().click();
  await expect(page.getByRole("heading", { name: "Skyline Tower Phase II" })).toBeVisible();
  const tabsContainer = page.locator("div.flex.gap-1").first();
  await expect(tabsContainer).not.toContainText("Invoices");
});

test("Client lands on Client Portal and sees only their own project", async ({ page }) => {
  await loginAs(page, "Client");
  await expect(page.getByText(/Client Portal/i).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Skyline Tower Phase II").first()).toBeVisible();
  await expect(page.getByText("Heritage Mall Renovation")).not.toBeVisible();
});

test("type gate hides construction-only tabs for an Interior project", async ({ page }) => {
  await loginAs(page, "Architect");
  await page.getByRole("button", { name: /Projects/i }).first().click();
  await page.getByText("Heritage Mall Renovation").first().click();
  await expect(page.getByRole("heading", { name: "Heritage Mall Renovation" })).toBeVisible({ timeout: 10000 });
  const tabsContainer = page.locator("div.flex.gap-1").first();
  await expect(tabsContainer).not.toContainText("BOQ");
  await expect(tabsContainer).not.toContainText("RA Bills");
  await expect(tabsContainer).not.toContainText("Labour");
});
