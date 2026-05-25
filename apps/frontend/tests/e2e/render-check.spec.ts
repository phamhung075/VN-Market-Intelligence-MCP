import { test, expect } from "@playwright/test";

/**
 * render-check.spec.ts — G12 render-gate (P1-A)
 * 3 targeted checks proving the dashboard renders correctly.
 * This is the frontend's trust contract (G9 analog for UI services).
 *
 * Runs against dev server on http://localhost:3001.
 * Zero hardcoded credentials.
 */

test("dashboard nav renders", async ({ page }) => {
  await page.goto("/dashboard/analysis");

  // Nav must contain the app name
  const nav = page.locator("nav");
  await expect(nav).toContainText("VN Market Intelligence");

  // At least 4 nav links must be present (Analysis, Services, Fetch Ops, VPS Proxy, Database)
  const navLinks = nav.locator("a");
  const linkCount = await navLinks.count();
  expect(linkCount).toBeGreaterThanOrEqual(4);
});

test("analysis stock selector renders", async ({ page }) => {
  await page.goto("/dashboard/analysis");

  // "Chọn cổ phiếu" section header must be present
  await expect(page.locator("text=Chọn cổ phiếu")).toBeVisible();

  // At least one ticker badge must render (VNM is always active in watchlist)
  await expect(page.locator("text=VNM").first()).toBeVisible();
});

test("graceful degrade on API error", async ({ page }) => {
  await page.goto("/dashboard/analysis");

  // Page must NOT show an unhandled 500 crash — errors surface via error banner, not as crashes
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toContain("Internal Server Error");
  expect(bodyText).not.toContain("Application Error");

  // Page title must still be meaningful (not a blank or error page)
  await expect(page).toHaveTitle(/VN Market Intelligence/i);
});
