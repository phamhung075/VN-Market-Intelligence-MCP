/**
 * Infrastructure — Macro Stats Store
 *
 * Reads historical commodity/SBV data from SQLite and computes
 * rolling statistics (mean, stdDev) for macro threshold classification.
 *
 * Layer: infrastructure/db — may use SQLite, exports data for domain services.
 */

import { getDb } from "./schema.js";
import { computeRollingStats, type MacroStats } from "../../domain/services/macroThresholds.js";
import { logger } from "../logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Default lookback: 30 data points (roughly 30 days with daily fetches). */
const DEFAULT_LOOKBACK = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes MacroStats for all commodity indicators from historical data.
 *
 * Reads the last N rows from `commodity_prices_history` and computes
 * rolling mean + stdDev for each indicator.
 *
 * @param lookback - Number of historical data points to use (default: 30)
 * @returns Array of MacroStats for brentCrudeUSD, goldUSDPerOz, usdVndRate
 */
export function getCommodityStats(lookback = DEFAULT_LOOKBACK): MacroStats[] {
  try {
    const db = getDb();

    const rows = db
      .query<
        { brent_crude_usd: number; gold_usd_per_oz: number; usd_vnd_rate: number },
        [number]
      >(
        `SELECT brent_crude_usd, gold_usd_per_oz, usd_vnd_rate
         FROM commodity_prices_history
         ORDER BY fetched_at DESC
         LIMIT ?`,
      )
      .all(lookback);

    if (rows.length === 0) return [];

    const results: MacroStats[] = [];

    // Get current values (latest row)
    const latest = rows[0]!;

    // Brent crude
    const brentValues = rows.map((r) => r.brent_crude_usd).filter((v) => v > 0);
    const brentStats = computeRollingStats(brentValues);
    if (brentStats) {
      results.push({
        name: "brentCrudeUSD",
        current: latest.brent_crude_usd,
        mean: brentStats.mean,
        stdDev: brentStats.stdDev,
        sampleCount: brentValues.length,
      });
    }

    // Gold
    const goldValues = rows.map((r) => r.gold_usd_per_oz).filter((v) => v > 0);
    const goldStats = computeRollingStats(goldValues);
    if (goldStats) {
      results.push({
        name: "goldUSDPerOz",
        current: latest.gold_usd_per_oz,
        mean: goldStats.mean,
        stdDev: goldStats.stdDev,
        sampleCount: goldValues.length,
      });
    }

    // USD/VND
    const fxValues = rows.map((r) => r.usd_vnd_rate).filter((v) => v > 0);
    const fxStats = computeRollingStats(fxValues);
    if (fxStats) {
      results.push({
        name: "usdVndRate",
        current: latest.usd_vnd_rate,
        mean: fxStats.mean,
        stdDev: fxStats.stdDev,
        sampleCount: fxValues.length,
      });
    }

    logger.debug("[macroStats] computed commodity stats", {
      indicators: results.length,
      sampleSize: rows.length,
    });

    return results;
  } catch (err) {
    logger.warn("[macroStats] failed to compute commodity stats", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Computes MacroStats for SBV/interest rate indicators from historical data.
 *
 * @param lookback - Number of historical data points to use (default: 30)
 * @returns Array of MacroStats for refinancingRatePct, overnightRatePct, usdVndOfficial
 */
export function getSbvStats(lookback = DEFAULT_LOOKBACK): MacroStats[] {
  try {
    const db = getDb();

    const rows = db
      .query<
        { refinancing_rate_pct: number; overnight_rate_pct: number; usd_vnd_official: number },
        [number]
      >(
        `SELECT refinancing_rate_pct, overnight_rate_pct, usd_vnd_official
         FROM sbv_rates_history
         ORDER BY fetched_at DESC
         LIMIT ?`,
      )
      .all(lookback);

    if (rows.length === 0) return [];

    const results: MacroStats[] = [];
    const latest = rows[0]!;

    // Refinancing rate
    const refiValues = rows.map((r) => r.refinancing_rate_pct).filter((v) => v > 0);
    const refiStats = computeRollingStats(refiValues);
    if (refiStats) {
      results.push({
        name: "refinancingRatePct",
        current: latest.refinancing_rate_pct,
        mean: refiStats.mean,
        stdDev: refiStats.stdDev,
        sampleCount: refiValues.length,
      });
    }

    // Overnight rate
    const onValues = rows.map((r) => r.overnight_rate_pct).filter((v) => v > 0);
    const onStats = computeRollingStats(onValues);
    if (onStats) {
      results.push({
        name: "overnightRatePct",
        current: latest.overnight_rate_pct,
        mean: onStats.mean,
        stdDev: onStats.stdDev,
        sampleCount: onValues.length,
      });
    }

    // USD/VND official
    const offValues = rows.map((r) => r.usd_vnd_official).filter((v) => v > 0);
    const offStats = computeRollingStats(offValues);
    if (offStats) {
      results.push({
        name: "usdVndOfficial",
        current: latest.usd_vnd_official,
        mean: offStats.mean,
        stdDev: offStats.stdDev,
        sampleCount: offValues.length,
      });
    }

    logger.debug("[macroStats] computed SBV stats", {
      indicators: results.length,
      sampleSize: rows.length,
    });

    return results;
  } catch (err) {
    logger.warn("[macroStats] failed to compute SBV stats", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Returns all macro stats (commodity + SBV) combined.
 */
export function getAllMacroStats(lookback = DEFAULT_LOOKBACK): MacroStats[] {
  return [...getCommodityStats(lookback), ...getSbvStats(lookback)];
}
