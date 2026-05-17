import { test, expect } from "@playwright/test";

/**
 * Smoke test — verifies the app boots and serves a real page (not 404).
 * Runs against the dev server on http://localhost:3001.
 */
test("homepage renders with a meaningful title", async ({ page }) => {
  await page.goto("/");

  // Page title must contain the app name — not a 404 or blank page.
  await expect(page).toHaveTitle(/VN Market Intelligence/i);
});
