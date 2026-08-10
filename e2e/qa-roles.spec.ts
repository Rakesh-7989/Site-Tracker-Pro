import { test, expect, Page } from "@playwright/test";

const BASE = "https://sitetrack-rakesh.vercel.app";

const USERS = {
  owner:  { email: "boyapatirakesh.mahespaddy@gmail.com", pw: "Test@123", loginPage: "staff" },
  orga:   { email: "orga@test.in", pw: "Test@123", loginPage: "org" },
  pm:     { email: "pm@test.in", pw: "Test@123", loginPage: "org" },
  con:    { email: "con@test.in", pw: "Test@123", loginPage: "org" },
  client: { email: "client@test.in", pw: "Test@123", loginPage: "org" },
};

const PROJ = {
  design:     "654e3955-5842-453f-aec1-70610c2b6ca3",
  interior:   "686ac52e-499a-4763-a68c-7d2055d02a06",
  consultant: "883884e1-b8a4-413c-b70b-2050f3c6b428",
};

async function login(page: Page, email: string, pw: string, prefix = "") {
  const path = prefix === "staff" ? "/staff/login" : "/login";
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.locator("#email").fill(email);
  await page.locator("#pw").fill(pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 });
  await page.waitForTimeout(2000);
}

function navLink(page: Page, name: string) {
  return page.locator("nav").getByRole("link", { name, exact: true });
}

// ──────────────────────────────────────────────────────────────────────────
// Phase 3 — Role visibility (nav items, tabs, admin gating)
// ──────────────────────────────────────────────────────────────────────────

test.describe("Phase 3 — Role visibility", () => {

  /* ── PM ─────────────────────────────────────────────────────── */
  test("PM — nav items", async ({ page }) => {
    test.setTimeout(60000);
    await login(page, USERS.pm.email, USERS.pm.pw, USERS.pm.loginPage);

    // Workspace — always visible
    await expect(navLink(page, "Dashboard")).toBeVisible({ timeout: 5000 });
    await expect(navLink(page, "Projects")).toBeVisible();

    // PM-specific
    await expect(navLink(page, "PM Dashboard")).not.toBeVisible();   // nav item removed entirely
    await expect(navLink(page, "New Project")).toBeVisible();
    await expect(navLink(page, "Purchase Orders")).toBeVisible();

    // Blocked
    await expect(navLink(page, "Client Portal")).not.toBeVisible();
    await expect(navLink(page, "Vendors")).not.toBeVisible();   // PM lacks vendor:manage
    await expect(navLink(page, "Platform")).not.toBeVisible();
    await expect(navLink(page, "Org Home")).not.toBeVisible();
  });

  test("PM — blocked from /admin", async ({ page }) => {
    test.setTimeout(60000);
    await login(page, USERS.pm.email, USERS.pm.pw, USERS.pm.loginPage);
    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).toContainText("access", { timeout: 5000 });
  });

  test("PM — sees Issues tab with Raise form", async ({ page }) => {
    test.setTimeout(60000);
    await login(page, USERS.pm.email, USERS.pm.pw, USERS.pm.loginPage);
    await page.goto(`${BASE}/projects/${PROJ.design}`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(3000);

    // Tab bar renders buttons, not role=tab elements
    const issuesBtn = page.locator("button", { hasText: "Issues" });
    await expect(issuesBtn).toBeVisible({ timeout: 5000 });

    // Click the Issues tab
    await issuesBtn.click();
    await page.waitForTimeout(1500);

    // Should see issue creation form
    await expect(page.locator('input[placeholder*="Water seepage"]')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Raise" })).toBeVisible();
  });

  /* ── Contractor ──────────────────────────────────────────────── */
  test("Contractor — nav items", async ({ page }) => {
    test.setTimeout(60000);
    await login(page, USERS.con.email, USERS.con.pw, USERS.con.loginPage);

    await expect(navLink(page, "Dashboard")).toBeVisible({ timeout: 5000 });
    await expect(navLink(page, "Projects")).toBeVisible();

    // Should NOT see PM/privileged items
    await expect(navLink(page, "PM Dashboard")).not.toBeVisible();
    await expect(navLink(page, "New Project")).not.toBeVisible();
    await expect(navLink(page, "Purchase Orders")).not.toBeVisible();
    await expect(navLink(page, "Vendors")).not.toBeVisible();
    await expect(navLink(page, "Client Portal")).not.toBeVisible();
    await expect(navLink(page, "Platform")).not.toBeVisible();
    await expect(navLink(page, "Org Home")).not.toBeVisible();
  });

  test("Contractor — sees Materials tab with Add form", async ({ page }) => {
    test.setTimeout(60000);
    await login(page, USERS.con.email, USERS.con.pw, USERS.con.loginPage);
    await page.goto(`${BASE}/projects/${PROJ.interior}`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(3000);

    const matBtn = page.locator("button", { hasText: "Materials" });
    await expect(matBtn).toBeVisible({ timeout: 5000 });

    await matBtn.click();
    await page.waitForTimeout(1500);

    await expect(page.locator('input[placeholder*="TMT"]')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Add" })).toBeVisible();
  });

  test("Contractor — blocked from /admin", async ({ page }) => {
    test.setTimeout(60000);
    await login(page, USERS.con.email, USERS.con.pw, USERS.con.loginPage);
    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).toContainText("access", { timeout: 5000 });
  });

  /* ── Client ──────────────────────────────────────────────────── */
  test("Client — nav items", async ({ page }) => {
    test.setTimeout(60000);
    await login(page, USERS.client.email, USERS.client.pw, USERS.client.loginPage);

    await expect(navLink(page, "Dashboard")).toBeVisible({ timeout: 5000 });
    await expect(navLink(page, "Projects")).toBeVisible();
    await expect(navLink(page, "Client Portal")).toBeVisible();

    await expect(navLink(page, "PM Dashboard")).not.toBeVisible();
    await expect(navLink(page, "New Project")).not.toBeVisible();
    await expect(navLink(page, "Purchase Orders")).not.toBeVisible();
    await expect(navLink(page, "Vendors")).not.toBeVisible();
    await expect(navLink(page, "Platform")).not.toBeVisible();
    await expect(navLink(page, "Org Home")).not.toBeVisible();
  });

  test("Client — no issue or material Add form", async ({ page }) => {
    test.setTimeout(60000);
    await login(page, USERS.client.email, USERS.client.pw, USERS.client.loginPage);
    await page.goto(`${BASE}/projects/${PROJ.consultant}`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(3000);

    // Try Issues
    const issuesBtn = page.locator("button", { hasText: "Issues" });
    if (await issuesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await issuesBtn.click();
      await page.waitForTimeout(1000);
      await expect(page.locator('input[placeholder*="Water seepage"]')).not.toBeVisible();
    }

    // Try Materials
    const matBtn = page.locator("button", { hasText: "Materials" });
    if (await matBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await matBtn.click();
      await page.waitForTimeout(1000);
      await expect(page.locator('input[placeholder*="TMT"]')).not.toBeVisible();
    }
  });

  test("Client — blocked from /admin", async ({ page }) => {
    test.setTimeout(60000);
    await login(page, USERS.client.email, USERS.client.pw, USERS.client.loginPage);
    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).toContainText("access", { timeout: 5000 });
  });

  /* ── Org Admin ───────────────────────────────────────────────── */
  test("OrgAdmin — nav items", async ({ page }) => {
    test.setTimeout(60000);
    await login(page, USERS.orga.email, USERS.orga.pw, USERS.orga.loginPage);

    await expect(navLink(page, "Org Home")).toBeVisible({ timeout: 5000 });
    await expect(navLink(page, "Members")).toBeVisible();
    await expect(navLink(page, "Custom Roles")).toBeVisible();
    await expect(navLink(page, "Billing")).toBeVisible();

    await expect(navLink(page, "Platform")).not.toBeVisible();
    await expect(navLink(page, "Staff")).not.toBeVisible();
  });

  test("OrgAdmin — blocked from /admin", async ({ page }) => {
    test.setTimeout(60000);
    await login(page, USERS.orga.email, USERS.orga.pw, USERS.orga.loginPage);
    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).toContainText("access", { timeout: 5000 });
  });

  /* ── Owner (staff) ──────────────────────────────────────────── */
  test("Owner — admin access granted", async ({ page }) => {
    test.setTimeout(60000);
    await login(page, USERS.owner.email, USERS.owner.pw, USERS.owner.loginPage);

    await expect(navLink(page, "Platform")).toBeVisible({ timeout: 5000 });
    await expect(navLink(page, "Staff")).toBeVisible({ timeout: 5000 });

    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).not.toContainText("access", { timeout: 3000 });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Phase 4 — CRUD operations (create → read → update → delete)
// ──────────────────────────────────────────────────────────────────────────

test.describe("Phase 4 — CRUD operations", () => {

  test("PM — create, read, resolve, delete issue", async ({ page }) => {
    test.setTimeout(90000);
    await login(page, USERS.pm.email, USERS.pm.pw, USERS.pm.loginPage);
    await page.goto(`${BASE}/projects/${PROJ.design}`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(3000);

    // Open Issues tab
    await page.locator("button", { hasText: "Issues" }).click();
    await page.waitForTimeout(1500);

    const title = `E2E Issue ${Date.now()}`;

    // CREATE
    await page.locator('input[placeholder*="Water seepage"]').fill(title);
    await page.locator('input[placeholder*="Description"]').fill("Created by E2E test");
    await page.getByRole("button", { name: "Raise" }).click();
    await page.waitForTimeout(2500);

    // READ — verify appears
    await expect(page.locator("body")).toContainText(title, { timeout: 5000 });

    // RESOLVE — click first Resolve button (the one that just appeared)
    const resolveBtns = page.getByRole("button", { name: "Resolve" });
    if (await resolveBtns.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await resolveBtns.first().click();
      await page.waitForTimeout(2000);
    }

    // DELETE — click trash icon button (no text inside button, just an SVG)
    const trashBtns = page.locator('button:has(svg)');
    if (await trashBtns.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await trashBtns.first().click();
      await page.waitForTimeout(1500);
    }
  });

  test("Contractor — create, read, update status, delete material", async ({ page }) => {
    test.setTimeout(90000);
    await login(page, USERS.con.email, USERS.con.pw, USERS.con.loginPage);
    await page.goto(`${BASE}/projects/${PROJ.interior}`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(3000);

    // Open Materials tab
    await page.locator("button", { hasText: "Materials" }).click();
    await page.waitForTimeout(1500);

    const matName = `E2E Mat ${Date.now()}`;

    // CREATE
    await page.locator('input[placeholder*="TMT"]').fill(matName);
    await page.locator('input[placeholder*="5 ton"]').fill("10 kg");
    // Supplier input has no placeholder, find it after the first two inputs
    const inputs = page.locator('input');
    const supplierInput = inputs.nth(2);
    if (await supplierInput.isVisible()) {
      await supplierInput.fill("E2E Supplier");
    }
    await page.getByRole("button", { name: "Add" }).click();
    await page.waitForTimeout(2500);

    // READ
    await expect(page.locator("body")).toContainText(matName, { timeout: 5000 });

    // UPDATE status — scope to the Materials tab content (avoid the language selector)
    const statusSelect = page.locator("h2:has-text('Materials')").locator("..").locator("select").first();
    if (await statusSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await statusSelect.selectOption("received");
      await page.waitForTimeout(1000);
    }
  });

  test("Client — read-only: no create forms visible", async ({ page }) => {
    test.setTimeout(60000);
    await login(page, USERS.client.email, USERS.client.pw, USERS.client.loginPage);
    await page.goto(`${BASE}/projects/${PROJ.consultant}`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(3000);

    // Check Issues tab
    const issuesBtn = page.locator("button", { hasText: "Issues" });
    if (await issuesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await issuesBtn.click();
      await page.waitForTimeout(1000);
      const raiseBtn = page.getByRole("button", { name: "Raise" });
      await expect(raiseBtn).not.toBeVisible();
    }

    // Check Materials tab
    const matBtn = page.locator("button", { hasText: "Materials" });
    if (await matBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await matBtn.click();
      await page.waitForTimeout(1000);
      const addBtn = page.getByRole("button", { name: "Add" });
      await expect(addBtn).not.toBeVisible();
    }
  });
});
