import { defineConfig, devices } from "@playwright/test";

/**
 * SiteTrack Pro — Playwright E2E config.
 *
 * Runs in DEMO mode (no Supabase) so tests are deterministic and don't need
 * a backend. The dev server is started fresh per run, against the same
 * localStorage seed data.
 *
 * Usage:
 *   npm run dev          # in one terminal
 *   npm run test:e2e     # in another terminal
 *
 * Or use webServer (below) for one-shot CI runs.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,           // role tests share localStorage state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                     // sequential — same domain, same storage
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
