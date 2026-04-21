/**
 * Infrastructure — BCTC Source Router
 *
 * Intelligent selector for BCTC financial report sources during VPS outages.
 * Decides: primary (VPS) → fallback chain (cache → Công Báo).
 *
 * @module infrastructure/fetchers/bctcSourceRouter
 */

import { breakers } from "../circuitBreakerRegistry.js";
import type { CircuitState } from "../circuitBreaker.js";

export interface BctcSourceRoute {
  primary: {
    type: "vps";
    source: string;
    timeout: number;
    description: string;
  };
  fallbacks: Array<{
    type: "cache" | "congbao_fallback";
    source: string;
    timeout: number;
    description: string;
  }>;
  shouldUseFallback: boolean;
  stalewnessHours: number;
  quartersAvailable: string[];
}

/**
 * Route BCTC fetch request to appropriate source.
 *
 * @param ticker Stock ticker
 * @param quarter Fiscal quarter (Q1, Q2, Q3, Q4)
 * @param vpsHealth Current VPS health status
 * @param cachedReport Last cached report (if any)
 * @param config Fallback configuration
 * @returns Route object specifying primary + fallback chain
 */
export function bctcSourceRouter(
  ticker: string,
  quarter: "Q1" | "Q2" | "Q3" | "Q4",
  vpsHealth: {
    circuitState: CircuitState;
    lastFetchMinutesAgo: number;
    openDurationMinutes: number;
  },
  cachedReport: { quarter: string; timestamp: Date } | null,
  config: {
    enableCongbaoFallback: boolean;
    congbaoMinVpsOpenMinutes: number;
  }
): BctcSourceRoute {
  const VPS_STALE_THRESHOLD_MINUTES = 360; // 6 hours

  // Calculate staleness of cached report
  let stalewnessHours = 0;
  if (cachedReport && cachedReport.timestamp) {
    stalewnessHours = Math.round(
      (Date.now() - cachedReport.timestamp.getTime()) / (60_000 * 60)
    );
  }

  // Determine if we should use fallback
  const shouldUseFallback =
    vpsHealth.lastFetchMinutesAgo > VPS_STALE_THRESHOLD_MINUTES ||
    vpsHealth.circuitState === "open";

  // Build fallback chain
  const fallbacks: BctcSourceRoute["fallbacks"] = [];

  if (shouldUseFallback) {
    // Always add cache fallback (BCTC reports are stable within quarter)
    fallbacks.push({
      type: "cache",
      source: "bctc_reports table (cached)",
      timeout: 5000,
      description: "Last parsed BCTC from previous fetch, any staleness",
    });

    // Conditionally add Công Báo fallback
    // Requires: config enabled AND VPS breaker open for long enough
    if (
      config.enableCongbaoFallback &&
      vpsHealth.circuitState === "open" &&
      vpsHealth.openDurationMinutes >= config.congbaoMinVpsOpenMinutes
    ) {
      fallbacks.push({
        type: "congbao_fallback",
        source: "congbao.xyz / Công Báo (government gazette, domestic fallback)",
        timeout: 60000,
        description:
          "BCTC published in govt gazette, 1-5 days delayed, requires SSC portal DOWN",
      });
    }
  }

  // Quarters available in cache (placeholder; fetched from DB in actual implementation)
  const quartersAvailable = cachedReport ? [cachedReport.quarter] : [];

  return {
    primary: {
      type: "vps",
      source: "congbothongtin.ssc.gov.vn (via VPS proxy + Puppeteer)",
      timeout: 120000,
      description: "Official SSC BCTC PDFs, <6h staleness, comprehensive",
    },
    fallbacks,
    shouldUseFallback,
    stalewnessHours,
    quartersAvailable,
  };
}
