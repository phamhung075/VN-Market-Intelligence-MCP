import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e configuration.
 * Tests live in tests/e2e/.
 * Run: npm run test:e2e
 */
export default defineConfig({
  testDir: "tests/e2e",
  reporter: "list",
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
