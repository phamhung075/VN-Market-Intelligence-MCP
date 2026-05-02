/**
 * Application — Sync vnstock Data (Lazy Fetch)
 *
 * Fetches all available data from vnstock for watchlist stocks,
 * but ONLY if the local cache is stale. Respects rate limits.
 *
 * Rate limit: vnstock free = 60 req/min
 * Each stock = ~9 requests (price, financials, stats, officers, shareholders,
 *                            balance_sheet, cash_flow, events)
 * 4 stocks × 9 = 36 requests = safe within 60/min
 *
 * Staleness thresholds:
 *   - prices:        30 min (refreshed by intelligence cycle)
 *   - financials:    6 hours (BCTC data changes quarterly)
 *   - balance_sheet: 6 hours (same cadence as income statement)
 *   - cash_flow:     6 hours (same cadence as income statement)
 *   - trading_stats: 2 hours (changes during trading day)
 *   - officers:      24 hours (rarely changes)
 *   - shareholders:  24 hours (rarely changes)
 *   - events:        7 days (rarely changes)
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
  fetchVnstockBalanceSheet,
  fetchVnstockCashFlow,
} from "../../infrastructure/fetchers/vnstockBridge.js";
import {
  isStale,
  storeFinancials,
  storeTradingStats,
  storeOfficers,
  storeShareholders,
  storeEvents,
  storeBalanceSheet,
  storeCashFlow,
  markFetched,
} from "../../infrastructure/db/vnstockStore.js";
import { sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";

// Inter-request delay to stay well within 60 req/min
const DELAY_MS = 1500;

// ---------------------------------------------------------------------------
// Circuit breaker — exported for unit tests
// ---------------------------------------------------------------------------

/** Per-code-per-type circuit breaker entry. */
export interface CbEntry {
  failures: number;
  openedAt: number | null;
  /** Number of times the circuit has opened (not reset by success, increments each open). */
  consecutiveOpens: number;
}

/** Map keyed by `${code}:${type}`. */
export type CbStateMap = Record<string, CbEntry>;

/** Thresholds. */
const FAIL_THRESHOLD = 3;
const RESET_MS = 2 * 60 * 60 * 1000; // 2 hours
const COOLDOWN_MS = 60 * 60 * 1000;  // 60 min between bulk alerts

/** Module-level circuit breaker state (persists across syncVnstockData() calls). */
const _globalCbState: CbStateMap = {};
/** Timestamp of last bulk-failure Telegram alert (module-level, avoids spam). */
let _lastVnstockAlertAt = 0;

/** Factory — creates a fresh state map (used by unit tests to get clean slate). */
export function makeCbState(): CbStateMap {
  return {};
}

/** Ensure the entry for a key exists in the map. */
function ensureEntry(state: CbStateMap, code: string, type: string): CbEntry {
  const key = `${code}:${type}`;
  if (!state[key]) {
    state[key] = { failures: 0, openedAt: null, consecutiveOpens: 0 };
  }
  return state[key]!;
}

/**
 * Effective reset window for a circuit: exponential backoff per consecutive opens.
 * consecutiveOpens=1 → 2h, 2 → 4h, ≥3 → 8h (cap).
 */
function effectiveResetMs(entry: CbEntry): number {
  const multiplier = Math.min(Math.pow(2, (entry.consecutiveOpens ?? 1) - 1), 4);
  return RESET_MS * multiplier;
}

/**
 * Returns true if the circuit is open (too many consecutive failures)
 * AND the reset window has not expired.
 */
export function isCircuitOpen(state: CbStateMap, code: string, type: string): boolean {
  const entry = state[`${code}:${type}`];
  if (!entry || entry.openedAt === null) return false;
  if (Date.now() - entry.openedAt >= effectiveResetMs(entry)) return false;
  return true;
}

/**
 * Record a null/failed fetch for a code+type.
 * Opens the circuit after `threshold` consecutive failures.
 */
export function recordFailure(
  state: CbStateMap,
  code: string,
  type: string,
  threshold = FAIL_THRESHOLD,
): void {
  const entry = ensureEntry(state, code, type);
  entry.failures += 1;
  if (entry.openedAt === null && entry.failures >= threshold) {
    entry.openedAt = Date.now();
    entry.consecutiveOpens = (entry.consecutiveOpens ?? 0) + 1;
  }
}

/**
 * Record a successful fetch for a code+type — resets the circuit.
 * consecutiveOpens resets to 0 so next failure starts from 2h backoff again.
 */
export function recordSuccess(state: CbStateMap, code: string, type: string): void {
  const key = `${code}:${type}`;
  state[key] = { failures: 0, openedAt: null, consecutiveOpens: 0 };
}

/**
 * Returns the number of codes that have at least one open circuit across the given types.
 * Used to build the WORK-channel message with the affected ticker count.
 */
export function countOpenCircuits(
  state: CbStateMap,
  codes: string[],
  types: string[],
): number {
  return codes.filter((code) => types.some((type) => isCircuitOpen(state, code, type))).length;
}

/**
 * Returns true if a bulk-failure Telegram alert should be fired:
 *   - >= 10 codes have at least one open circuit across the given types
 *   - lastAlertAt is more than COOLDOWN_MS ago (or 0)
 */
export function shouldFireBulkAlert(
  state: CbStateMap,
  codes: string[],
  types: string[],
  lastAlertAt: number,
): boolean {
  if (Date.now() - lastAlertAt < COOLDOWN_MS) return false;
  const openCount = codes.filter((code) =>
    types.some((type) => isCircuitOpen(state, code, type)),
  ).length;
  return openCount >= 10;
}

/** Exposed for unit tests to reset module-level alert timestamp. */
export function resetLastAlertAt(): void {
  _lastVnstockAlertAt = 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sync all vnstock data for a single stock (lazy — skips if fresh).
 * Returns number of API calls made.
 */
async function syncStock(code: string): Promise<number> {
  let calls = 0;

  // Financials / income statement (6h staleness)
  if (isStale(code, "financials", 360)) {
    if (isCircuitOpen(_globalCbState, code, "financials")) {
      logger.debug("[vnstock-sync] circuit open — skipping financials", { code });
    } else {
      const fin = await fetchVnstockFinancials(code);
      if (fin) {
        storeFinancials(fin);
        recordSuccess(_globalCbState, code, "financials");
      } else {
        markFetched(code, "financials", 30); // empty/timeout: retry in 30min, not 6h
        recordFailure(_globalCbState, code, "financials");
      }
      calls++;
      await sleep(DELAY_MS);
    }
  }

  // Balance sheet (6h staleness — same cadence as income statement)
  if (isStale(code, "balance_sheet", 360)) {
    if (isCircuitOpen(_globalCbState, code, "balance_sheet")) {
      logger.debug("[vnstock-sync] circuit open — skipping balance_sheet", { code });
    } else {
      const bs = await fetchVnstockBalanceSheet(code);
      if (bs) {
        storeBalanceSheet(bs);
        recordSuccess(_globalCbState, code, "balance_sheet");
      } else {
        markFetched(code, "balance_sheet", 30); // empty/timeout: retry in 30min
        recordFailure(_globalCbState, code, "balance_sheet");
      }
      calls++;
      await sleep(DELAY_MS);
    }
  }

  // Cash flow (6h staleness — same cadence as income statement)
  if (isStale(code, "cash_flow", 360)) {
    if (isCircuitOpen(_globalCbState, code, "cash_flow")) {
      logger.debug("[vnstock-sync] circuit open — skipping cash_flow", { code });
    } else {
      const cf = await fetchVnstockCashFlow(code);
      if (cf) {
        storeCashFlow(cf);
        recordSuccess(_globalCbState, code, "cash_flow");
      } else {
        markFetched(code, "cash_flow", 30); // empty/timeout: retry in 30min
        recordFailure(_globalCbState, code, "cash_flow");
      }
      calls++;
      await sleep(DELAY_MS);
    }
  }

  // Trading stats (2h staleness)
  if (isStale(code, "trading_stats", 120)) {
    if (isCircuitOpen(_globalCbState, code, "trading_stats")) {
      logger.debug("[vnstock-sync] circuit open — skipping trading_stats", { code });
    } else {
      const stats = await fetchVnstockTradingStats(code);
      if (stats) {
        storeTradingStats(stats);
        recordSuccess(_globalCbState, code, "trading_stats");
      } else {
        markFetched(code, "trading_stats");
        recordFailure(_globalCbState, code, "trading_stats");
      }
      calls++;
      await sleep(DELAY_MS);
    }
  }

  // Officers (24h staleness)
  if (isStale(code, "officers", 1440)) {
    const officers = await fetchVnstockOfficers(code);
    if (officers.length > 0) storeOfficers(code, officers);
    else markFetched(code, "officers"); // back off even on empty/timeout
    calls++;
    await sleep(DELAY_MS);
  }

  // Shareholders (24h staleness)
  if (isStale(code, "shareholders", 1440)) {
    const holders = await fetchVnstockShareholders(code);
    if (holders.length > 0) storeShareholders(code, holders);
    else markFetched(code, "shareholders"); // back off even on empty/timeout
    calls++;
    await sleep(DELAY_MS);
  }

  // Corporate events (7-day staleness — events don't change often)
  // Always mark fetched even on empty/timeout result, otherwise the retry
  // storm will hit every cycle (vnstock events frequently SIGTERMs at 45s).
  if (isStale(code, "events", 10_080)) {
    const events = await fetchVnstockEvents(code);
    if (events.length > 0) storeEvents(code, events);
    else markFetched(code, "events"); // back off 7d even on empty/timeout
    calls++;
    await sleep(DELAY_MS);
  }

  return calls;
}

/**
 * Lightweight sync for sector peer stocks — only the 3 data types that
 * matter for relative-strength comparison, with relaxed staleness windows
 * to avoid burning rate limit on peer refreshes.
 *
 * Synced types (relaxed windows): trading_stats (6h), financials (24h),
 * balance_sheet (24h).
 *
 * @param code - Stock code to sync
 * @returns Number of API calls made
 */
export async function syncStockLight(code: string): Promise<number> {
  let calls = 0;

  if (isStale(code, "trading_stats", 360)) {
    const stats = await fetchVnstockTradingStats(code);
    if (stats) storeTradingStats(stats);
    else markFetched(code, "trading_stats");
    calls++;
    await sleep(DELAY_MS);
  }

  if (isStale(code, "financials", 1440)) {
    const fin = await fetchVnstockFinancials(code);
    if (fin) storeFinancials(fin);
    else markFetched(code, "financials");
    calls++;
    await sleep(DELAY_MS);
  }

  if (isStale(code, "balance_sheet", 1440)) {
    const bs = await fetchVnstockBalanceSheet(code);
    if (bs) storeBalanceSheet(bs);
    else markFetched(code, "balance_sheet");
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
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("malformed")) {
        logger.warn("[vnstock-sync] DB malformed — bailing sync loop early", {
          code,
          error: msg,
        });
        break;
      }
      logger.warn("[vnstock-sync] failed for stock", {
        code,
        error: msg,
      });
    }
  }

  logger.info("[vnstock-sync] complete", {
    stocks: codes.length,
    totalApiCalls: totalCalls,
  });

  // Bulk-failure circuit breaker alert: fire once per hour if >= 10 codes are
  // blocked for financial data types (signal of API-wide rate-limit or ANSI pollution).
  const financialTypes = ["financials", "balance_sheet", "cash_flow"];
  if (shouldFireBulkAlert(_globalCbState, codes, financialTypes, _lastVnstockAlertAt)) {
    _lastVnstockAlertAt = Date.now();
    const openCount = countOpenCircuits(_globalCbState, codes, financialTypes);
    const affectedTypes = financialTypes
      .filter((t) => codes.some((c) => isCircuitOpen(_globalCbState, c, t)))
      .join(", ");
    const ts = new Date().toISOString();
    await sendTelegramWork(
      `[VNSTOCK] vnstock rate-limit: ${openCount} tickers circuit-open at ${ts}. Types: ${affectedTypes}. Will auto-retry (2h→4h→8h backoff). Check: python3 -c "from vnstock import Vnstock; print('ok')"`,
    );
    logger.warn("[vnstock-sync] bulk circuit breaker alert sent", { openCount, affectedTypes });
  }

  return totalCalls;
}
