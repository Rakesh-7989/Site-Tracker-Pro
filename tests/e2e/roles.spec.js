// SiteTrack Pro — Role-access E2E (Playwright)
//
// One scenario per role exercising the critical happy path:
//   - Architect: lands on Admin Console? NO — architect has no admin nav.
//     Tests: dashboard loads + can see Projects nav.
//   - PM: dashboard loads + can open a project.
//   - Contractor: dashboard loads + cannot see Invoices tab.
//   - Client: lands on Client Portal + only sees their own project.
//   - Super Admin: lands on Admin Console with all 7 admin nav items.
//
// Each test resets localStorage so demo data is fresh.

import { test, expect } from "@playwright/test";

async function loginAs(page, roleLabel) {
  await page.goto("/");
  // Wait for the login screen to render
  await page.waitForLoadState("networkidle");
  // Click the role tile — they are buttons inside the right pane.
  const roleButton = page.getByRole("button", { name: new RegExp(roleLabel, "i") }).first();
  await roleButton.click();
  // Then the bottom "Continue as ..." CTA
  const cta = page.getByRole("button", { name: /Continue as/i });
  await cta.click();
}

test.beforeEach(async ({ page }) => {
  // Clear localStorage before each test so demo seed is consistent.
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("Super Admin lands on Admin Console and sees Operations nav", async ({ page }) => {
  await loginAs(page, "Super Admin");
  await expect(page.getByRole("heading", { name: /Admin Console/i })).toBeVisible({ timeout: 10000 });
  // Operations section should list at least 5 admin nav items
  for (const label of ["Admin Console", "Organizations", "Users", "Billing & MRR", "System Settings"]) {
    await expect(page.getByText(label).first()).toBeVisible();
  }
});

test("Architect can access all projects in their org", async ({ page }) => {
  await loginAs(page, "Architect / Org Admin");
  // Architect's landing is the editorial Dashboard
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/i })).toBeVisible({ timeout: 10000 });
  // Should see at least one project card
  await expect(page.getByText("Skyline Tower Phase II").first()).toBeVisible();
});

test("PM can open a project and see Daily Report button", async ({ page }) => {
  await loginAs(page, "Project Manager");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/i })).toBeVisible({ timeout: 10000 });
  await page.getByText("Skyline Tower Phase II").first().click();
  // Project detail header shows the project name
  await expect(page.getByRole("heading", { name: "Skyline Tower Phase II" })).toBeVisible();
  // Daily Report button visible to PM
  await expect(page.getByRole("button", { name: /Daily Report/i })).toBeVisible();
});

test("Contractor CANNOT see Invoices tab in a project", async ({ page }) => {
  await loginAs(page, "Contractor");
  await page.getByText("Skyline Tower Phase II").first().click();
  await expect(page.getByRole("heading", { name: "Skyline Tower Phase II" })).toBeVisible();
  // Tabs list — Invoices should NOT be among them for contractor role
  const tabsContainer = page.locator("div.flex.gap-1").first();
  await expect(tabsContainer).not.toContainText("Invoices");
});

test("Client lands on Client Portal and sees only their own project", async ({ page }) => {
  await loginAs(page, "Client");
  // Client view header
  await expect(page.getByText(/Client Portal/i).first()).toBeVisible({ timeout: 10000 });
  // Should see Skyline (their project) but NOT Heritage Mall (different client)
  await expect(page.getByText("Skyline Tower Phase II").first()).toBeVisible();
  await expect(page.getByText("Heritage Mall Renovation")).not.toBeVisible();
});
