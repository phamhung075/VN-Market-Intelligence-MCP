#!/usr/bin/env node
/**
 * capture-recheck.mjs — Capture screenshot of the live-vs-db-recheck dashboard.
 *
 * Usage (from apps/stock-price/):
 *   node dashboard/capture-recheck.mjs
 *
 * Output:
 *   apps/stock-price/dashboard/recheck-live-vs-db.png
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DASHBOARD_DIR = __dirname;
const SP_ROOT = path.resolve(DASHBOARD_DIR, "..");
const RECHECK_HTML = path.join(DASHBOARD_DIR, "live-vs-db-recheck.html");
const OUTPUT_PNG = path.join(DASHBOARD_DIR, "recheck-live-vs-db.png");

const PAGE_URL = `file://${RECHECK_HTML}`;

function resolvePlaywrightCore() {
  const localPath = path.join(SP_ROOT, "node_modules", "playwright-core");
  if (fs.existsSync(path.join(localPath, "package.json"))) {
    return localPath;
  }

  const frontendPath = path.resolve(
    SP_ROOT,
    "..",
    "frontend",
    "node_modules",
    "playwright-core"
  );
  if (fs.existsSync(path.join(frontendPath, "package.json"))) {
    console.warn(
      "[capture-recheck] WARNING: using playwright-core from apps/frontend."
    );
    return frontendPath;
  }

  throw new Error(
    "playwright-core not found. " +
      "Install: cd apps/frontend && bun add -d playwright-core"
  );
}

const pwCorePath = resolvePlaywrightCore();
const require = createRequire(import.meta.url);
const pwCore = require(path.join(pwCorePath, "index.js"));
const { chromium } = pwCore;

async function run() {
  if (!fs.existsSync(RECHECK_HTML)) {
    console.error(`[capture-recheck] FAIL: ${RECHECK_HTML} not found`);
    process.exit(1);
  }

  console.log("[capture-recheck] Launching headless Chromium...");
  console.log(`[capture-recheck] Loading: ${PAGE_URL}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 }
  });

  try {
    await page.goto(PAGE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    // Capture full page screenshot
    await page.screenshot({
      path: OUTPUT_PNG,
      fullPage: true
    });

    console.log(`[capture-recheck] Screenshot saved: ${OUTPUT_PNG}`);

    // Also output a machine-readable result
    const rows = await page.$$eval("#recheck-tbody tr", (trs) =>
      trs.map((tr) => {
        const cells = tr.querySelectorAll("td");
        return {
          code: cells[1]?.textContent?.trim() || "",
          dbClose: cells[2]?.textContent?.trim() || "",
          apiClose: cells[3]?.textContent?.trim() || "",
          delta: cells[4]?.textContent?.trim() || "",
          match: cells[5]?.textContent?.trim() || ""
        };
      })
    );

    const passCount = rows.filter((r) => r.match === "MATCH").length;
    const failCount = rows.filter((r) => r.match === "MISMATCH").length;

    console.log("\n[capture-recheck] Summary:");
    console.log(`  Total tickers: ${rows.length}`);
    console.log(`  Matched: ${passCount}`);
    console.log(`  Mismatched: ${failCount}`);
    console.log(`  Verdict: ${failCount === 0 ? "ALL GREEN" : "HAS FAILURES"}`);

    await browser.close();
    process.exit(0);
  } catch (err) {
    await browser.close();
    console.error(`\n[capture-recheck] FATAL: ${err.message}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(`\n[capture-recheck] FATAL: ${err.message}`);
  process.exit(1);
});
