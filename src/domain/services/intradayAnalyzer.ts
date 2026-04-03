/**
 * Intraday Analyzer — domain service
 *
 * Pure function that detects market signals from a list of intraday tick data.
 *
 * Signal logic:
 *   - Calculates recentVolume5min (ticks within last 5 minutes)
 *   - avgVolume5min = avgDailyVolume / 78  (78 × 5-min intervals in a 6.5-h session)
 *   - velocityRatio = recentVolume5min / avgVolume5min
 *   - buyRatio = fraction of recent ticks with matchType "Buy"
 *
 *   Priority order (first match wins):
 *   1. institutional_buy  — velocityRatio > 2 AND buyRatio > 0.7
 *   2. institutional_sell — velocityRatio > 2 AND buyRatio < 0.3
 *   3. volume_burst CRITICAL — velocityRatio > 5
 *   4. volume_burst HIGH    — velocityRatio > 3
 *
 * Layer: domain/services — ZERO imports from infrastructure/
 */

import type { VnstockIntradayTick } from "../../infrastructure/fetchers/vnstockBridge.js";
import type { Severity } from "./signalDetector.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IntradaySignal {
  code: string;
  type: "volume_burst" | "institutional_buy" | "institutional_sell" | "price_momentum";
  severity: Severity;
  metrics: {
    /** Total volume traded in the last 5 minutes */
    recentVolume5min: number;
    /** Expected average volume per 5-min interval (avgDailyVolume / 78) */
    avgVolume5min: number;
    /** recentVolume5min / avgVolume5min */
    velocityRatio: number;
    /** Fraction of recent ticks (last 5 min) where matchType === "Buy" */
    buyRatio: number;
  };
  /** 0.0–1.0 confidence score based on velocity magnitude */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of 5-minute intervals in a 6.5-hour trading session (9:00–15:30) */
const INTERVALS_PER_DAY = 78;

/** Window for "recent" ticks (milliseconds) */
const RECENT_WINDOW_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Analyze a list of intraday ticks and return a signal if anomalous activity
 * is detected.
 *
 * @param ticks          - Intraday tick list (most recent first or last — order-agnostic)
 * @param avgDailyVolume - Average daily traded volume (shares)
 * @returns IntradaySignal or null if activity is within normal range
 */
export function analyzeIntradayTicks(
  ticks: VnstockIntradayTick[],
  avgDailyVolume: number,
): IntradaySignal | null {
  if (ticks.length === 0) return null;

  const now = Date.now();
  const cutoff = now - RECENT_WINDOW_MS;

  // Partition ticks into recent (last 5 min) vs historical
  const recentTicks = ticks.filter((t) => {
    const ts = new Date(t.time).getTime();
    return !Number.isNaN(ts) && ts >= cutoff;
  });

  if (recentTicks.length === 0) return null;

  // Metrics
  const recentVolume5min = recentTicks.reduce((sum, t) => sum + t.volume, 0);
  const avgVolume5min = avgDailyVolume / INTERVALS_PER_DAY;
  const velocityRatio = avgVolume5min > 0 ? recentVolume5min / avgVolume5min : 0;

  const buyCount = recentTicks.filter((t) => t.matchType === "Buy").length;
  const buyRatio = recentTicks.length > 0 ? buyCount / recentTicks.length : 0;

  const code = ticks[0]!.code;

  const metrics = {
    recentVolume5min,
    avgVolume5min,
    velocityRatio,
    buyRatio,
  };

  // Priority 1: institutional_buy (velocity > 2x AND highly directional buy)
  if (velocityRatio > 2 && buyRatio > 0.7) {
    return {
      code,
      type: "institutional_buy",
      severity: "high",
      metrics,
      confidence: Math.min(1, (velocityRatio / 10) * 0.8 + buyRatio * 0.2),
    };
  }

  // Priority 2: institutional_sell (velocity > 2x AND highly directional sell)
  if (velocityRatio > 2 && buyRatio < 0.3) {
    return {
      code,
      type: "institutional_sell",
      severity: "high",
      metrics,
      confidence: Math.min(1, (velocityRatio / 10) * 0.8 + (1 - buyRatio) * 0.2),
    };
  }

  // Priority 3: volume_burst CRITICAL (> 5x)
  if (velocityRatio > 5) {
    return {
      code,
      type: "volume_burst",
      severity: "critical",
      metrics,
      confidence: Math.min(1, velocityRatio / 10),
    };
  }

  // Priority 4: volume_burst HIGH (> 3x)
  if (velocityRatio > 3) {
    return {
      code,
      type: "volume_burst",
      severity: "high",
      metrics,
      confidence: Math.min(1, velocityRatio / 10),
    };
  }

  return null;
}
