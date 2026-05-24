#!/usr/bin/env node
/**
 * dash-check.mjs — Machine-readable health report for the TA Scenario Trust Dashboard.
 *
 * Purpose: An AI agent (or CI pipeline) runs this script to read the LIVE rendered
 * state of dashboard/index.html and receive a structured JSON verdict — without
 * needing screenshots, a running server, or any production credentials.
 *
 * This COMPLEMENTS verify-render.mjs (strict full-green build gate) — it does NOT
 * replace it. verify-render.mjs asserts exact totals and hard-fails on any deviation.
 * dash-check.mjs is data-driven: it reads what IS there and issues PASS / WARN / FAIL
 * based on rules that hold regardless of how many scenarios exist.
 *
 * Usage (from apps/technical-analysis/):
 *   node dashboard/dash-check.mjs
 *
 * Output:
 *   - Exactly ONE machine-readable line:
 *       DASH-CHECK-RESULT: { ...json... }
 *   - A short human-readable summary on stdout.
 *   - Exit 0 on PASS or WARN; non-zero on FAIL.
 *
 * Security contract:
 *   ZERO DB credentials, ZERO API keys in sandbox env at all times.
 *   CGO_ENABLED=0. Dashboard loaded via file:// — no server, no production credentials.
 *   Env audit at startup; aborts if any forbidden variable is set.
 *
 * Playwright resolution: prefers apps/technical-analysis/node_modules/playwright-core.
 * Falls back to apps/frontend/node_modules/playwright-core with a console.warn.
 * Same resolver as verify-render.mjs.
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

// File URL for Chromium to load (no server required)
const PAGE_URL = `file://${INDEX_HTML}`;

// ---------------------------------------------------------------------------
// Security contract — env audit
// ZERO DB credentials, ZERO API keys must be present in the sandbox env.
// ---------------------------------------------------------------------------

const FORBIDDEN_ENV_PATTERNS = [
  /^DB_/i,
  /^DATABASE_/i,
  /^POSTGRES/i,
  /^MYSQL/i,
  /^SQLITE/i,
  /^API_KEY/i,
  /^SECRET/i,
  /^CREDENTIAL/i,
  /^TOKEN.*KEY/i,
];

function auditEnv() {
  const matches = Object.keys(process.env).filter((k) =>
    FORBIDDEN_ENV_PATTERNS.some((re) => re.test(k))
  );
  if (matches.length > 0) {
    console.error(
      `[dash-check] SECURITY ABORT: forbidden env vars detected: ${matches.join(", ")}`
    );
    process.exit(2);
  }
}

auditEnv();

// ---------------------------------------------------------------------------
// Resolve playwright-core — prefer local TA node_modules, fall back to
// frontend node_modules (with a warning).
// REUSES the exact resolver pattern from verify-render.mjs.
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
      "[dash-check] WARNING: using playwright-core from apps/frontend. " +
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
// Known-good category chip labels.
// FAIL if any chip text is not in this set OR if a bare legacy label appears.
// ---------------------------------------------------------------------------

const VALID_CATEGORY_CHIPS = new Set([
  "Valid Input",
  "Edge Case",
  "Bad Input → Error", // "Bad Input → Error" — the → is U+2192
]);

// Legacy labels that must never appear (bare internal category names)
const LEGACY_LABELS = new Set(["golden", "edge", "failure"]);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  // Guard: dist/ and scenario-results.js must exist
  if (!fs.existsSync(DIST_DIR)) {
    console.error(
      `[dash-check] FAIL: dist/ not found at ${DIST_DIR}. Run ./dashboard/build.sh first.`
    );
    process.exit(1);
  }
  if (!fs.existsSync(path.join(DIST_DIR, "scenario-results.js"))) {
    console.error(
      "[dash-check] FAIL: dist/scenario-results.js not found. Run ./dashboard/build.sh first."
    );
    process.exit(1);
  }
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

    // Short settle: let DOMContentLoaded + applyBuildVerdicts + renders complete
    await page.waitForTimeout(500);

    // -----------------------------------------------------------------------
    // 1. Count status dots (class contains "dot-green", "dot-red", "dot-pending")
    // -----------------------------------------------------------------------
    const dotCounts = await page.$$eval('[class*="dot-"]', (els) => {
      let green = 0;
      let red = 0;
      let pending = 0;
      for (const el of els) {
        const cls = el.className || "";
        if (cls.includes("dot-green")) green++;
        else if (cls.includes("dot-red")) red++;
        else if (cls.includes("dot-pending")) pending++;
      }
      return { green, red, pending };
    });

    // -----------------------------------------------------------------------
    // 2. Read all .group-status texts
    // -----------------------------------------------------------------------
    const groupStatuses = await page.$$eval(".group-status", (els) =>
      els.map((el) => el.textContent.trim())
    );

    // -----------------------------------------------------------------------
    // 3. Read count chips (green/red summary-chips per panel)
    //    Reads from known IDs; falls back to 0 if element absent.
    // -----------------------------------------------------------------------
    async function readChipText(id) {
      try {
        return await page.$eval(`#${id}`, (el) => el.textContent.trim());
      } catch {
        return null;
      }
    }

    const primGreenText = await readChipText("prim-green-chip");
    const primRedText = await readChipText("prim-red-chip");
    const modGreenText = await readChipText("mod-green-chip");
    const modRedText = await readChipText("mod-red-chip");
    const svcGreenText = await readChipText("svc-green-chip");
    const svcRedText = await readChipText("svc-red-chip");

    // Parse "N passed" → N; "N failed" → N; null → 0
    function parseChipNum(text) {
      if (!text) return 0;
      const m = text.match(/^(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    }

    const chipCounts = {
      primPassed: parseChipNum(primGreenText),
      primFailed: parseChipNum(primRedText),
      modPassed: parseChipNum(modGreenText),
      modFailed: parseChipNum(modRedText),
      svcPassed: parseChipNum(svcGreenText),
      svcFailed: parseChipNum(svcRedText),
    };

    // -----------------------------------------------------------------------
    // 4. Collect ALL category chip texts (class contains "category-chip")
    //    Count by canonical label; flag unknown/legacy labels.
    // -----------------------------------------------------------------------
    const allCategoryChipTexts = await page.$$eval(
      '[class*="category-chip"]',
      (els) => els.map((el) => el.textContent.trim())
    );

    // Build count map for the 3 valid labels
    const categoryChips = {
      "Valid Input": 0,
      "Edge Case": 0,
      "Bad Input -> Error": 0, // normalized key for JSON output (→ → ->)
    };

    const badLabels = [];

    for (const text of allCategoryChipTexts) {
      // Normalize arrow variants: → (U+2192) or -> to a canonical form for matching
      const normalized = text.replace(/→/g, "->").trim();

      if (normalized === "Valid Input") {
        categoryChips["Valid Input"]++;
      } else if (normalized === "Edge Case") {
        categoryChips["Edge Case"]++;
      } else if (normalized === "Bad Input -> Error") {
        categoryChips["Bad Input -> Error"]++;
      } else {
        // Any other text = either a legacy bare label or unexpected content
        badLabels.push(text);
      }
    }

    // -----------------------------------------------------------------------
    // 5. Check for NOT RUN / "not wired" text in body
    // -----------------------------------------------------------------------
    const bodyText = await page.$eval("body", (el) => el.innerText);
    const hasNotRun = bodyText.includes("NOT RUN");
    const hasNotWired = bodyText.toLowerCase().includes("not wired yet");

    // -----------------------------------------------------------------------
    // 6. Log human-readable summary
    // -----------------------------------------------------------------------
    console.log(
      `[dash-check] Dots: green=${dotCounts.green}, red=${dotCounts.red}, pending=${dotCounts.pending}`
    );
    console.log(
      `[dash-check] Group statuses (${groupStatuses.length}): ${JSON.stringify(groupStatuses)}`
    );
    console.log(
      `[dash-check] Chips — prim: ${primGreenText} / ${primRedText}` +
        ` | mod: ${modGreenText} / ${modRedText}` +
        ` | svc: ${svcGreenText} / ${svcRedText}`
    );
    console.log(
      `[dash-check] Category chips: ${JSON.stringify(categoryChips)}`
    );
    console.log(
      `[dash-check] Bad labels: ${badLabels.length > 0 ? JSON.stringify(badLabels) : "none"}`
    );
    console.log(
      `[dash-check] "NOT RUN" in body: ${hasNotRun} | "not wired yet": ${hasNotWired}`
    );
    console.log(
      `[dash-check] JS errors: ${consoleErrors.length} | Page errors: ${pageErrors.length}`
    );

    // -----------------------------------------------------------------------
    // 7. Determine verdict (data-driven — no hardcoded expected totals)
    //
    //    FAIL if:
    //      - any red dot > 0
    //      - any JS console error
    //      - any page error
    //      - any bare legacy label ("golden" / "edge" / "failure") appears
    //        as a category chip text
    //      - any category chip text is not one of the 3 valid labels
    //
    //    WARN (exit 0) if:
    //      - pending dots > 0 OR "NOT RUN" present, but no FAIL condition
    //
    //    PASS (exit 0) otherwise.
    // -----------------------------------------------------------------------

    const failReasons = [];

    if (dotCounts.red > 0) {
      failReasons.push(`${dotCounts.red} red dot(s) — scenario(s) failed`);
    }
    if (consoleErrors.length > 0) {
      failReasons.push(
        `${consoleErrors.length} JS console error(s): ${consoleErrors.slice(0, 2).join("; ")}`
      );
    }
    if (pageErrors.length > 0) {
      failReasons.push(
        `${pageErrors.length} page error(s): ${pageErrors.slice(0, 2).join("; ")}`
      );
    }
    if (badLabels.length > 0) {
      failReasons.push(
        `${badLabels.length} invalid category chip label(s): ${JSON.stringify(badLabels)}`
      );
    }

    let verdict;
    if (failReasons.length > 0) {
      verdict = "FAIL";
    } else if (dotCounts.pending > 0 || hasNotRun || hasNotWired) {
      verdict = "WARN";
    } else {
      verdict = "PASS";
    }

    // -----------------------------------------------------------------------
    // 8. Emit the single machine-readable result line
    // -----------------------------------------------------------------------
    const result = {
      service: "technical-analysis",
      dotsGreen: dotCounts.green,
      dotsRed: dotCounts.red,
      dotsPending: dotCounts.pending,
      jsErrors: consoleErrors.length,
      pageErrors: pageErrors.length,
      categoryChips,
      badLabels,
      verdict,
    };

    console.log(`\nDASH-CHECK-RESULT: ${JSON.stringify(result)}`);

    // -----------------------------------------------------------------------
    // 9. Human-readable summary + exit code
    // -----------------------------------------------------------------------
    if (verdict === "PASS") {
      console.log(
        `\n[dash-check] PASS — ${dotCounts.green} green dot(s), 0 red, 0 pending, ` +
          `0 JS errors, all category chips valid, no legacy labels.`
      );
    } else if (verdict === "WARN") {
      const warnReasons = [];
      if (dotCounts.pending > 0) warnReasons.push(`${dotCounts.pending} pending dot(s)`);
      if (hasNotRun) warnReasons.push('"NOT RUN" text present');
      if (hasNotWired) warnReasons.push('"not wired yet" text present');
      console.log(
        `\n[dash-check] WARN (exit 0) — ${warnReasons.join("; ")}. No red dots or JS errors.`
      );
    } else {
      // FAIL
      console.error(`\n[dash-check] FAIL — ${failReasons.length} issue(s):`);
      for (const r of failReasons) {
        console.error(`  - ${r}`);
      }
      await browser.close();
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
