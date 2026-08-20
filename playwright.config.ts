import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 1,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "https://sitetrackpro.in",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "Mobile Chrome", use: { ...devices["Pixel 7"] } },
    { name: "Mobile Safari", use: { ...devices["iPhone 14"] } },
  ],
});
