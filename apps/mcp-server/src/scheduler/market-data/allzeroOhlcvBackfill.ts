/**
 * allzeroOhlcvBackfill — ALLZERO-OHLCV-FETCH fix
 *
 * Two responsibilities:
 *
 * 1. purgeAllZeroRows(db)
 *    Deletes all-zero (open=0 AND high=0 AND low=0 AND close=0) rows from
 *    daily_ohlcv across ALL tickers. These rows originate from:
 *      (a) A failed bulk-fetch that stamped zeros instead of skipping the row
 *          (e.g. 2026-05-30 gap across 103 tickers).
 *      (b) DPI-4 foreign-flow stub rows that were never overwritten by real OHLCV.
 *    Purging them removes the 0 from the 20-period BB window (which detonates stdev
 *    to ±35k) and removes the Y-axis zero anchor from the chart domain.
 *
 * 2. normalizeResidualContam(db)
 *    Finds watchlist tickers where any row has 0 < close < STOCK_MIN_VND (100) —
 *    i.e. thousand-VND leakage survived earlier CONTAM-2..7 repairs — and multiplies
 *    the entire OHLC row by 1000 (whole-row normalization, preserving all intra-row
 *    relationships). This repairs VCB 2026-06-01 close=62.2 → 62200 and similar.
 *
 * Both functions operate generically across ALL tickers (no per-ticker hardcode).
 *
 * DDD layer: scheduler — may import from domain/; must NOT import from application/.
 */

import type { Database } from "bun:sqlite";
import { STOCK_MIN_VND } from "../../domain/services/market-data/ohlcvUnitGuard.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PurgeResult {
  /** Number of all-zero rows deleted from daily_ohlcv */
  deleted: number;
}

export interface NormalizeResult {
  /** Number of thousand-VND contaminated rows re-scaled to full-VND */
  fixed: number;
}

export interface PurgeStrandedResult {
  /** Number of synthetic flat zero-vol seed rows deleted from daily_ohlcv */
  deleted: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// purgeAllZeroRows
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deletes all rows in daily_ohlcv where open=0 AND high=0 AND low=0 AND close=0.
 *
 * These rows are never valid trading-day data. Two sources:
 *  - Failed bulk fetch (e.g. 2026-05-30): the fetcher stamped zeros on a real
 *    trading day instead of skipping the write.
 *  - DPI-4 foreign-flow stub rows that were never filled by a real OHLCV push.
 *
 * After deletion, the taOhlcvBackfillJob (which already detects corrupt_cnt > 0)
 * will re-fetch and re-populate any trading-day rows for covered tickers.
 *
 * @param db - SQLite Database instance (named-volume mcp-server DB)
 * @returns PurgeResult with count of deleted rows
 */
export function purgeAllZeroRows(db: Database): PurgeResult {
  const result = db
    .prepare(
      `DELETE FROM daily_ohlcv
       WHERE open = 0 AND high = 0 AND low = 0 AND close = 0`,
    )
    .run();

  return { deleted: result.changes };
}

// ─────────────────────────────────────────────────────────────────────────────
// normalizeResidualContam
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Restores thousand-VND contaminated rows to full-VND for ALL tickers in
 * daily_ohlcv where 0 < close < STOCK_MIN_VND (100).
 *
 * Applies whole-row normalization (×1000) — the same contract as
 * normalizeOhlcvToVnd() in ohlcvUnitGuard — so all intra-row relationships
 * (low ≤ open/close ≤ high) are preserved.
 *
 * Skips index tickers (VNINDEX, VN30, HNXINDEX, HNX30, UPCOMINDEX) since their
 * prices are already in the correct unit at much lower values.
 *
 * Generic: no per-ticker hardcode. Affects VCB 2026-06-01 close=62.2, DAG rows
 * with close=1.4, VNH rows with close=0.9/0.8/1.0 etc.
 *
 * @param db - SQLite Database instance
 * @returns NormalizeResult with count of fixed rows
 */
export function normalizeResidualContam(db: Database): NormalizeResult {
  // Known index tickers — exempt from stock range guard
  const INDEX_TICKERS = ["VNINDEX", "VN30", "HNXINDEX", "HNX30", "UPCOMINDEX"];
  const excludePlaceholders = INDEX_TICKERS.map(() => "?").join(", ");

  // Find all rows where close is > 0 but < STOCK_MIN_VND (100), excluding indices.
  // These are thousand-VND contaminated stock rows.
  const contamRows = db
    .prepare(
      `SELECT code, date, open, high, low, close, volume, updated_at
       FROM daily_ohlcv
       WHERE close > 0
         AND close < ?
         AND code NOT IN (${excludePlaceholders})`,
    )
    .all(STOCK_MIN_VND, ...INDEX_TICKERS) as Array<{
    code: string;
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    updated_at: string;
  }>;

  if (contamRows.length === 0) {
    return { fixed: 0 };
  }

  const updateStmt = db.prepare(
    `UPDATE daily_ohlcv
     SET open = ?, high = ?, low = ?, close = ?, updated_at = datetime('now')
     WHERE code = ? AND date = ?`,
  );

  const fixAll = db.transaction(
    (rows: typeof contamRows) => {
      for (const row of rows) {
        // Whole-row normalization ×1000 — never per-field
        updateStmt.run(
          row.open * 1000,
          row.high * 1000,
          row.low * 1000,
          row.close * 1000,
          row.code,
          row.date,
        );
      }
    },
  );

  fixAll(contamRows);

  return { fixed: contamRows.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// purgeStrandedSeedRows
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FIX-OHLCV-STRANDED-ROWS-REPAIR-P1
 *
 * Deletes all synthetic flat zero-vol seed bars from daily_ohlcv using a
 * GENERIC shape predicate — no date literal, no per-ticker allowlist.
 *
 * Shape predicate:
 *   volume = 0 AND open = high AND high = low AND low = close
 *
 * This matches every row where:
 *   - volume is zero (no real trading activity), AND
 *   - all four OHLC fields are identical (reference/seed price, not a candle)
 *
 * Two classes of stranded residue from FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0:
 *
 *   Class 1 — wrong-scale seed bars: DCR O=H=L=C=5900 vol=0, H11 O=H=L=C=25700 vol=0.
 *     The pre-fix aggregator wrote the VNDIRECT reference price directly without
 *     scale-normalization (detectAndNormalizeScaleFromPrevClose was bypassed).
 *
 *   Class 2 — all-zero seed bars: DAG/DFF/DMC/POM O=H=L=C=0 vol=0.
 *     The pre-fix aggregator produced close=0 for tickers whose sole tick had price=0.
 *     These also satisfy the shape predicate (0=0 AND vol=0).
 *     NOTE: purgeAllZeroRows() already catches O=H=L=C=0 rows. purgeStrandedSeedRows
 *     catching them too is harmless (idempotent — second DELETE matches 0 rows).
 *
 * Safety invariant: the predicate keys on vol=0. A real halt day (ATC price match,
 * full circuit-breaker halt) may produce O=H=L=C but will always have vol > 0 from
 * the auction. This function NEVER deletes vol > 0 candles.
 *
 * Idempotent: a second run deletes 0 rows (WHERE matches nothing after first run).
 *
 * Generic: fires for ANY ticker on ANY date — matches /goal#2. No per-ticker logic,
 * no date comparison, no data_env filter (don't need it — the shape is sufficient).
 *
 * @param db - SQLite Database instance (named-volume mcp-server DB)
 * @returns PurgeStrandedResult with count of deleted rows
 */
export function purgeStrandedSeedRows(db: Database): PurgeStrandedResult {
  const result = db
    .prepare(
      `DELETE FROM daily_ohlcv
       WHERE volume = 0
         AND open = high
         AND high = low
         AND low = close`,
    )
    .run();

  return { deleted: result.changes };
}
