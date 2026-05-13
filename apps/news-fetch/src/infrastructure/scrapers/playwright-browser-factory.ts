/**
 * PlaywrightBrowserFactory
 *
 * Single responsibility: launch Chromium with standard stealth settings,
 * apply playwright-stealth, and return { browser, context, page }.
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
import stealth from 'playwright-stealth';

export class PlaywrightBrowserFactory {
  /**
   * Launch a headless Chromium browser with playwright-stealth applied.
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
      // Browser User-Agent per dev-standards: VN sites (and Reuters/Bloomberg)
      // return 503 for default Node/Bun UA strings.
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });

    // Stealth MUST be applied to context, before newPage() — per playwright-stealth docs.
    await stealth(context);

    const page = await context.newPage();

    return { browser, context, page };
  }
}
