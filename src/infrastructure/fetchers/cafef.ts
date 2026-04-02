/**
 * Infrastructure — CafeF RSS Fetcher
 *
 * Fetches the latest news from CafeF (cafef.vn) via their public RSS feed
 * and normalises it into RssItem records.
 *
 * Layer: infrastructure/fetchers — may use HTTP libs, must not import domain/.
 */

import { parseRssFeed, type RssItem } from "./rss.js";
import type { HttpClient } from "./ssc.js";
import { logger } from "../logger.js";
import { globalRateLimiter } from "../../domain/services/rateLimiter.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Primary CafeF RSS feed (stock market / thị trường chứng khoán). */
const CAFEF_RSS_URL = "https://cafef.vn/thi-truong-chung-khoan.rss";

/** Source tag applied to all items fetched from CafeF. */
const CAFEF_SOURCE = "cafef";

// ---------------------------------------------------------------------------
// Default HTTP client (axios)
// ---------------------------------------------------------------------------

/**
 * Creates the default production HTTP client backed by axios.
 * Lazy-imported so tests that inject a mock never load axios.
 */
async function makeDefaultHttpClient(): Promise<HttpClient> {
  const axiosModule = await import("axios");
  const axios = axiosModule.default;

  return {
    async get(url: string): Promise<string> {
      const response = await axios.get<string>(url, {
        headers: {
          // CafeF blocks bot-like User-Agents with 503 — use a browser UA
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "application/rss+xml, text/xml, application/xml, */*",
        },
        timeout: 15_000,
        responseType: "text",
        maxRedirects: 5,
      });
      return response.data;
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches the CafeF homepage RSS feed and returns the parsed items.
 *
 * Each returned item has `source = 'cafef'` set.
 *
 * @param httpClient - Optional HTTP client; defaults to an axios-backed client.
 *                     Inject a mock in tests to avoid real network calls.
 * @returns Promise resolving to an array of RssItem (empty on error).
 */
export async function fetchCafeF(httpClient?: HttpClient): Promise<RssItem[]> {
  // Rate limit guard — skip if called too soon (test mode bypasses via injected httpClient)
  if (!httpClient && !globalRateLimiter.canCall("cafef.vn")) {
    logger.debug("[cafef] rate-limited — skipping fetch", {
      waitMs: globalRateLimiter.getWaitMs("cafef.vn"),
    });
    return [];
  }

  const client = httpClient ?? (await makeDefaultHttpClient());

  if (!httpClient) globalRateLimiter.recordCall("cafef.vn");

  logger.debug("[cafef] fetching RSS feed", { url: CAFEF_RSS_URL });

  try {
    const xml = await client.get(CAFEF_RSS_URL);
    const items = parseRssFeed(xml);

    // Tag every item with the CafeF source identifier
    const tagged = items.map((item) => ({ ...item, source: CAFEF_SOURCE }));

    logger.info("[cafef] fetched RSS items", { count: tagged.length });

    return tagged;
  } catch (err) {
    logger.error("[cafef] failed to fetch RSS feed", {
      url: CAFEF_RSS_URL,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
