import { test, expect } from "@playwright/test";

const BASE = "https://sitetrackpro.in";

test("Staff/Owner — login at /staff/login, reach admin", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(`${BASE}/staff/login`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);

  await page.locator("#email").fill("boyapatirakesh.mahespaddy@gmail.com");
  await page.locator("#pw").fill("Test@123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // Should redirect to /admin (staff default)
  await page.waitForURL((url) => url.pathname !== "/staff/login", { timeout: 25000 });
  await page.waitForTimeout(2000);
  const url = page.url();
  expect(url).not.toContain("/login");
  // Staff should see admin
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(2000);
  expect(page.url()).toContain("/admin");
  await expect(page.locator("body")).not.toContainText("access", { timeout: 3000 });
});

test("OrgAdmin — login at /login, blocked from admin", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.locator("#email").fill("orga@test.in");
  await page.locator("#pw").fill("Test@123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25000 });
  await page.waitForTimeout(2000);

  // Try admin
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(2000);
  // Should see access denied
  const body = page.locator("body");
  await expect(body).toContainText("access", { timeout: 5000 });
});

test("PM — login at /login, blocked from admin", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.locator("#email").fill("pm@test.in");
  await page.locator("#pw").fill("Test@123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25000 });
  await page.waitForTimeout(2000);

  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(2000);
  const body = page.locator("body");
  await expect(body).toContainText("access", { timeout: 5000 });
});

test("Contractor — login at /login, blocked from admin", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.locator("#email").fill("con@test.in");
  await page.locator("#pw").fill("Test@123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25000 });
  await page.waitForTimeout(2000);

  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(2000);
  const body = page.locator("body");
  await expect(body).toContainText("access", { timeout: 5000 });
});

test("Client — login at /login, blocked from admin", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.locator("#email").fill("client@test.in");
  await page.locator("#pw").fill("Test@123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25000 });
  await page.waitForTimeout(2000);

  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(2000);
  const body = page.locator("body");
  await expect(body).toContainText("access", { timeout: 5000 });
});
