/**
 * Infrastructure — vnstock Data Store (barrel)
 *
 * SQLite storage for all vnstock data: financials, trading stats,
 * officers, shareholders, events, balance sheet, cash flow, foreign flow.
 * Lazy-fetched and cached locally.
 *
 * Rate limit strategy: vnstock free = 60 req/min.
 * Each stock needs ~9 requests for full snapshot.
 * With 4 stocks in watchlist = 36 requests = well within limit.
 * Lazy fetch: only refresh if data is older than staleness threshold.
 *
 * FACTORY-INFRA-split-stores-and-migrations: this file used to be a 937L
 * monolith owning store/get pairs for 8 entities + runVnstockMigrations. It
 * is now a pure re-export barrel over infrastructure/db/vnstock/*.ts — one
 * module per entity — so every existing call site (production imports,
 * `require("../vnstockStore.js")` dynamic lookups in
 * SqliteVnstockRepository.ts, and ~12 test files) resolves unchanged.
 *
 * Layer: infrastructure/db
 */

export { isStale, markFetched } from "./vnstock/fetchLog.js";
export { storeFinancials, getLatestFinancials } from "./vnstock/financialsStore.js";
export {
  storeTradingStats,
  getTradingStats,
  tradingStatsHasDate,
  resetTradingStatsDateCache,
} from "./vnstock/tradingStatsStore.js";
export { storeOfficers } from "./vnstock/officersStore.js";
export { storeShareholders } from "./vnstock/shareholdersStore.js";
export { storeEvents, getEvents } from "./vnstock/eventsStore.js";
export { storeBalanceSheet, getLatestBalanceSheet } from "./vnstock/balanceSheetStore.js";
export { storeCashFlow, getLatestCashFlow } from "./vnstock/cashFlowStore.js";
export { getForeignFlowHistory, upsertForeignFlow } from "./vnstock/foreignFlowStore.js";
export { runVnstockMigrations } from "./vnstock/migrations.js";
