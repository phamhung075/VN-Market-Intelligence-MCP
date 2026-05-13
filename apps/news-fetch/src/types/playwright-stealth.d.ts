/**
 * Ambient type declaration for playwright-stealth (v0.0.1 — no bundled types).
 *
 * playwright-stealth applies stealth JS patches to a Playwright BrowserContext
 * to reduce bot-detection fingerprinting.
 */
declare module 'playwright-stealth' {
  import type { BrowserContext } from 'playwright';

  /**
   * Apply stealth patches to a BrowserContext.
   * Must be called AFTER context creation and BEFORE newPage().
   */
  function stealth(context: BrowserContext): Promise<void>;

  export default stealth;
}
