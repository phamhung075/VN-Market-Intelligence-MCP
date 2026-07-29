/**
 * Infrastructure — Foreign Flow Queries (market-wide aggregate + top-N tickers)
 *
 * Pure daily_ohlcv_with_flow read functions, extracted out of
 * interface/mcp/tools/market-data/marketWideForeignFlowTool.ts
 * (FACTORY-GUARD-CI-TSBOUNDARIES-IMPL, 2026-07-29). Zero MCP/protocol
 * concerns — same pattern as moneyRadarStore.ts — so this belongs in
 * infrastructure/db, not interface/. The interface-layer tool file
 * re-exports both functions unchanged for its own MCP tool registration
 * and existing tests; application/usecases/getMoneyRadarComposite.ts now
 * imports queryMarketWideForeignFlow directly from here instead of
 * reaching up into interface/ (Fence-B fix — pure relocation, verbatim
 * bodies, zero behavior change).
 *
 * @module infrastructure/db/foreignFlowQueries
 */

import type { Database } from "bun:sqlite";

export interface DailyAggrRow {
  date: string;
  total_buy: number;
  total_sell: number;
  total_net: number;
  ticker_count: number;
}

export interface TickerFlowRow {
  code: string;
  date: string;
  foreign_buy_vol: number;
  foreign_sell_vol: number;
  foreign_net_vol: number;
}

/**
 * Query market-wide foreign flow aggregates for the last N trading dates
 * that have foreign flow data.
 *
 * @param db   - Database instance
 * @param days - Number of trading dates to return (default 1 = latest session only)
 * @returns    - Array of daily aggregate rows, most-recent first
 */
export function queryMarketWideForeignFlow(
  db: Database,
  days = 1,
): DailyAggrRow[] {
  const rows = db
    .prepare<DailyAggrRow, [number]>(
      `SELECT
         date,
         COALESCE(SUM(foreign_buy_vol),  0) AS total_buy,
         COALESCE(SUM(foreign_sell_vol), 0) AS total_sell,
         COALESCE(SUM(foreign_net_vol),  0) AS total_net,
         COUNT(*)                           AS ticker_count
       FROM daily_ohlcv_with_flow
       -- TASK_2003 (SUBTASK-DAILY-FF-4): reads foreign-flow via the daily_ohlcv_with_flow
       -- compat view (COALESCE new daily_foreign_flow, then legacy daily_ohlcv.foreign_*).
       WHERE foreign_net_vol IS NOT NULL
       GROUP BY date
       HAVING COUNT(*) > 0
       ORDER BY date DESC
       LIMIT ?`,
    )
    .all(days);

  return rows;
}

/**
 * Query top-N net buyers and sellers for a given trading date.
 *
 * @param db      - Database instance
 * @param date    - Trading date string (YYYY-MM-DD)
 * @param topN    - How many tickers to return per side (default 5)
 * @returns       - { topBuyers, topSellers }
 */
export function queryTopFlowTickers(
  db: Database,
  date: string,
  topN = 5,
): { topBuyers: TickerFlowRow[]; topSellers: TickerFlowRow[] } {
  const topBuyers = db
    .prepare<TickerFlowRow, [string, number]>(
      `SELECT code, date,
              COALESCE(foreign_buy_vol,  0) AS foreign_buy_vol,
              COALESCE(foreign_sell_vol, 0) AS foreign_sell_vol,
              COALESCE(foreign_net_vol,  0) AS foreign_net_vol
       FROM daily_ohlcv_with_flow
       WHERE date = ? AND foreign_net_vol IS NOT NULL
       ORDER BY foreign_net_vol DESC
       LIMIT ?`,
    )
    .all(date, topN);

  const topSellers = db
    .prepare<TickerFlowRow, [string, number]>(
      `SELECT code, date,
              COALESCE(foreign_buy_vol,  0) AS foreign_buy_vol,
              COALESCE(foreign_sell_vol, 0) AS foreign_sell_vol,
              COALESCE(foreign_net_vol,  0) AS foreign_net_vol
       FROM daily_ohlcv_with_flow
       WHERE date = ? AND foreign_net_vol IS NOT NULL
       ORDER BY foreign_net_vol ASC
       LIMIT ?`,
    )
    .all(date, topN);

  return { topBuyers, topSellers };
}
