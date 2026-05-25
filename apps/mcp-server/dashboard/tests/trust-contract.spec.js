/**
 * trust-contract.spec.js — G9 Playwright Trust Contract
 * Task: P2-H | Predecessor: P2-G (7520428b)
 *
 * 7 assertions — all must pass for G9 sign-off.
 * Runs in file:// mode, headless Chromium, no server spawn.
 *
 * Data loading strategy:
 * Playwright's sandboxed Chromium blocks file:// fetch() calls
 * ("URL scheme 'file' is not supported"). This spec uses page.addInitScript()
 * to pre-inject trace data (window.__MCP_TRACES__) and modules data
 * (window.__MCP_MODULES__) as globals. The dashboard checks for these globals
 * before attempting fetch() — zero HTTP calls, zero network dependency.
 *
 * Assertion index:
 *   1. Three panels present
 *   2. Module panel: no "Phase 2" placeholder text
 *   3. Primitives panel: ≥9 scenario cards
 *   4. ≥1 GREEN status indicator
 *   5. ≥1 RED status indicator (regression tripwire: sparkline-regression-tripwire)
 *   6. Zero console errors during load + 2s settle
 *   7. Zero HTTP(S) network requests (data injected via initScript — no fetch() calls)
 */

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = resolve(__dirname, '..');
const TRACES_DIR = resolve(DASHBOARD_DIR, 'traces');
const MODULES_JSON = resolve(DASHBOARD_DIR, 'data', 'modules.json');

// Dashboard path — absolute file:// URL
const DASHBOARD_FILE = `file://${resolve(DASHBOARD_DIR, 'index.html')}`;

/**
 * Load all trace JSON files from dashboard/traces/ into a map keyed by scenario name.
 * Returns window.__MCP_TRACES__ payload.
 */
function loadTracesFromDisk() {
  const traces = {};
  const files = readdirSync(TRACES_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const data = JSON.parse(readFileSync(resolve(TRACES_DIR, file), 'utf-8'));
    traces[data.scenario] = data;
  }
  return traces;
}

/**
 * Load modules.json from disk.
 * Returns window.__MCP_MODULES__ payload.
 */
function loadModulesFromDisk() {
  return JSON.parse(readFileSync(MODULES_JSON, 'utf-8'));
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared setup: inject data globals, collect console errors and HTTP requests
// ──────────────────────────────────────────────────────────────────────────────

test.describe('G9 Trust Contract — mcp-server Dashboard', () => {
  let consoleErrors = [];
  let httpRequests = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    httpRequests = [];

    // Listener 6: capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Listener 7: capture HTTP/HTTPS network requests only.
    // With addInitScript injection, no fetch() calls occur (data already in globals).
    // The microservice panel detects window.location.protocol === 'file:' and
    // skips the localhost:3000 HTTP probe (synchronous offline fallback).
    // Result: 0 HTTP(S) requests.
    page.on('request', req => {
      const scheme = req.url().split(':')[0].toLowerCase();
      if (scheme === 'http' || scheme === 'https') {
        httpRequests.push(req.url());
      }
    });

    // Pre-inject trace data and modules data BEFORE the page scripts execute.
    // The dashboard's fetchTrace() and loadModules() check for these globals first.
    const tracesPayload = loadTracesFromDisk();
    const modulesPayload = loadModulesFromDisk();

    await page.addInitScript((args) => {
      window.__MCP_TRACES__ = args.traces;
      window.__MCP_MODULES__ = args.modules;
    }, { traces: tracesPayload, modules: modulesPayload });

    await page.goto(DASHBOARD_FILE);

    // Wait for primitives panel to finish loading (scenario cards rendered)
    await page.waitForSelector('#mcp-panel-primitives .mcp-scenario-card', { timeout: 10000 });

    // Wait for module rows to render
    await page.waitForSelector('.mcp-module-row', { timeout: 10000 });

    // 2-second settle period for any remaining async work
    await page.waitForTimeout(2000);
  });

  // ── Assertion 1: Three panels present ──────────────────────────────────────
  test('1. Three panels are present in the DOM', async ({ page }) => {
    // Panel 1: primitives (has explicit id)
    const primitivesPanel = page.locator('#mcp-panel-primitives');
    await expect(primitivesPanel).toBeVisible();

    // All three .mcp-panel divs
    const panels = page.locator('.mcp-panel');
    await expect(panels).toHaveCount(3);

    // Panel 3: microservice panel identified by its inner stat element
    const msPanel = page.locator('#mcp-ms-stat');
    await expect(msPanel).toBeVisible();
  });

  // ── Assertion 2: Module panel — no "Phase 2" placeholder text ──────────────
  test('2. Module panel contains no "Phase 2" placeholder text', async ({ page }) => {
    const panels = page.locator('.mcp-panel');
    const modulePanelText = await panels.nth(1).textContent();
    expect(modulePanelText).not.toContain('Phase 2');
    expect(modulePanelText).not.toContain('not yet extracted');
  });

  // ── Assertion 3: Primitives panel has ≥9 scenario cards ────────────────────
  test('3. Primitives panel contains ≥9 scenario cards', async ({ page }) => {
    const cards = page.locator('#mcp-panel-primitives .mcp-scenario-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(9);
  });

  // ── Assertion 4: At least 1 GREEN indicator ────────────────────────────────
  test('4. At least 1 card with GREEN (pass) status indicator', async ({ page }) => {
    const greenDots = page.locator('#mcp-panel-primitives .mcp-dot-pass');
    const count = await greenDots.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // ── Assertion 5: At least 1 RED indicator ─────────────────────────────────
  test('5. At least 1 card with RED (fail) status indicator', async ({ page }) => {
    // The sparkline-regression-tripwire trace has status: "fail" and renders
    // a .mcp-dot-fail (red) indicator. This is the intentional trust-contract
    // regression tripwire added in P2-H to verify the RED path renders correctly.
    const redDots = page.locator('#mcp-panel-primitives .mcp-dot-fail');
    const count = await redDots.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // ── Assertion 6: Zero console errors ───────────────────────────────────────
  test('6. Zero console errors during load + 2s settle', async ({ page }) => {
    // With addInitScript injection, no fetch() calls are attempted, eliminating
    // the "URL scheme 'file' is not supported" console errors.
    if (consoleErrors.length > 0) {
      console.log('Console errors captured:', consoleErrors);
    }
    expect(consoleErrors).toHaveLength(0);
  });

  // ── Assertion 7: Zero HTTP/HTTPS network requests ──────────────────────────
  test('7. Zero HTTP/HTTPS network requests (file:// mode)', async ({ page }) => {
    // Interpretation: only http:// and https:// scheme requests count.
    // - Trace and module data is injected via addInitScript — no fetch() calls made.
    // - The microservice panel detects window.location.protocol === 'file:'
    //   and skips the localhost:3000 HTTP probe (synchronous offline fallback).
    // Result: 0 HTTP(S) requests.
    if (httpRequests.length > 0) {
      console.log('HTTP requests captured:', httpRequests);
    }
    expect(httpRequests).toHaveLength(0);
  });
});
