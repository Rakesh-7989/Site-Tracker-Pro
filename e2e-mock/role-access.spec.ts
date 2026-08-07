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
  await page.waitForTimeout(3000);
  return session;
}

test.describe("Role-access · mocked Supabase session", () => {

  test("orgadmin — sees workspace + org nav, blocked from Platform/Staff", async ({ page }) => {
    await openAs(page, "orgadmin");
    await expect(navLink(page, "Dashboard")).toBeVisible({ timeout: 10000 });
    await expect(navLink(page, "Projects")).toBeVisible();
    await expect(navLink(page, "Org Home")).toBeVisible();

    // Not in the orgadmin capability set:
    await expect(navLink(page, "Platform")).not.toBeVisible();
    await expect(navLink(page, "Staff")).not.toBeVisible();
    await expect(navLink(page, "Client Portal")).not.toBeVisible();
  });

  test("pm — sees PM-scoped nav, blocked from admin areas + org admin", async ({ page }) => {
    await openAs(page, "pm");
    await expect(navLink(page, "Dashboard")).toBeVisible({ timeout: 10000 });
    await expect(navLink(page, "Projects")).toBeVisible();
    await expect(navLink(page, "PM Dashboard")).toBeVisible();
    await expect(navLink(page, "New Project")).toBeVisible();

    await expect(navLink(page, "Client Portal")).not.toBeVisible();
    await expect(navLink(page, "Vendors")).not.toBeVisible();   // pm lacks vendor:manage
    await expect(navLink(page, "Platform")).not.toBeVisible();
    await expect(navLink(page, "Org Home")).not.toBeVisible();
  });

  test("pm — blocked from /admin renders AccessDenied", async ({ page }) => {
    await openAs(page, "pm", "/admin");
    await expect(page.getByRole("heading", { name: "Access Restricted" })).toBeVisible({ timeout: 10000 });
  });

  test("client — sees Client Portal, not New Project", async ({ page }) => {
    await openAs(page, "client");
    await expect(navLink(page, "Dashboard")).toBeVisible({ timeout: 10000 });
    await expect(navLink(page, "Client Portal")).toBeVisible();
    await expect(navLink(page, "New Project")).not.toBeVisible();
    await expect(navLink(page, "Platform")).not.toBeVisible();
  });

  test("superadmin — sees Platform nav", async ({ page }) => {
    await openAs(page, "superadmin");
    await expect(navLink(page, "Platform")).toBeVisible({ timeout: 10000 });
  });

  test("pm — blocked on /org (org admin route) renders AccessDenied", async ({ page }) => {
    await openAs(page, "pm", "/org");
    await expect(page.getByRole("heading", { name: "Access Restricted" })).toBeVisible({ timeout: 10000 });
  });
});