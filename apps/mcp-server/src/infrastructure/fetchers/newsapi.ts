/**
 * Infrastructure — NewsAPI.org Fetcher
 *
 * Fetches Vietnam-related news from NewsAPI.org as a fallback source when
 * the VPS Reuters push has been absent for >90 minutes.
 *
 * Safe no-key path: returns [] immediately when apiKey is empty or enabled
 * is false — zero I/O, suitable for deployments without a NewsAPI key.
 *
 * API docs: https://newsapi.org/docs/endpoints/everything
 *
 * Layer: infrastructure/fetchers — may use HTTP libs, must not import domain/.
 *
 * @module infrastructure/fetchers/newsapi
 */

import type { RssItem } from "./rss.js";
import { logger } from "../logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** NewsAPI endpoint for "everything" search. */
const NEWSAPI_URL = "https://newsapi.org/v2/everything";

/** Default query: Vietnam economy and stock market news. */
const DEFAULT_QUERY = "Vietnam economy OR Vietnam stock market OR VN-Index";

/** Max results per request — NewsAPI free tier allows up to 100. */
const PAGE_SIZE = 20;

/** Source tag applied to all items from this fetcher. */
const SOURCE_TAG = "newsapi";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Configuration injected from mcpConfig.newsSources.newsapi. */
export interface NewsApiConfig {
  /** NewsAPI.org API key. Empty string = stub path (returns []). */
  apiKey: string;
  /** Master switch — false means skip entirely. */
  enabled: boolean;
  /** Optional query override (defaults to DEFAULT_QUERY). */
  query?: string;
}

/** Shape of one article from the NewsAPI /everything response. */
interface NewsApiArticle {
  title: string | null;
  url: string | null;
  publishedAt: string | null;
  description: string | null;
  source?: { name?: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches Vietnam-related news from NewsAPI.org.
 *
 * Stub path: returns [] immediately when `apiKey` is empty or `enabled` is
 * false — zero network calls, safe for deployments without a key.
 *
 * @param config  - NewsAPI configuration (key, enabled flag, optional query)
 * @returns       - Array of RssItem (empty on failure or stub path)
 */
export async function fetchNewsApi(config: NewsApiConfig): Promise<RssItem[]> {
  // Stub path — no key or disabled: zero I/O
  if (!config.enabled || !config.apiKey) {
    logger.debug("[newsapi] skipping fetch — disabled or no apiKey configured");
    return [];
  }

  const query = config.query ?? DEFAULT_QUERY;
  const url = new URL(NEWSAPI_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("language", "en");
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  url.searchParams.set("apiKey", config.apiKey);

  try {
    logger.debug("[newsapi] fetching articles", { query, pageSize: PAGE_SIZE });

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VNMarket/1.0; +https://github.com/phamhung075/VN-Market-Intelligence-MCP)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      logger.warn("[newsapi] HTTP error", { status: response.status });
      return [];
    }

    const data = (await response.json()) as {
      status: string;
      articles?: NewsApiArticle[];
    };

    if (data.status !== "ok" || !Array.isArray(data.articles)) {
      logger.warn("[newsapi] unexpected response shape", { status: data.status });
      return [];
    }

    const items: RssItem[] = data.articles
      .filter((a) => a.title && a.url)
      .map((a) => ({
        title: a.title!,
        url: a.url!,
        source: SOURCE_TAG,
        publishedAt: a.publishedAt ?? new Date().toISOString(),
        content: a.description ?? "",
      }));

    logger.info("[newsapi] fetched articles", { count: items.length });
    return items;
  } catch (err) {
    logger.error("[newsapi] fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
