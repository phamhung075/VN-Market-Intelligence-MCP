/**
 * Infrastructure — FRED EFFR/IORB Daily Series Fetcher (Task 1879a, fixed FU-FRED-EFFR-STALE)
 *
 * Fetches daily EFFR (Effective Federal Funds Rate) and IORB (Interest on
 * Reserve Balances) from the FRED REST API (api.stlouisfed.org):
 *
 *   https://api.stlouisfed.org/fred/series/observations
 *     ?series_id=EFFR&api_key=<KEY>&file_type=json&sort_order=asc
 *     &observation_start=<last-date-in-db-or-45d-window>
 *
 * WHY this endpoint: the legacy fredgraph.csv URL (fred.stlouisfed.org) is routed
 * through an Akamai WAF that silently drops all non-browser HTTP streams from this
 * server's IP (confirmed 2026-05-13 and 2026-06-04 recon). api.stlouisfed.org is a
 * separate Apache backend — no Akamai, API-key auth only. Both hostnames resolve to
 * the same IP but the backend is selected by SNI/Host header.
 *
 * Requires: FRED_API_KEY environment variable (Bun.env.FRED_API_KEY).
 * Key already exists in .env — same key used by fredIsmSubcomponents.ts.
 *
 * JSON response shape (FRED API v2):
 *   {
 *     "observations": [
 *       { "date": "YYYY-MM-DD", "value": "3.62" },
 *       { "date": "YYYY-MM-DD", "value": "."    }   // "." = missing/not-yet-published
 *       ...
 *     ]
 *   }
 *
 * Incremental strategy: LAST-DATE-IN-DB
 *   For each series, query MAX(date) from fred_series_daily.  If a row exists,
 *   pass observation_start=<that date> so FRED returns only rows from that date
 *   forward (the date itself is re-fetched but INSERT OR IGNORE makes it idempotent).
 *   If no rows exist (first-run / empty table), fall back to a 45-day window
 *   (observation_start = today-45d) to seed recent history without pulling the full
 *   ~6700-row corpus on every cold start.
 *
 * Storage:
 *   Writes per-date rows to `fred_series_daily`:
 *     (series='EFFR'|'IORB', date='YYYY-MM-DD', value=<rate>)
 *   INSERT OR IGNORE guarantees idempotency: re-runs on same (series, date) = 0 new rows.
 *
 * Error handling:
 *   - Missing FRED_API_KEY → log ERROR, return null immediately (never throws)
 *   - HTTP errors → log WARN, retry up to 3 times (backoff 1s, 2s, 4s)
 *   - After 3 retries → log ERROR, return null for that series (never throws)
 *   - JSON parse failure → log WARN, persist nothing for that series, continue
 *   - "." values (FRED convention for missing data) → silently skipped
 *   - If both EFFR + IORB fail → log ERROR, return null
 *
 * Fetch frequency: daily via macroIndicatorRefreshJob (CRON_MACRO_INDICATOR_REFRESH).
 * Also called on container startup backfill (startScheduler.ts).
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

const FRED_REST_BASE = "https://api.stlouisfed.org/fred/series/observations";

/** Fallback window (days) when the DB has no rows for a series. */
const COLD_START_WINDOW_DAYS = 45;

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
// FRED REST observation response shape
// ---------------------------------------------------------------------------

interface FredObservation {
  date: string;   // "YYYY-MM-DD"
  value: string;  // numeric string or "." for missing
}

interface FredObservationsResponse {
  observations: FredObservation[];
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
          Accept: "application/json",
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
// URL builder
// ---------------------------------------------------------------------------

/**
 * Builds the FRED REST observations URL for the given series.
 *
 * Uses observation_start for incremental fetch:
 *   - If the DB has rows for this series, use MAX(date) as start (re-fetches
 *     that date; idempotent via INSERT OR IGNORE).
 *   - If the DB is empty for this series, fall back to today-COLD_START_WINDOW_DAYS.
 *
 * @param series  - EFFR or IORB
 * @param apiKey  - FRED API key (from Bun.env.FRED_API_KEY)
 * @param db      - Database for reading MAX(date)
 * @returns URL string (api key is included — do NOT log this URL directly)
 */
export function buildFredEffrIorbUrl(
  series: FredSeries,
  apiKey: string,
  db: Database,
): string {
  // Resolve incremental start date from DB
  const row = db
    .prepare<{ maxDate: string | null }, [string]>(
      `SELECT MAX(date) AS maxDate FROM fred_series_daily WHERE series = ?`,
    )
    .get(series);

  let observationStart: string;
  if (row?.maxDate) {
    // Re-fetch from the last known date (INSERT OR IGNORE handles duplicate)
    observationStart = row.maxDate;
  } else {
    // Cold start: seed a 45-day window
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - COLD_START_WINDOW_DAYS);
    observationStart = cutoff.toISOString().slice(0, 10);
  }

  const params = new URLSearchParams({
    series_id: series,
    api_key: apiKey,
    file_type: "json",
    sort_order: "asc",
    observation_start: observationStart,
  });
  return `${FRED_REST_BASE}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// JSON parse helper
// ---------------------------------------------------------------------------

/**
 * Parses a FRED JSON observations response and returns typed rows.
 * Skips "." entries (FRED convention for missing/not-yet-published data).
 *
 * @param body    - Raw JSON string from FRED REST endpoint.
 * @param series  - Series identifier for log context and row tagging.
 * @returns Array of FredDailyRow or null on parse failure / zero valid rows.
 */
export function parseFredEffrIorbJson(
  body: string,
  series: FredSeries,
): FredDailyRow[] | null {
  let parsed: FredObservationsResponse;
  try {
    parsed = JSON.parse(body) as FredObservationsResponse;
  } catch (err) {
    logger.warn(`[fredEffrIorb] JSON parse failed for ${series}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!parsed.observations || !Array.isArray(parsed.observations)) {
    logger.warn(
      `[fredEffrIorb] no observations array in response for ${series}`,
    );
    return null;
  }

  const rows: FredDailyRow[] = [];
  for (const obs of parsed.observations) {
    if (!obs.date || obs.value === ".") continue;  // skip missing entries
    const value = parseFloat(obs.value);
    if (Number.isNaN(value)) continue;
    rows.push({ series, date: obs.date, value });
  }

  if (rows.length === 0) {
    logger.warn(`[fredEffrIorb] zero valid observations for ${series}`);
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
 * @param client   - HTTP client instance.
 * @param url      - URL to fetch.
 * @param series   - Series label for log context.
 * @param sleepFn  - Sleep function (injectable for test speed).
 * @returns JSON string on success, null after all retries exhausted.
 */
async function fetchWithRetry(
  client: FredHttpClient,
  url: string,
  series: FredSeries,
  sleepFn: (ms: number) => Promise<void>,
): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const body = await client.get(url);
      return body;
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
 * Fetches daily EFFR and IORB series from the FRED REST API and persists
 * incremental rows to the `fred_series_daily` table.
 *
 * Uses api.stlouisfed.org (Apache backend, no Akamai WAF) with FRED_API_KEY.
 * Incremental strategy: reads MAX(date) per series from DB; falls back to a
 * 45-day cold-start window when the table is empty for that series.
 *
 * Both series are fetched sequentially (EFFR first, then IORB).
 *
 * @param httpClient - Optional injectable HTTP client (defaults to native fetch).
 *                     Pass a mock in tests to avoid real network calls.
 * @param db         - Optional Database instance (defaults to the app singleton).
 * @param sleepFn    - Optional sleep function override (defaults to Bun.sleep).
 *                     Pass a no-op in tests to skip backoff delays.
 * @returns Result object with { effrRows, iorbRows } counts, or null if both fail
 *          or FRED_API_KEY is missing. Never throws — all errors are caught and logged.
 */
export async function fetchFredEffrIorb(
  httpClient?: FredHttpClient,
  db?: Database,
  sleepFn?: (ms: number) => Promise<void>,
): Promise<FetchFredEffrIorbResult | null> {
  // --- Guard: FRED_API_KEY required ---
  const apiKey =
    typeof Bun !== "undefined" ? Bun.env.FRED_API_KEY : undefined;

  if (!apiKey) {
    logger.error(
      "[fredEffrIorb] FRED_API_KEY not set — cannot fetch EFFR/IORB (fail-loud)",
    );
    return null;
  }

  const client = httpClient ?? makeDefaultHttpClient();
  const database = db ?? getDb();
  const sleep = sleepFn ?? ((ms: number) => Bun.sleep(ms));

  let effrNewRows = 0;
  let iorbNewRows = 0;
  let anySeriesSucceeded = false;

  for (const series of SERIES) {
    const url = buildFredEffrIorbUrl(series, apiKey, database);
    // Log with key masked to avoid leaking it
    logger.debug(`[fredEffrIorb] fetching ${series} JSON`, {
      url: url.replace(apiKey, "***"),
    });

    const body = await fetchWithRetry(client, url, series, sleep);
    if (body === null) {
      logger.error(`[fredEffrIorb] permanent failure for series ${series} — skipping`);
      continue;
    }

    const rows = parseFredEffrIorbJson(body, series);
    if (rows === null) {
      logger.warn(`[fredEffrIorb] JSON parse failed for ${series} — skipping`);
      continue;
    }

    const newRows = persistRows(database, rows);
    if (series === "EFFR") {
      effrNewRows = newRows;
    } else {
      iorbNewRows = newRows;
    }

    anySeriesSucceeded = true;
    logger.info(
      `[fredEffrIorb] ${series} persisted: ${newRows} new rows (${rows.length} in response)`,
      { series, newRows, fetchedRows: rows.length },
    );
  }

  if (!anySeriesSucceeded) {
    logger.error("[fredEffrIorb] both EFFR and IORB fetch failed — returning null");
    return null;
  }

  return { effrRows: effrNewRows, iorbRows: iorbNewRows };
}
