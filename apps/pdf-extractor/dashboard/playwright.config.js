// playwright.config.js — G9 trust contract headless config
// Path B: PO/QA Playwright headless (no human-in-loop)
// Serves dashboard/index.html via local HTTP server (port 9999)
// to avoid Chromium file:// fetch() cross-origin restrictions.

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: '.',
  testMatch: 'trust-contract.spec.js',
  timeout: 30000,
  use: {
    headless: true,
    baseURL: 'http://localhost:9999',
  },
  webServer: {
    command: 'npx http-server . -p 9999 -c-1 --cors',
    url: 'http://localhost:9999',
    reuseExistingServer: false,
    cwd: __dirname,
    timeout: 10000,
  },
  reporter: [['list'], ['json', { outputFile: 'trust-contract-result.json' }]],
};

module.exports = config;
