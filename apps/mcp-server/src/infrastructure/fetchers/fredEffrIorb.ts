/**
 * Infrastructure — FRED EFFR/IORB Daily Series Fetcher (Task 1879a)
 *
 * Fetches daily EFFR (Effective Federal Funds Rate) and IORB (Interest on
 * Reserve Balances) from the FRED public CSV endpoint:
 *   https://fred.stlouisfed.org/graph/fredgraph.csv?id=EFFR
 *   https://fred.stlouisfed.org/graph/fredgraph.csv?id=IORB
 *
 * No API key required — FRED public tier (confirmed by existing fredApi.ts).
 *
 * CSV format (same as FEDFUNDS):
 *   DATE,VALUE
 *   2026-05-07,4.33
 *   2026-05-08,4.33
 *   ...
 *
 * Parse strategy: parse ALL data rows for full history backfill.
 *
 * Storage:
 *   Writes per-date rows to `fred_series_daily`:
 *     (series='EFFR'|'IORB', date='YYYY-MM-DD', value=<rate>)
 *   INSERT OR IGNORE guarantees idempotency: re-runs on same (series, date) = 0 new rows.
 *
 * Error handling:
 *   - HTTP errors → log WARN, retry up to 3 times (backoff 1s, 2s, 4s)
 *   - After 3 retries → log ERROR, return null (never throws)
 *   - CSV parse failure → log WARN, persist nothing, return null
 *   - If both EFFR + IORB fail → log ERROR, return null
 *
 * Fetch frequency: daily via macroIndicatorRefreshJob (CRON_MACRO_INDICATOR_REFRESH).
 *
 * @module infrastructure/fetchers/fredEffrIorb
 */

import type { Database } from "bun:sqlite";
import { logger } from "../logger.js";
import { getDb } from "../db/schema.js";
import type { FredHttpClient } from "./fredApi.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FRED_BASE_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=";

const SERIES = ["EFFR", "IORB"] as const;
type FredSeries = (typeof SERIES)[number];

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FredDailyRow {
  series: FredSeries;
  date: string;
  value: number;
}

export interface FetchFredEffrIorbResult {
  effrRows: number;
  iorbRows: number;
}

// ---------------------------------------------------------------------------
// Default HTTP client — reuses FredHttpClient shape from fredApi.ts
// ---------------------------------------------------------------------------

function makeDefaultHttpClient(): FredHttpClient {
  return {
    async get(url: string): Promise<string> {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; VN-Market-Intelligence/1.0; +https://github.com/vn-market)",
          Accept: "text/csv,text/plain,*/*",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return response.text();
    },
  };
}

// ---------------------------------------------------------------------------
// CSV parsing helper — parses ALL data rows (not just last row)
// ---------------------------------------------------------------------------

/**
 * Parses a FRED CSV string and returns all data rows.
 *
 * @param csv - Raw CSV string from FRED endpoint.
 * @param series - Series identifier for row tagging.
 * @returns Array of { series, date, value } or null on parse failure.
 */
function parseFredCsvAllRows(
  csv: string,
  series: FredSeries,
): FredDailyRow[] | null {
  const lines = csv
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Expect at least header + 1 data row
  if (lines.length < 2) {
    logger.warn(`[fredEffrIorb] WARN: CSV for ${series} returned 0 rows`);
    return null;
  }

  // Skip header row
  const dataLines = lines.slice(1);
  const rows: FredDailyRow[] = [];

  for (const line of dataLines) {
    const parts = line.split(",");
    if (parts.length < 2) {
      logger.warn(`[fredEffrIorb] WARN: skipping malformed CSV row for ${series}`, { line });
      continue;
    }
    const date = (parts[0] as string).trim();
    const rawValue = (parts[1] as string).trim();
    const value = parseFloat(rawValue);

    if (!date || Number.isNaN(value)) {
      // Skip rows with "." (FRED placeholder for missing data)
      continue;
    }

    rows.push({ series, date, value });
  }

  if (rows.length === 0) {
    logger.warn(`[fredEffrIorb] WARN: no valid data rows parsed for ${series}`);
    return null;
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Retry helper with exponential backoff
// ---------------------------------------------------------------------------

/**
 * Fetch with retry — up to 3 attempts with 1s, 2s, 4s backoff.
 *
 * @param client - HTTP client instance.
 * @param url - URL to fetch.
 * @param series - Series label for log context.
 * @param sleepFn - Sleep function (injectable for test speed).
 * @returns CSV string on success, null after all retries exhausted.
 */
async function fetchWithRetry(
  client: FredHttpClient,
  url: string,
  series: FredSeries,
  sleepFn: (ms: number) => Promise<void>,
): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const csv = await client.get(url);
      return csv;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        const backoffMs = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        logger.warn(
          `[fredEffrIorb] attempt ${attempt}/${MAX_RETRIES} failed for ${series} — retrying in ${backoffMs}ms`,
          { error: errorMsg },
        );
        await sleepFn(backoffMs);
      } else {
        logger.error(
          `[fredEffrIorb] all ${MAX_RETRIES} retries exhausted for ${series} — giving up`,
          { error: errorMsg },
        );
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Persistence helper
// ---------------------------------------------------------------------------

/**
 * Inserts all rows for a series into fred_series_daily using INSERT OR IGNORE.
 *
 * @returns Number of net new rows inserted.
 */
function persistRows(db: Database, rows: FredDailyRow[]): number {
  if (rows.length === 0) return 0;

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO fred_series_daily (series, date, value)
     VALUES (?, ?, ?)`,
  );

  // Count rows before and after to determine net new inserts
  const series = rows[0]!.series;
  const beforeCount = (
    db
      .prepare<{ cnt: number }, [string]>(
        `SELECT COUNT(*) AS cnt FROM fred_series_daily WHERE series = ?`,
      )
      .get(series) ?? { cnt: 0 }
  ).cnt;

  for (const row of rows) {
    stmt.run(row.series, row.date, row.value);
  }

  const afterCount = (
    db
      .prepare<{ cnt: number }, [string]>(
        `SELECT COUNT(*) AS cnt FROM fred_series_daily WHERE series = ?`,
      )
      .get(series) ?? { cnt: 0 }
  ).cnt;

  return afterCount - beforeCount;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches daily EFFR and IORB series from FRED's public CSV endpoint and
 * persists all rows to the `fred_series_daily` table.
 *
 * Both series are fetched sequentially (EFFR first, then IORB).
 *
 * @param httpClient - Optional injectable HTTP client (defaults to native fetch).
 *                     Pass a mock in tests to avoid real network calls.
 * @param db         - Optional Database instance (defaults to the app singleton).
 * @param sleepFn    - Optional sleep function override (defaults to Bun.sleep).
 *                     Pass a no-op in tests to skip backoff delays.
 * @returns Result object with { effrRows, iorbRows } counts, or null if both fail.
 *          Never throws — all errors are caught and logged.
 */
export async function fetchFredEffrIorb(
  httpClient?: FredHttpClient,
  db?: Database,
  sleepFn?: (ms: number) => Promise<void>,
): Promise<FetchFredEffrIorbResult | null> {
  const client = httpClient ?? makeDefaultHttpClient();
  const database = db ?? getDb();
  const sleep = sleepFn ?? ((ms: number) => Bun.sleep(ms));

  let effrNewRows = 0;
  let iorbNewRows = 0;
  let anySeriessucceeded = false;

  for (const series of SERIES) {
    const url = `${FRED_BASE_URL}${series}`;
    logger.debug(`[fredEffrIorb] fetching ${series} CSV`, { url });

    const csv = await fetchWithRetry(client, url, series, sleep);
    if (csv === null) {
      logger.error(`[fredEffrIorb] permanent failure for series ${series} — skipping`);
      continue;
    }

    const rows = parseFredCsvAllRows(csv, series);
    if (rows === null) {
      logger.warn(`[fredEffrIorb] CSV parse failed for ${series} — skipping`);
      continue;
    }

    const newRows = persistRows(database, rows);
    if (series === "EFFR") {
      effrNewRows = newRows;
    } else {
      iorbNewRows = newRows;
    }

    anySeriessucceeded = true;
    logger.info(
      `[fredEffrIorb] ${series} persisted: ${newRows} new rows (${rows.length} in CSV)`,
      { series, newRows, csvRows: rows.length },
    );
  }

  if (!anySeriessucceeded) {
    logger.error("[fredEffrIorb] both EFFR and IORB fetch failed — returning null");
    return null;
  }

  return { effrRows: effrNewRows, iorbRows: iorbNewRows };
}
