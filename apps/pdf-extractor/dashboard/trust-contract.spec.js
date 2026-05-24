// trust-contract.spec.js — G9 Playwright headless trust contract
// Path B: QA headless automation. No human-in-loop.
//
// PRIMARY: Renders apps/pdf-extractor/dashboard/index.html via file:// (the REAL double-click path).
// This is the regression guard for the false-green that shipped in the original G9 pass —
// the old contract only tested http://localhost:9999 and never exercised the user-facing file:// path.
//
// SECONDARY: Retained http://localhost:9999 baseline for coverage completeness.
//
// AC mapping:
//   AC-1: file:// rendering exits 0 — all PASS badges visible
//   AC-2: missing traces.js → all NOT-RUN (honest fallback under file://)
//   AC-3: 6 intentional-RED known_bad fixtures show FAIL (runner-level honesty)
//   AC-4: zero network requests under file:// (footer claim is literally true)
//   AC-5: http baseline — 3 panels, 6 primitive cards, 0 console errors, 0 external HTTP
//   AC-6: honest-red under file:// (traces.js injection → card shows FAIL badge)
//
// Regression guard (the exact false-green bug):
//   Old spec: http://localhost:9999 only → fetch() worked → traced loaded → PASS appeared honest.
//   New spec: file:// FIRST. If file:// doesn't render PASS, the test fails immediately.

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const DASHBOARD_DIR = path.resolve(__dirname);
const TRACES_JS_PATH = path.join(DASHBOARD_DIR, 'traces.js');
const FILE_URL = 'file://' + path.join(DASHBOARD_DIR, 'index.html');

// HTTP baseline (kept from original G9 contract for regression continuity)
const HTTP_URL = 'http://localhost:9999/index.html';

// The 7 non-service card IDs expected to show PASS
const PASS_IDS = [
  'validate-financial-figures',
  'decimal-normalizer',
  'confidence-scorer',
  'low-confidence-gate',
  'ratio-computer',
  'field-extractor',
  'financial-reports',
];

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: PRIMARY — file:// rendering shows PASS badges for all 7 non-service cards
// This is the REGRESSION GUARD for the false-green. It MUST run first.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('file:// rendering — PRIMARY regression guard', () => {
  let page;
  const consoleErrors = [];
  const networkRequests = [];

  test.beforeEach(async ({ page: p }) => {
    page = p;
    consoleErrors.length = 0;
    networkRequests.length = 0;

    p.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    p.on('request', req => {
      networkRequests.push(req.url());
    });
  });

  test('AC-1: file:// — 6 primitive + 1 module cards show PASS, service shows NOT-RUN', async ({ page }) => {
    await page.goto(FILE_URL);

    // No async fetch — traces.js loaded synchronously via <script src>, so no wait needed
    // beyond DOM ready (goto waits for load event)

    // 3 panels must be present
    await expect(page.locator('#section-primitives')).toBeVisible();
    await expect(page.locator('#section-module')).toBeVisible();
    await expect(page.locator('#section-microservice')).toBeVisible();

    // 6 primitive cards
    const primitiveCards = page.locator('#section-primitives .card');
    await expect(primitiveCards).toHaveCount(6);

    // All 6 primitive cards must show PASS
    for (const id of ['validate-financial-figures', 'decimal-normalizer', 'confidence-scorer',
                       'low-confidence-gate', 'ratio-computer', 'field-extractor']) {
      const badge = page.locator(`#badge-${id}`);
      await expect(badge).toHaveText('PASS');
      await expect(badge).toHaveClass(/badge-pass/);
    }

    // Module card must show PASS
    await expect(page.locator('#badge-financial-reports')).toHaveText('PASS');
    await expect(page.locator('#badge-financial-reports')).toHaveClass(/badge-pass/);

    // Service card must show NOT-RUN (honest placeholder)
    await expect(page.locator('#badge-pdf-extractor')).toHaveText('NOT-RUN');
    await expect(page.locator('#badge-pdf-extractor')).toHaveClass(/badge-not-run/);

    // Verify window.__TRACES is populated with 8 keys
    const traceKeys = await page.evaluate(() => Object.keys(window.__TRACES || {}));
    expect(traceKeys).toHaveLength(8);
  });

  test('AC-4: file:// — zero network requests (footer claim literally true)', async ({ page }) => {
    await page.goto(FILE_URL);

    // All requests captured (file:// requests are not reported as network by Playwright)
    // The key assertion: zero http/https requests
    const httpRequests = networkRequests.filter(url =>
      url.startsWith('http://') || url.startsWith('https://')
    );
    expect(httpRequests, `HTTP requests made under file://: ${httpRequests.join(', ')}`).toHaveLength(0);

    // Zero console errors
    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);
  });

  test('AC-2: file:// — missing traces.js → all cards show NOT-RUN (honest fallback)', async ({ page }) => {
    // Backup current traces.js
    const originalContent = fs.readFileSync(TRACES_JS_PATH, 'utf-8');
    const backupPath = TRACES_JS_PATH + '.bak';

    try {
      // Rename traces.js away → onerror handler fires → window.__TRACES = {}
      fs.renameSync(TRACES_JS_PATH, backupPath);

      await page.goto(FILE_URL);

      // Every card must show NOT-RUN — no card may show PASS or FAIL
      for (const id of PASS_IDS) {
        const badge = page.locator(`#badge-${id}`);
        await expect(badge).toHaveText('NOT-RUN');
        await expect(badge).toHaveClass(/badge-not-run/);
      }

      // Service card also NOT-RUN
      await expect(page.locator('#badge-pdf-extractor')).toHaveText('NOT-RUN');

      // window.__TRACES must be empty object (set by onerror)
      const traceKeys = await page.evaluate(() => Object.keys(window.__TRACES || {}));
      expect(traceKeys).toHaveLength(0);

    } finally {
      // Always restore traces.js
      if (fs.existsSync(backupPath)) {
        fs.renameSync(backupPath, TRACES_JS_PATH);
      }
    }
  });

  test('AC-6: file:// — honest-red — inject pass=false into traces.js, card shows FAIL badge', async ({ page }) => {
    // Read current traces.js and parse __TRACES contents
    const originalContent = fs.readFileSync(TRACES_JS_PATH, 'utf-8');

    try {
      // Parse __TRACES from the JS sidecar, flip decimal-normalizer.pass to false, re-emit.
      // Strategy: extract the JSON literal from window.__TRACES = {...};
      const jsonMatch = originalContent.match(/window\.__TRACES\s*=\s*(\{[\s\S]*?\});\s*$/m);
      expect(jsonMatch, 'Could not extract __TRACES JSON from traces.js').not.toBeNull();

      const tracesObj = JSON.parse(jsonMatch[1]);
      expect(tracesObj['decimal-normalizer'], 'decimal-normalizer key missing from __TRACES').toBeTruthy();
      expect(tracesObj['decimal-normalizer'].pass).toBe(true);

      // Flip pass to false
      tracesObj['decimal-normalizer'].pass = false;

      // Re-emit traces.js with the modified __TRACES
      const injectedContent = originalContent.replace(
        /window\.__TRACES\s*=\s*\{[\s\S]*?\};\s*$/m,
        `window.__TRACES = ${JSON.stringify(tracesObj, null, 2)};\n`
      );

      // Verify the injection actually changed something
      expect(injectedContent).not.toEqual(originalContent);

      fs.writeFileSync(TRACES_JS_PATH, injectedContent, 'utf-8');

      await page.goto(FILE_URL);

      // decimal-normalizer card must show FAIL (RED) badge
      const badge = page.locator('#badge-decimal-normalizer');
      await expect(badge).toHaveText('FAIL');
      await expect(badge).toHaveClass(/badge-fail/);

      // Other primitive cards must still show PASS (isolation)
      await expect(page.locator('#badge-validate-financial-figures')).toHaveText('PASS');
      await expect(page.locator('#badge-confidence-scorer')).toHaveText('PASS');
      await expect(page.locator('#badge-financial-reports')).toHaveText('PASS');

      // At least 1 FAIL badge on page
      const failBadges = await page.locator('.badge-fail').count();
      expect(failBadges).toBeGreaterThanOrEqual(1);

    } finally {
      // Always restore original traces.js
      fs.writeFileSync(TRACES_JS_PATH, originalContent, 'utf-8');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: HTTP baseline — retained from original G9 for regression continuity
// ─────────────────────────────────────────────────────────────────────────────
test.describe('http baseline — retained G9 contract', () => {
  const consoleErrors = [];
  const networkRequests = [];

  test.beforeEach(async ({ page: p }) => {
    consoleErrors.length = 0;
    networkRequests.length = 0;

    p.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    p.on('request', req => {
      networkRequests.push(req.url());
    });
  });

  test('AC-5: http — 3 panels, 6 primitive PASS, module PASS, service NOT-RUN, 0 console errors, 0 external HTTP', async ({ page }) => {
    await page.goto(HTTP_URL);

    // 3 panels
    await expect(page.locator('#section-primitives')).toBeVisible();
    await expect(page.locator('#section-module')).toBeVisible();
    await expect(page.locator('#section-microservice')).toBeVisible();

    // 6 primitive cards
    await expect(page.locator('#section-primitives .card')).toHaveCount(6);

    // All PASS badges
    for (const id of ['validate-financial-figures', 'decimal-normalizer', 'confidence-scorer',
                       'low-confidence-gate', 'ratio-computer', 'field-extractor']) {
      await expect(page.locator(`#badge-${id}`)).toHaveText('PASS');
    }
    await expect(page.locator('#badge-financial-reports')).toHaveText('PASS');
    await expect(page.locator('#badge-pdf-extractor')).toHaveText('NOT-RUN');

    // AC-5: zero console errors
    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);

    // AC-5: zero external HTTP (only localhost allowed)
    const externalRequests = networkRequests.filter(url => {
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) return false;
      return url.startsWith('http://') || url.startsWith('https://');
    });
    expect(externalRequests, `External HTTP requests: ${externalRequests.join(', ')}`).toHaveLength(0);
  });

  test('http screenshot: trust-contract screenshot in all-green state', async ({ page }) => {
    await page.goto(HTTP_URL);

    await expect(page.locator('#badge-validate-financial-figures')).toHaveText('PASS');
    await expect(page.locator('#badge-field-extractor')).toHaveText('PASS');
    await expect(page.locator('#badge-financial-reports')).toHaveText('PASS');

    await page.screenshot({
      path: path.resolve(__dirname, 'g9-trust-contract.png'),
      fullPage: true
    });

    expect(fs.existsSync(path.resolve(__dirname, 'g9-trust-contract.png'))).toBe(true);
    expect(consoleErrors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: Runner-level honesty — 5 known_bad fixtures all produce pass=false (exit 1)
// (Validated at sandbox/runner.py level, not browser level — these are not
//  displayed in the dashboard sidecar; they are standalone runner evidence only.)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('AC-3: runner honesty — known_bad fixtures exit 1, output pass=false', () => {
  test('AC-3: all known_bad scenario fixtures produce runner exit 1 + pass=false output', async () => {
    const PDF_EXTRACTOR_ROOT = path.resolve(__dirname, '..');
    const REPO_ROOT = path.resolve(PDF_EXTRACTOR_ROOT, '../..');

    const KNOWN_BAD_FILES = [
      path.join(PDF_EXTRACTOR_ROOT, 'scenarios/primitives/validate_financial_figures/known_bad_threshold_wrong.json'),
      path.join(PDF_EXTRACTOR_ROOT, 'scenarios/primitives/decimal_normalizer/known_bad_expected_wrong.json'),
      path.join(PDF_EXTRACTOR_ROOT, 'scenarios/primitives/confidence_scorer/known_bad_score_wrong.json'),
      path.join(PDF_EXTRACTOR_ROOT, 'scenarios/primitives/low_confidence_gate/known_bad_disposition_wrong.json'),
      path.join(PDF_EXTRACTOR_ROOT, 'scenarios/primitives/ratio_computer/known_bad_ratio_wrong.json'),
    ];

    let verified = 0;
    for (const scenarioPath of KNOWN_BAD_FILES) {
      if (!fs.existsSync(scenarioPath)) continue;

      let stdout = '';
      let exitedNonZero = false;

      try {
        stdout = execSync(
          `python3 apps/pdf-extractor/sandbox/runner.py --tier=primitive --scenario=${scenarioPath}`,
          { cwd: REPO_ROOT, env: { ...process.env, PYTHONPATH: path.join(REPO_ROOT, 'apps/pdf-extractor') } }
        ).toString();
      } catch (e) {
        // Non-zero exit is expected — capture stdout from the error object
        stdout = e.stdout ? e.stdout.toString() : '';
        exitedNonZero = true;
      }

      expect(exitedNonZero, `Expected exit 1 for known_bad: ${scenarioPath}`).toBe(true);

      const result = JSON.parse(stdout);
      expect(result.pass, `Expected pass=false in output for ${scenarioPath}`).toBe(false);

      verified++;
    }

    // All 5 known_bad fixtures must have been verified
    expect(verified, `Expected 5 known_bad fixtures verified, got ${verified}`).toBe(5);
  });
});
