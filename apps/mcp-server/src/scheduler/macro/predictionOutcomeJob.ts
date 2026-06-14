/**
 * Prediction Market Outcome Validation Job — Task 248 (Interface / Scheduler Layer)
 *
 * Validates whether Polymarket prediction signals actually predicted VN stock moves.
 *
 * Algorithm:
 *   1. Query prediction_signals WHERE outcome IS NULL AND detected_at > 7 days ago
 *   2. For each signal, find mapped VN stocks (mapped_stocks JSON field)
 *   3. Look up market_prices_history for those stocks:
 *      - price at signal detection time (or nearest before)
 *      - price at +48h window
 *   4. Determine direction implied by signal:
 *      - probability_shift: bullish if yes_price_curr > yes_price_prev
 *      - volume_spike: direction-neutral (compare |change| only)
 *   5. Classify outcome:
 *      - 'confirmed'      — any mapped stock moved >2% in predicted direction
 *      - 'false_positive' — any mapped stock moved >2% in opposite direction
 *      - 'neutral'        — no significant move detected
 *   6. UPDATE prediction_signals SET outcome=?, outcome_price_change=?
 *
 * This is best-effort: signals without mapped stocks or price history are skipped.
 *
 * Registered in jobs.ts at Sunday 08:00 UTC (weekly retrospective).
 *
 * Layer: interface/scheduler — may import from infrastructure and domain.
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PredictionSignalRow {
  id: string;
  market_id: string;
  signal_type: string;
  severity: string;
  yes_price_prev: number | null;
  yes_price_curr: number;
  mapped_stocks: string; // JSON string[]
  detected_at: string;
}

interface PriceHistoryRow {
  code: string;
  price: number;
  recorded_at: string;
}

export interface PredictionAccuracyRow {
  signalType: string;
  total: number;
  confirmed: number;
  falsePositive: number;
  neutral: number;
  precision: number; // confirmed / (confirmed + falsePositive), 0 if none
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse mapped_stocks JSON field, returning [] on error.
 */
function parseMappedStocks(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

/**
 * Determine the bullish/bearish direction implied by a signal.
 * Returns 'bullish', 'bearish', or 'neutral' (for volume_spike with no prev price).
 */
function signalDirection(
  signalType: string,
  yesPricePrev: number | null,
  yesPriceCurr: number,
): "bullish" | "bearish" | "neutral" {
  if (signalType === "probability_shift") {
    if (yesPricePrev === null) return "neutral";
    return yesPriceCurr > yesPricePrev ? "bullish" : "bearish";
  }
  // volume_spike — treat as directionally neutral; we just check magnitude
  return "neutral";
}

/**
 * Get nearest price for a stock at or before a given ISO timestamp.
 */
function getPriceAt(
  db: Database,
  code: string,
  atIso: string,
): number | null {
  const row = db
    .prepare(
      `SELECT price FROM market_prices_history
       WHERE code = ? AND recorded_at <= ?
       ORDER BY recorded_at DESC
       LIMIT 1`,
    )
    .get(code, atIso) as { price: number } | undefined;
  return row?.price ?? null;
}

/**
 * Get nearest price for a stock at or after a given ISO timestamp.
 */
function getPriceAfter(
  db: Database,
  code: string,
  afterIso: string,
): number | null {
  const row = db
    .prepare(
      `SELECT price FROM market_prices_history
       WHERE code = ? AND recorded_at >= ?
       ORDER BY recorded_at ASC
       LIMIT 1`,
    )
    .get(code, afterIso) as { price: number } | undefined;
  return row?.price ?? null;
}

/**
 * Classify the outcome for a single stock's price move given the signal direction.
 *
 * Rules:
 *   pctChange > +2%  AND direction == bullish  → 'confirmed'
 *   pctChange < -2%  AND direction == bearish   → 'confirmed'
 *   pctChange > +2%  AND direction == bearish   → 'false_positive'
 *   pctChange < -2%  AND direction == bullish   → 'false_positive'
 *   |pctChange| > 2% AND direction == neutral   → 'confirmed' (volume spike caused move)
 *   Otherwise → 'neutral'
 */
function classifyOutcome(
  pctChange: number,
  direction: "bullish" | "bearish" | "neutral",
): "confirmed" | "false_positive" | "neutral" {
  const threshold = 2.0;
  const absPct = Math.abs(pctChange);

  if (direction === "neutral") {
    // volume_spike: any move >2% is 'confirmed'
    return absPct > threshold ? "confirmed" : "neutral";
  }

  if (direction === "bullish") {
    if (pctChange > threshold) return "confirmed";
    if (pctChange < -threshold) return "false_positive";
    return "neutral";
  }

  // bearish
  if (pctChange < -threshold) return "confirmed";
  if (pctChange > threshold) return "false_positive";
  return "neutral";
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — outcome check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the prediction outcome validation pass.
 *
 * Accepts an optional `db` for dependency injection in tests.
 * The function NEVER throws — all errors are caught and logged.
 */
/**
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of weekly cadence (6 days 1h12m window)
 */
export async function runPredictionOutcomeCheck(
  db?: Database,
  nowMsFn?: () => number,
): Promise<void> {
  let resolvedDb: Database;
  if (db) {
    resolvedDb = db;
  } else {
    try {
      const { getDb } = await import("../../infrastructure/db/schema.js");
      resolvedDb = getDb();
    } catch (err) {
      logger.error("[prediction-outcome-job] could not resolve DB", {
        error: String(err),
      });
      return;
    }
  }

  const WEEKLY_CADENCE_MS = 604_800_000;
  if (shouldSkipRecoveryReplay(resolvedDb, "predictionOutcomeJob", WEEKLY_CADENCE_MS, nowMsFn)) return;

  try {
    // ── Step 1: load unvalidated signals from the last 7 days ──────────────
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const signals = resolvedDb
      .prepare(
        `SELECT id, market_id, signal_type, severity,
                yes_price_prev, yes_price_curr, mapped_stocks, detected_at
         FROM prediction_signals
         WHERE outcome IS NULL
           AND detected_at > ?
         ORDER BY detected_at ASC`,
      )
      .all(cutoff) as PredictionSignalRow[];

    if (signals.length === 0) {
      logger.info("[prediction-outcome-job] no unvalidated signals — done");
      return;
    }

    logger.info(
      `[prediction-outcome-job] validating ${signals.length} signals`,
    );

    let validated = 0;
    let skipped = 0;

    const updateStmt = resolvedDb.prepare(
      `UPDATE prediction_signals
       SET outcome = ?, outcome_price_change = ?
       WHERE id = ?`,
    );

    for (const sig of signals) {
      const stocks = parseMappedStocks(sig.mapped_stocks);

      if (stocks.length === 0) {
        // No mapped stocks — cannot validate
        skipped++;
        continue;
      }

      const direction = signalDirection(
        sig.signal_type,
        sig.yes_price_prev,
        sig.yes_price_curr,
      );

      // Window: signal detection time to +48h
      const detectedAt = sig.detected_at;
      const windowEnd = new Date(
        new Date(detectedAt).getTime() + 48 * 60 * 60 * 1000,
      ).toISOString();

      // Evaluate each mapped stock — take the best outcome found
      let bestOutcome: "confirmed" | "false_positive" | "neutral" = "neutral";
      let bestPctChange: number | null = null;

      for (const code of stocks) {
        const priceAt = getPriceAt(resolvedDb, code, detectedAt);
        const priceAfter = getPriceAfter(resolvedDb, code, windowEnd);

        if (priceAt === null || priceAfter === null || priceAt === 0) {
          // No price data available for this stock
          continue;
        }

        const pctChange = ((priceAfter - priceAt) / priceAt) * 100;
        const outcome = classifyOutcome(pctChange, direction);

        // Priority: confirmed > false_positive > neutral
        if (
          outcome === "confirmed" ||
          (outcome === "false_positive" && bestOutcome === "neutral")
        ) {
          bestOutcome = outcome;
          bestPctChange = pctChange;
        } else if (bestPctChange === null) {
          bestPctChange = pctChange;
        }
      }

      if (bestPctChange !== null) {
        updateStmt.run(bestOutcome, bestPctChange, sig.id);
        validated++;
      } else {
        // No price data found for any mapped stock — skip
        skipped++;
      }
    }

    logger.info(
      `[prediction-outcome-job] complete — validated: ${validated}, skipped (no price data): ${skipped}`,
    );
  } catch (err) {
    logger.error("[prediction-outcome-job] unhandled error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — accuracy computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute prediction accuracy metrics per signal_type over the last `days` days.
 *
 * Used by the get_prediction_accuracy MCP tool.
 *
 * @param db   - SQLite database instance
 * @param days - Rolling window in days (default: 30)
 * @returns    Array of accuracy rows per signal_type
 */
export function computePredictionAccuracy(
  db: Database,
  days = 30,
): PredictionAccuracyRow[] {
  const cutoff = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();

  interface RawRow {
    signal_type: string;
    total: number;
    confirmed: number;
    false_positive: number;
    neutral: number;
  }

  const rows = db
    .prepare(
      `SELECT
         signal_type,
         COUNT(*) AS total,
         SUM(CASE WHEN outcome = 'confirmed'      THEN 1 ELSE 0 END) AS confirmed,
         SUM(CASE WHEN outcome = 'false_positive' THEN 1 ELSE 0 END) AS false_positive,
         SUM(CASE WHEN outcome = 'neutral'        THEN 1 ELSE 0 END) AS neutral
       FROM prediction_signals
       WHERE outcome IS NOT NULL
         AND detected_at > ?
       GROUP BY signal_type
       ORDER BY signal_type`,
    )
    .all(cutoff) as RawRow[];

  return rows.map((r) => {
    const decidedTotal = r.confirmed + r.false_positive;
    const precision =
      decidedTotal > 0 ? r.confirmed / decidedTotal : 0;

    return {
      signalType: r.signal_type,
      total: r.total,
      confirmed: r.confirmed,
      falsePositive: r.false_positive,
      neutral: r.neutral,
      precision,
    };
  });
}
