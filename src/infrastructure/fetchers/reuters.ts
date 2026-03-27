/**
 * Infrastructure — Reuters / AP News RSS Fetcher
 *
 * Fetches international business/finance news with a sequential fallback:
 *   1. Try Reuters Agency RSS feed first.
 *   2. If Reuters returns an empty result or throws, try AP News via RSSHub.
 *   3. If both fail, return an empty array (never throws).
 *
 * Layer: infrastructure/fetchers — may use HTTP libs, must not import domain/.
 */

import { parseRssFeed, type RssItem } from "./rss.js";
import type { HttpClient } from "./ssc.js";
import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Reuters Agency RSS feed for business/finance topics. */
const REUTERS_RSS_URL =
  "https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best";

/** AP News RSS feed via RSSHub (public mirror). */
const AP_NEWS_RSS_URL = "https://rsshub.app/apnews/topics/business";

/** Source tag for items fetched from the Reuters feed. */
const REUTERS_SOURCE = "reuters";

/** Source tag for items fetched from the AP News fallback feed. */
const AP_NEWS_SOURCE = "ap_news";

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
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Attempts to fetch and parse an RSS feed from the given URL.
 * Returns a tagged array of RssItem, or an empty array on any failure.
 *
 * @param url        - RSS feed URL to fetch.
 * @param sourceTag  - Source identifier to stamp onto every returned item.
 * @param client     - HTTP client to use for the request.
 */
async function tryFetchFeed(
  url: string,
  sourceTag: string,
  client: HttpClient,
): Promise<RssItem[]> {
  try {
    logger.debug("[reuters] fetching RSS feed", { url, source: sourceTag });
    const xml = await client.get(url);
    const items = parseRssFeed(xml);

    if (items.length === 0) {
      logger.debug("[reuters] empty feed result", { url, source: sourceTag });
      return [];
    }

    const tagged = items.map((item) => ({ ...item, source: sourceTag }));
    logger.info("[reuters] fetched RSS items", { source: sourceTag, count: tagged.length });
    return tagged;
  } catch (err) {
    logger.error("[reuters] failed to fetch RSS feed", {
      url,
      source: sourceTag,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches international business/finance news from Reuters with fallback to AP News.
 *
 * Strategy:
 *   1. Fetch Reuters RSS (`reutersagency.com`). If ≥1 item returned → done.
 *   2. Otherwise fall back to AP News via RSSHub. If ≥1 item → done.
 *   3. Return `[]` if both fail — never throws.
 *
 * Items are tagged:
 *   - `source = 'reuters'`  when the Reuters feed succeeds.
 *   - `source = 'ap_news'`  when the AP News fallback is used.
 *
 * @param httpClient - Optional HTTP client; defaults to an axios-backed client.
 *                     Inject a mock in tests to avoid real network calls.
 * @returns Promise resolving to an array of RssItem (empty on total failure).
 */
export async function fetchReuters(httpClient?: HttpClient): Promise<RssItem[]> {
  const client = httpClient ?? (await makeDefaultHttpClient());

  // Step 1: Reuters primary
  const reutersItems = await tryFetchFeed(REUTERS_RSS_URL, REUTERS_SOURCE, client);
  if (reutersItems.length > 0) {
    return reutersItems;
  }

  // Step 2: AP News fallback
  logger.info("[reuters] Reuters feed empty or failed — trying AP News fallback");
  const apItems = await tryFetchFeed(AP_NEWS_RSS_URL, AP_NEWS_SOURCE, client);
  if (apItems.length > 0) {
    return apItems;
  }

  // Step 3: total failure — return empty array
  logger.warn("[reuters] all RSS sources failed — returning empty array");
  return [];
}
