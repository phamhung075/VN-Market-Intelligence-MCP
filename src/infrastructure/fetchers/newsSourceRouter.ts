/**
 * Infrastructure — News Source Router
 *
 * Intelligent selector for news sources during VPS outages.
 * Decides: primary (VPS) → fallback chain (cache → domestic RSS).
 *
 * @module infrastructure/fetchers/newsSourceRouter
 */

import { breakers } from "../circuitBreakerRegistry.js";
import type { CircuitState } from "../circuitBreaker.js";

export interface NewsSourceRoute {
  primary: {
    type: "vps";
    endpoint: string;
    timeout: number;
    description: string;
  };
  fallbacks: Array<{
    type: "cache" | "domestic_rss";
    endpoint: string;
    timeout: number;
    description: string;
  }>;
  shouldUseFallback: boolean;
  lastVpsHealthCheck: {
    state: CircuitState;
    failureCount?: number;
  };
}

/**
 * Route news fetch request to appropriate source.
 *
 * @param vpsHealth Current VPS health status
 * @param config Fallback configuration
 * @param cacheArticleCount24h Number of articles in cache (last 24h)
 * @returns Route object specifying primary + fallback chain
 */
export function newsSourceRouter(
  vpsHealth: {
    circuitState: CircuitState;
    lastSuccessMinutesAgo: number;
  },
  config: {
    enableDomesticNewsFallback: boolean;
  },
  cacheArticleCount24h: number
): NewsSourceRoute {
  const VPS_STALE_THRESHOLD_MINUTES = 15;
  const MIN_CACHE_ARTICLES_FOR_DOMESTIC_FALLBACK = 10;

  // Determine if we should use fallback
  const shouldUseFallback =
    vpsHealth.circuitState === "open" ||
    vpsHealth.lastSuccessMinutesAgo > VPS_STALE_THRESHOLD_MINUTES;

  // Build fallback chain
  const fallbacks: NewsSourceRoute["fallbacks"] = [];

  if (shouldUseFallback) {
    // Always add cache fallback
    fallbacks.push({
      type: "cache",
      endpoint: "db:select from news where source IN (cafef, vnexpress, reuters, ...)",
      timeout: 5000,
      description: "Cached news from last 7 days (immediate, no freshness)",
    });

    // Conditionally add domestic RSS fallback
    if (
      config.enableDomesticNewsFallback &&
      cacheArticleCount24h < MIN_CACHE_ARTICLES_FOR_DOMESTIC_FALLBACK
    ) {
      fallbacks.push({
        type: "domestic_rss",
        endpoint: "cafef.vn, vnexpress.net, vneconomy.vn (direct, no VPS proxy)",
        timeout: 30000,
        description: "Direct RSS from Vietnamese sources (5-15min stale, bot-risk moderate)",
      });
    }
  }

  return {
    primary: {
      type: "vps",
      endpoint: `http://${process.env.VINAHOST_IP || "vps"}:3001/fetch-news`,
      timeout: 30000,
      description: "Real-time VPS proxy (10 sources, 226 items/15min)",
    },
    fallbacks,
    shouldUseFallback,
    lastVpsHealthCheck: {
      state: vpsHealth.circuitState,
      failureCount: breakers.cafef.stats.failures, // Read from breaker stats
    },
  };
}
