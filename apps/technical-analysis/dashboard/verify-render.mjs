#!/usr/bin/env node
/**
 * verify-render.mjs — Headless browser render check for the TA Scenario Trust Dashboard.
 *
 * Loads dashboard/index.html via file:// URL in headless Chromium, reads the live
 * rendered DOM, and asserts the full-green state:
 *   - 33 dot-green (25 primitive + 5 module + 3 service), 0 dot-red, 0 dot-pending
 *   - All .group-status labels read "PASSED"
 *   - Count chips: "25 passed" (primitives), "5 passed" (module), "3 passed" (service)
 *   - Zero console.error / pageerror events
 *   - No "NOT RUN" text anywhere in <body>
 *   - No "not wired" text in <body>
 *
 * Exit 0 on pass. Non-zero + clear message on fail.
 * Writes dashboard/dist/render-check.png as evidence screenshot.
 *
 * Usage (from apps/technical-analysis/):
 *   node dashboard/verify-render.mjs
 *
 * Playwright resolution: playwright-core installed as devDependency of the
 * technical-analysis package (apps/technical-analysis/node_modules/playwright-core).
 * Chromium is the system ms-playwright cache already installed by playwright.
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Path resolution — derive everything from this script's location.
// NEVER hardcode machine-specific absolute paths.
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// __dirname = apps/technical-analysis/dashboard/
const DASHBOARD_DIR = __dirname;
const TA_ROOT = path.resolve(DASHBOARD_DIR, "..");
const INDEX_HTML = path.join(DASHBOARD_DIR, "index.html");
const DIST_DIR = path.join(DASHBOARD_DIR, "dist");
const SCREENSHOT_PATH = path.join(DIST_DIR, "render-check.png");

// File URL for Chromium to load
const PAGE_URL = `file://${INDEX_HTML}`;

// ---------------------------------------------------------------------------
// Resolve playwright-core — prefer local TA node_modules, fall back to
// frontend node_modules (with a warning).
// ---------------------------------------------------------------------------

function resolvePlaywrightCore() {
  const localPath = path.join(TA_ROOT, "node_modules", "playwright-core");
  if (fs.existsSync(path.join(localPath, "package.json"))) {
    return localPath;
  }
  // Cross-zone fallback — warn but allow for CI bootstrapping
  const frontendPath = path.resolve(
    TA_ROOT,
    "..",
    "frontend",
    "node_modules",
    "playwright-core"
  );
  if (fs.existsSync(path.join(frontendPath, "package.json"))) {
    console.warn(
      "[verify-render] WARNING: using playwright-core from apps/frontend. " +
        "Run `bun add -d playwright-core` in apps/technical-analysis/ to fix."
    );
    return frontendPath;
  }
  throw new Error(
    "playwright-core not found. " +
      "Install it: cd apps/technical-analysis && bun add -d playwright-core"
  );
}

const pwCorePath = resolvePlaywrightCore();
// playwright-core is CommonJS — use createRequire to import from resolved path.
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
  // Guard: dist/ must exist (build.sh must have run first)
  if (!fs.existsSync(DIST_DIR)) {
    fail(
      `dist/ directory not found at ${DIST_DIR}. Run ./dashboard/build.sh first.`
    );
  }
  if (!fs.existsSync(path.join(DIST_DIR, "scenario-results.js"))) {
    fail(
      `dist/scenario-results.js not found. Run ./dashboard/build.sh first.`
    );
  }
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

    // Short settle: let DOMContentLoaded + applyBuildVerdicts + renders complete
    await page.waitForTimeout(500);

    // -----------------------------------------------------------------------
    // 1. Read count chips
    // -----------------------------------------------------------------------
    const chips = await page.$$eval('[class*="chip"]', (els) =>
      els
        .filter((el) => {
          const cls = el.className || "";
          return (
            cls.includes("chip-green") ||
            cls.includes("chip-red") ||
            cls.includes("summary-chip")
          );
        })
        .map((el) => ({ cls: el.className, text: el.textContent.trim() }))
    );

    const primGreenChip = await page.$eval("#prim-green-chip", (el) =>
      el.textContent.trim()
    );
    const primRedChip = await page.$eval("#prim-red-chip", (el) =>
      el.textContent.trim()
    );
    const modGreenChip = await page.$eval("#mod-green-chip", (el) =>
      el.textContent.trim()
    );
    const modRedChip = await page.$eval("#mod-red-chip", (el) =>
      el.textContent.trim()
    );
    const svcGreenChip = await page.$eval("#svc-green-chip", (el) =>
      el.textContent.trim()
    );
    const svcRedChip = await page.$eval("#svc-red-chip", (el) =>
      el.textContent.trim()
    );

    console.log(
      `[verify-render] Primitives chip: green="${primGreenChip}", red="${primRedChip}"`
    );
    console.log(
      `[verify-render] Module chip:     green="${modGreenChip}", red="${modRedChip}"`
    );
    console.log(
      `[verify-render] Service chip:    green="${svcGreenChip}", red="${svcRedChip}"`
    );

    // -----------------------------------------------------------------------
    // 2. Read .group-status labels
    // -----------------------------------------------------------------------
    const groupStatuses = await page.$$eval(".group-status", (els) =>
      els.map((el) => el.textContent.trim())
    );
    console.log(`[verify-render] Group statuses: ${JSON.stringify(groupStatuses)}`);

    // -----------------------------------------------------------------------
    // 3. Count status dots
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
    // 4. Check for stale / stub text
    // -----------------------------------------------------------------------
    const bodyText = await page.$eval("body", (el) => el.innerText);
    const hasNotRun = bodyText.includes("NOT RUN");
    const hasNotWired = bodyText.toLowerCase().includes("not wired yet");

    console.log(`[verify-render] "NOT RUN" in body: ${hasNotRun}`);
    console.log(`[verify-render] "not wired yet" in body: ${hasNotWired}`);
    console.log(
      `[verify-render] console.error count: ${consoleErrors.length}`
    );
    console.log(`[verify-render] pageerror count: ${pageErrors.length}`);

    // -----------------------------------------------------------------------
    // 5. Screenshot for evidence
    // -----------------------------------------------------------------------
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    console.log(`[verify-render] Screenshot saved: ${SCREENSHOT_PATH}`);

    // -----------------------------------------------------------------------
    // 6. Assertions
    // -----------------------------------------------------------------------
    assert(
      primGreenChip === "25 passed",
      `Expected primitives chip "25 passed", got "${primGreenChip}"`
    );
    assert(
      primRedChip === "0 failed",
      `Expected primitives red chip "0 failed", got "${primRedChip}"`
    );
    assert(
      modGreenChip === "5 passed",
      `Expected module chip "5 passed", got "${modGreenChip}"`
    );
    assert(
      modRedChip === "0 failed",
      `Expected module red chip "0 failed", got "${modRedChip}"`
    );
    assert(
      svcGreenChip === "3 passed",
      `Expected service chip "3 passed", got "${svcGreenChip}"`
    );
    assert(
      svcRedChip === "0 failed",
      `Expected service red chip "0 failed", got "${svcRedChip}"`
    );

    assert(
      groupStatuses.length > 0,
      "No .group-status elements found — primitives panel may not have rendered"
    );
    const nonPassedGroups = groupStatuses.filter((s) => s !== "PASSED");
    assert(
      nonPassedGroups.length === 0,
      `Not all group statuses are PASSED. Found: ${JSON.stringify(nonPassedGroups)}`
    );

    assert(
      dotGreenCount === 33,
      `Expected 33 dot-green (25 primitive + 5 module + 3 service), got ${dotGreenCount}`
    );
    assert(
      dotRedCount === 0,
      `Expected 0 dot-red, got ${dotRedCount}`
    );
    assert(
      dotPendingCount === 0,
      `Expected 0 dot-pending, got ${dotPendingCount}`
    );

    assert(
      !hasNotRun,
      '"NOT RUN" text found in body — some scenarios have not been run'
    );

    assert(
      !hasNotWired,
      '"not wired yet" text found in body — Level 3 stub text not removed'
    );

    assert(
      consoleErrors.length === 0,
      `JS console errors detected (${consoleErrors.length}):\n  ${consoleErrors.join("\n  ")}`
    );

    assert(
      pageErrors.length === 0,
      `Page errors detected (${pageErrors.length}):\n  ${pageErrors.join("\n  ")}`
    );

    console.log(
      "\n[verify-render] PASS — 33 dot-green (L1:25 + L2:5 + L3:3), 0 dot-red, 0 dot-pending, " +
        "0 JS errors, all groups PASSED, no NOT RUN text, no 'not wired' text."
    );
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(`\n[verify-render] FATAL: ${err.message}`);
  process.exit(1);
});
