/**
 * Application — Sync vnstock Data (Lazy Fetch)
 *
 * Fetches all available data from vnstock for watchlist stocks,
 * but ONLY if the local cache is stale. Respects rate limits.
 *
 * Rate limit: vnstock free = 60 req/min
 * Each stock = ~5 requests (price, financials, stats, officers, shareholders)
 * 4 stocks × 5 = 20 requests = safe within 60/min
 *
 * Staleness thresholds:
 *   - prices:        30 min (refreshed by intelligence cycle)
 *   - financials:    6 hours (BCTC data changes quarterly)
 *   - trading_stats: 2 hours (changes during trading day)
 *   - officers:      24 hours (rarely changes)
 *   - shareholders:  24 hours (rarely changes)
 *
 * Layer: application/usecases
 */

import { logger } from "../../infrastructure/logger.js";
import {
  fetchVnstockFinancials,
  fetchVnstockTradingStats,
  fetchVnstockOfficers,
  fetchVnstockShareholders,
  fetchVnstockEvents,
} from "../../infrastructure/fetchers/vnstockBridge.js";
import {
  initVnstockTables,
  isStale,
  storeFinancials,
  storeTradingStats,
  storeOfficers,
  storeShareholders,
  storeEvents,
} from "../../infrastructure/db/vnstockStore.js";

// Inter-request delay to stay well within 60 req/min
const DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sync all vnstock data for a single stock (lazy — skips if fresh).
 * Returns number of API calls made.
 */
async function syncStock(code: string): Promise<number> {
  let calls = 0;

  // Financials (6h staleness)
  if (isStale(code, "financials", 360)) {
    const fin = await fetchVnstockFinancials(code);
    if (fin) storeFinancials(fin);
    calls++;
    await sleep(DELAY_MS);
  }

  // Trading stats (2h staleness)
  if (isStale(code, "trading_stats", 120)) {
    const stats = await fetchVnstockTradingStats(code);
    if (stats) storeTradingStats(stats);
    calls++;
    await sleep(DELAY_MS);
  }

  // Officers (24h staleness)
  if (isStale(code, "officers", 1440)) {
    const officers = await fetchVnstockOfficers(code);
    if (officers.length > 0) storeOfficers(code, officers);
    calls++;
    await sleep(DELAY_MS);
  }

  // Shareholders (24h staleness)
  if (isStale(code, "shareholders", 1440)) {
    const holders = await fetchVnstockShareholders(code);
    if (holders.length > 0) storeShareholders(code, holders);
    calls++;
    await sleep(DELAY_MS);
  }

  // Corporate events (7-day staleness — events don't change often)
  if (isStale(code, "events", 10_080)) {
    const events = await fetchVnstockEvents(code);
    if (events.length > 0) storeEvents(code, events);
    calls++;
    await sleep(DELAY_MS);
  }

  return calls;
}

/**
 * Sync vnstock data for all watchlist stocks.
 * Lazy: only fetches stale data. Safe for rate limits.
 *
 * @param codes - Stock codes to sync
 * @returns Total API calls made
 */
export async function syncVnstockData(codes: string[]): Promise<number> {
  if (codes.length === 0) return 0;

  initVnstockTables();

  let totalCalls = 0;

  for (const code of codes) {
    try {
      const calls = await syncStock(code);
      totalCalls += calls;
      if (calls > 0) {
        logger.info("[vnstock-sync] synced stock", { code, apiCalls: calls });
      } else {
        logger.debug("[vnstock-sync] all fresh, skipped", { code });
      }
    } catch (err) {
      logger.warn("[vnstock-sync] failed for stock", {
        code,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("[vnstock-sync] complete", {
    stocks: codes.length,
    totalApiCalls: totalCalls,
  });

  return totalCalls;
}
