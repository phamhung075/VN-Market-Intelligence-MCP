/**
 * Evening Summary — Step 3: watchlist movers (|changePct| >= 1.0).
 *
 * Extracted from assembleEveningSummary.ts _assembleEveningSummaryImpl
 * (FACTORY-APP-split-assembleEveningSummary).
 *
 * Layer: application/usecases/eveningSummary — pure query, no side effects.
 */
import type { Database } from "bun:sqlite";
import type { WatchlistMover } from "./types.js";

interface WatchlistMoverRow {
  code: string;
  exchange: string | null;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
}

/**
 * Query watchlist stocks with |changePct| >= 1.0.
 *
 * Determines whether market_prices has an exchange column (added by task 027) —
 * gracefully falls back to w.exchange when the column doesn't exist yet. When
 * daily_ohlcv exists, uses a CTE to compute change_pct from today vs yesterday
 * close as a fallback when market_prices lacks a fresh row for a ticker; when
 * daily_ohlcv is absent, falls back to a simple LEFT JOIN on market_prices only.
 *
 * `rsi14` is initialized to `null` on every returned mover — the caller
 * (computeTaSummaryStep) threads the real value in after TA computation.
 */
export function queryWatchlistMovers(db: Database): WatchlistMover[] {
  const mpCols = db
    .prepare<{ name: string }, []>("PRAGMA table_info(market_prices)")
    .all()
    .map((c) => c.name);

  const exchangeExpr = mpCols.includes("exchange")
    ? "COALESCE(mp.exchange, w.exchange)"
    : "w.exchange";

  // Check whether daily_ohlcv table exists (may be absent on older DB schemas).
  const ohlcvExists =
    db
      .prepare<{ cnt: number }, []>(
        `SELECT COUNT(*) AS cnt FROM sqlite_master
         WHERE type='table' AND name='daily_ohlcv'`,
      )
      .get()?.cnt ?? 0;

  const moverSql = ohlcvExists
    ? `
      WITH ohlcv_change AS (
        SELECT
          t.code,
          t.close AS today_close,
          t.volume AS today_volume,
          CASE
            WHEN y.close IS NOT NULL AND y.close <> 0
            THEN (t.close - y.close) * 100.0 / y.close
            ELSE NULL
          END AS computed_pct
        FROM daily_ohlcv t
        JOIN daily_ohlcv y
          ON y.code = t.code
         AND y.date = (SELECT MAX(date) FROM daily_ohlcv WHERE date < t.date)
        WHERE t.date = (SELECT MAX(date) FROM daily_ohlcv)
      )
      SELECT w.code,
             ${exchangeExpr} AS exchange,
             COALESCE(mp.price, oc.today_close) AS price,
             COALESCE(mp.change_pct, oc.computed_pct) AS change_pct,
             COALESCE(mp.volume, oc.today_volume) AS volume
      FROM watchlist w
      LEFT JOIN market_prices mp ON mp.code = w.code
                                 AND mp.updated_at >= datetime('now', '-3 days')
      LEFT JOIN ohlcv_change oc ON oc.code = w.code
      WHERE ABS(COALESCE(mp.change_pct, oc.computed_pct, 0)) >= 1.0
      ORDER BY ABS(COALESCE(mp.change_pct, oc.computed_pct, 0)) DESC
    `
    : `
      SELECT w.code,
             ${exchangeExpr} AS exchange,
             mp.price,
             mp.change_pct,
             mp.volume
      FROM watchlist w
      LEFT JOIN market_prices mp ON mp.code = w.code
                                 AND mp.updated_at >= datetime('now', '-3 days')
      WHERE ABS(COALESCE(mp.change_pct, 0)) >= 1.0
      ORDER BY ABS(COALESCE(mp.change_pct, 0)) DESC
    `;

  const moverRows = db.prepare<WatchlistMoverRow, []>(moverSql).all();

  // Build initial movers — volume threaded from query; rsi14 will be patched after TA step
  return moverRows.map((row) => ({
    code: row.code,
    changePct: row.change_pct ?? 0,
    price: row.price ?? 0,
    exchange: row.exchange ?? "HOSE",
    ...(row.volume != null ? { volume: row.volume } : {}),
    rsi14: null, // populated after taSummary is computed below
  }));
}
