/**
 * Unit test — PlaywrightBrowserFactory
 * Task: 1899a-factory
 *
 * Mocks playwright (chromium.launch) and playwright-stealth so no real browser
 * is launched. Verifies the factory:
 *   - calls chromium.launch with headless:true
 *   - creates a new context
 *   - applies stealth to context (not page) before newPage()
 *   - returns { browser, context, page }
 *   - does NOT call browser.close() itself (caller owns lifecycle)
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';

// ── Mock objects ──────────────────────────────────────────────────────────────

const mockPage = { goto: mock(async () => {}), isMock: 'page' } as const;
const mockContext = {
  newPage: mock(async () => mockPage),
  isMock: 'context',
} as const;
const mockBrowser = {
  newContext: mock(async () => mockContext),
  close: mock(async () => {}),
  isMock: 'browser',
} as const;

// Playwright mock — must shadow module resolution before factory import.
// Bun module mocking: mock.module() replaces the module for subsequent dynamic imports.
mock.module('playwright', () => ({
  default: {
    chromium: {
      launch: mock(async () => mockBrowser),
    },
  },
}));

// playwright-stealth mock — records calls so we can assert invocation order.
const stealthCalls: unknown[] = [];
mock.module('playwright-stealth', () => ({
  default: mock(async (ctx: unknown) => {
    stealthCalls.push(ctx);
  }),
}));

// ── Import factory AFTER mocks are registered ─────────────────────────────────
// Dynamic import ensures Bun resolves the module against the registered mock.
const { PlaywrightBrowserFactory } = await import(
  '../src/infrastructure/scrapers/playwright-browser-factory.js'
);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('1899a-factory — PlaywrightBrowserFactory', () => {
  beforeEach(() => {
    // Reset call counts before each test.
    mockBrowser.newContext.mockClear();
    mockBrowser.close.mockClear();
    mockContext.newPage.mockClear();
    stealthCalls.length = 0;
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
    // Obtain fresh reference to the mock after module resolution.
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

  it('launch() applies stealth to context — not page', async () => {
    await PlaywrightBrowserFactory.launch();
    expect(stealthCalls).toHaveLength(1);
    // The single stealth call must receive context, not page.
    expect(stealthCalls[0]).toBe(mockContext);
  });

  it('launch() calls stealth BEFORE newPage()', async () => {
    const order: string[] = [];

    stealthCalls.length = 0;
    // Wrap newPage to record order.
    mockContext.newPage.mockImplementation(async () => {
      order.push('newPage');
      return mockPage;
    });

    mock.module('playwright-stealth', () => ({
      default: mock(async (ctx: unknown) => {
        stealthCalls.push(ctx);
        order.push('stealth');
      }),
    }));

    // Re-import factory to pick up new stealth mock.
    const { PlaywrightBrowserFactory: Factory2 } = await import(
      '../src/infrastructure/scrapers/playwright-browser-factory.js'
    );
    await Factory2.launch();

    const stealthIdx = order.indexOf('stealth');
    const newPageIdx = order.indexOf('newPage');

    // stealth must appear before newPage in the call order.
    expect(stealthIdx).toBeLessThan(newPageIdx);
  });

  it('launch() does NOT call browser.close()', async () => {
    await PlaywrightBrowserFactory.launch();
    expect(mockBrowser.close).not.toHaveBeenCalled();
  });

  it('launch() does NOT call context.newPage() more than once', async () => {
    await PlaywrightBrowserFactory.launch();
    expect(mockContext.newPage).toHaveBeenCalledTimes(1);
  });
});
