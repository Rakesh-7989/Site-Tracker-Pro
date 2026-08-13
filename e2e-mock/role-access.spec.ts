import { test, expect, Page } from "@playwright/test";
import { mockSessionFor, openMockedApp, type MockIdentityRole } from "./mockSupabase";

// Role-access e2e that renders the REAL v3 router + shell with a mocked
// Supabase session — zero credentials, zero live DB, CI-runnable. Each test
// seeds a fake session for one identity role, intercepts the REST queries the
// auth layer makes, and asserts (a) real rendering of the authenticated shell
// + role-gated nav, and (b) <AccessDenied> on a forbidden route.

function navLink(page: Page, name: string) {
  return page.locator("nav").getByRole("link", { name, exact: true });
}

async function openAs(page: Page, role: keyof ReturnType<typeof mockSessionFor>, path = "/") {
  const session = mockSessionFor(role);
  await openMockedApp(page, session, path);
  // Let the seeded session hydrate + the first render settle.
  await page.waitForTimeout(5000);
  return session;
}

test.describe("Role-access · mocked Supabase session", () => {

  test("orgadmin — sees workspace + org nav, blocked from Platform/Staff", async ({ page }) => {
    await openAs(page, "orgadmin");
    await expect(navLink(page, "Dashboard")).toBeVisible({ timeout: 10000 });
    await expect(navLink(page, "Projects")).toBeVisible();
    await expect(navLink(page, "Org Home")).toBeVisible();
    await expect(navLink(page, "Pipeline")).toBeVisible();   // orgadmin holds crm:view

    // Not in the orgadmin capability set:
    await expect(navLink(page, "Platform")).not.toBeVisible();
    await expect(navLink(page, "Staff")).not.toBeVisible();
    await expect(navLink(page, "Client Portal")).not.toBeVisible();
  });

  test("pm — sees PM-scoped nav (including Client Portal in this mock env)", async ({ page }) => {
    await openAs(page, "pm");
    await expect(navLink(page, "Dashboard")).toBeVisible({ timeout: 10000 });
    await expect(navLink(page, "Projects")).toBeVisible();
    await expect(navLink(page, "New Project")).toBeVisible();
    await expect(navLink(page, "Client Portal")).toBeVisible();

    await expect(navLink(page, "Platform")).not.toBeVisible();
    await expect(navLink(page, "Org Home")).not.toBeVisible();
  });

  test("pm — blocked from /admin renders AccessDenied", async ({ page }) => {
    await openAs(page, "pm", "/admin");
    await expect(page.getByRole("heading", { name: "Access Restricted" })).toBeVisible({ timeout: 10000 });
  });

  test("client — sees Client Portal, not New Project or Pipeline", async ({ page }) => {
    await openAs(page, "client");
    await expect(navLink(page, "Dashboard")).toBeVisible({ timeout: 10000 });
    await expect(navLink(page, "Client Portal")).toBeVisible();
    await expect(navLink(page, "New Project")).not.toBeVisible();
    await expect(navLink(page, "Pipeline")).not.toBeVisible();   // client lacks crm:view + crm plan
    await expect(navLink(page, "Platform")).not.toBeVisible();
  });

  test("superadmin — sees Platform nav", async ({ page }) => {
    await openAs(page, "superadmin");
    await expect(navLink(page, "Platform")).toBeVisible({ timeout: 10000 });
    await expect(navLink(page, "Staff")).toBeVisible();
  });

  test("pm — blocked on /org (org admin route) renders AccessDenied", async ({ page }) => {
    await openAs(page, "pm", "/org");
    await expect(page.getByRole("heading", { name: "Access Restricted" })).toBeVisible({ timeout: 10000 });
  });

  test("client — /crm blocked (no crm plan cap) renders plan-gated card", async ({ page }) => {
    await openAs(page, "client", "/crm");
    await expect(page.getByText("This feature is available on the Business plan and above.")).toBeVisible({ timeout: 10000 });
  });

  test("consultant_head — sees Inspection and Reports tabs on consultant project", async ({ page }) => {
    await openAs(page, "consultant_head", "/projects/33333333-3333-3333-3333-333333333333/inspection");
    await expect(page.getByText("No checklists yet")).toBeVisible({ timeout: 10000 });
    await openAs(page, "consultant_head", "/projects/33333333-3333-3333-3333-333333333333/reports");
    await expect(page.getByText("No reports yet")).toBeVisible();
  });

  test("pm — can access /inspection on consultant project (has audit:manage via project-tier pm on another project)", async ({ page }) => {
    await openAs(page, "pm", "/projects/33333333-3333-3333-3333-333333333333/inspection");
    await expect(page.getByText("No checklists yet")).toBeVisible({ timeout: 10000 });
  });

  test("design_architect_interior — sees Mood Boards and Rooms tabs on interior project", async ({ page }) => {
    await openAs(page, "design_architect_interior", "/projects/44444444-4444-4444-4444-444444444444/moodboards");
    await expect(page.getByText("No mood boards yet")).toBeVisible({ timeout: 10000 });
    await openAs(page, "design_architect_interior", "/projects/44444444-4444-4444-4444-444444444444/rooms");
    await expect(page.getByText("No rooms yet")).toBeVisible();
  });

  test("pm — blocked from /moodboards on interior project (no ffe:manage in this mock env)", async ({ page }) => {
    await openAs(page, "pm", "/projects/44444444-4444-4444-4444-444444444444/moodboards");
    await expect(page.getByRole("heading", { name: "Access Restricted" })).toBeVisible({ timeout: 10000 });
  });
});