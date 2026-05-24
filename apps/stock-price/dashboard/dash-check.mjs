#!/usr/bin/env node
/**
 * dash-check.mjs — Machine-readable health check for the stock-price Scenario Trust Dashboard.
 *
 * Purpose: AI/CI-friendly verification of dashboard rendered state WITHOUT screenshots.
 * Outputs ONE structured JSON line (DASH-CHECK-RESULT) that an AI can parse programmatically.
 *
 * Usage (from apps/stock-price/):
 *   node dashboard/dash-check.mjs
 *
 * SECURITY CONTRACT (G7):
 *   - ZERO DB credentials in sandbox env
 *   - ZERO API keys in sandbox env
 *   - CGO_ENABLED=0 expected for sandbox processes
 *   - env audit must return empty for credential keywords
 *   - file:// URL loading — no server, no production credentials required
 *
 * Playwright resolution:
 *   - Prefers local node_modules/playwright-core (if installed)
 *   - Falls back to apps/frontend/node_modules/playwright-core with console.warn
 *   - playwright-core is CommonJS — imported via createRequire
 *
 * Exit codes:
 *   0: PASS or WARN (no red dots, no JS errors, category labels valid)
 *   1: FAIL (red dots, JS errors, page errors, or bad category labels)
 *
 * DASH-CHECK-RESULT JSON schema:
 *   {
 *     "service": "stock-price",
 *     "dotsGreen": N,
 *     "dotsRed": N,
 *     "dotsPending": N,
 *     "jsErrors": N,
 *     "pageErrors": N,
 *     "categoryChips": {"Valid Input": N, "Edge Case": N, "Bad Input -> Error": N},
 *     "badLabels": [...],
 *     "verdict": "PASS" | "WARN" | "FAIL"
 *   }
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Path resolution — self-derive ALL paths from import.meta.url
// NEVER hardcode machine-specific absolute paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// __dirname = apps/stock-price/dashboard/
const DASHBOARD_DIR = __dirname;
const SP_ROOT = path.resolve(DASHBOARD_DIR, "..");
const INDEX_HTML = path.join(DASHBOARD_DIR, "index.html");

// File URL for Chromium to load (file:// protocol — no server required)
const PAGE_URL = `file://${INDEX_HTML}`;

// ---------------------------------------------------------------------------
// Resolve playwright-core
// Prefer local stock-price node_modules, fall back to frontend node_modules
// ---------------------------------------------------------------------------

function resolvePlaywrightCore() {
  // Try local first
  const localPath = path.join(SP_ROOT, "node_modules", "playwright-core");
  if (fs.existsSync(path.join(localPath, "package.json"))) {
    return localPath;
  }

  // Fallback to frontend
  const frontendPath = path.resolve(
    SP_ROOT,
    "..",
    "frontend",
    "node_modules",
    "playwright-core"
  );
  if (fs.existsSync(path.join(frontendPath, "package.json"))) {
    console.warn(
      "[dash-check] WARNING: using playwright-core from apps/frontend. " +
        "Run `bun add -d playwright-core` in apps/stock-price/ to install locally."
    );
    return frontendPath;
  }

  throw new Error(
    "playwright-core not found. " +
      "Install: cd apps/frontend && bun add -d playwright-core"
  );
}

const pwCorePath = resolvePlaywrightCore();
// playwright-core is CommonJS — use createRequire
const require = createRequire(import.meta.url);
const pwCore = require(path.join(pwCorePath, "index.js"));
const { chromium } = pwCore;

// ---------------------------------------------------------------------------
// Valid category chip labels (plain-meaning convention)
// Legacy labels (golden, edge, failure) are FAIL if rendered as-is
// ---------------------------------------------------------------------------

const VALID_CATEGORY_LABELS = new Set([
  "Valid Input",
  "Edge Case",
  "Bad Input -> Error",
  // Allow uppercase versions from modal
  "VALID INPUT",
  "EDGE CASE",
  "BAD INPUT -> ERROR",
  "BAD INPUT → ERROR", // HTML arrow variant
]);

const LEGACY_LABELS = new Set(["golden", "edge", "failure", "GOLDEN", "EDGE", "FAILURE"]);

// ---------------------------------------------------------------------------
// Main check
// ---------------------------------------------------------------------------

async function run() {
  // Guard: index.html must exist
  if (!fs.existsSync(INDEX_HTML)) {
    console.error(`[dash-check] FAIL: index.html not found at ${INDEX_HTML}`);
    process.exit(1);
  }

  console.log("[dash-check] Launching headless Chromium...");
  console.log(`[dash-check] Loading: ${PAGE_URL}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Collect console errors and page errors
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  try {
    await page.goto(PAGE_URL, { waitUntil: "networkidle" });

    // Short settle for DOM rendering
    await page.waitForTimeout(500);

    // -----------------------------------------------------------------------
    // 1. Count status dots
    // -----------------------------------------------------------------------
    const dotsGreen = await page.$$eval(
      ".scenario-status-dot",
      (els) => els.filter((el) => el.classList.contains("dot-green")).length
    );
    const dotsRed = await page.$$eval(
      ".scenario-status-dot",
      (els) => els.filter((el) => el.classList.contains("dot-red")).length
    );
    const dotsPending = await page.$$eval(
      ".scenario-status-dot",
      (els) => els.filter((el) => el.classList.contains("dot-pending")).length
    );

    // -----------------------------------------------------------------------
    // 2. Read group status texts
    // -----------------------------------------------------------------------
    const groupStatuses = await page.$$eval(".group-status", (els) =>
      els.map((el) => el.textContent.trim())
    );

    // -----------------------------------------------------------------------
    // 3. Read count chips
    // -----------------------------------------------------------------------
    const primGreenChip = await page
      .$eval("#prim-green-chip", (el) => el.textContent.trim())
      .catch(() => "hidden");
    const primRedChip = await page
      .$eval("#prim-red-chip", (el) => el.textContent.trim())
      .catch(() => "hidden");
    const primNotrunChip = await page
      .$eval("#prim-notrun-chip", (el) => el.textContent.trim())
      .catch(() => "hidden");

    const modGreenChip = await page
      .$eval("#mod-green-chip", (el) => el.textContent.trim())
      .catch(() => "hidden");
    const modRedChip = await page
      .$eval("#mod-red-chip", (el) => el.textContent.trim())
      .catch(() => "hidden");
    const modNotrunChip = await page
      .$eval("#mod-notrun-chip", (el) => el.textContent.trim())
      .catch(() => "hidden");

    // -----------------------------------------------------------------------
    // 4. Read ALL category chip texts
    // -----------------------------------------------------------------------
    const categoryChipTexts = await page.$$eval(".category-chip", (els) =>
      els.map((el) => el.textContent.trim())
    );

    // Count by label
    const categoryChips = {
      "Valid Input": 0,
      "Edge Case": 0,
      "Bad Input -> Error": 0,
    };
    const badLabels = [];

    for (const text of categoryChipTexts) {
      if (text === "Valid Input" || text === "VALID INPUT") {
        categoryChips["Valid Input"]++;
      } else if (text === "Edge Case" || text === "EDGE CASE") {
        categoryChips["Edge Case"]++;
      } else if (
        text === "Bad Input -> Error" ||
        text === "BAD INPUT -> ERROR" ||
        text === "Bad Input → Error" ||
        text === "BAD INPUT → ERROR"
      ) {
        categoryChips["Bad Input -> Error"]++;
      } else if (LEGACY_LABELS.has(text)) {
        // Legacy bare label rendered — this is a FAIL
        badLabels.push(text);
      } else {
        // Unknown label
        badLabels.push(text);
      }
    }

    // -----------------------------------------------------------------------
    // 5. Check for NOT RUN / not wired text
    // -----------------------------------------------------------------------
    const bodyText = await page.$eval("body", (el) => el.innerText);
    const hasNotRun = bodyText.includes("NOT RUN") || bodyText.includes("NOT-RUN");
    const hasNotWired = bodyText.toLowerCase().includes("not wired");

    // -----------------------------------------------------------------------
    // 6. Build result object
    // -----------------------------------------------------------------------
    const jsErrors = consoleErrors.length;
    const pageErrorCount = pageErrors.length;

    // Verdict logic (data-driven, NOT hardcoded totals):
    // FAIL if: any red > 0 OR jsErrors > 0 OR pageErrors > 0 OR badLabels.length > 0
    // WARN if: pending/NOT-RUN present but no red/errors
    // PASS otherwise

    let verdict = "PASS";
    let failReason = "";

    if (dotsRed > 0) {
      verdict = "FAIL";
      failReason = `${dotsRed} red dot(s) present`;
    } else if (jsErrors > 0) {
      verdict = "FAIL";
      failReason = `${jsErrors} JS console error(s)`;
    } else if (pageErrorCount > 0) {
      verdict = "FAIL";
      failReason = `${pageErrorCount} page error(s)`;
    } else if (badLabels.length > 0) {
      verdict = "FAIL";
      failReason = `Bad category labels: ${JSON.stringify(badLabels)}`;
    } else if (dotsPending > 0 || hasNotRun) {
      verdict = "WARN";
    }

    const result = {
      service: "stock-price",
      dotsGreen,
      dotsRed,
      dotsPending,
      jsErrors,
      pageErrors: pageErrorCount,
      categoryChips,
      badLabels,
      verdict,
    };

    // -----------------------------------------------------------------------
    // 7. Output machine-readable line
    // -----------------------------------------------------------------------
    console.log(`DASH-CHECK-RESULT: ${JSON.stringify(result)}`);

    // Human-readable summary
    console.log("\n[dash-check] Summary:");
    console.log(`  Dots: green=${dotsGreen}, red=${dotsRed}, pending=${dotsPending}`);
    console.log(`  Category chips: ${JSON.stringify(categoryChips)}`);
    console.log(`  Bad labels: ${badLabels.length > 0 ? JSON.stringify(badLabels) : "none"}`);
    console.log(`  JS errors: ${jsErrors}, page errors: ${pageErrorCount}`);
    console.log(`  NOT-RUN text: ${hasNotRun}, not-wired text: ${hasNotWired}`);
    console.log(`  Group statuses: ${JSON.stringify(groupStatuses)}`);
    console.log(`  Verdict: ${verdict}${failReason ? ` (${failReason})` : ""}`);

    await browser.close();

    // Exit code
    if (verdict === "FAIL") {
      console.error(`\n[dash-check] FAIL: ${failReason}`);
      process.exit(1);
    } else {
      console.log(`\n[dash-check] ${verdict}`);
      process.exit(0);
    }
  } catch (err) {
    await browser.close();
    console.error(`\n[dash-check] FATAL: ${err.message}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(`\n[dash-check] FATAL: ${err.message}`);
  process.exit(1);
});
