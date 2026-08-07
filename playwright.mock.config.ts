import { defineConfig, devices } from "@playwright/test";

const mockPort = process.env.E2E_MOCK_PORT || "5176";

// Runs the role-access suite against a LOCAL vite dev server in supabase mode
// (no VITE_BACKEND=local → getSupabaseClient returns a real client), with the
// Supabase session + REST mocked per-role. No credentials, no live DB.
export default defineConfig({
  testDir: "./e2e-mock",
  timeout: 60000,
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