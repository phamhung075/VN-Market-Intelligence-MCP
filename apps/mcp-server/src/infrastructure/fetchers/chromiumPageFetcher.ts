/**
 * Shared Chromium/Playwright page fetcher for mcp-server.
 * Playwright runs locally on the main server — never on VPS.
 *
 * Reuses the same launch config (buildChromiumLaunchConfig) that the
 * tradingEconomicsChromium fetcher uses, ensuring consistent headless flags
 * for the Docker environment.
 *
 * Layer: infrastructure/fetchers — may use HTTP/browser/fs; must not import domain/.
 *
 * @module infrastructure/fetchers/chromiumPageFetcher
 */

import { buildChromiumLaunchConfig, TE_USER_AGENT } from "./tradingEconomicsChromium.js";
import { logger } from "../logger.js";

/**
 * Fetches a URL using a headless Chromium browser (puppeteer-core) and returns
 * the fully-rendered page HTML via `page.content()`.
 *
 * - Waits for `networkidle2` (≤ timeoutMs) so JavaScript-rendered pages
 *   (Oracle ADF, React SPAs) are fully hydrated before HTML is captured.
 * - Retries once on "Target closed" crashes (known Chromium 147 instability
 *   in Docker when the first page context tears down unexpectedly).
 * - Always closes the browser in a `finally` block.
 * - Never throws — callers receive a thrown Error on unrecoverable failure
 *   (after the single retry) so they can wrap gracefully.
 *
 * @param url       - Fully-qualified URL to load.
 * @param timeoutMs - Navigation timeout in milliseconds (default 30 000).
 * @returns         - Raw HTML string of the fully-rendered page.
 * @throws          - Error if both the initial attempt and the retry fail.
 */
export async function chromiumFetchPage(url: string, timeoutMs = 30_000): Promise<string> {
  return _attemptFetch(url, timeoutMs, true);
}

async function _attemptFetch(url: string, timeoutMs: number, allowRetry: boolean): Promise<string> {
  // Dynamic import so TypeScript does not require puppeteer-core at compile
  // time — the Docker image installs it at build time.
  const puppeteer = (await import("puppeteer-core")).default;

  const browser = await puppeteer.launch(buildChromiumLaunchConfig());

  try {
    const page = await browser.newPage();
    await page.setUserAgent(TE_USER_AGENT);

    logger.info("[chromium-page-fetcher] navigating", { url, timeoutMs });

    await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });

    const html = await page.content();

    logger.info("[chromium-page-fetcher] page loaded", {
      url,
      htmlLength: html.length,
    });

    return html;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Retry once on known Chromium "Target closed" crash
    if (allowRetry && msg.includes("Target closed")) {
      logger.warn("[chromium-page-fetcher] Target closed — retrying once", { url });
      try { await browser.close(); } catch { /* ignore */ }
      return _attemptFetch(url, timeoutMs, false);
    }

    throw err;
  } finally {
    try { await browser.close(); } catch { /* ignore teardown errors */ }
  }
}
