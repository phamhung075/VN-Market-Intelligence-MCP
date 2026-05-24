#!/usr/bin/env node
/**
 * dash-check.mjs — Machine-readable health check for the macro-indicators
 * Scenario Trust Dashboard.
 *
 * Loads dashboard/index.html via file:// URL in headless Chromium, reads the
 * live rendered DOM, and emits ONE structured JSON line an AI (or CI) can parse
 * to verify the dashboard WITHOUT screenshots.
 *
 * Verdict rules (data-driven — no hardcoded expected totals):
 *   FAIL  — any dotsRed > 0, jsErrors > 0, pageErrors > 0, or any bare legacy
 *            label ("golden"/"edge"/"failure") appears as a category chip text,
 *            or any chip text is not in {"Valid Input","Edge Case","Bad Input → Error"}
 *   WARN  — pending/NOT-RUN present but no red/errors (exit 0)
 *   PASS  — all dots green, zero errors, zero bad labels (exit 0)
 *
 * Output (exactly one machine-readable line + human summary):
 *   DASH-CHECK-RESULT: {"service":"macro-indicators","dotsGreen":N,...,"verdict":"PASS|WARN|FAIL"}
 *
 * Security contract (verbatim):
 *   ZERO DB credentials, ZERO API keys in sandbox env at all times;
 *   CGO_ENABLED=0; env audit must return empty; file:// must work with no
 *   server and no production credentials.
 *
 * Usage (from apps/macro-indicators/):
 *   node dashboard/dash-check.mjs
 */

import { createRequire } from "module";
import { fileURLToPath }  from "url";
import path               from "path";
import fs                 from "fs";

// ---------------------------------------------------------------------------
// Path resolution — derive everything from this script's location.
// NEVER hardcode machine-specific absolute paths.
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// __dirname  = apps/macro-indicators/dashboard/
const DASHBOARD_DIR = __dirname;
const APP_ROOT      = path.resolve(DASHBOARD_DIR, "..");   // apps/macro-indicators/
const APPS_DIR      = path.resolve(APP_ROOT, "..");        // apps/
const INDEX_HTML    = path.join(DASHBOARD_DIR, "index.html");

// file:// URL — Chromium loads static asset with no server required
const PAGE_URL = `file://${INDEX_HTML}`;

// ---------------------------------------------------------------------------
// Security env audit
// Fail loud if any DB credential or API key leaks into the environment.
// ---------------------------------------------------------------------------

const FORBIDDEN_ENV_KEYS = [
  "DB_PASSWORD", "DATABASE_URL", "POSTGRES_PASSWORD",
  "FRED_API_KEY", "API_KEY", "SECRET_KEY", "JWT_SECRET",
];

function auditEnv() {
  const leaks = FORBIDDEN_ENV_KEYS.filter(
    (k) => typeof process.env[k] === "string" && process.env[k].length > 0
  );
  if (leaks.length > 0) {
    console.error(
      `[dash-check] SECURITY VIOLATION: forbidden env vars present: ${leaks.join(", ")}`
    );
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Resolve playwright-core
//   Priority 1: apps/macro-indicators/node_modules/playwright-core  (local)
//   Priority 2: apps/technical-analysis/node_modules/playwright-core (sibling TS app)
//   Priority 3: apps/frontend/node_modules/playwright-core           (cross-zone fallback)
// playwright-core is CommonJS → import via createRequire.
// ---------------------------------------------------------------------------

function resolvePlaywrightCore() {
  const candidates = [
    {
      label: "local (apps/macro-indicators)",
      p: path.join(APP_ROOT, "node_modules", "playwright-core"),
    },
    {
      label: "apps/technical-analysis",
      p: path.join(APPS_DIR, "technical-analysis", "node_modules", "playwright-core"),
      warn: "[dash-check] WARNING: using playwright-core from apps/technical-analysis. " +
            "Run `bun add -d playwright-core` in apps/macro-indicators/ to fix.",
    },
    {
      label: "apps/frontend",
      p: path.join(APPS_DIR, "frontend", "node_modules", "playwright-core"),
      warn: "[dash-check] WARNING: using playwright-core from apps/frontend. " +
            "Run `bun add -d playwright-core` in apps/macro-indicators/ to fix.",
    },
  ];

  for (const c of candidates) {
    if (fs.existsSync(path.join(c.p, "package.json"))) {
      if (c.warn) console.warn(c.warn);
      return c.p;
    }
  }

  throw new Error(
    "playwright-core not found in any candidate path. " +
    "Install it: cd apps/macro-indicators && bun add -d playwright-core"
  );
}

const pwCorePath = resolvePlaywrightCore();
const require    = createRequire(import.meta.url);
const { chromium } = require(path.join(pwCorePath, "index.js"));

// ---------------------------------------------------------------------------
// Valid category chip labels (task spec + Unicode arrow variant)
// ---------------------------------------------------------------------------

const VALID_CHIP_LABELS = new Set([
  "Valid Input",
  "Edge Case",
  "Bad Input -> Error",   // ASCII arrow (task spec)
  "Bad Input → Error",    // Unicode arrow (actual HTML catLabel() output)
]);

const LEGACY_BARE_LABELS = new Set(["golden", "edge", "failure"]);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  auditEnv();

  if (!fs.existsSync(INDEX_HTML)) {
    console.error(`[dash-check] FATAL: index.html not found at ${INDEX_HTML}`);
    process.exit(1);
  }

  console.log("[dash-check] Launching headless Chromium...");
  console.log(`[dash-check] Loading: ${PAGE_URL}`);

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  const consoleErrors = [];
  const pageErrors    = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  try {
    await page.goto(PAGE_URL, { waitUntil: "networkidle" });
    // Let DOMContentLoaded + renderPrimitivesPanel/renderModulePanel/renderServicePanel complete
    await page.waitForTimeout(600);

    // -----------------------------------------------------------------------
    // 1. Status dots
    // -----------------------------------------------------------------------
    const dotsGreen   = await page.$$eval(
      ".scenario-status-dot.dot-green",
      (els) => els.length
    );
    const dotsRed     = await page.$$eval(
      ".scenario-status-dot.dot-red",
      (els) => els.length
    );
    const dotsPending = await page.$$eval(
      ".scenario-status-dot.dot-pending",
      (els) => els.length
    );

    console.log(`[dash-check] Dots: green=${dotsGreen}, red=${dotsRed}, pending=${dotsPending}`);

    // -----------------------------------------------------------------------
    // 2. Group status labels (.group-status in primitive groups)
    // -----------------------------------------------------------------------
    const groupStatuses = await page.$$eval(
      ".group-status",
      (els) => els.map((el) => el.textContent.trim())
    );
    console.log(`[dash-check] Group statuses: ${JSON.stringify(groupStatuses)}`);

    // -----------------------------------------------------------------------
    // 3. Category chip texts
    // -----------------------------------------------------------------------
    const chipTexts = await page.$$eval(
      ".category-chip",
      (els) => els.map((el) => el.textContent.trim())
    );
    console.log(`[dash-check] Category chip texts: ${JSON.stringify(chipTexts)}`);

    // Count valid chip labels
    const categoryChipCounts = {
      "Valid Input":         0,
      "Edge Case":           0,
      "Bad Input -> Error":  0,
    };
    const badLabels = [];

    for (const text of chipTexts) {
      if (text === "Valid Input") {
        categoryChipCounts["Valid Input"]++;
      } else if (text === "Edge Case") {
        categoryChipCounts["Edge Case"]++;
      } else if (text === "Bad Input -> Error" || text === "Bad Input → Error") {
        // Unicode → is what catLabel() actually renders; normalise into the ASCII key
        categoryChipCounts["Bad Input -> Error"]++;
      } else {
        badLabels.push(text);
      }
    }

    // -----------------------------------------------------------------------
    // 4. NOT-RUN / not wired text presence
    // -----------------------------------------------------------------------
    const bodyText    = await page.$eval("body", (el) => el.innerText);
    const hasNotRun   = bodyText.includes("NOT-RUN") || bodyText.includes("NOT RUN");
    const hasNotWired = bodyText.toLowerCase().includes("not wired");

    console.log(`[dash-check] "NOT-RUN" in body: ${hasNotRun}`);
    console.log(`[dash-check] "not wired" in body: ${hasNotWired}`);
    console.log(`[dash-check] console.error count: ${consoleErrors.length}`);
    console.log(`[dash-check] pageerror count:     ${pageErrors.length}`);
    console.log(`[dash-check] badLabels:            ${JSON.stringify(badLabels)}`);

    // -----------------------------------------------------------------------
    // 5. Verdict
    // -----------------------------------------------------------------------
    let verdict = "PASS";

    if (
      dotsRed > 0 ||
      consoleErrors.length > 0 ||
      pageErrors.length > 0 ||
      badLabels.length > 0
    ) {
      verdict = "FAIL";
    } else if (dotsPending > 0 || hasNotRun) {
      verdict = "WARN";
    }

    // -----------------------------------------------------------------------
    // 6. Emit machine-readable result line
    // -----------------------------------------------------------------------
    const result = {
      service:       "macro-indicators",
      dotsGreen,
      dotsRed,
      dotsPending,
      jsErrors:      consoleErrors.length,
      pageErrors:    pageErrors.length,
      categoryChips: categoryChipCounts,
      badLabels,
      verdict,
    };

    console.log(`\nDASH-CHECK-RESULT: ${JSON.stringify(result)}`);

    // Human-readable summary
    if (verdict === "PASS") {
      console.log(
        `\n[dash-check] PASS — ${dotsGreen} dot-green, ${dotsRed} dot-red, ` +
        `${dotsPending} dot-pending, 0 JS errors, 0 bad labels.`
      );
    } else if (verdict === "WARN") {
      console.log(
        `\n[dash-check] WARN (exit 0) — ${dotsPending} pending/NOT-RUN present ` +
        `but no red dots or JS errors. Dashboard renders correctly; sandbox not yet run.`
      );
    } else {
      // FAIL — build a human-readable reason list
      const reasons = [];
      if (dotsRed > 0)               reasons.push(`${dotsRed} red dot(s)`);
      if (consoleErrors.length > 0)  reasons.push(`${consoleErrors.length} JS console error(s): ${consoleErrors.slice(0,3).join("; ")}`);
      if (pageErrors.length > 0)     reasons.push(`${pageErrors.length} page error(s): ${pageErrors.slice(0,3).join("; ")}`);
      if (badLabels.length > 0)      reasons.push(`bad category chip labels: ${JSON.stringify(badLabels)}`);
      console.error(`\n[dash-check] FAIL — ${reasons.join(" | ")}`);
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
