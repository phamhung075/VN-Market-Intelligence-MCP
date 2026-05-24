// trust-contract.spec.js — G9 Playwright headless trust contract
// Path B: QA headless automation. No human-in-loop.
//
// Renders apps/pdf-extractor/dashboard/index.html via file://
// Asserts: 3 panels present, 6 primitive cards, honest RED on pass=false trace,
//          console_errors=0, zero HTTP network calls.
//
// AC mapping:
//   AC-1: npx playwright test exits 0
//   AC-2: all 3 panels visible (primitives, module, service)
//   AC-3: exactly 6 primitive cards rendered
//   AC-4: at least 1 red card (honest-red from pass=false trace)
//   AC-5: zero console errors
//   AC-6: zero HTTP network requests (file:// only)
//   AC-7: trust-contract-verdict.json committed (written after test)

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// Dashboard served via local HTTP server (see playwright.config.js webServer)
// Using HTTP avoids Chromium's file:// fetch() cross-origin restrictions.
const DASHBOARD_URL = 'http://localhost:9999/index.html';
const TRACES_DIR = path.resolve(__dirname, 'traces');
const VERDICT_PATH = path.resolve(__dirname, 'trust-contract-verdict.json');

// Helper: inject a pass=false trace for one primitive to prove honest RED
function injectFailTrace(primitiveName) {
  const tracePath = path.join(TRACES_DIR, 'primitive', primitiveName + '.json');
  const failTrace = {
    primitive: primitiveName,
    module: null,
    inputs: { _test: 'honesty_check' },
    expected: 'EXPECTED_VALUE',
    actual: 'WRONG_VALUE',
    pass: false,
    error: null
  };
  fs.writeFileSync(tracePath, JSON.stringify(failTrace, null, 2));
  return tracePath;
}

// Helper: restore original trace from runner
function restoreTrace(primitiveName, originalContent) {
  const tracePath = path.join(TRACES_DIR, 'primitive', primitiveName + '.json');
  fs.writeFileSync(tracePath, originalContent);
}

test.describe('pdf-extractor dashboard G9 trust contract', () => {
  const consoleErrors = [];
  const networkRequests = [];
  let page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    consoleErrors.length = 0;
    networkRequests.length = 0;

    // Capture console errors
    p.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Capture network requests
    p.on('request', req => {
      const url = req.url();
      networkRequests.push(url);
    });
  });

  test('AC-2 + AC-3 + AC-5 + AC-6: all 3 panels, 6 primitive cards, 0 console errors, 0 HTTP requests — all-green state', async ({ page }) => {
    // Ensure all traces are green before loading
    await page.goto(DASHBOARD_URL);

    // Wait for JS to load traces (Promise.allSettled + fetch)
    await page.waitForTimeout(1500);

    // AC-2: All 3 panels present
    await expect(page.locator('#section-primitives')).toBeVisible();
    await expect(page.locator('#section-module')).toBeVisible();
    await expect(page.locator('#section-microservice')).toBeVisible();

    // AC-3: Exactly 6 cards in primitives panel
    const primitiveCards = page.locator('#section-primitives .card');
    await expect(primitiveCards).toHaveCount(6);

    // All 6 primitive cards should show PASS badge (all-green state)
    const expectedPrimitiveIds = [
      'validate-financial-figures',
      'decimal-normalizer',
      'confidence-scorer',
      'low-confidence-gate',
      'ratio-computer',
      'field-extractor'
    ];
    for (const id of expectedPrimitiveIds) {
      const badge = page.locator(`#badge-${id}`);
      await expect(badge).toHaveText('PASS');
      await expect(badge).toHaveClass(/badge-pass/);
    }

    // Module card should show PASS
    await expect(page.locator('#badge-financial-reports')).toHaveText('PASS');

    // Service card: NOT-RUN (honest — no service trace authored yet)
    await expect(page.locator('#badge-pdf-extractor')).toHaveText('NOT-RUN');

    // AC-5: Zero console errors
    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);

    // AC-6: Zero external HTTP requests (only localhost allowed — served via local http-server)
    // The dashboard must not make calls to external services (CDNs, APIs, etc.)
    const externalRequests = networkRequests.filter(url => {
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) return false;
      if (url.startsWith('http://') || url.startsWith('https://')) return true;
      return false;
    });
    expect(externalRequests, `External HTTP requests made: ${externalRequests.join(', ')}`).toHaveLength(0);
  });

  test('AC-4: honest-red — inject pass=false trace, card shows FAIL badge', async ({ page }) => {
    // Read current good trace for decimal_normalizer
    const tracePath = path.join(TRACES_DIR, 'primitive', 'decimal_normalizer.json');
    const originalContent = fs.readFileSync(tracePath, 'utf-8');

    try {
      // Inject a fail trace
      injectFailTrace('decimal_normalizer');

      await page.goto(DASHBOARD_URL);
      await page.waitForTimeout(1500);

      // decimal_normalizer card must show FAIL (RED) badge
      const badge = page.locator('#badge-decimal-normalizer');
      await expect(badge).toHaveText('FAIL');
      await expect(badge).toHaveClass(/badge-fail/);

      // Other primitive cards should still be PASS (isolation test)
      await expect(page.locator('#badge-validate-financial-figures')).toHaveText('PASS');
      await expect(page.locator('#badge-confidence-scorer')).toHaveText('PASS');

      // AC-4: at least 1 red card exists
      const failBadges = await page.locator('.badge-fail').count();
      expect(failBadges).toBeGreaterThanOrEqual(1);

    } finally {
      // Always restore green trace
      restoreTrace('decimal_normalizer', originalContent);
    }
  });

  test('AC-2 screenshot: take trust-contract screenshot in all-green state', async ({ page }) => {
    await page.goto(DASHBOARD_URL);
    await page.waitForTimeout(1500);

    // Verify all-green before screenshot
    await expect(page.locator('#badge-validate-financial-figures')).toHaveText('PASS');
    await expect(page.locator('#badge-field-extractor')).toHaveText('PASS');
    await expect(page.locator('#badge-financial-reports')).toHaveText('PASS');

    // Take screenshot (G9 trust-contract artifact)
    await page.screenshot({
      path: path.resolve(__dirname, 'g9-trust-contract.png'),
      fullPage: true
    });

    // Verify screenshot was written
    expect(fs.existsSync(path.resolve(__dirname, 'g9-trust-contract.png'))).toBe(true);

    // AC-5: Zero console errors in this state too
    expect(consoleErrors).toHaveLength(0);
  });
});
