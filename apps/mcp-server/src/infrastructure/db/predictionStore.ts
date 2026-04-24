/**
 * Prediction Store — Task 172
 *
 * Infrastructure read helpers for the `prediction_signals` and
 * `prediction_markets` SQLite tables (created by task 163).
 *
 * Used by `assembleBriefing` and `assembleEveningSummary` to surface
 * crowd-sourced early warnings alongside traditional market data.
 *
 * Layer: infrastructure/db — may be imported by application/usecases.
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A flattened prediction signal enriched with its market question text.
 * Returned by `getRecentPredictionSignals` for display in briefings.
 */
export interface BriefingPredictionSignal {
  /** Polymarket condition_id of the prediction market */
  marketId: string;
  /** Human-readable prediction question */
  question: string;
  /** Signal category: volume_spike | probability_shift | insider_timing | sentiment_divergence */
  signalType: string;
  /** Urgency level: low | medium | high | critical */
  severity: string;
  /** Current YES probability (0.0–1.0) */
  yesPriceCurr: number;
  /** [0.1, 0.95] reliability estimate */
  confidence: number;
  /** Human-readable explanation */
  reasoning: string;
  /** ISO 8601 timestamp of signal detection */
  detectedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal row type
// ─────────────────────────────────────────────────────────────────────────────

interface SignalRow {
  market_id: string;
  question: string;
  signal_type: string;
  severity: string;
  yes_price_curr: number;
  confidence: number;
  reasoning: string;
  detected_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches prediction signals detected within the last `hoursBack` hours,
 * sorted newest first. Joins with `prediction_markets` to include the
 * human-readable question text.
 *
 * Returns an empty array if the `prediction_signals` table does not exist
 * yet (graceful degradation when the schema migration has not run).
 *
 * @param db        - Active bun:sqlite Database connection
 * @param hoursBack - Look-back window in hours (default: 24)
 * @returns         - Flat list of BriefingPredictionSignal sorted by detected_at DESC
 */
export function getRecentPredictionSignals(
  db: Database,
  hoursBack: number = 24,
): BriefingPredictionSignal[] {
  // Graceful: return [] if table does not exist
  try {
    const tables = db
      .prepare<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='prediction_signals'",
      )
      .all();
    if (tables.length === 0) return [];
  } catch {
    return [];
  }

  try {
    const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();

    const rows = db
      .prepare<SignalRow, [string]>(`
        SELECT
          ps.market_id,
          COALESCE(pm.question, ps.market_id) AS question,
          ps.signal_type,
          ps.severity,
          ps.yes_price_curr,
          ps.confidence,
          ps.reasoning,
          ps.detected_at
        FROM prediction_signals ps
        LEFT JOIN prediction_markets pm ON pm.id = ps.market_id
        WHERE ps.detected_at >= ?
        ORDER BY ps.detected_at DESC
      `)
      .all(since);

    return rows.map((row) => ({
      marketId: row.market_id,
      question: row.question,
      signalType: row.signal_type,
      severity: row.severity,
      yesPriceCurr: row.yes_price_curr,
      confidence: row.confidence,
      reasoning: row.reasoning,
      detectedAt: row.detected_at,
    }));
  } catch {
    return [];
  }
}
