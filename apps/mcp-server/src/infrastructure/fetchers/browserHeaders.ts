/**
 * Shared browser HTTP headers for Vietnamese site fetchers.
 *
 * Vietnamese financial and government sites (cafef.vn, vndirect, etc.)
 * return HTTP 503 or bot-detection pages when they see non-browser User-Agents.
 * Centralise the UA here so all fetchers stay in sync on a single Chrome version.
 *
 * Layer: infrastructure/fetchers — HTTP I/O only.
 *
 * DO NOT import this from domain/ — domain has zero infrastructure dependencies.
 * DO NOT use BROWSER_UA for sites that require a bot-identified UA (e.g. yahooFinance,
 * sbv, fredApi) or for Chromium/Puppeteer stealth (see tradingEconomicsChromium.ts
 * which exports TE_USER_AGENT separately).
 */

/**
 * Desktop Chrome 131 User-Agent string.
 * Matches macOS Chrome 131 — the version historically accepted by HOSE/CafeF/VnExpress.
 * Update when sites begin rejecting Chrome 131.
 */
export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Returns a minimal set of browser-like headers suitable for Vietnamese
 * HTTP/RSS/JSON endpoints that block bot User-Agents.
 */
export function buildBrowserHeaders(
  accept = "*/*",
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    "User-Agent": BROWSER_UA,
    Accept: accept,
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    ...extra,
  };
}
