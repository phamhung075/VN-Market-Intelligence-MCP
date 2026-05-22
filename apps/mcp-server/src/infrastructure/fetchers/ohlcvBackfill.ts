/**
 * ohlcvBackfill — VNDirect historical OHLCV backfill (Task 1842b)
 *
 * Fetches up to 2 years of daily OHLCV from VNDirect for all tickers
 * currently in daily_ohlcv plus VNINDEX, and upserts via INSERT OR IGNORE.
 *
 * Idempotent: safe to re-run. Per-ticker resume logic skips already-backfilled
 * tickers (count > 100 AND earliest date <= 2024-01-15).
 *
 * Rate limiting: 200ms delay between ticker requests.
 *
 * Data source: VNDirect api-finfo.vndirect.com.vn/v4/stock_prices
 * — same base URL used by hose.ts. Requires browser User-Agent.
 *
 * Layer: infrastructure/fetchers
 */

import type { Database } from "bun:sqlite";
import { BROWSER_UA } from "./browserHeaders.js";

const VNDIRECT_STOCK_PRICES_BASE = "https://api-finfo.vndirect.com.vn/v4";

/** Shape of a single record from VNDirect stock_prices API */
interface VnDirectOhlcvRecord {
  code?: string;
  date?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  nmVolume?: number;
}

/**
 * Fetch OHLCV history for a single ticker from VNDirect.
 * Returns an array of records sorted by date ASC (API default is sort=date).
 */
async function fetchOhlcvForTicker(
  code: string,
  fromDate: string,
  toDate: string,
): Promise<VnDirectOhlcvRecord[]> {
  // VNDirect supports up to 365 rows per page; for a 2-year range we need ~500 rows.
  // Use size=750 to capture all trading days in a 2-year window (252 trading days/year).
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

    const json = (await response.json()) as { data?: VnDirectOhlcvRecord[] };
    if (!Array.isArray(json.data)) return [];
    return json.data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface OhlcvBackfillResult {
  fetched: number;
  skipped: number;
  errors: string[];
}

/**
 * Run the OHLCV historical backfill for all tickers in daily_ohlcv + VNINDEX.
 *
 * @param db       - Injected Database instance (no getDb() calls)
 * @param options  - Optional overrides for date range and delay
 * @returns Summary of fetched, skipped, and error counts
 */
export async function runOhlcvBackfill(
  db: Database,
  options?: {
    fromDate?: string;  // default "2024-01-01"
    toDate?: string;    // default today YYYY-MM-DD
    delayMs?: number;   // default 200
  },
): Promise<OhlcvBackfillResult> {
  const fromDate = options?.fromDate ?? "2024-01-01";
  const toDate = options?.toDate ?? new Date().toISOString().slice(0, 10);
  const delayMs = options?.delayMs ?? 200;

  // Collect tickers from daily_ohlcv. On a fresh deployment the table is empty,
  // so fall back to the watchlist table as the authoritative ticker source.
  const existingRows = db
    .prepare<{ code: string }, []>("SELECT DISTINCT code FROM daily_ohlcv")
    .all();
  const existingCodes = existingRows.map((r) => r.code);

  let watchlistCodes: string[] = [];
  if (existingCodes.length === 0) {
    // Bootstrap path: daily_ohlcv is empty — seed ticker list from watchlist
    try {
      watchlistCodes = (
        db.prepare<{ code: string }, []>("SELECT code FROM watchlist").all()
      ).map((r) => r.code);
    } catch {
      // watchlist table absent — VNINDEX only
    }
  }

  const tickers = Array.from(
    new Set([...existingCodes, ...watchlistCodes, "VNINDEX"]),
  );

  const total = tickers.length;
  let fetched = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Prepared statements for resume check and upsert
  const resumeCheck = db.prepare<
    { min_date: string | null; max_date: string | null; cnt: number },
    [string]
  >(
    "SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as cnt FROM daily_ohlcv WHERE code = ?",
  );

  const upsert = db.prepare<void, [string, string, number, number, number, number, number]>(
    `INSERT OR IGNORE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  );

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    if (!ticker) continue;

    // Progress log every 10 tickers
    if (i % 10 === 0) {
      console.log(`[ohlcvBackfill] ${i}/${total} — ${ticker}`);
    }

    // Resume logic: skip if already sufficiently backfilled
    const check = resumeCheck.get(ticker);
    if (
      check &&
      check.cnt > 100 &&
      check.min_date !== null &&
      check.min_date <= "2024-01-15"
    ) {
      skipped++;
      continue;
    }

    try {
      const records = await fetchOhlcvForTicker(ticker, fromDate, toDate);

      if (records.length === 0) {
        // Not an error — ticker may not have data in VNDirect (e.g. newly listed)
        continue;
      }

      // Batch insert inside a transaction for performance
      const insertMany = db.transaction((rows: VnDirectOhlcvRecord[]) => {
        for (const r of rows) {
          // Skip records with any missing OHLC field — coercing null to 0 produces
          // corrupt rows (e.g. low=0) that break TA computations and P/L scoring.
          // All four fields must be present; volume is optional (defaults to 0).
          if (
            !r.code ||
            !r.date ||
            r.open == null ||
            r.high == null ||
            r.low == null ||
            r.close == null
          ) continue;
          upsert.run(
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

      insertMany(records);
      fetched += records.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${ticker}: ${msg}`);
    }

    // Rate limit — 200ms between requests
    if (i < tickers.length - 1) {
      await sleep(delayMs);
    }
  }

  const summary = `[ohlcvBackfill] Complete: ${fetched} fetched, ${skipped} skipped, ${errors.length} errors`;
  console.log(summary);

  return { fetched, skipped, errors };
}
