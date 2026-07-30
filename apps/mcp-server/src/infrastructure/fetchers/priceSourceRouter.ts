/**
 * Infrastructure — Price Source Router
 *
 * Intelligent selector for price sources during VPS outages.
 * Decides: primary (VPS) → fallback chain (cache → Yahoo Finance).
 *
 * @module infrastructure/fetchers/priceSourceRouter
 */

import { breakers } from "../circuitBreakerRegistry.js";
import type { CircuitState } from "../circuitBreaker.js";

export interface PriceSourceRoute {
  primary: {
    type: "vps";
    source: string;
    timeout: number;
    description: string;
  };
  fallbacks: Array<{
    type: "cache" | "yahoo";
    source: string;
    timeout: number;
    description: string;
  }>;
  shouldUseFallback: boolean;
  stalewnessMinutes: number;
  coverageGap: string | null;
}

/**
 * Route price fetch request to appropriate source.
 *
 * @param ticker Stock ticker (e.g., "VNM")
 * @param vpsHealth Current VPS health status
 * @param cachedPrice Last known price (if any)
 * @param stockClassification Classification (exchange, majorCap flag)
 * @returns Route object specifying primary + fallback chain
 */
export function priceSourceRouter(
  ticker: string,
  vpsHealth: {
    circuitState: CircuitState;
    lastQuoteMinutesAgo: number;
  },
  cachedPrice: { price: number; timestamp: Date } | null,
  stockClassification: {
    exchange: "HOSE" | "HNX" | "UPCOM";
    majorCap: boolean;
  }
): PriceSourceRoute {
  const VPS_STALE_THRESHOLD_MINUTES = 10;
  // hardcode-scan-allow: JANITOR-034 — pending generalization decision, tracked in docs/data/code-janitor-known-findings.json
  const MAJOR_CAPS = ["VNM", "FPT", "VCB", "HPG", "BID", "VHM", "VIC", "CTG"];

  // Calculate staleness of cached price
  let stalewnessMinutes = 0;
  if (cachedPrice && cachedPrice.timestamp) {
    stalewnessMinutes = Math.round(
      (Date.now() - cachedPrice.timestamp.getTime()) / 60_000
    );
  }

  // Determine if we should use fallback
  const shouldUseFallback =
    vpsHealth.lastQuoteMinutesAgo > VPS_STALE_THRESHOLD_MINUTES;

  // Build fallback chain
  const fallbacks: PriceSourceRoute["fallbacks"] = [];
  let coverageGap: string | null = null;

  if (shouldUseFallback) {
    // Always add cache fallback
    fallbacks.push({
      type: "cache",
      source: "market_prices table (cached)",
      timeout: 5000,
      description: "Last known price from any source, <6h staleness",
    });

    // Conditionally add Yahoo Finance fallback (major caps only)
    if (stockClassification.majorCap && MAJOR_CAPS.includes(ticker)) {
      fallbacks.push({
        type: "yahoo",
        source: "Yahoo Finance API",
        timeout: 30000,
        description:
          "5-15min stale; HOSE major caps only; rate-limited 300 req/min",
      });
    } else if (stockClassification.exchange !== "HOSE") {
      // HNX/UPCOM not available from Yahoo
      coverageGap = `${stockClassification.exchange}-listed; unavailable from Yahoo fallback`;
    }
  }

  return {
    primary: {
      type: "vps",
      source: "VnDirect (via VPS)",
      timeout: 30000,
      description: "Real-time prices ALL exchanges (HOSE/HNX/UPCOM), <1min staleness",
    },
    fallbacks,
    shouldUseFallback,
    stalewnessMinutes,
    coverageGap,
  };
}
