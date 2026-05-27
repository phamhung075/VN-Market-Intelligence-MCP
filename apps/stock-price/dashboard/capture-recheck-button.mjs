#!/usr/bin/env node
/**
 * capture-recheck-button.mjs — Capture screenshot of main dashboard with new "Open Live-vs-DB Recheck" button.
 *
 * Usage (from apps/stock-price/):
 *   node dashboard/capture-recheck-button.mjs
 *
 * Output: apps/stock-price/dashboard/index-with-recheck-button.png
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DASHBOARD_DIR = __dirname;
const SP_ROOT = path.resolve(DASHBOARD_DIR, "..");
const INDEX_HTML = path.join(DASHBOARD_DIR, "index.html");
const OUTPUT_PNG = path.join(DASHBOARD_DIR, "index-with-recheck-button.png");
const PAGE_URL = `file://${INDEX_HTML}`;

// Resolve playwright-core (same pattern as dash-check.mjs)
function resolvePlaywrightCore() {
  const localPath = path.join(SP_ROOT, "node_modules", "playwright-core");
  if (fs.existsSync(path.join(localPath, "package.json"))) {
    return localPath;
  }
  const frontendPath = path.resolve(SP_ROOT, "..", "frontend", "node_modules", "playwright-core");
  if (fs.existsSync(path.join(frontendPath, "package.json"))) {
    console.warn("[capture] WARNING: using playwright-core from apps/frontend.");
    return frontendPath;
  }
  throw new Error("playwright-core not found.");
}

const pwCorePath = resolvePlaywrightCore();
const require = createRequire(import.meta.url);
const pwCore = require(path.join(pwCorePath, "index.js"));
const { chromium } = pwCore;

async function main() {
  console.log("[capture] Launching headless Chromium...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  console.log(`[capture] Loading ${PAGE_URL}`);
  await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });

  // Wait for header to render
  await page.waitForSelector("header h1", { timeout: 5000 });

  // Check if the button exists
  const button = await page.$("a.open-recheck-btn");
  if (!button) {
    console.error("[capture] FAIL: Button 'Open Live-vs-DB Recheck' not found.");
    await browser.close();
    process.exit(1);
  }

  const buttonText = await button.textContent();
  const buttonHref = await button.getAttribute("href");
  console.log(`[capture] Found button: text="${buttonText}", href="${buttonHref}"`);

  // Verify link target resolves (file exists in same directory)
  const targetPath = path.join(DASHBOARD_DIR, buttonHref);
  if (!fs.existsSync(targetPath)) {
    console.error(`[capture] FAIL: Link target "${buttonHref}" does not exist at ${targetPath}`);
    await browser.close();
    process.exit(1);
  }
  console.log(`[capture] Link target verified: ${targetPath}`);

  // Capture screenshot of header area (top 450px)
  await page.screenshot({ path: OUTPUT_PNG, clip: { x: 0, y: 0, width: 1400, height: 450 } });
  console.log(`[capture] Screenshot saved: ${OUTPUT_PNG}`);

  await browser.close();
  console.log("[capture] PASS: Button renders and link target resolves.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[capture] Error:", err.message);
  process.exit(1);
});
