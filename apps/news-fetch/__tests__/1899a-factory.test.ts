/**
 * Unit test — PlaywrightBrowserFactory
 * Task: 1899a-factory (updated 1905a: playwright-stealth removed)
 *
 * Mocks playwright (chromium.launch) — no real browser launched.
 * playwright-stealth removed in 1905a; stealth now applied via addInitScript.
 *
 * Verifies the factory:
 *   - calls chromium.launch with headless:true
 *   - creates a new context
 *   - calls addInitScript on context (inline stealth patch)
 *   - calls addInitScript BEFORE newPage()
 *   - returns { browser, context, page }
 *   - does NOT call browser.close() itself (caller owns lifecycle)
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';

// ── Mock objects ──────────────────────────────────────────────────────────────

const mockPage = { goto: mock(async () => {}), isMock: 'page' } as const;
const initScriptCalls: string[] = [];
const mockContext = {
  addInitScript: mock(async (script: string) => { initScriptCalls.push(script); }),
  newPage: mock(async () => mockPage),
  isMock: 'context',
};
const mockBrowser = {
  newContext: mock(async () => mockContext),
  close: mock(async () => {}),
  isMock: 'browser',
} as const;

// Playwright mock — must shadow module resolution before factory import.
mock.module('playwright', () => ({
  default: {
    chromium: {
      launch: mock(async () => mockBrowser),
    },
  },
}));

// ── Import factory AFTER mocks are registered ─────────────────────────────────
const { PlaywrightBrowserFactory } = await import(
  '../src/infrastructure/scrapers/playwright-browser-factory.js'
);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('1899a-factory — PlaywrightBrowserFactory', () => {
  beforeEach(() => {
    mockBrowser.newContext.mockClear();
    mockBrowser.close.mockClear();
    mockContext.newPage.mockClear();
    mockContext.addInitScript.mockClear();
    initScriptCalls.length = 0;
  });

  it('launch() returns { browser, context, page }', async () => {
    const result = await PlaywrightBrowserFactory.launch();

    expect(result).toHaveProperty('browser');
    expect(result).toHaveProperty('context');
    expect(result).toHaveProperty('page');
  });

  it('launch() returns the mock browser instance', async () => {
    const { browser } = await PlaywrightBrowserFactory.launch();
    expect((browser as unknown as typeof mockBrowser).isMock).toBe('browser');
  });

  it('launch() returns the mock context instance', async () => {
    const { context } = await PlaywrightBrowserFactory.launch();
    expect((context as unknown as typeof mockContext).isMock).toBe('context');
  });

  it('launch() returns the mock page instance', async () => {
    const { page } = await PlaywrightBrowserFactory.launch();
    expect((page as unknown as typeof mockPage).isMock).toBe('page');
  });

  it('launch() calls chromium.launch with headless:true', async () => {
    const playwright = (await import('playwright')).default as unknown as {
      chromium: { launch: ReturnType<typeof mock> };
    };
    playwright.chromium.launch.mockClear();

    await PlaywrightBrowserFactory.launch();

    expect(playwright.chromium.launch).toHaveBeenCalledTimes(1);
    expect(playwright.chromium.launch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: true }),
    );
  });

  it('launch() calls browser.newContext() to create context', async () => {
    await PlaywrightBrowserFactory.launch();
    expect(mockBrowser.newContext).toHaveBeenCalledTimes(1);
  });

  it('launch() calls addInitScript on context (inline stealth patch)', async () => {
    await PlaywrightBrowserFactory.launch();
    expect(mockContext.addInitScript).toHaveBeenCalledTimes(1);
    // Script must patch navigator.webdriver
    expect(initScriptCalls[0]).toContain('webdriver');
  });

  it('launch() calls addInitScript BEFORE newPage()', async () => {
    const order: string[] = [];

    mockContext.addInitScript.mockImplementation(async (_script: string) => {
      order.push('addInitScript');
    });
    mockContext.newPage.mockImplementation(async () => {
      order.push('newPage');
      return mockPage;
    });

    await PlaywrightBrowserFactory.launch();

    const initIdx = order.indexOf('addInitScript');
    const newPageIdx = order.indexOf('newPage');

    expect(initIdx).toBeLessThan(newPageIdx);
  });

  it('launch() does NOT call browser.close()', async () => {
    await PlaywrightBrowserFactory.launch();
    expect(mockBrowser.close).not.toHaveBeenCalled();
  });

  it('launch() does NOT call context.newPage() more than once', async () => {
    await PlaywrightBrowserFactory.launch();
    expect(mockContext.newPage).toHaveBeenCalledTimes(1);
  });

  it('launch() passes userAgent to newContext', async () => {
    await PlaywrightBrowserFactory.launch();
    const calls = mockBrowser.newContext.mock.calls as unknown as Array<[Record<string, unknown>]>;
    expect(calls.length).toBeGreaterThan(0);
    const opts = calls[0][0];
    expect(typeof opts.userAgent).toBe('string');
    expect((opts.userAgent as string).length).toBeGreaterThan(20);
  });
});
