import { test, expect } from "@playwright/test";

/**
 * quality-audit-lastverified.spec.ts — FE-PG-QUALITY-AUDIT-LASTVERIFIED-RENDER-FIX
 * AC (c): proves no crash and correct stale/fresh bucketing against the REAL
 * served path — this test hits /dashboard/quality-audit which loader-fetches
 * /api/quality-checklist (frontend proxy) → mcp-server :3000's live
 * docs/data/quality-checklist.json, which naturally contains all four
 * timestamp shapes exercised below (no synthetic fixture needed).
 *
 * Row → shape → capability mapping (live data, 2026-07-25 snapshot):
 *   FR-FUNC-01           second precision   "2026-06-10T09:13:45Z"    stale
 *   FR-FRESH-02          microsecond        "2026-06-10T09:18:46.945489Z" stale
 *   FR-FRESH-04          second precision   "2026-07-25T06:46:06Z"    fresh
 *   MAC-CONSIST-01       bare date          "2026-06-10"              stale
 *   STOCK-PRICE-FUNC-01  millisecond        "2026-06-10T19:26:13.150Z" stale
 *
 * Runs against dev server on http://localhost:3001 by default — set
 * PLAYWRIGHT_PORT to point at an alternate dev server instance when the
 * default port is occupied by a container that predates this change.
 */

test("quality-audit dashboard renders without crashing", async ({ page }) => {
  await page.goto("/dashboard/quality-audit");

  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toContain("Application Error");
  expect(bodyText).not.toContain("Internal Server Error");
  await expect(page).toHaveTitle(/Quality Audit/i);
});

test("stale checks (all four timestamp shapes) show STALE marker, not blank/fresh", async ({
  page,
}) => {
  await page.goto("/dashboard/quality-audit");

  // Expand the three capabilities holding our target checks.
  await page
    .locator("button", { hasText: "Financial Reports (BCTC / PDF / OCR)" })
    .click();
  await page.locator("button", { hasText: "Macro Indicators" }).click();
  await page
    .locator("button", {
      hasText: "Service: stock-price (:5010) — undeployed by design",
    })
    .click();

  const staleRows = [
    "FR-FUNC-01", // second precision, 45d stale
    "FR-FRESH-02", // microsecond precision, 45d stale — must not NaN/crash
    "MAC-CONSIST-01", // bare date "2026-06-10", 45d stale
    "STOCK-PRICE-FUNC-01", // millisecond precision, 45d stale
  ];

  for (const checkId of staleRows) {
    const row = page.locator("tr", { hasText: checkId });
    // Column 6 = "Last Verified" (Check ID, Dimension, Question, Severity,
    // Status, Last Verified, Evidence) — scoped so the free-text Evidence
    // column (which can itself legitimately contain the word "stale" in
    // prose, e.g. FR-FRESH-04 below) cannot false-positive the assertion.
    const lastVerifiedCell = row.locator("td").nth(5);
    await expect(lastVerifiedCell).toBeVisible();
    await expect(lastVerifiedCell).toContainText(/stale/i);
    await expect(lastVerifiedCell).not.toContainText("UNKNOWN");
    await expect(lastVerifiedCell).not.toContainText("Invalid Date");
  }
});

test("fresh check (today's timestamp) shows no STALE marker", async ({
  page,
}) => {
  await page.goto("/dashboard/quality-audit");

  await page
    .locator("button", { hasText: "Financial Reports (BCTC / PDF / OCR)" })
    .click();

  const freshRow = page.locator("tr", { hasText: "FR-FRESH-04" });
  await expect(freshRow).toBeVisible();
  // Scoped to the Last Verified column — FR-FRESH-04's Evidence text
  // legitimately contains the word "stale" in prose (referencing an
  // unrelated OCR-reflow feedback note), which would false-positive a
  // whole-row text match.
  const lastVerifiedCell = freshRow.locator("td").nth(5);
  await expect(lastVerifiedCell).not.toContainText(/stale/i);
  await expect(lastVerifiedCell).not.toContainText("UNKNOWN");
  await expect(lastVerifiedCell).not.toContainText("Invalid Date");
});
