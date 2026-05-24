// @ts-nocheck — deprecated file; relative imports no longer resolve from _deprecated/ location.
// Retained for rollback reference only. See _deprecated/fetchers/README.md.
/**
 * Infrastructure — International Finance News RSS Fetcher
 *
 * Fetches international business/finance news with a sequential fallback:
 *   1. Try the primary Google News RSS feed for Vietnam economy / stock market news.
 *   2. If the primary returns an empty result or throws, try the secondary Google News
 *      feed for broader Asia finance / emerging markets news.
 *   3. If both fail, return an empty array (never throws).
 *
 * Google News RSS endpoints (replaces the defunct Reuters/AP feeds):
 *   Primary:   https://news.google.com/rss/search?q=vietnam+economy+OR+stock+market&hl=en
 *   Secondary: https://news.google.com/rss/search?q=asia+finance+OR+emerging+markets&hl=en
 *
 * Source tags are kept for backward compatibility:
 *   - Primary feed items are tagged source = 'reuters'
 *   - Secondary feed items are tagged source = 'ap_news'
 *
 * Layer: infrastructure/fetchers — may use HTTP libs, must not import domain/.
 */

import { parseRssFeed, type RssItem } from "./rss.js";
import type { HttpClient } from "./ssc.js";
import { logger } from "../logger.js";
import { globalRateLimiter } from "../../domain/services/rateLimiter.js";
import { BROWSER_UA } from "./browserHeaders.js";

// ── Consecutive-error observability (Task 1828c) ──────────────────────────
const REUTERS_ERROR_THRESHOLD = 10;
let _reutersConsecutiveErrors = 0;
let _reutersAlertSent = false;

/** Reset counter for test isolation — do NOT call from production code. */
export function resetReutersErrorCounter(): void {
  _reutersConsecutiveErrors = 0;
  _reutersAlertSent = false;
}

export interface ReutersDeps {
  onAlert?: (message: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Primary Google News RSS feed — Vietnam economy + stock market news. */
const GOOGLE_NEWS_PRIMARY_URL =
  "https://news.google.com/rss/search?q=vietnam+economy+OR+stock+market&hl=en";

/** Secondary Google News RSS feed — Asia finance + emerging markets. */
const GOOGLE_NEWS_SECONDARY_URL =
  "https://news.google.com/rss/search?q=asia+finance+OR+emerging+markets&hl=en";

/**
 * Source tag for primary feed items.
 * Kept as 'reuters' for backward compatibility with downstream consumers.
 */
const REUTERS_SOURCE = "reuters";

/**
 * Source tag for secondary feed items.
 * Kept as 'ap_news' for backward compatibility with downstream consumers.
 */
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
          // Google News blocks bot-like User-Agents with 403 — use a browser UA
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 15_000,
        responseType: "text",
        // Google News returns 302 redirects — must follow them
        maxRedirects: 5,
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
 * Fetches international finance news from Google News RSS feeds with fallback.
 *
 * Strategy:
 *   1. Fetch primary Google News RSS (Vietnam economy / stocks). If ≥1 item → done.
 *   2. Otherwise fall back to secondary Google News RSS (Asia finance / emerging markets).
 *      If ≥1 item → done.
 *   3. Return `[]` if both fail — never throws.
 *
 * Source tags (preserved for backward compatibility):
 *   - `source = 'reuters'`  when the primary feed succeeds.
 *   - `source = 'ap_news'`  when the secondary fallback is used.
 *
 * @param httpClient - Optional HTTP client; defaults to an axios-backed client.
 *                     Inject a mock in tests to avoid real network calls.
 * @returns Promise resolving to an array of RssItem (empty on total failure).
 */
export async function fetchReuters(httpClient?: HttpClient, deps?: ReutersDeps): Promise<RssItem[]> {
  // Rate limit guard — skip if called too soon (test mode bypasses via injected httpClient)
  if (!httpClient && !globalRateLimiter.canCall("news.google.com")) {
    logger.debug("[reuters] rate-limited — skipping fetch", {
      waitMs: globalRateLimiter.getWaitMs("news.google.com"),
    });
    return [];
  }

  const client = httpClient ?? (await makeDefaultHttpClient());

  if (!httpClient) globalRateLimiter.recordCall("news.google.com");

  // Step 1: Primary Google News feed (Vietnam economy / stocks)
  const primaryItems = await tryFetchFeed(
    GOOGLE_NEWS_PRIMARY_URL,
    REUTERS_SOURCE,
    client,
  );
  if (primaryItems.length > 0) {
    _reutersConsecutiveErrors = 0;
    _reutersAlertSent = false;
    return primaryItems;
  }

  // Step 2: Secondary Google News feed (Asia finance / emerging markets)
  logger.info(
    "[reuters] primary Google News feed empty or failed — trying secondary feed",
  );
  const secondaryItems = await tryFetchFeed(
    GOOGLE_NEWS_SECONDARY_URL,
    AP_NEWS_SOURCE,
    client,
  );
  if (secondaryItems.length > 0) {
    _reutersConsecutiveErrors = 0;
    _reutersAlertSent = false;
    return secondaryItems;
  }

  // Step 3: total failure — return empty array
  logger.warn("[reuters] all RSS sources failed — returning empty array");
  _reutersConsecutiveErrors++;
  if (_reutersConsecutiveErrors >= REUTERS_ERROR_THRESHOLD && !_reutersAlertSent) {
    _reutersAlertSent = true;
    const alertMsg =
      `reuters RSS: ${_reutersConsecutiveErrors} consecutive errors — source may be down.`;
    try {
      if (deps?.onAlert) {
        await deps.onAlert(alertMsg);
      } else {
        const { sendTelegramWork } = await import("../notifiers/telegram.js");
        await sendTelegramWork(alertMsg);
      }
    } catch { /* alert failure must not abort fetch */ }
  }
  return [];
}
