/**
 * System Health Counts Store (FACTORY-INFRA-split-telegramCommands)
 *
 * Backs the Telegram /health command. Extracted verbatim from
 * telegramCommands.ts's handleHealth count queries (was lines 260-279) —
 * zero query/logic drift, including the per-table try/catch defensiveness
 * (tables may not exist yet on a fresh DB).
 *
 * @module infrastructure/db/systemHealthStore
 */

import type { Database } from "bun:sqlite";

export interface SystemHealthCounts {
  watchlistCount: number;
  alertCount: number;
  priceCount: number;
}

interface CountRow {
  count: number;
}

/** Watchlist / alert / market_prices row counts for the /health command. */
export function getSystemHealthCounts(db: Database): SystemHealthCounts {
  let watchlistCount = 0;
  let alertCount = 0;
  let priceCount = 0;

  try {
    watchlistCount =
      db.prepare<CountRow, []>("SELECT COUNT(*) as count FROM watchlist").get()?.count ?? 0;
  } catch {
    /* table may not exist */
  }

  try {
    alertCount =
      db.prepare<CountRow, []>("SELECT COUNT(*) as count FROM alerts").get()?.count ?? 0;
  } catch {
    /* table may not exist */
  }

  try {
    priceCount =
      db.prepare<CountRow, []>("SELECT COUNT(*) as count FROM market_prices").get()?.count ?? 0;
  } catch {
    /* table may not exist */
  }

  return { watchlistCount, alertCount, priceCount };
}
