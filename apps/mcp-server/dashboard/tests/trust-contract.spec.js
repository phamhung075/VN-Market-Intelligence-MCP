/**
 * trust-contract.spec.js — G9 Playwright Trust Contract (P2-H-FIX)
 * Task: P2-H-FIX | Corrects the Potemkin gate from original P2-H.
 *
 * 7 assertions — all must pass for G9 sign-off.
 * Runs in file:// mode, headless Chromium, no server spawn.
 *
 * Inline data model (P2-H-FIX):
 * Dashboard embeds trace + module data as <script type="application/json"> blocks.
 * Dashboard JS reads from DOM (document.getElementById), NO fetch(), NO window.__MCP_* globals.
 * This spec uses NO page.addInitScript(). test-path == user-path.
 * The file:// double-click the user sees is IDENTICAL to what Playwright tests here.
 *
 * Assertion index:
 *   1. Three panels present
 *   2. Module panel: no "Phase 2" placeholder text
 *   3. Primitives panel: ≥9 scenario cards
 *   4. ≥1 GREEN status indicator (mcp-dot-pass)
 *   5. renderCard() pure unit: returns HTML with mcp-dot-fail when given status:"fail"
 *   6. Zero console errors during load + 2s settle
 *   7. Zero HTTP(S) network requests (no fetch() calls at all — structurally guaranteed)
 */

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = resolve(__dirname, '..');

// Dashboard path — absolute file:// URL
const DASHBOARD_FILE = `file://${resolve(DASHBOARD_DIR, 'index.html')}`;

// ──────────────────────────────────────────────────────────────────────────────
// Shared setup: collect console errors and HTTP requests (NO addInitScript)
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
    // With the inline-data model, no fetch() calls occur for trace/module data.
    // The microservice panel detects window.location.protocol === 'file:' and
    // skips the localhost:3000 HTTP probe (synchronous offline fallback).
    // Result: 0 HTTP(S) requests — structurally guaranteed, not just behaviorally.
    page.on('request', req => {
      const scheme = req.url().split(':')[0].toLowerCase();
      if (scheme === 'http' || scheme === 'https') {
        httpRequests.push(req.url());
      }
    });

    // NO addInitScript — data comes from inline <script type="application/json"> blocks
    // already present in index.html. Same HTML the user double-clicks.

    await page.goto(DASHBOARD_FILE);

    // Wait for primitives panel to finish loading (scenario cards rendered from inline data)
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

  // ── Assertion 5: renderCard() pure unit — RED render path works ────────────
  test('5. renderCard() produces mcp-dot-fail HTML when given status:"fail"', async ({ page }) => {
    // Pure DOM-unit test: call renderCard() in-page with a synthetic fail trace (no on-disk fixture).
    // Proves the RED render path works without any on-disk red fixture or global injection.
    // The real RED→GREEN visual proof happens at G10/P2-J-K (genuine bug injection).
    const html = await page.evaluate(() => {
      // renderCard is defined in the global scope of index.html
      const trace = {
        scenario: 'test-fail-scenario',
        primitive: 'test-primitive',
        status: 'fail',
        durationMs: 0,
        actual: null,
        error: 'synthetic error for red-path unit test'
      };
      return renderCard(trace);
    });
    expect(html).toContain('mcp-dot-fail');
  });

  // ── Assertion 6: Zero console errors ───────────────────────────────────────
  test('6. Zero console errors during load + 2s settle', async ({ page }) => {
    // With inline-data model, no fetch() calls are attempted, eliminating
    // the "URL scheme 'file' is not supported" console errors.
    if (consoleErrors.length > 0) {
      console.log('Console errors captured:', consoleErrors);
    }
    expect(consoleErrors).toHaveLength(0);
  });

  // ── Assertion 7: Zero HTTP/HTTPS network requests ──────────────────────────
  test('7. Zero HTTP/HTTPS network requests (file:// mode)', async ({ page }) => {
    // Inline-data model: no fetch() calls for trace or module data.
    // Microservice panel detects file:// protocol and skips HTTP probe.
    // This is structurally guaranteed — zero network calls possible from this HTML.
    if (httpRequests.length > 0) {
      console.log('HTTP requests captured:', httpRequests);
    }
    expect(httpRequests).toHaveLength(0);
  });
});
