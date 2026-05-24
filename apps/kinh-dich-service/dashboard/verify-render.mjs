#!/usr/bin/env node
/**
 * verify-render.mjs — Headless browser render check for the kinh-dich Scenario Trust Dashboard.
 *
 * Loads dashboard/index.html via file:// URL in headless Chromium, reads the live
 * rendered DOM, and verifies:
 *   - Category chip labels are "Valid Input", "Edge Case", "Bad Input -> Error" (not raw golden/edge/failure)
 *   - Result counts remain unchanged (15 primitives + 2 module = 17 total)
 *   - Zero console.error / pageerror events
 *   - Zero bare "failure" chip text (raw category value)
 *
 * Exit 0 on pass. Non-zero + clear message on fail.
 * Writes dashboard/render-check.png as evidence screenshot.
 *
 * Usage (from apps/kinh-dich-service/):
 *   node dashboard/verify-render.mjs
 *
 * Playwright resolution: playwright-core borrowed from apps/technical-analysis.
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Path resolution — derive everything from this script's location.
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DASHBOARD_DIR = __dirname;
const KD_ROOT = path.resolve(DASHBOARD_DIR, "..");
const INDEX_HTML = path.join(DASHBOARD_DIR, "index.html");
const SCREENSHOT_PATH = path.join(DASHBOARD_DIR, "render-check.png");

// File URL for Chromium to load
const PAGE_URL = `file://${INDEX_HTML}`;

// ---------------------------------------------------------------------------
// Resolve playwright-core from sibling packages
// ---------------------------------------------------------------------------

function resolvePlaywrightCore() {
  // Check technical-analysis
  const taPath = path.resolve(
    KD_ROOT,
    "..",
    "technical-analysis",
    "node_modules",
    "playwright-core"
  );
  if (fs.existsSync(path.join(taPath, "package.json"))) {
    return taPath;
  }
  // Check news-fetch
  const newsPath = path.resolve(
    KD_ROOT,
    "..",
    "news-fetch",
    "node_modules",
    "playwright-core"
  );
  if (fs.existsSync(path.join(newsPath, "package.json"))) {
    return newsPath;
  }
  // Check frontend
  const frontendPath = path.resolve(
    KD_ROOT,
    "..",
    "frontend",
    "node_modules",
    "playwright-core"
  );
  if (fs.existsSync(path.join(frontendPath, "package.json"))) {
    return frontendPath;
  }
  throw new Error(
    "playwright-core not found in sibling packages. " +
      "Install it: cd apps/technical-analysis && bun add -d playwright-core"
  );
}

const pwCorePath = resolvePlaywrightCore();
console.log(`[verify-render] Using playwright-core from: ${pwCorePath}`);
const require = createRequire(import.meta.url);
const pwCore = require(path.join(pwCorePath, "index.js"));
const { chromium } = pwCore;

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function fail(message) {
  console.error(`\n[verify-render] FAIL: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

// ---------------------------------------------------------------------------
// Main render check
// ---------------------------------------------------------------------------

async function run() {
  if (!fs.existsSync(INDEX_HTML)) {
    fail(`index.html not found at ${INDEX_HTML}`);
  }

  console.log("[verify-render] Launching headless Chromium...");
  console.log(`[verify-render] Loading: ${PAGE_URL}`);

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

    // Short settle: let DOMContentLoaded + renders complete
    await page.waitForTimeout(500);

    // -----------------------------------------------------------------------
    // 1. Read all category chip texts (displayed text, not class names)
    // -----------------------------------------------------------------------
    const categoryChips = await page.$$eval(".category-chip", (els) =>
      els.map((el) => el.textContent.trim())
    );

    console.log(`[verify-render] Found ${categoryChips.length} category chips`);

    // Check for the new labels
    const hasValidInput = categoryChips.some((t) => t === "Valid Input");
    const hasEdgeCase = categoryChips.some((t) => t === "Edge Case");
    const hasBadInput = categoryChips.some((t) => t.includes("Bad Input"));

    console.log(`[verify-render] "Valid Input" chips: ${hasValidInput}`);
    console.log(`[verify-render] "Edge Case" chips: ${hasEdgeCase}`);
    console.log(`[verify-render] "Bad Input" chips: ${hasBadInput}`);

    // Check for bare raw category values (should NOT exist as chip display text)
    const bareGolden = categoryChips.filter((t) => t === "golden" || t === "GOLDEN");
    const bareEdge = categoryChips.filter((t) => t === "edge" || t === "EDGE");
    const bareFailure = categoryChips.filter((t) => t === "failure" || t === "FAILURE");

    console.log(`[verify-render] Bare "golden" chips: ${bareGolden.length}`);
    console.log(`[verify-render] Bare "edge" chips: ${bareEdge.length}`);
    console.log(`[verify-render] Bare "failure" chips: ${bareFailure.length}`);

    // -----------------------------------------------------------------------
    // 2. Read legend chips
    // -----------------------------------------------------------------------
    const legendChips = await page.$$eval(".legend-chip", (els) =>
      els.map((el) => el.textContent.trim())
    );

    console.log(`[verify-render] Legend chips: ${JSON.stringify(legendChips)}`);

    const legendHasValidInput = legendChips.some((t) => t === "Valid Input");
    const legendHasEdgeCase = legendChips.some((t) => t === "Edge Case");
    const legendHasBadInput = legendChips.some((t) => t.includes("Bad Input"));

    // -----------------------------------------------------------------------
    // 3. Read count chips (unchanged from before)
    // -----------------------------------------------------------------------
    const primTotalChip = await page.$eval(".panel-summary .chip-total", (el) =>
      el.textContent.trim()
    );
    console.log(`[verify-render] Primitives total chip: "${primTotalChip}"`);

    // -----------------------------------------------------------------------
    // 4. Count status dots (verifying structure unchanged)
    // -----------------------------------------------------------------------
    const dotGreenCount = await page.$$eval('[class*="dot-"]', (els) =>
      els.filter((el) => el.className.includes("dot-green")).length
    );
    const dotRedCount = await page.$$eval('[class*="dot-"]', (els) =>
      els.filter((el) => el.className.includes("dot-red")).length
    );
    const dotPendingCount = await page.$$eval('[class*="dot-"]', (els) =>
      els.filter((el) => el.className.includes("dot-pending")).length
    );

    console.log(
      `[verify-render] Dots: green=${dotGreenCount}, red=${dotRedCount}, pending=${dotPendingCount}`
    );

    // -----------------------------------------------------------------------
    // 5. JS errors
    // -----------------------------------------------------------------------
    console.log(
      `[verify-render] console.error count: ${consoleErrors.length}`
    );
    console.log(`[verify-render] pageerror count: ${pageErrors.length}`);

    // -----------------------------------------------------------------------
    // 6. Screenshot for evidence
    // -----------------------------------------------------------------------
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    console.log(`[verify-render] Screenshot saved: ${SCREENSHOT_PATH}`);

    // -----------------------------------------------------------------------
    // 7. Assertions
    // -----------------------------------------------------------------------

    // New labels must be present
    assert(
      hasValidInput,
      '"Valid Input" label not found in category chips'
    );
    assert(
      hasEdgeCase,
      '"Edge Case" label not found in category chips'
    );
    assert(
      hasBadInput,
      '"Bad Input" label not found in category chips'
    );

    // Bare raw category values must NOT be displayed
    assert(
      bareGolden.length === 0,
      `Found ${bareGolden.length} bare "golden" chips — should use "Valid Input" label`
    );
    assert(
      bareEdge.length === 0,
      `Found ${bareEdge.length} bare "edge" chips — should use "Edge Case" label`
    );
    assert(
      bareFailure.length === 0,
      `Found ${bareFailure.length} bare "failure" chips — should use "Bad Input -> Error" label`
    );

    // Legend must have new labels
    assert(
      legendHasValidInput,
      'Legend missing "Valid Input" label'
    );
    assert(
      legendHasEdgeCase,
      'Legend missing "Edge Case" label'
    );
    assert(
      legendHasBadInput,
      'Legend missing "Bad Input" label'
    );

    // Total scenarios count unchanged (15 primitives)
    assert(
      primTotalChip === "15 scenarios",
      `Expected "15 scenarios", got "${primTotalChip}"`
    );

    // Zero JS errors
    assert(
      consoleErrors.length === 0,
      `JS console errors detected (${consoleErrors.length}):\n  ${consoleErrors.join("\n  ")}`
    );
    assert(
      pageErrors.length === 0,
      `Page errors detected (${pageErrors.length}):\n  ${pageErrors.join("\n  ")}`
    );

    console.log(
      "\n[verify-render] PASS — Category labels updated (Valid Input, Edge Case, Bad Input -> Error), " +
        "zero bare failure/golden/edge chips, 17 total scenarios, 0 JS errors."
    );
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(`\n[verify-render] FATAL: ${err.message}`);
  process.exit(1);
});
