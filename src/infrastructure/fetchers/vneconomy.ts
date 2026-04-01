/**
 * Infrastructure — VnEconomy RSS Fetcher
 *
 * Fetches financial news from VnEconomy (vneconomy.vn) via their RSS feeds.
 * Two feeds: chứng khoán (stocks) and tài chính (finance).
 *
 * Layer: infrastructure/fetchers — may use HTTP libs, must not import domain/.
 */

import { parseRssFeed, type RssItem } from "./rss.js";
import type { HttpClient } from "./ssc.js";
import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** VnEconomy stock market RSS feed. */
const VNECONOMY_STOCKS_URL = "https://vneconomy.vn/chung-khoan.rss";

/** VnEconomy finance RSS feed. */
const VNECONOMY_FINANCE_URL = "https://vneconomy.vn/tai-chinh.rss";

/** Source tag applied to all items fetched from VnEconomy. */
const VNECONOMY_SOURCE = "vneconomy";

// ---------------------------------------------------------------------------
// Default HTTP client (axios)
// ---------------------------------------------------------------------------

async function makeDefaultHttpClient(): Promise<HttpClient> {
  const axiosModule = await import("axios");
  const axios = axiosModule.default;

  return {
    async get(url: string): Promise<string> {
      const response = await axios.get<string>(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
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
 * Fetches VnEconomy stock market + finance RSS feeds and returns the merged items.
 * Deduplicates by URL. Items are tagged with `source = 'vneconomy'`.
 *
 * @param httpClient - Optional HTTP client for testing.
 * @returns Promise resolving to an array of RssItem (empty on error).
 */
export async function fetchVnEconomy(httpClient?: HttpClient): Promise<RssItem[]> {
  const client = httpClient ?? (await makeDefaultHttpClient());
  const allItems: RssItem[] = [];
  const seenUrls = new Set<string>();

  for (const feedUrl of [VNECONOMY_STOCKS_URL, VNECONOMY_FINANCE_URL]) {
    try {
      logger.debug("[vneconomy] fetching RSS feed", { url: feedUrl });

      const xml = await client.get(feedUrl);
      const items = parseRssFeed(xml);

      for (const item of items) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          allItems.push({ ...item, source: VNECONOMY_SOURCE });
        }
      }
    } catch (err) {
      logger.error("[vneconomy] failed to fetch RSS feed", {
        url: feedUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue to next feed — don't abort
    }
  }

  logger.info("[vneconomy] fetched RSS items", { count: allItems.length });
  return allItems;
}
