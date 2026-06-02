/**
 * Infrastructure — FRED API Fed Funds Rate Fetcher (Task 1423b)
 *
 * Fetches the effective Federal Funds Rate from the FRED public CSV endpoint:
 *   https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS
 *
 * No API key required — FRED public tier confirmed.
 *
 * CSV format:
 *   DATE,VALUE
 *   2024-01-01,5.33
 *   2024-02-01,5.33    ← last row = most recent monthly value
 *
 * Parse strategy: split lines, skip header, parse last data row, column index 1.
 *
 * Storage:
 *   Writes one row to `tracked_indicators`:
 *     indicator = 'fed_funds_rate', source = 'fred', unit = '%'
 *   Hour-bucket dedup is handled by the existing trigger on tracked_indicators.
 *
 * Error handling:
 *   - HTTP errors → log WARN, return null (never throws)
 *   - CSV parse failures (0 rows, NaN) → log WARN, return null
 *
 * Fetch frequency: daily via macroIndicatorRefreshJob (FOMC changes ~8x/year).
 *
 * @module infrastructure/fetchers/fredApi
 */

import type { Database } from "bun:sqlite";
import { logger } from "../logger.js";
import { getDb } from "../db/schema.js";
import { currentDataEnv } from "../envCheck.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** FRED public CSV endpoint — no API key required. */
const FRED_CSV_URL =
  Bun.env["FRED_API_URL"] ??
  "https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS";

/** Indicator key written to tracked_indicators. */
const INDICATOR_NAME = "fed_funds_rate";

/** Source tag written to tracked_indicators. */
const SOURCE = "fred";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Minimal HTTP client interface — injectable for testing.
 * Mirrors the HttpClient shape used by other fetchers in this layer.
 */
export interface FredHttpClient {
  get(url: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Default HTTP client — uses native fetch (no API key needed)
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
// CSV parsing helper
// ---------------------------------------------------------------------------

/**
 * Parses a FRED CSV string and returns the value from the last data row.
 *
 * Expected format:
 *   DATE,VALUE
 *   2024-01-01,5.33
 *   ...
 *
 * @returns Parsed numeric value, or null if parsing fails.
 */
function parseLastFredValue(csv: string): number | null {
  const lines = csv
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Expect at least header + 1 data row
  if (lines.length < 2) {
    logger.warn("[fredApi] WARN: CSV returned 0 rows");
    return null;
  }

  // Skip the header row, take the last data row
  const dataLines = lines.slice(1);
  const lastLine = dataLines[dataLines.length - 1];

  if (!lastLine) {
    logger.warn("[fredApi] WARN: CSV returned 0 rows");
    return null;
  }

  const parts = lastLine.split(",");
  if (parts.length < 2) {
    logger.warn("[fredApi] WARN: last CSV row has fewer than 2 columns", { lastLine });
    return null;
  }

  const raw = (parts[1] as string).trim();
  const value = parseFloat(raw);

  if (Number.isNaN(value)) {
    logger.warn("[fredApi] WARN: could not parse numeric value from last row", {
      raw,
      lastLine,
    });
    return null;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches the most recent Federal Funds Rate from FRED's public CSV endpoint
 * and stores it in the `tracked_indicators` table.
 *
 * @param httpClient - Optional injectable HTTP client (defaults to native fetch).
 *                     Pass a mock in tests to avoid real network calls.
 * @param db         - Optional Database instance (defaults to the app singleton).
 * @returns The parsed Fed Funds Rate as a number (e.g. 4.33), or null on failure.
 *          Never throws — all errors are caught and logged.
 */
export async function fetchFedFundsRate(
  httpClient?: FredHttpClient,
  db?: Database,
): Promise<number | null> {
  const client = httpClient ?? makeDefaultHttpClient();
  const database = db ?? getDb();

  const url =
    Bun.env["FRED_API_URL"] ?? FRED_CSV_URL;

  logger.debug("[fredApi] fetching Fed Funds Rate CSV", { url });

  let csv: string;
  try {
    csv = await client.get(url);
  } catch (err) {
    logger.warn("[fredApi] HTTP request failed — Fed Funds Rate unavailable", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const rate = parseLastFredValue(csv);
  if (rate === null) {
    return null;
  }

  // Store to tracked_indicators
  const extractedAt = new Date().toISOString();
  try {
    database
      .prepare(
        `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at, data_env)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(INDICATOR_NAME, rate, "%", SOURCE, extractedAt, currentDataEnv());

    logger.info("[macroRefresh] fed_funds_rate = " + rate + "%", {
      indicator: INDICATOR_NAME,
      value: rate,
      source: SOURCE,
      extractedAt,
    });
  } catch (err) {
    logger.error("[fredApi] failed to store fed_funds_rate in tracked_indicators", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Still return the parsed value even if storage fails
  }

  return rate;
}
