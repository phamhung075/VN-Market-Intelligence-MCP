/**
 * Infrastructure — VnExpress Finance RSS Fetcher
 *
 * Fetches the latest business/finance news from VnExpress (vnexpress.net) via
 * their public RSS feed and normalises it into RssItem records.
 *
 * Layer: infrastructure/fetchers — may use HTTP libs, must not import domain/.
 */

import { parseRssFeed, type RssItem } from "./rss.js";
import type { HttpClient } from "./ssc.js";
import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** VnExpress Finance / Kinh doanh RSS feed. */
const VNEXPRESS_RSS_URL = "https://vnexpress.net/rss/kinh-doanh.rss";

/** Source tag applied to all items fetched from VnExpress. */
const VNEXPRESS_SOURCE = "vnexpress";

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
          "User-Agent":
            "Mozilla/5.0 (compatible; VN-Market-Intelligence/1.0; +https://github.com/vn-market)",
          Accept: "application/rss+xml, text/xml, application/xml, */*",
        },
        timeout: 15_000,
        responseType: "text",
      });
      return response.data;
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches the VnExpress Finance RSS feed and returns the parsed items.
 *
 * Each returned item has `source = 'vnexpress'` set.
 *
 * @param httpClient - Optional HTTP client; defaults to an axios-backed client.
 *                     Inject a mock in tests to avoid real network calls.
 * @returns Promise resolving to an array of RssItem (empty on error).
 */
export async function fetchVnExpress(httpClient?: HttpClient): Promise<RssItem[]> {
  const client = httpClient ?? (await makeDefaultHttpClient());

  logger.debug("[vnexpress] fetching RSS feed", { url: VNEXPRESS_RSS_URL });

  try {
    const xml = await client.get(VNEXPRESS_RSS_URL);
    const items = parseRssFeed(xml);

    // Tag every item with the VnExpress source identifier
    const tagged = items.map((item) => ({ ...item, source: VNEXPRESS_SOURCE }));

    logger.info("[vnexpress] fetched RSS items", { count: tagged.length });

    return tagged;
  } catch (err) {
    logger.error("[vnexpress] failed to fetch RSS feed", {
      url: VNEXPRESS_RSS_URL,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
