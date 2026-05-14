/**
 * Unit tests — PlaywrightBrowserFactory (1905a stealth fix)
 *
 * Verifies:
 *   AC1: factory can be imported without playwright-stealth (no startup error)
 *   AC2: launch() calls chromium.launch with headless:true
 *   AC3: newContext() receives userAgent string (stealth UA patch)
 *   AC4: stealth JS patches applied via addInitScript (navigator.webdriver = false)
 *   AC5: browser.close() not called by factory — caller owns lifecycle
 *
 * playwright fully mocked — no real browser launched, no network.
 */

import { describe, it, expect, mock } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock playwright BEFORE importing factory
// ---------------------------------------------------------------------------

const mockPage = {
  goto: mock(async () => {}),
  content: mock(async () => '<html></html>'),
};

const mockContext = {
  newPage: mock(async () => mockPage),
  addInitScript: mock(async (_script: string) => { void _script; }),
};

const mockBrowser = {
  newContext: mock(async (_opts: unknown) => { void _opts; return mockContext; }),
  close: mock(async () => {}),
};

const mockChromium = {
  launch: mock(async (_opts: unknown) => { void _opts; return mockBrowser; }),
};

mock.module('playwright', () => ({
  default: {
    chromium: mockChromium,
  },
}));

// Import AFTER mock.module
const { PlaywrightBrowserFactory } = await import('../../infrastructure/scrapers/playwright-browser-factory.js');

// ---------------------------------------------------------------------------

describe('PlaywrightBrowserFactory — 1905a stealth fix', () => {
  // AC1: module loads without error (no playwright-stealth import crash)
  it('AC1: factory module imports without startup error', () => {
    expect(PlaywrightBrowserFactory).toBeDefined();
    expect(typeof PlaywrightBrowserFactory.launch).toBe('function');
  });

  // AC2: chromium.launch called with headless:true
  it('AC2: chromium.launch receives headless:true', async () => {
    await PlaywrightBrowserFactory.launch();
    expect(mockChromium.launch).toHaveBeenCalled();
    const launchCall = mockChromium.launch.mock.calls[0];
    expect(launchCall[0]).toMatchObject({ headless: true });
  });

  // AC3: newContext called with a non-empty userAgent string
  it('AC3: newContext receives userAgent string', async () => {
    await PlaywrightBrowserFactory.launch();
    expect(mockBrowser.newContext).toHaveBeenCalled();
    const ctxCall = mockBrowser.newContext.mock.calls[0];
    const opts = ctxCall[0] as Record<string, unknown>;
    expect(typeof opts.userAgent).toBe('string');
    expect((opts.userAgent as string).length).toBeGreaterThan(20);
  });

  // AC4: addInitScript called to patch navigator.webdriver
  it('AC4: addInitScript called with webdriver patch', async () => {
    await PlaywrightBrowserFactory.launch();
    expect(mockContext.addInitScript).toHaveBeenCalled();
    const scriptArg = mockContext.addInitScript.mock.calls[0][0] as string;
    expect(scriptArg).toContain('webdriver');
  });

  // AC5: browser.close NOT called by factory (caller owns lifecycle)
  it('AC5: factory does not call browser.close()', async () => {
    mockBrowser.close.mockClear();
    await PlaywrightBrowserFactory.launch();
    expect(mockBrowser.close).not.toHaveBeenCalled();
  });

  // AC6: launch() returns { browser, context, page } handles
  it('AC6: returns browser, context, page handles', async () => {
    const result = await PlaywrightBrowserFactory.launch();
    expect(result.browser).toBeDefined();
    expect(result.context).toBeDefined();
    expect(result.page).toBeDefined();
  });
});
