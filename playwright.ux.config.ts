import { defineConfig, devices } from "@playwright/test";

// UX-audit-only config: runs the diagnostic viewport sweep (ux-audit.spec.ts)
// against the same mocked-session dev server. `npm run test:ux`.
const mockPort = process.env.E2E_MOCK_PORT || "5176";

export default defineConfig({
  testDir: "./e2e-mock",
  testMatch: "**/ux-audit.spec.ts",
  timeout: 300_000,
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${mockPort}`,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/e2e-mock-server.mjs",
    url: `http://127.0.0.1:${mockPort}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
