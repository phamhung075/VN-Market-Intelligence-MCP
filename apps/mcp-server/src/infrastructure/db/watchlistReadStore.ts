/**
 * Watchlist Read Store (FACTORY-INFRA-split-telegramCommands)
 *
 * Read-only SQLite helpers backing the Telegram /watchlist and /price
 * commands. Extracted verbatim from telegramCommands.ts's handleWatchlist
 * and handlePrice (was lines 141-242) — zero query/logic drift.
 *
 * @module infrastructure/db/watchlistReadStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// /watchlist — list all watchlist stocks with current price
// ─────────────────────────────────────────────────────────────────────────────

export interface WatchlistPriceRow {
  code: string;
  company_name: string | null;
  exchange: string;
  domain: string;
  price: number | null;
  change_pct: number | null;
}

/** List all watchlist stocks joined with the latest known price (market_prices, fallback daily_ohlcv). */
export function listWatchlistWithPrices(db: Database): WatchlistPriceRow[] {
  return db
    .prepare<WatchlistPriceRow, []>(
      `SELECT w.code, w.company_name, w.exchange, w.domain,
              COALESCE(
                (SELECT mp.price FROM market_prices mp WHERE mp.code = w.code AND mp.price IS NOT NULL AND mp.price > 0),
                (SELECT d.close FROM daily_ohlcv d WHERE d.code = w.code ORDER BY d.date DESC LIMIT 1)
              ) AS price,
              (SELECT mp2.change_pct FROM market_prices mp2 WHERE mp2.code = w.code AND mp2.price IS NOT NULL AND mp2.price > 0) AS change_pct
       FROM watchlist w
       ORDER BY w.code ASC`,
    )
    .all();
}

// ─────────────────────────────────────────────────────────────────────────────
// /price <CODE> — single-stock price lookup (market_prices, fallback daily_ohlcv)
// ─────────────────────────────────────────────────────────────────────────────

export interface PriceQuoteRow {
  code: string;
  price: number | null;
  change_amt: number | null;
  change_pct: number | null;
  volume: number | null;
  updated_at: string | null;
}

/**
 * Look up a single stock's latest price quote.
 * Tries market_prices first (price IS NOT NULL AND price > 0), then falls
 * back to the most recent daily_ohlcv close when no live quote exists.
 */
export function getPriceQuote(db: Database, code: string): PriceQuoteRow | null {
  const row = db
    .prepare<PriceQuoteRow, [string]>(
      `SELECT code, price, change_amt, change_pct, volume, updated_at
       FROM market_prices WHERE code = ? AND price IS NOT NULL AND price > 0`,
    )
    .get(code);

  if (row && row.price != null) return row;

  // Fallback to daily_ohlcv latest close
  const ohlcv = db
    .prepare<{ code: string; close: number; volume: number; updated_at: string }, [string]>(
      `SELECT code, close, volume, updated_at FROM daily_ohlcv WHERE code = ? ORDER BY date DESC LIMIT 1`,
    )
    .get(code);

  if (!ohlcv) return null;

  return {
    code: ohlcv.code,
    price: ohlcv.close,
    change_amt: null,
    change_pct: null,
    volume: ohlcv.volume,
    updated_at: ohlcv.updated_at,
  };
}
