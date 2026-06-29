import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: "https://sitetrack-rakesh.vercel.app",
    screenshot: "only-on-failure",
    trace: "off",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});
