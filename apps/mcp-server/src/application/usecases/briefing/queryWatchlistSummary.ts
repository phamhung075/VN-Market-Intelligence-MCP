/**
 * Morning Briefing — Step 5: watchlist stocks with latest prices + 5-day sparkline.
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 *
 * `WatchlistRow` is exported — Steps 11/14/15/16/17/18 all consume the raw
 * watchlist rows (code list / price+change_pct), not just the formatted
 * WatchlistEntry[] summary, so this is the one shared cross-step SQLite row
 * type in the whole briefing/ split (everything else is single-owner).
 *
 * Layer: application/usecases/briefing — pure query, no side effects.
 */
import type { Database } from "bun:sqlite";
import { generateSparkline } from "../../../domain/services/sparkline.js";
import type { WatchlistEntry } from "./types.js";

export interface WatchlistRow {
  code: string;
  domain: string;
  price: number | null;
  change_pct: number | null;
}

interface PriceHistoryRow {
  price: number;
}

export interface WatchlistSummaryResult {
  /** Raw rows — consumed by downstream steps needing code/price/change_pct. */
  watchlistRows: WatchlistRow[];
  /** Formatted entries — the DailyBriefing.watchlistSummary field. */
  watchlistSummary: WatchlistEntry[];
}

/**
 * Query all watchlist stocks joined with the latest market_prices (falling
 * back to the latest daily_ohlcv close), plus a 5-day sparkline built from
 * market_prices_history when that table exists.
 */
export function queryWatchlistSummary(db: Database): WatchlistSummaryResult {
  const watchlistRows = db
    .prepare<WatchlistRow, []>(`
      SELECT w.code, w.domain,
             COALESCE(
               (SELECT mp.price FROM market_prices mp WHERE mp.code = w.code AND mp.price IS NOT NULL AND mp.price > 0 AND mp.updated_at >= datetime('now', '-3 days')),
               (SELECT d.close FROM daily_ohlcv d WHERE d.code = w.code ORDER BY d.date DESC LIMIT 1)
             ) AS price,
             (SELECT mp2.change_pct FROM market_prices mp2 WHERE mp2.code = w.code AND mp2.price IS NOT NULL AND mp2.price > 0 AND mp2.updated_at >= datetime('now', '-3 days')) AS change_pct
      FROM watchlist w
      ORDER BY w.code
    `)
    .all();

  // Check whether the history table exists before querying it
  const historyTableExists = (() => {
    try {
      const row = db
        .query<{ name: string }, [string]>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        )
        .get("market_prices_history");
      return row !== null;
    } catch {
      return false;
    }
  })();

  // Pre-fetch 5-day price history for every watchlist stock (oldest first).
  const historyMap = new Map<string, number[]>();
  if (historyTableExists) {
    const histStmt = db.prepare<PriceHistoryRow, [string]>(`
      SELECT price
      FROM (
        SELECT price, fetched_at
        FROM market_prices_history
        WHERE code = ?
        ORDER BY fetched_at DESC
        LIMIT 5
      )
      ORDER BY fetched_at ASC
    `);
    for (const row of watchlistRows) {
      try {
        const rows = histStmt.all(row.code);
        historyMap.set(row.code, rows.map((r) => r.price));
      } catch {
        // history table may exist without required columns — skip silently
      }
    }
  }

  const watchlistSummary: WatchlistEntry[] = watchlistRows.map((row) => {
    const entry: WatchlistEntry = {
      code: row.code,
      domain: row.domain,
    };
    if (row.price != null) entry.price = row.price;
    if (row.change_pct != null) entry.changePct = row.change_pct;

    const history = historyMap.get(row.code) ?? [];
    entry.sparkline = generateSparkline(history, 5);

    return entry;
  });

  return { watchlistRows, watchlistSummary };
}
