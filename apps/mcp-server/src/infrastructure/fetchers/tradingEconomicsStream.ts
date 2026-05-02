/**
 * Infrastructure — Trading Economics News Fetcher (RSS strategy)
 *
 * Fetches global macro/market news using three free public RSS feeds with
 * sequential fallback, replacing the defunct session-gated stream.ashx endpoint.
 *
 * Strategy:
 *   1. MarketWatch top stories RSS — if ≥1 item → done.
 *   2. Google News: global economy / central banks / inflation — if ≥1 item → done.
 *   3. Google News: financial markets / commodities / USD-VND exchange rate.
 *   4. All empty → return [] (never throws).
 *
 * Items are normalized to RssItem for compatibility with the pollNews pipeline.
 *
 * Layer: infrastructure/fetchers — may use HTTP libs, must not import domain/.
 */

import { parseRssFeed, type RssItem } from "./rss.js";
import type { HttpClient } from "./ssc.js";
import { logger } from "../logger.js";
import { globalRateLimiter } from "../../domain/services/rateLimiter.js";
import { BROWSER_UA } from "./browserHeaders.js";

// ── Consecutive-error observability (Task 1828c) ──────────────────────────
const TE_STREAM_ERROR_THRESHOLD = 10;
let _teStreamConsecutiveErrors = 0;
let _teStreamAlertSent = false;

export function resetTeStreamErrorCounter(): void {
  _teStreamConsecutiveErrors = 0;
  _teStreamAlertSent = false;
}

export interface TeStreamDeps {
  onAlert?: (message: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Feed 1: MarketWatch top stories RSS. */
const MW_RSS_URL =
  "https://feeds.marketwatch.com/marketwatch/topstories/";

/** Feed 2: Google News — global economy, central banks, inflation. */
const GNEWS_MACRO_URL =
  "https://news.google.com/rss/search?q=global+economy+OR+central+bank+OR+interest+rate+OR+inflation&hl=en";

/** Feed 3: Google News — financial markets, commodities, USD/VND. */
const GNEWS_MARKETS_URL =
  "https://news.google.com/rss/search?q=financial+markets+OR+commodities+OR+USD+VND+exchange+rate&hl=en";

/** Source tag for all items from this fetcher. */
const TE_SOURCE = "tradingeconomics";

// ---------------------------------------------------------------------------
// Default HTTP client (axios, lazy-imported)
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
          // MarketWatch and Google News block bot-like UAs with 403 — use a browser UA
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
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
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Attempts to fetch and parse an RSS feed from the given URL.
 * Returns a tagged array of RssItem, or an empty array on any failure.
 *
 * @param url       - RSS feed URL to fetch.
 * @param sourceTag - Source identifier to stamp onto every returned item.
 * @param client    - HTTP client to use for the request.
 */
async function tryFetchFeed(
  url: string,
  sourceTag: string,
  client: HttpClient,
): Promise<RssItem[]> {
  try {
    logger.debug("[te-rss] fetching RSS feed", { url, source: sourceTag });
    const xml = await client.get(url);
    const items = parseRssFeed(xml);

    if (items.length === 0) {
      logger.debug("[te-rss] empty feed result", { url, source: sourceTag });
      return [];
    }

    const tagged = items.map((item) => ({ ...item, source: sourceTag }));
    logger.info("[te-rss] fetched RSS items", { source: sourceTag, count: tagged.length });
    return tagged;
  } catch (err) {
    logger.warn("[te-rss] failed to fetch RSS feed", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches global macro/market news from public RSS feeds with sequential fallback.
 *
 * Strategy:
 *   1. MarketWatch top stories. If ≥1 item → done.
 *   2. Google News global economy / central banks / inflation. If ≥1 item → done.
 *   3. Google News financial markets / commodities / USD-VND. If ≥1 item → done.
 *   4. All empty → return [] (never throws).
 *
 * @param httpClient - Optional HTTP client; defaults to an axios-backed client.
 *                     Inject a mock in tests to avoid real network calls.
 * @returns Promise resolving to an array of RssItem (empty on total failure).
 */
export async function fetchTradingEconomicsStream(
  httpClient?: HttpClient,
  deps?: TeStreamDeps,
): Promise<RssItem[]> {
  // Rate limit guard — skip if called too soon (test mode bypasses via injected httpClient)
  if (!httpClient && !globalRateLimiter.canCall("tradingeconomics-rss")) {
    logger.debug("[te-rss] rate-limited — skipping fetch", {
      waitMs: globalRateLimiter.getWaitMs("tradingeconomics-rss"),
    });
    return [];
  }

  const client = httpClient ?? (await makeDefaultHttpClient());

  if (!httpClient) globalRateLimiter.recordCall("tradingeconomics-rss");

  // Step 1: MarketWatch top stories
  const feed1 = await tryFetchFeed(MW_RSS_URL, TE_SOURCE, client);
  if (feed1.length > 0) {
    _teStreamConsecutiveErrors = 0;
    _teStreamAlertSent = false;
    return feed1;
  }

  // Step 2: Google News — global economy / central banks / inflation
  logger.info("[te-rss] Feed 1 empty or failed — trying Feed 2 (GNEWS_MACRO)");
  const feed2 = await tryFetchFeed(GNEWS_MACRO_URL, TE_SOURCE, client);
  if (feed2.length > 0) {
    _teStreamConsecutiveErrors = 0;
    _teStreamAlertSent = false;
    return feed2;
  }

  // Step 3: Google News — financial markets / commodities / USD-VND
  logger.info("[te-rss] Feed 2 empty or failed — trying Feed 3 (GNEWS_MARKETS)");
  const feed3 = await tryFetchFeed(GNEWS_MARKETS_URL, TE_SOURCE, client);
  if (feed3.length > 0) {
    _teStreamConsecutiveErrors = 0;
    _teStreamAlertSent = false;
    return feed3;
  }

  // All three failed
  logger.warn("[te-rss] all RSS sources failed — returning empty array");
  _teStreamConsecutiveErrors++;
  if (_teStreamConsecutiveErrors >= TE_STREAM_ERROR_THRESHOLD && !_teStreamAlertSent) {
    _teStreamAlertSent = true;
    const alertMsg =
      `tradingEconomics: ${_teStreamConsecutiveErrors} consecutive fetch failures — CB not yet tripped. Consider manual check.`;
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
