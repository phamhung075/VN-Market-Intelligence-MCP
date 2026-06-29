/**
 * Infrastructure — Insider Sentiment Store (P0-5-INSIDER-SENTIMENT)
 *
 * Read-only queries on `insider_transactions` and `vnstock_trading_stats`.
 * No writes — NFR-P05-1: tool is READ-ONLY on insider_transactions.
 *
 * DDD layer: infrastructure/db — may use Database; no domain or application logic.
 *
 * @module infrastructure/db/insiderSentimentStore
 */

import type { Database } from "bun:sqlite";
import type { InsiderTxRow } from "../../domain/services/market-data/insiderSentimentCalculator.js";
import { sqlInClause } from "./sqlHelpers.js";

// ---------------------------------------------------------------------------
// Raw DB row shapes (internal — never leak outside this module)
// ---------------------------------------------------------------------------

interface RawInsiderRow {
  code: string;
  type: string;           // 'buy' | 'sell' | 'other'
  executed_volume: number;
  price: number;
  from_date: string;      // YYYY-MM-DD
}

interface MarketCapRow {
  code: string;
  market_cap_bn: number | null;
}

interface WatchlistRow {
  code: string;
}

// ---------------------------------------------------------------------------
// Store functions
// ---------------------------------------------------------------------------

/**
 * Fetch insider transaction rows for sentiment computation.
 *
 * Returns rows where from_date >= sinceDate (inclusive), optionally filtered
 * by ticker codes. Returns rows needed by all three windows (30/90/180d);
 * the application layer sub-windows in memory.
 *
 * No try/catch: errors propagate to the tool handler's catch block (P0-2 pattern).
 *
 * @param db        - SQLite database.
 * @param opts.codes     - Optional array of ticker codes to filter to.
 * @param opts.sinceDate - ISO date string (YYYY-MM-DD), inclusive lower bound.
 */
export function getInsiderTxForSentiment(
  db: Database,
  opts: {
    codes?: string[];
    sinceDate: string;
  },
): InsiderTxRow[] {
  const { codes, sinceDate } = opts;

  const conditions: string[] = ['from_date >= ?'];
  const params: (string | number)[] = [sinceDate];

  if (codes && codes.length > 0) {
    const placeholders = sqlInClause(codes.length);
    conditions.push(`code IN (${placeholders})`);
    params.push(...codes);
  }

  const sql = `
    SELECT code, type, executed_volume, price, from_date
    FROM insider_transactions
    WHERE ${conditions.join(' AND ')}
    ORDER BY from_date DESC, code ASC
  `;

  const rows = db
    .prepare<RawInsiderRow, (string | number)[]>(sql)
    .all(...params) as RawInsiderRow[];

  return rows.map((r) => ({
    code: r.code,
    type: r.type as 'buy' | 'sell' | 'other',
    executedVolume: r.executed_volume,
    price: r.price,
    fromDate: r.from_date,
  }));
}

/**
 * Fetch the latest market_cap_bn for a single ticker.
 *
 * Returns null when no row exists for the ticker or when market_cap_bn IS NULL.
 *
 * @param db   - SQLite database.
 * @param code - Ticker code (e.g. 'FPT').
 */
export function getLatestMarketCapBn(db: Database, code: string): number | null {
  const row = db
    .query<MarketCapRow, [string]>(
      `SELECT code, market_cap_bn
       FROM vnstock_trading_stats
       WHERE code = ?
       ORDER BY date DESC
       LIMIT 1`,
    )
    .get(code);
  return row?.market_cap_bn ?? null;
}

/**
 * Fetch the latest market_cap_bn for multiple tickers in one query.
 *
 * Uses ROW_NUMBER() window function to get the most recent row per code.
 * Returns a Map<code, market_cap_bn | null>; missing codes map to null.
 *
 * @param db    - SQLite database.
 * @param codes - Array of ticker codes.
 */
export function getMarketCapBnBulk(
  db: Database,
  codes: string[],
): Map<string, number | null> {
  const result = new Map<string, number | null>();
  if (codes.length === 0) return result;

  // Initialise all requested codes to null
  for (const code of codes) result.set(code, null);

  const placeholders = sqlInClause(codes.length);
  const rows = db
    .prepare<MarketCapRow, string[]>(
      `SELECT code, market_cap_bn
       FROM (
         SELECT code, market_cap_bn,
                ROW_NUMBER() OVER (PARTITION BY code ORDER BY date DESC) AS rn
         FROM vnstock_trading_stats
         WHERE code IN (${placeholders})
       )
       WHERE rn = 1`,
    )
    .all(...codes) as MarketCapRow[];

  for (const r of rows) {
    result.set(r.code, r.market_cap_bn);
  }

  return result;
}

/**
 * Fetch active watchlist ticker codes from the watchlist table.
 *
 * Returns codes in ascending order. Returns [] when table is empty.
 */
export function getWatchlistCodes(db: Database): string[] {
  const rows = db
    .prepare<WatchlistRow, []>('SELECT DISTINCT code FROM watchlist ORDER BY code')
    .all() as WatchlistRow[];
  return rows.map((r) => r.code);
}
