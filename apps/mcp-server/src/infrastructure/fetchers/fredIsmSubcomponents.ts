/**
 * Infrastructure — FRED ISM Manufacturing Sub-Component Fetcher (Task 1910a)
 *
 * Fetches ISM Manufacturing PMI sub-component series from the FRED REST API
 * (api.stlouisfed.org) using the FRED_API_KEY environment variable.
 *
 * Series fetched (all require FRED_API_KEY — authenticated endpoint):
 *   NAPMNO  — ISM New Orders index
 *   NAPMEMP — ISM Employment index
 *   NAPMPI  — ISM Prices Paid index
 *   NAPMBI  — ISM Backlog of Orders index
 *
 * Endpoint:
 *   https://api.stlouisfed.org/fred/series/observations
 *     ?series_id={ID}&api_key={KEY}&file_type=json&sort_order=desc&limit=3
 *
 * Note: ISM is a monthly series. We fetch the last 3 observations to get the
 * latest published value (FRED may lag ISM publication by 1–2 business days).
 * Daily cron runs idempotently via INSERT OR IGNORE.
 *
 * Storage: Reuses `fred_series_daily` table (schema from Task 1879a).
 *   (series TEXT, date TEXT, value REAL) — UNIQUE(series, date) → idempotent.
 *
 * Error handling:
 *   - Missing FRED_API_KEY → log WARN + return null (never throws)
 *   - HTTP errors → retry up to 3 times with 1s/2s/4s backoff
 *   - After retries exhausted → log ERROR + continue to next series
 *   - JSON parse failure → log WARN + skip series
 *   - "." values (FRED missing-data convention) → silently skipped
 *
 * Rate limit: FRED allows 120 req/min. 4 series/day = no concern.
 *
 * @module infrastructure/fetchers/fredIsmSubcomponents
 */

import type { Database } from "bun:sqlite";
import { logger } from "../logger.js";
import { getDb } from "../db/schema.js";
import type { FredHttpClient } from "./fredApi.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FRED_REST_BASE =
  "https://api.stlouisfed.org/fred/series/observations";

/** ISM Manufacturing sub-component series IDs. */
export const ISM_SERIES = ["NAPMNO", "NAPMEMP", "NAPMPI", "NAPMBI"] as const;
export type IsmSeriesId = (typeof ISM_SERIES)[number];

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IsmFetchResult {
  /** Number of net new rows inserted per series (key = series ID). */
  inserted: Record<IsmSeriesId, number>;
  /** Series that failed after all retries. */
  failed: IsmSeriesId[];
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
// HTTP client builder
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
// Build FRED REST URL for a series
// ---------------------------------------------------------------------------

export function buildFredIsmUrl(seriesId: IsmSeriesId, apiKey: string): string {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    sort_order: "desc",
    limit: "3",
  });
  return `${FRED_REST_BASE}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Retry helper with exponential backoff
// ---------------------------------------------------------------------------

async function fetchWithRetry(
  client: FredHttpClient,
  url: string,
  seriesId: IsmSeriesId,
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
          `[fredIsmSubcomponents] attempt ${attempt}/${MAX_RETRIES} failed for ${seriesId} — retrying in ${backoffMs}ms`,
          { error: errorMsg },
        );
        await sleepFn(backoffMs);
      } else {
        logger.error(
          `[fredIsmSubcomponents] all ${MAX_RETRIES} retries exhausted for ${seriesId} — giving up`,
          { error: errorMsg },
        );
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// JSON parse helper
// ---------------------------------------------------------------------------

/**
 * Parses FRED JSON observations response and extracts (date, value) rows.
 * Skips "." entries (FRED convention for missing data).
 *
 * @returns Array of { date, value } rows or null on parse failure.
 */
export function parseFredIsmJson(
  body: string,
  seriesId: IsmSeriesId,
): Array<{ date: string; value: number }> | null {
  let parsed: FredObservationsResponse;
  try {
    parsed = JSON.parse(body) as FredObservationsResponse;
  } catch (err) {
    logger.warn(`[fredIsmSubcomponents] JSON parse failed for ${seriesId}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!parsed.observations || !Array.isArray(parsed.observations)) {
    logger.warn(
      `[fredIsmSubcomponents] no observations array in response for ${seriesId}`,
    );
    return null;
  }

  const rows: Array<{ date: string; value: number }> = [];
  for (const obs of parsed.observations) {
    if (!obs.date || obs.value === ".") continue;
    const value = parseFloat(obs.value);
    if (Number.isNaN(value)) continue;
    rows.push({ date: obs.date, value });
  }

  if (rows.length === 0) {
    logger.warn(
      `[fredIsmSubcomponents] zero valid observations for ${seriesId}`,
    );
    return null;
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Persistence helper — INSERT OR IGNORE idempotency
// ---------------------------------------------------------------------------

function persistRows(
  db: Database,
  seriesId: IsmSeriesId,
  rows: Array<{ date: string; value: number }>,
): number {
  if (rows.length === 0) return 0;

  const beforeCount = (
    db
      .prepare<{ cnt: number }, [string]>(
        `SELECT COUNT(*) AS cnt FROM fred_series_daily WHERE series = ?`,
      )
      .get(seriesId) ?? { cnt: 0 }
  ).cnt;

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO fred_series_daily (series, date, value)
     VALUES (?, ?, ?)`,
  );
  for (const row of rows) {
    stmt.run(seriesId, row.date, row.value);
  }

  const afterCount = (
    db
      .prepare<{ cnt: number }, [string]>(
        `SELECT COUNT(*) AS cnt FROM fred_series_daily WHERE series = ?`,
      )
      .get(seriesId) ?? { cnt: 0 }
  ).cnt;

  return afterCount - beforeCount;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches ISM Manufacturing PMI sub-component series from FRED REST API and
 * persists all rows to the `fred_series_daily` table.
 *
 * Requires `FRED_API_KEY` environment variable (Bun.env.FRED_API_KEY).
 * If missing, logs WARN and returns null immediately.
 *
 * @param httpClient - Optional injectable HTTP client (defaults to native fetch).
 * @param db         - Optional Database instance (defaults to app singleton).
 * @param sleepFn    - Optional sleep override (defaults to Bun.sleep).
 * @returns          IsmFetchResult with per-series insert counts + failed list,
 *                   or null if FRED_API_KEY is absent.
 *                   Never throws — all errors are caught and logged.
 */
export async function fetchFredIsmSubcomponents(
  httpClient?: FredHttpClient,
  db?: Database,
  sleepFn?: (ms: number) => Promise<void>,
): Promise<IsmFetchResult | null> {
  const apiKey =
    (typeof Bun !== "undefined" ? Bun.env.FRED_API_KEY : undefined) ??
    process.env["FRED_API_KEY"];

  if (!apiKey) {
    logger.warn(
      "[fredIsmSubcomponents] FRED_API_KEY not set — skipping ISM sub-component fetch",
    );
    return null;
  }

  const client = httpClient ?? makeDefaultHttpClient();
  const database = db ?? getDb();
  const sleep = sleepFn ?? ((ms: number) => Bun.sleep(ms));

  const inserted: Record<IsmSeriesId, number> = {
    NAPMNO: 0,
    NAPMEMP: 0,
    NAPMPI: 0,
    NAPMBI: 0,
  };
  const failed: IsmSeriesId[] = [];

  for (const seriesId of ISM_SERIES) {
    const url = buildFredIsmUrl(seriesId, apiKey);
    logger.debug(`[fredIsmSubcomponents] fetching ${seriesId}`, { url: url.replace(apiKey, "***") });

    const body = await fetchWithRetry(client, url, seriesId, sleep);
    if (body === null) {
      failed.push(seriesId);
      continue;
    }

    const rows = parseFredIsmJson(body, seriesId);
    if (rows === null) {
      failed.push(seriesId);
      continue;
    }

    const newRows = persistRows(database, seriesId, rows);
    inserted[seriesId] = newRows;
    logger.info(
      `[fredIsmSubcomponents] ${seriesId} persisted: ${newRows} new rows (${rows.length} fetched)`,
      { seriesId, newRows, fetchedRows: rows.length },
    );
  }

  if (failed.length > 0) {
    logger.warn("[fredIsmSubcomponents] some series failed", { failed });
  }

  return { inserted, failed };
}
