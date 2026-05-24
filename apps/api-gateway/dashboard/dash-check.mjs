#!/usr/bin/env node
/**
 * dash-check.mjs — Machine-readable health check for the api-gateway
 * Scenario Trust Dashboard.
 *
 * Loads dashboard/index.html via file:// URL in headless Chromium, reads the
 * live rendered DOM, and emits ONE structured JSON line an AI (or CI) can parse
 * to verify the dashboard WITHOUT screenshots.
 *
 * Verdict rules (data-driven — no hardcoded expected totals):
 *   FAIL  — any dotsRed > 0, jsErrors > 0, pageErrors > 0,
 *            or panels missing (panelCount < 3), or any bare legacy
 *            label ("golden"/"edge"/"failure") appears as category chip text
 *            outside the valid set.
 *   WARN  — pending dots present but no red/errors (exit 0)
 *   PASS  — dotsRed=0, jsErrors=0, pageErrors=0, panelCount=3 (exit 0)
 *
 * Output (exactly one machine-readable line + human summary):
 *   DASH-CHECK-RESULT: {"service":"api-gateway","panelCount":3,...,"verdict":"PASS|WARN|FAIL"}
 *
 * Security contract (verbatim from charter):
 *   ZERO DB credentials, ZERO API keys in sandbox env at all times;
 *   CGO_ENABLED=0; env audit must return empty; file:// must work with no
 *   server and no production credentials.
 *
 * Usage (from apps/api-gateway/):
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

// __dirname  = apps/api-gateway/dashboard/
const DASHBOARD_DIR = __dirname;
const APP_ROOT      = path.resolve(DASHBOARD_DIR, "..");   // apps/api-gateway/
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
//   Priority 1: apps/api-gateway/node_modules/playwright-core  (local)
//   Priority 2: apps/technical-analysis/node_modules/playwright-core (sibling TS app)
//   Priority 3: apps/macro-indicators/node_modules/playwright-core   (sibling Go app)
//   Priority 4: apps/frontend/node_modules/playwright-core           (cross-zone fallback)
// playwright-core is CommonJS → import via createRequire.
// ---------------------------------------------------------------------------

function resolvePlaywrightCore() {
  const candidates = [
    {
      label: "local (apps/api-gateway)",
      p: path.join(APP_ROOT, "node_modules", "playwright-core"),
    },
    {
      label: "apps/technical-analysis",
      p: path.join(APPS_DIR, "technical-analysis", "node_modules", "playwright-core"),
      warn: "[dash-check] WARNING: using playwright-core from apps/technical-analysis. " +
            "Run `npm install playwright-core` in apps/api-gateway/ to fix.",
    },
    {
      label: "apps/macro-indicators",
      p: path.join(APPS_DIR, "macro-indicators", "node_modules", "playwright-core"),
      warn: "[dash-check] WARNING: using playwright-core from apps/macro-indicators. " +
            "Run `npm install playwright-core` in apps/api-gateway/ to fix.",
    },
    {
      label: "apps/frontend",
      p: path.join(APPS_DIR, "frontend", "node_modules", "playwright-core"),
      warn: "[dash-check] WARNING: using playwright-core from apps/frontend. " +
            "Run `npm install playwright-core` in apps/api-gateway/ to fix.",
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
    "Install it: cd apps/api-gateway && npm install playwright-core"
  );
}

const pwCorePath = resolvePlaywrightCore();
const require    = createRequire(import.meta.url);
const { chromium } = require(path.join(pwCorePath, "index.js"));

// ---------------------------------------------------------------------------
// Valid category chip labels for api-gateway dashboard
// Fixture chips are valid (intentional-failure fixtures shown as FIXTURE).
// ---------------------------------------------------------------------------

const VALID_CHIP_LABELS = new Set([
  "Valid Input",
  "Edge Case",
  "Failure Scenario",
  "Fixture",
]);

const LEGACY_BARE_LABELS = new Set(["golden", "edge", "failure", "fixture"]);

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
    // Allow DOMContentLoaded + renderPrimitivesPanel/renderModulePanel/renderServicePanel to complete
    await page.waitForTimeout(600);

    // -----------------------------------------------------------------------
    // 1. Panel count — must be exactly 3 (Primitives / Module / Microservice)
    // -----------------------------------------------------------------------
    const panelCount = await page.$$eval(".level-panel", (els) => els.length);
    console.log(`[dash-check] Panel count: ${panelCount} (expected 3)`);

    // -----------------------------------------------------------------------
    // 2. Status dots
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
    // 3. Scenario cards — total count
    // -----------------------------------------------------------------------
    const cardCount = await page.$$eval(
      ".scenario-card, .module-card-header",
      (els) => els.length
    );
    console.log(`[dash-check] Card count (scenario-card + module-card-header): ${cardCount}`);

    // -----------------------------------------------------------------------
    // 4. Per-card status (scenario name + dot class)
    // -----------------------------------------------------------------------
    const cardDetails = await page.$$eval(
      ".scenario-card",
      (els) => els.map((el) => {
        const nameEl = el.querySelector(".scenario-name");
        const dotEl  = el.querySelector(".scenario-status-dot");
        return {
          name:   nameEl ? nameEl.textContent.trim() : "(unknown)",
          dotCls: dotEl  ? dotEl.className           : "",
        };
      })
    );

    const moduleCardDetails = await page.$$eval(
      ".module-card-header",
      (els) => els.map((el) => {
        const nameEl = el.querySelector(".module-card-title");
        const dotEl  = el.querySelector(".scenario-status-dot");
        return {
          name:   nameEl ? nameEl.textContent.trim() : "(unknown)",
          dotCls: dotEl  ? dotEl.className           : "",
        };
      })
    );

    const allCards = cardDetails.concat(moduleCardDetails);
    console.log(`[dash-check] Per-card status:`);
    allCards.forEach((c) => {
      const isGreen   = c.dotCls.includes("dot-green");
      const isRed     = c.dotCls.includes("dot-red");
      const isPending = c.dotCls.includes("dot-pending");
      const label     = isGreen ? "PASS" : (isRed ? "FAIL" : "pending");
      console.log(`  - ${c.name}: ${label}`);
    });

    // -----------------------------------------------------------------------
    // 5. Group status labels (.group-status in primitive groups)
    // -----------------------------------------------------------------------
    const groupStatuses = await page.$$eval(
      ".group-status",
      (els) => els.map((el) => el.textContent.trim())
    );
    console.log(`[dash-check] Group statuses: ${JSON.stringify(groupStatuses)}`);

    // -----------------------------------------------------------------------
    // 6. Category chip texts — validate against allowed set
    // -----------------------------------------------------------------------
    const chipTexts = await page.$$eval(
      ".category-chip",
      (els) => els.map((el) => el.textContent.trim())
    );
    console.log(`[dash-check] Category chip texts: ${JSON.stringify(chipTexts)}`);

    const chipCounts = {
      "Valid Input":      0,
      "Edge Case":        0,
      "Failure Scenario": 0,
      "Fixture":          0,
    };
    const badLabels = [];

    for (const text of chipTexts) {
      if (chipCounts[text] !== undefined) {
        chipCounts[text]++;
      } else {
        badLabels.push(text);
      }
    }

    // -----------------------------------------------------------------------
    // 7. Console / page errors
    // -----------------------------------------------------------------------
    console.log(`[dash-check] console.error count: ${consoleErrors.length}`);
    console.log(`[dash-check] pageerror count:     ${pageErrors.length}`);
    console.log(`[dash-check] badLabels:            ${JSON.stringify(badLabels)}`);

    // -----------------------------------------------------------------------
    // 8. Verdict
    // -----------------------------------------------------------------------
    let verdict = "PASS";

    if (
      dotsRed > 0             ||
      consoleErrors.length > 0 ||
      pageErrors.length > 0   ||
      badLabels.length > 0    ||
      panelCount !== 3
    ) {
      verdict = "FAIL";
    } else if (dotsPending > 0) {
      verdict = "WARN";
    }

    // -----------------------------------------------------------------------
    // 9. Emit machine-readable result line
    // -----------------------------------------------------------------------
    const result = {
      service:      "api-gateway",
      panelCount,
      cardCount,
      dotsGreen,
      dotsRed,
      dotsPending,
      jsErrors:     consoleErrors.length,
      pageErrors:   pageErrors.length,
      categoryChips: chipCounts,
      badLabels,
      groupStatuses,
      verdict,
    };

    console.log(`\nDASH-CHECK-RESULT: ${JSON.stringify(result)}`);

    // Human-readable summary
    if (verdict === "PASS") {
      console.log(
        `\n[dash-check] PASS — panels=${panelCount}, cards=${cardCount}, ` +
        `green=${dotsGreen}, red=${dotsRed}, pending=${dotsPending}, ` +
        `0 JS errors, 0 bad labels.`
      );
    } else if (verdict === "WARN") {
      console.log(
        `\n[dash-check] WARN (exit 0) — ${dotsPending} pending dot(s) present ` +
        `but no red dots or JS errors. Dashboard renders correctly.`
      );
    } else {
      const reasons = [];
      if (panelCount !== 3)          reasons.push(`panelCount=${panelCount} (expected 3)`);
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
