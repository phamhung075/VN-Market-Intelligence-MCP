/**
 * Infrastructure — Trading Economics News Stream Fetcher
 *
 * Fetches global macro/market news from the Trading Economics live stream.
 * API: https://tradingeconomics.com/ws/stream.ashx
 *
 * This provides Level 1 (global) and Level 2 (country) intelligence for the
 * causal cascade: Fed rate decisions, oil prices, commodity moves, GDP data,
 * inflation, stock market moves — all with country, category, and importance.
 *
 * Items are normalized to RssItem for compatibility with pollNews pipeline.
 *
 * Layer: infrastructure/fetchers — may use HTTP libs, must not import domain/.
 */

import type { RssItem } from "./rss.js";
import { logger } from "../logger.js";
import { globalRateLimiter } from "../../domain/services/rateLimiter.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Trading Economics stream AJAX endpoint. */
const TE_STREAM_URL = "https://tradingeconomics.com/ws/stream.ashx";

/** Source tag for all items from this fetcher. */
const TE_SOURCE = "tradingeconomics";

/** Default number of items to fetch per call. */
const DEFAULT_LIMIT = 30;

/** HTTP timeout in milliseconds. */
const TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Response types (internal)
// ---------------------------------------------------------------------------

/** Shape of a single item from the stream.ashx API. */
interface TEStreamItem {
  ID?: number;
  title?: string;
  description?: string;
  url?: string;
  author?: string;
  country?: string;
  category?: string;
  importance?: number; // 1-3 scale (3 = most important)
  date?: string;       // ISO 8601
  image?: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches the latest news from the Trading Economics global stream.
 *
 * Returns items as RssItem[] for direct integration with pollNews pipeline.
 * The `content` field includes country and category metadata for cascade engine.
 *
 * @param limit - Max number of items to fetch (default: 30)
 * @returns Array of RssItem tagged with source = 'tradingeconomics'. Empty on error.
 */
export async function fetchTradingEconomicsStream(
  limit = DEFAULT_LIMIT,
): Promise<RssItem[]> {
  // Rate limit guard — skip if called too soon
  if (!globalRateLimiter.canCall("tradingeconomics.com")) {
    logger.debug("[te-stream] rate-limited — skipping fetch", {
      waitMs: globalRateLimiter.getWaitMs("tradingeconomics.com"),
    });
    return [];
  }

  globalRateLimiter.recordCall("tradingeconomics.com");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${TE_STREAM_URL}?start=0&size=${limit}`;

    logger.debug("[te-stream] fetching news stream", { url, limit });

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json",
        Referer: "https://tradingeconomics.com/stream",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`TE stream HTTP ${response.status}`);
    }

    const data: TEStreamItem[] = await response.json();

    if (!Array.isArray(data)) {
      logger.warn("[te-stream] unexpected response format");
      return [];
    }

    const items: RssItem[] = [];

    for (const item of data) {
      if (!item.title) continue;

      // Build enriched content with metadata for cascade engine
      const country = item.country ?? "Global";
      const category = item.category ?? "";
      const importance = item.importance ?? 1;
      const description = item.description ?? "";

      // Prefix content with structured metadata so cascade engine can parse it
      const content = `[${country}] [${category}] [importance:${importance}] ${description}`;

      items.push({
        title: item.title,
        url: item.url
          ? `https://tradingeconomics.com${item.url}`
          : `https://tradingeconomics.com/stream#${item.ID ?? ""}`,
        publishedAt: item.date ?? new Date().toISOString(),
        content,
        source: TE_SOURCE,
      });
    }

    logger.info("[te-stream] fetched stream items", {
      count: items.length,
      countries: [...new Set(data.map((d) => d.country).filter(Boolean))].slice(0, 5),
    });

    return items;
  } catch (err) {
    logger.error("[te-stream] failed to fetch stream", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
