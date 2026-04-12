/**
 * Task 1122 — baseRateComputer
 *
 * Pure domain functions for computing base rates, Brier scores, and
 * likelihood ratio clamping. Part of the Prediction Engine Phase B (Sprint 059).
 *
 * DDD invariant: this file MUST NOT import from src/infrastructure/.
 * It receives `db: Database` as a parameter (dependency injection).
 * The only non-domain import allowed is `bun:sqlite` (type-only).
 *
 * @module domain/services/baseRateComputer
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Raw row returned by the daily_ohlcv query */
interface OhlcvRow {
  date: string;
  close: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the unconditional base rate: fraction of historical horizon-day windows
 * where the absolute price change exceeded 3%.
 *
 * Data source: daily_ohlcv table (queried directly via db parameter).
 * Domain layer — no infrastructure imports, db is injected.
 *
 * Algorithm:
 * 1. Query `SELECT date, close FROM daily_ohlcv WHERE code = ? ORDER BY date ASC`.
 * 2. Build rolling windows of horizonDays rows: for each index i, compare
 *    close[i] with close[i + horizonDays].
 * 3. A window is a "hit" when `abs((close[i+h] - close[i]) / close[i]) * 100 > 3.0`.
 * 4. Return `hits / total_windows`.
 * 5. If fewer than 10 windows → return 0.5 (neutral prior).
 *
 * @param stock        Ticker code
 * @param horizonDays  5 | 10 | 20
 * @param db           SQLite database (injected — domain never calls getDb())
 * @returns            Fraction in [0.0, 1.0]. Returns 0.5 if fewer than 10 windows.
 */
export function computeRollingBaseRate(
  stock: string,
  horizonDays: 5 | 10 | 20,
  db: Database,
): number {
  const rows = db
    .prepare(
      `SELECT date, close FROM daily_ohlcv WHERE code = ? ORDER BY date ASC`,
    )
    .all(stock) as OhlcvRow[];

  const totalWindows = rows.length - horizonDays;
  if (totalWindows < 10) {
    return 0.5; // Insufficient data — neutral prior
  }

  let hits = 0;

  for (let i = 0; i < totalWindows; i++) {
    const rowBase = rows[i];
    const rowHorizon = rows[i + horizonDays];
    if (!rowBase || !rowHorizon) continue; // TypeScript narrowing for array access

    const closeBase = rowBase.close;
    const closeHorizon = rowHorizon.close;

    if (closeBase === 0) continue; // Avoid division by zero (malformed data)

    const changePct = Math.abs((closeHorizon - closeBase) / closeBase) * 100;
    if (changePct > 3.0) {
      hits++;
    }
  }

  return hits / totalWindows;
}

/**
 * Compute the Brier score for a single prediction.
 *
 * Formula: (probability - outcome)^2
 *
 * A score of 0.0 is perfect (predicted 1.0 and it happened, or 0.0 and it didn't).
 * A score of 1.0 is the worst possible (predicted 1.0 and it didn't happen).
 *
 * outcome must be 0 or 1 (not null — caller ensures resolution is complete).
 *
 * Pure function — no I/O.
 *
 * @param probability  Predicted probability in [0.0, 1.0]
 * @param outcome      Actual outcome: 0 (false) or 1 (true)
 * @returns            Brier score in [0.0, 1.0]
 */
export function computeBrierScore(probability: number, outcome: 0 | 1): number {
  const diff = probability - outcome;
  return diff * diff;
}

/**
 * Clamp a likelihood ratio to [0.1, 5.0].
 *
 * The lower bound of 0.1 prevents a single negative evidence type from
 * overwhelming the posterior. The upper bound of 5.0 prevents extreme
 * overconfidence from a single evidence type with limited data.
 *
 * Pure function — no I/O.
 *
 * @param ratio  Raw likelihood ratio (may be any real number)
 * @returns      Clamped value in [0.1, 5.0]
 */
export function clampLikelihoodRatio(ratio: number): number {
  return Math.max(0.1, Math.min(5.0, ratio));
}
