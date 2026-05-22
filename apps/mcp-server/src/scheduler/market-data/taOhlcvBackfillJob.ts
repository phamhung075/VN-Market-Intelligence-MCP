/**
 * taOhlcvBackfillJob — RSI/MACD/BB indicator restoration backfill (Task 1970)
 *
 * Purpose: After the 1972 null-coercion fix, ~1072 corrupt low=0 rows remain in
 * daily_ohlcv from earlier VNDIRECT fetches. This job restores RSI/MACD/BB
 * indicator coverage across all 30 watchlist tickers by:
 *   1. Detecting tickers with < TA_MIN_ROWS clean rows (insufficient for MACD/RSI/BB)
 *   2. Detecting tickers with any low=0 rows (corrupt 1972-era data)
 *   3. Fetching 18 months of OHLCV history from VNDIRECT
 *   4. Upserting via INSERT OR REPLACE — overwrites corrupt rows with clean data
 *
 * TA minimum threshold (TA_MIN_ROWS = 35):
 *   MACD(26,9): requires 26 + 9 - 1 = 34 prices → 35 rows is the safe minimum
 *   RSI(14): requires 15 prices — lower bound than MACD
 *   BB(20): requires 20 prices — lower bound than MACD
 *   TA_MIN_ROWS = 35 covers all three indicators.
 *
 * INSERT OR REPLACE vs INSERT OR IGNORE:
 *   ohlcvBackfill.ts uses INSERT OR IGNORE (never overwrites). This job uses
 *   INSERT OR REPLACE so corrupt rows (low=0 from 1972 bug) are healed.
 *
 * DDD layer: scheduler — may import from domain/ and infrastructure/.
 * MUST NOT import from application/ or interface/.
 * MUST NOT import sendTelegram or any Telegram client directly.
 *
 * @module scheduler/market-data/taOhlcvBackfillJob
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimum OHLCV row count needed for RSI(14), MACD(12,26,9), and BB(20).
 * MACD requires the most: slow(26) + signal(9) - 1 = 34 rows minimum.
 * We use 35 as a safe buffer (one extra row for the signal EMA seed).
 */
export const TA_MIN_ROWS = 35;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Shape of a single OHLCV record returned by the fetch function */
export interface OhlcvRecord {
  code?: string;
  date?: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  nmVolume?: number;
}

/** Dependency-injectable parameters — production uses real DB + VNDIRECT fetcher */
export interface TaOhlcvBackfillDeps {
  /** Injected Database instance (no getDb() calls inside) */
  db?: Database;
  /**
   * Fetch function for a single ticker — injectable for tests.
   * Signature matches the VNDIRECT fetch pattern in ohlcvBackfill.ts.
   * Production default: fetches from api-finfo.vndirect.com.vn
   */
  fetchFn?: (
    code: string,
    fromDate: string,
    toDate: string,
  ) => Promise<OhlcvRecord[]>;
  /** Delay between ticker requests in ms (default 200) */
  delayMs?: number;
  /** backfill from-date (default: 18 months ago) */
  fromDate?: string;
  /** backfill to-date (default: today YYYY-MM-DD) */
  toDate?: string;
}

/** Summary returned by runTaOhlcvBackfill */
export interface TaOhlcvBackfillResult {
  /** Tickers already having >= TA_MIN_ROWS clean rows (not re-fetched) */
  covered: number;
  /** Tickers successfully fetched and upserted with >= TA_MIN_ROWS rows from API */
  backfilled: number;
  /**
   * Tickers where the API returned data but < TA_MIN_ROWS rows.
   * Rows are still inserted (best-effort) but TA indicators may still be null.
   */
  sparse: number;
  /** Per-ticker error strings for tickers where fetch or upsert failed */
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL constants
// ─────────────────────────────────────────────────────────────────────────────

const TICKER_COVERAGE_SQL = `
  SELECT
    COUNT(*) AS cnt,
    SUM(CASE WHEN low = 0 THEN 1 ELSE 0 END) AS corrupt_cnt
  FROM daily_ohlcv
  WHERE code = ?
`;

const UPSERT_SQL = `
  INSERT OR REPLACE INTO daily_ohlcv
    (code, date, open, high, low, close, volume, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
`;

// ─────────────────────────────────────────────────────────────────────────────
// Default fetcher
// ─────────────────────────────────────────────────────────────────────────────

const VNDIRECT_STOCK_PRICES_BASE = "https://api-finfo.vndirect.com.vn/v4";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function defaultFetchFn(
  code: string,
  fromDate: string,
  toDate: string,
): Promise<OhlcvRecord[]> {
  const url =
    `${VNDIRECT_STOCK_PRICES_BASE}/stock_prices` +
    `?code=${encodeURIComponent(code)}` +
    `&sort=date&size=750&page=1` +
    `&fromDate=${fromDate}&toDate=${toDate}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "application/json",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${code}`);
    }

    const json = (await response.json()) as { data?: OhlcvRecord[] };
    if (!Array.isArray(json.data)) return [];
    return json.data;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sleep helper
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the TA OHLCV restoration backfill for all watchlist tickers.
 *
 * Strategy:
 *   - Covered tickers (>= TA_MIN_ROWS clean rows, zero corrupt rows) → skip
 *   - All others (< TA_MIN_ROWS OR any low=0 corrupt rows) → fetch + INSERT OR REPLACE
 *
 * @param deps - Optional injectable dependencies for testing.
 * @returns Summary of covered / backfilled / sparse / errors counts.
 */
export async function runTaOhlcvBackfill(
  deps?: TaOhlcvBackfillDeps,
): Promise<TaOhlcvBackfillResult> {
  // ─── Resolve dependencies ────────────────────────────────────────────────
  let db: Database;
  if (deps?.db) {
    db = deps.db;
  } else {
    const { getDb } = await import("../../infrastructure/db/schema.js");
    db = getDb();
  }

  const fetchFn = deps?.fetchFn ?? defaultFetchFn;
  const delayMs = deps?.delayMs ?? 200;

  // Default from-date: 18 months ago gives ample history for all TA indicators
  const today = new Date().toISOString().slice(0, 10);
  const eighteenMonthsAgo = new Date(Date.now() - 18 * 30 * 24 * 3_600_000)
    .toISOString()
    .slice(0, 10);

  const fromDate = deps?.fromDate ?? eighteenMonthsAgo;
  const toDate = deps?.toDate ?? today;

  // ─── Load watchlist ───────────────────────────────────────────────────────
  let watchlist: Array<{ code: string }>;
  try {
    watchlist = db
      .prepare<{ code: string }, []>("SELECT code FROM watchlist")
      .all();
  } catch (err) {
    logger.warn("[taOhlcvBackfill] failed to read watchlist", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { covered: 0, backfilled: 0, sparse: 0, errors: [] };
  }

  if (watchlist.length === 0) {
    return { covered: 0, backfilled: 0, sparse: 0, errors: [] };
  }

  // ─── Prepared statements ──────────────────────────────────────────────────
  const coverageStmt = db.prepare<
    { cnt: number; corrupt_cnt: number },
    [string]
  >(TICKER_COVERAGE_SQL);

  const upsertStmt = db.prepare(UPSERT_SQL);

  // Batch upsert inside a transaction for performance
  const insertMany = db.transaction((records: OhlcvRecord[]) => {
    for (const r of records) {
      // Skip any record with missing OHLC fields to avoid re-introducing corrupt data
      if (
        !r.code ||
        !r.date ||
        r.open == null ||
        r.high == null ||
        r.low == null ||
        r.close == null
      ) {
        continue;
      }
      upsertStmt.run(
        r.code,
        r.date,
        r.open,
        r.high,
        r.low,
        r.close,
        r.nmVolume ?? 0,
      );
    }
  });

  // ─── Per-ticker loop ──────────────────────────────────────────────────────
  let covered = 0;
  let backfilled = 0;
  let sparse = 0;
  const errors: string[] = [];

  for (let i = 0; i < watchlist.length; i++) {
    const item = watchlist[i];
    if (!item) continue;
    const { code } = item;

    // Coverage check: count total rows and corrupt rows (low=0)
    const coverage = coverageStmt.get(code);
    const cnt = coverage?.cnt ?? 0;
    const corruptCnt = coverage?.corrupt_cnt ?? 0;

    // Skip if already covered: enough rows AND no corrupt rows
    if (cnt >= TA_MIN_ROWS && corruptCnt === 0) {
      covered++;
      continue;
    }

    // Needs backfill — fetch from VNDIRECT
    try {
      const records = await fetchFn(code, fromDate, toDate);

      // Upsert all valid records (INSERT OR REPLACE → heals corrupt rows)
      insertMany(records);

      // Classify result: sparse if fetched records are below TA minimum
      const validCount = records.filter(
        (r) =>
          r.code &&
          r.date &&
          r.open != null &&
          r.high != null &&
          r.low != null &&
          r.close != null,
      ).length;

      if (validCount < TA_MIN_ROWS) {
        sparse++;
        logger.info(
          `[taOhlcvBackfill] sparse: ${code} → ${validCount}/${TA_MIN_ROWS} rows`,
        );
      } else {
        backfilled++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${code}: ${msg}`);
      logger.warn(`[taOhlcvBackfill] error ticker=${code}`, { error: msg });
    }

    // Rate limit between requests (skip after last ticker)
    if (i < watchlist.length - 1) {
      await sleep(delayMs);
    }
  }

  const summary =
    `[taOhlcvBackfill] Complete: covered=${covered} backfilled=${backfilled} ` +
    `sparse=${sparse} errors=${errors.length}`;
  logger.info(summary);

  return { covered, backfilled, sparse, errors };
}
