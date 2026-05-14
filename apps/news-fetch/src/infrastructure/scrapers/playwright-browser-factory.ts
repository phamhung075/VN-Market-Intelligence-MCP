/**
 * PlaywrightBrowserFactory
 *
 * Single responsibility: launch Chromium with inline stealth settings
 * and return { browser, context, page }.
 *
 * Stealth strategy (replaces removed playwright-stealth v0.0.1 placeholder):
 *   - Realistic Chrome UA via newContext userAgent
 *   - navigator.webdriver = false via addInitScript (most effective single patch)
 *   - locale/viewport/color-scheme matching a real Windows Chrome session
 *
 * playwright-stealth v0.0.1 was a never-functional placeholder package that
 * throws on import ("Wrong package"). Removed in task 1905a (c88).
 *
 * Caller responsibilities (this factory does NOT do these):
 *   - browser.close() in a finally block after each scrape session
 *   - All timeout / pause / human-simulation logic
 *
 * Caller pattern:
 *   const { browser, context, page } = await PlaywrightBrowserFactory.launch();
 *   try {
 *     await page.goto(url);
 *     // scraping logic
 *   } finally {
 *     await browser.close();
 *   }
 *
 * DDD: infrastructure layer — no domain or application imports.
 */

import playwright from 'playwright';

/**
 * Inline stealth init script injected into every page context before
 * any page script runs. Patches the most commonly fingerprinted property.
 */
const STEALTH_INIT_SCRIPT = `
  // Remove the webdriver flag that headless Chrome exposes by default.
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
  });
`;

export class PlaywrightBrowserFactory {
  /**
   * Launch a headless Chromium browser with inline stealth patches applied.
   *
   * Returns all three handles so callers can:
   *   - use `page` for navigation / scraping
   *   - use `context` for additional pages or cookies if needed
   *   - call `browser.close()` in their finally block
   *
   * No error handling: callers own the try/catch/finally lifecycle.
   */
  static async launch(): Promise<{
    browser: playwright.Browser;
    context: playwright.BrowserContext;
    page: playwright.Page;
  }> {
    const browser = await playwright.chromium.launch({
      headless: true,
    });

    const context = await browser.newContext({
      // Realistic Chrome UA — VN sites and Reuters/Bloomberg return 503
      // for default Node/Bun UA strings.
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      // Viewport matching a common desktop resolution — reduces canvas fingerprint variance.
      viewport: { width: 1280, height: 800 },
      // Locale and color scheme consistent with the UA above.
      locale: 'en-US',
      colorScheme: 'light',
    });

    // Patch navigator.webdriver before any page script executes.
    await context.addInitScript(STEALTH_INIT_SCRIPT);

    const page = await context.newPage();

    return { browser, context, page };
  }
}
