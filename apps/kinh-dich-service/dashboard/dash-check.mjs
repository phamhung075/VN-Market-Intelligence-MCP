#!/usr/bin/env node
/**
 * dash-check.mjs - AI/CI Health Reporter for kinh-dich Scenario Trust Dashboard
 *
 * Loads dashboard/index.html via file:// URL in headless Chromium, reads the LIVE
 * rendered DOM, and emits a machine-parseable health report for AI consumption.
 *
 * Exit codes:
 *   0 - PASS or WARN (no red, no errors)
 *   1 - FAIL (red dots, JS errors, page errors, or bad category labels)
 *
 * Usage (from apps/kinh-dich-service/):
 *   node dashboard/dash-check.mjs
 *
 * Security: ZERO DB credentials, ZERO API keys. Pure file:// load.
 * Playwright resolution: local node_modules first, fallback to apps/frontend.
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Path resolution - derive EVERYTHING from import.meta.url, no hardcoded paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DASHBOARD_DIR = __dirname;
const KD_ROOT = path.resolve(DASHBOARD_DIR, "..");
const INDEX_HTML = path.join(DASHBOARD_DIR, "index.html");

// File URL for Chromium to load
const PAGE_URL = `file://${INDEX_HTML}`;

// Valid category chip labels (data-driven - these are the ONLY allowed values)
const VALID_CATEGORY_LABELS = new Set([
  "Valid Input",
  "Edge Case",
  "Bad Input -> Error",
  "Bad Input → Error", // Unicode arrow variant
]);

// Legacy labels that should NOT appear (indicates failed relabel)
const LEGACY_LABELS = new Set([
  "golden",
  "GOLDEN",
  "edge",
  "EDGE",
  "failure",
  "FAILURE",
]);

// ---------------------------------------------------------------------------
// Resolve playwright-core - local first, fallback to frontend with warning
// ---------------------------------------------------------------------------

function resolvePlaywrightCore() {
  // 1. Check local node_modules (preferred)
  const localPath = path.resolve(KD_ROOT, "node_modules", "playwright-core");
  if (fs.existsSync(path.join(localPath, "package.json"))) {
    return { path: localPath, isLocal: true };
  }

  // 2. Fallback to apps/frontend/node_modules
  const frontendPath = path.resolve(
    KD_ROOT,
    "..",
    "frontend",
    "node_modules",
    "playwright-core"
  );
  if (fs.existsSync(path.join(frontendPath, "package.json"))) {
    console.warn(
      "[dash-check] WARN: playwright-core not in local node_modules, falling back to apps/frontend/node_modules"
    );
    return { path: frontendPath, isLocal: false };
  }

  // 3. Check other sibling packages as last resort
  const taPath = path.resolve(
    KD_ROOT,
    "..",
    "technical-analysis",
    "node_modules",
    "playwright-core"
  );
  if (fs.existsSync(path.join(taPath, "package.json"))) {
    console.warn(
      "[dash-check] WARN: playwright-core not in local node_modules, falling back to apps/technical-analysis/node_modules"
    );
    return { path: taPath, isLocal: false };
  }

  throw new Error(
    "playwright-core not found in local or sibling node_modules. " +
      "Install: cd apps/kinh-dich-service && bun add -d playwright-core"
  );
}

const pwInfo = resolvePlaywrightCore();
const require = createRequire(import.meta.url);
const pwCore = require(path.join(pwInfo.path, "index.js"));
const { chromium } = pwCore;

// ---------------------------------------------------------------------------
// Main health check
// ---------------------------------------------------------------------------

async function run() {
  if (!fs.existsSync(INDEX_HTML)) {
    console.error(`[dash-check] FAIL: index.html not found at ${INDEX_HTML}`);
    process.exit(1);
  }

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

    // -------------------------------------------------------------------------
    // 1. Count status dots (green/red/pending)
    // -------------------------------------------------------------------------
    const dotsGreen = await page.$$eval('[class*="dot-"]', (els) =>
      els.filter((el) => el.className.includes("dot-green")).length
    );
    const dotsRed = await page.$$eval('[class*="dot-"]', (els) =>
      els.filter((el) => el.className.includes("dot-red")).length
    );
    const dotsPending = await page.$$eval('[class*="dot-"]', (els) =>
      els.filter((el) => el.className.includes("dot-pending")).length
    );

    // -------------------------------------------------------------------------
    // 2. Read all category chip texts
    // -------------------------------------------------------------------------
    const categoryChipTexts = await page.$$eval(".category-chip", (els) =>
      els.map((el) => el.textContent.trim())
    );

    // Count valid category chips
    const categoryChips = {
      "Valid Input": 0,
      "Edge Case": 0,
      "Bad Input -> Error": 0,
    };

    const badLabels = [];

    for (const text of categoryChipTexts) {
      // Normalize Unicode arrow to ASCII
      const normalized = text.replace(/→/g, "->").trim();

      if (normalized === "Valid Input") {
        categoryChips["Valid Input"]++;
      } else if (normalized === "Edge Case") {
        categoryChips["Edge Case"]++;
      } else if (normalized === "Bad Input -> Error") {
        categoryChips["Bad Input -> Error"]++;
      } else if (LEGACY_LABELS.has(text) || LEGACY_LABELS.has(normalized)) {
        // Found legacy/bare label - this is bad
        badLabels.push(text);
      } else {
        // Unknown label - also bad
        badLabels.push(text);
      }
    }

    // -------------------------------------------------------------------------
    // 3. Read group/status texts
    // -------------------------------------------------------------------------
    const groupStatuses = await page.$$eval(".group-status", (els) =>
      els.map((el) => el.textContent.trim())
    );

    // -------------------------------------------------------------------------
    // 4. Check for pending dots (actual scenarios not run)
    // Note: We no longer check body text for "NOT-RUN" because it appears
    // in static documentation (legend, footer). We only care about actual
    // scenario dots being pending.
    // -------------------------------------------------------------------------
    const hasNotWired =
      (await page.$eval("body", (el) => el.textContent)).toLowerCase().includes("not wired") ||
      (await page.$eval("body", (el) => el.textContent)).toLowerCase().includes("not_wired");

    // -------------------------------------------------------------------------
    // 5. Build result object
    // -------------------------------------------------------------------------
    const result = {
      service: "kinh-dich",
      dotsGreen,
      dotsRed,
      dotsPending,
      jsErrors: consoleErrors.length,
      pageErrors: pageErrors.length,
      categoryChips,
      badLabels,
      verdict: "PASS",
    };

    // -------------------------------------------------------------------------
    // 6. Determine verdict (data-driven - no hardcoded expected totals)
    // -------------------------------------------------------------------------
    const failReasons = [];

    // FAIL if any red dots
    if (dotsRed > 0) {
      failReasons.push(`${dotsRed} red dots`);
    }

    // FAIL if any JS errors
    if (consoleErrors.length > 0) {
      failReasons.push(`${consoleErrors.length} JS errors`);
    }

    // FAIL if any page errors
    if (pageErrors.length > 0) {
      failReasons.push(`${pageErrors.length} page errors`);
    }

    // FAIL if any bad/legacy labels found
    if (badLabels.length > 0) {
      failReasons.push(
        `${badLabels.length} bad category labels: [${badLabels.join(", ")}]`
      );
    }

    if (failReasons.length > 0) {
      result.verdict = "FAIL";
    } else if (dotsPending > 0) {
      // WARN if pending dots exist (actual scenarios not run)
      result.verdict = "WARN";
    }

    // -------------------------------------------------------------------------
    // 7. Output machine-readable line + human summary
    // -------------------------------------------------------------------------
    console.log(`DASH-CHECK-RESULT: ${JSON.stringify(result)}`);
    console.log("");

    if (result.verdict === "PASS") {
      console.log(
        `[dash-check] PASS - ${dotsGreen} green dots, 0 red, 0 errors, all category labels valid`
      );
    } else if (result.verdict === "WARN") {
      console.log(
        `[dash-check] WARN - ${dotsGreen} green, ${dotsPending} pending/NOT-RUN, 0 red, 0 errors`
      );
      console.log(
        "[dash-check] Scenarios not yet executed (honest cold-start state)."
      );
    } else {
      console.log(
        `[dash-check] FAIL - ${failReasons.join("; ")}`
      );
      if (consoleErrors.length > 0) {
        console.log(`[dash-check] JS errors:\n  ${consoleErrors.join("\n  ")}`);
      }
      if (pageErrors.length > 0) {
        console.log(
          `[dash-check] Page errors:\n  ${pageErrors.join("\n  ")}`
        );
      }
    }

    await browser.close();

    // Exit 0 on PASS/WARN, non-zero on FAIL
    process.exit(result.verdict === "FAIL" ? 1 : 0);
  } catch (err) {
    await browser.close();
    console.error(`[dash-check] FATAL: ${err.message}`);
    process.exit(1);
  }
}

run();
