/**
 * Playwright config — mcp-server Trust Dashboard
 * Task: P2-H (G9 trust-contract artifact)
 *
 * - baseURL: file:// path to index.html (no server spawn)
 * - headless: true
 * - NO webServer block — dashboard is fully static, file:// mode only
 * - testDir: ./tests
 *
 * Note: Playwright's Chromium sandboxing blocks file:// fetch() calls
 * ("URL scheme 'file' is not supported"). The trust-contract spec uses
 * page.route() to intercept fetch calls and serve local files directly,
 * keeping the test fully server-free while allowing file content to load.
 */

import { defineConfig, devices } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardPath = resolve(__dirname, 'index.html');
const baseURL = `file://${dashboardPath}`;

export default defineConfig({
  testDir: './tests',
  timeout: 15000,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'playwright-verdict.json' }]],
  use: {
    headless: true,
    baseURL,
    // No webServer block — static file:// only
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
