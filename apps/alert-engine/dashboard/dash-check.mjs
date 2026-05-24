#!/usr/bin/env node
/**
 * dash-check.mjs — Machine-readable health check for the alert-engine Scenario Trust Dashboard.
 *
 * Loads dashboard/index.html via file:// URL in headless Chromium, reads the live
 * rendered DOM, and emits ONE structured JSON line + a human-readable summary.
 *
 * Designed to be run by an AI or CI step without screenshots or a server.
 *
 * SECURITY CONTRACT (verbatim):
 *   ZERO DB credentials, ZERO API keys in sandbox env at all times;
 *   CGO_ENABLED=0; env audit must return empty; file:// must work with no server
 *   and no production credentials.
 *
 * Output format (one machine-readable line):
 *   DASH-CHECK-RESULT: {"service":"alert-engine","dotsGreen":N,"dotsRed":N,"dotsPending":N,
 *     "jsErrors":N,"pageErrors":N,"categoryChips":{"Valid Input":N,"Edge Case":N,"Bad Input -> Error":N},
 *     "badLabels":[...],"verdict":"PASS|WARN|FAIL"}
 *
 * Exit codes:
 *   0  PASS or WARN (stub/NOT-RUN acceptable)
 *   1  FAIL (red dots, JS errors, or bad legacy category labels)
 *
 * Usage (from apps/alert-engine/):
 *   node dashboard/dash-check.mjs
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Path resolution — derive everything from import.meta.url.
// NEVER hardcode machine-specific absolute paths.
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// __dirname = apps/alert-engine/dashboard/
const DASHBOARD_DIR = __dirname;
const AE_ROOT = path.resolve(DASHBOARD_DIR, "..");
const INDEX_HTML = path.join(DASHBOARD_DIR, "index.html");

// file:// URL for Chromium — no server, no credentials required
const PAGE_URL = `file://${INDEX_HTML}`;

// ---------------------------------------------------------------------------
// Resolve playwright-core — prefer this app's local node_modules, fall back
// to apps/frontend/node_modules with a console.warn.
// playwright-core is CommonJS — import via createRequire.
// ---------------------------------------------------------------------------

function resolvePlaywrightCore() {
  const localPath = path.join(AE_ROOT, "node_modules", "playwright-core");
  if (fs.existsSync(path.join(localPath, "package.json"))) {
    return localPath;
  }
  // Cross-zone fallback — warn but allow for CI bootstrapping
  const frontendPath = path.resolve(
    AE_ROOT,
    "..",
    "frontend",
    "node_modules",
    "playwright-core"
  );
  if (fs.existsSync(path.join(frontendPath, "package.json"))) {
    console.warn(
      "[dash-check] WARNING: using playwright-core from apps/frontend. " +
        "Run `npm install --save-dev playwright-core` in apps/alert-engine/ to fix."
    );
    return frontendPath;
  }
  throw new Error(
    "playwright-core not found. " +
      "Install it: cd apps/alert-engine && npm install --save-dev playwright-core"
  );
}

const pwCorePath = resolvePlaywrightCore();
const require = createRequire(import.meta.url);
const pwCore = require(path.join(pwCorePath, "index.js"));
const { chromium } = pwCore;

// ---------------------------------------------------------------------------
// Category chip label constants — the dashboard maps raw data values through
// CATEGORY_LABELS before rendering; we must assert rendered text, not raw values.
// ---------------------------------------------------------------------------

const ALLOWED_CATEGORY_CHIPS = new Set([
  "Valid Input",
  "Edge Case",
  "Bad Input -> Error",
]);

// The arrow character rendered in the DOM may be a plain ASCII "→" (→)
// or a Unicode right arrow "→" (U+2192). Normalise both to "->".
function normaliseArrow(s) {
  return s.replace(/→/g, "->").replace(/→/g, "->").trim();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emitResult(result) {
  const line = `DASH-CHECK-RESULT: ${JSON.stringify(result)}`;
  console.log(line);
  return line;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  // Guard: index.html must exist
  if (!fs.existsSync(INDEX_HTML)) {
    console.error(`[dash-check] FATAL: index.html not found at ${INDEX_HTML}`);
    process.exit(1);
  }

  console.log("[dash-check] Launching headless Chromium...");
  console.log(`[dash-check] Loading: ${PAGE_URL}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

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

    // Let DOMContentLoaded + init() + panel renders fully settle
    await page.waitForTimeout(500);

    // -----------------------------------------------------------------------
    // 1. Count status dots
    // -----------------------------------------------------------------------
    const dotsGreen = await page.$$eval('[class*="dot-"]', (els) =>
      els.filter((el) => el.className.includes("dot-green")).length
    );
    const dotsRed = await page.$$eval('[class*="dot-"]', (els) =>
      els.filter((el) => el.className.includes("dot-red")).length
    );
    const dotsPending = await page.$$eval('[class*="dot-"]', (els) =>
      els.filter((el) => el.className.includes("dot-pending")).length
    );

    console.log(
      `[dash-check] Status dots: green=${dotsGreen}, red=${dotsRed}, pending=${dotsPending}`
    );

    // -----------------------------------------------------------------------
    // 2. Read group/status texts
    // -----------------------------------------------------------------------
    const groupStatuses = await page.$$eval(".group-status", (els) =>
      els.map((el) => el.textContent.trim())
    );
    console.log(
      `[dash-check] Group statuses (${groupStatuses.length}): ${JSON.stringify(groupStatuses)}`
    );

    // -----------------------------------------------------------------------
    // 3. Read count chips (summary chips per panel)
    // -----------------------------------------------------------------------
    const chipTexts = await page.$$eval(".summary-chip", (els) =>
      els
        .filter((el) => el.style.display !== "none")
        .map((el) => el.textContent.trim())
    );
    console.log(`[dash-check] Visible summary chips: ${JSON.stringify(chipTexts)}`);

    // -----------------------------------------------------------------------
    // 4. Collect ALL category chip and legend chip texts
    //    .category-chip — rendered in scenario cards
    //    .legend-chip   — rendered in the legend bar
    // -----------------------------------------------------------------------
    const rawCategoryChipTexts = await page.$$eval(
      ".category-chip, .legend-chip",
      (els) => els.map((el) => el.textContent.trim())
    );

    // Normalise arrow characters before classification
    const normalisedChipTexts = rawCategoryChipTexts.map(normaliseArrow);

    console.log(
      `[dash-check] Raw category/legend chip texts: ${JSON.stringify(rawCategoryChipTexts)}`
    );

    // Count occurrences of each allowed label
    const categoryChips = {
      "Valid Input": 0,
      "Edge Case": 0,
      "Bad Input -> Error": 0,
    };
    const badLabels = [];

    normalisedChipTexts.forEach((text) => {
      if (categoryChips.hasOwnProperty(text)) {
        categoryChips[text]++;
      } else if (ALLOWED_CATEGORY_CHIPS.has(text)) {
        // Covered by hasOwnProperty above; belt-and-suspenders
        categoryChips[text] = (categoryChips[text] || 0) + 1;
      } else {
        // Any bare legacy label ("golden", "edge", "failure") or unknown value
        if (!badLabels.includes(text)) {
          badLabels.push(text);
        }
      }
    });

    // -----------------------------------------------------------------------
    // 5. Check for "NOT RUN" / "not wired" text presence
    // -----------------------------------------------------------------------
    const bodyText = await page.$eval("body", (el) => el.innerText);
    const hasNotRun = bodyText.includes("NOT RUN") || bodyText.includes("NOT-RUN");
    const hasNotWired = bodyText.toLowerCase().includes("not wired");

    console.log(`[dash-check] "NOT RUN/NOT-RUN" in body: ${hasNotRun}`);
    console.log(`[dash-check] "not wired" in body: ${hasNotWired}`);
    console.log(`[dash-check] console.error count: ${consoleErrors.length}`);
    console.log(`[dash-check] pageerror count: ${pageErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log(`[dash-check] JS errors: ${JSON.stringify(consoleErrors)}`);
    }
    if (pageErrors.length > 0) {
      console.log(`[dash-check] Page errors: ${JSON.stringify(pageErrors)}`);
    }
    if (badLabels.length > 0) {
      console.log(`[dash-check] Bad labels found: ${JSON.stringify(badLabels)}`);
    }

    // -----------------------------------------------------------------------
    // 6. Determine verdict (data-driven — no hardcoded expected totals)
    // -----------------------------------------------------------------------

    // FAIL conditions
    const failReasons = [];

    if (dotsRed > 0) {
      failReasons.push(`red dots present: ${dotsRed}`);
    }
    if (consoleErrors.length > 0) {
      failReasons.push(`JS console errors: ${consoleErrors.length}`);
    }
    if (pageErrors.length > 0) {
      failReasons.push(`page errors: ${pageErrors.length}`);
    }
    if (badLabels.length > 0) {
      failReasons.push(
        `bare legacy/unknown category labels: ${JSON.stringify(badLabels)}`
      );
    }

    // WARN conditions (stub/NOT-RUN acceptable — exit 0)
    const warnReasons = [];
    if (dotsPending > 0) {
      warnReasons.push(`${dotsPending} pending (NOT-RUN) scenarios`);
    }
    if (hasNotRun) {
      warnReasons.push("NOT-RUN text present (cold-start honest stub state)");
    }
    if (hasNotWired) {
      warnReasons.push('"not wired" text present (stub panel)');
    }

    let verdict;
    if (failReasons.length > 0) {
      verdict = "FAIL";
    } else if (warnReasons.length > 0) {
      verdict = "WARN";
    } else {
      verdict = "PASS";
    }

    // -----------------------------------------------------------------------
    // 7. Emit result
    // -----------------------------------------------------------------------
    const result = {
      service: "alert-engine",
      dotsGreen,
      dotsRed,
      dotsPending,
      jsErrors: consoleErrors.length,
      pageErrors: pageErrors.length,
      categoryChips,
      badLabels,
      verdict,
    };

    console.log(""); // blank line before machine-readable output
    emitResult(result);
    console.log("");

    if (verdict === "PASS") {
      console.log(
        `[dash-check] PASS — ${dotsGreen} green, ${dotsRed} red, ${dotsPending} pending; ` +
          `0 JS errors; 0 page errors; category chips valid; no bad labels.`
      );
    } else if (verdict === "WARN") {
      console.log(
        `[dash-check] WARN (exit 0) — stub/NOT-RUN state is acceptable for P1-D. ` +
          warnReasons.join("; ")
      );
    } else {
      console.error(
        `\n[dash-check] FAIL — ${failReasons.join("; ")}`
      );
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(`\n[dash-check] FATAL: ${err.message}`);
  process.exit(1);
});
