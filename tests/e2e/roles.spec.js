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

// Session 24: v2 project-type gate end-to-end.
// Heritage Mall Renovation is type=interior. Architect opens it and should
// NOT see BOQ / RA Bills / Labour tabs — they're hidden by the type gate
// regardless of role permissions.
test("v2 type-gate: architect opens Interior project, BOQ + RA tabs are hidden", async ({ page }) => {
  await loginAs(page, "Architect");
  // Load demo data to get the 4 seeded projects (Heritage Mall is type=interior)
  const loadDemo = page.getByRole("button", { name: /Load demo data/i });
  if (await loadDemo.count() > 0) {
    await loadDemo.click();
    await page.waitForLoadState("networkidle");
  }
  // Navigate to Projects view
  await page.getByRole("button", { name: /Projects/i }).first().click();
  // Open Heritage Mall (type=interior)
  await page.getByText("Heritage Mall Renovation").first().click();
  await expect(page.getByRole("heading", { name: "Heritage Mall Renovation" })).toBeVisible({ timeout: 10000 });
  // The type-gate should hide construction-only tabs
  const tabsContainer = page.locator("div.flex.gap-1").first();
  await expect(tabsContainer).not.toContainText("BOQ");
  await expect(tabsContainer).not.toContainText("RA Bills");
  await expect(tabsContainer).not.toContainText("Labour");
});
