/**
 * Infrastructure — HOSE Market Data Fetcher (Task 026)
 *
 * Fetches live price and volume data for Vietnamese stocks listed on HOSE
 * from the VnDirect finfo-api (v4).
 *
 * Primary endpoint:
 *   GET https://finfo-api.vndirect.com.vn/v4/stocks?q=code:VCB,HPG&size=100
 *
 * The API returns prices directly in VND (e.g. 88000 = 88,000 VND).
 * No multiplication factor is needed.
 *
 * Price history is persisted in the `market_prices_history` SQLite table.
 * `getAvgVolume()` computes the N-day average volume from that table.
 *
 * Layer: infrastructure/fetchers — may use HTTP and SQLite, must not import domain/.
 */

import { logger } from "../logger.js";
import { getDb } from "../db/schema.js";
import type { HttpClient } from "./ssc.js";

// Re-export HttpClient so consumers can import it directly from this module.
export type { HttpClient } from "./ssc.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base URL for VnDirect finfo-api v4. */
const VNDIRECT_API_BASE = "https://finfo-api.vndirect.com.vn/v4";

/** Maximum number of stocks per single API request. */
const VNDIRECT_MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A real-time price and volume snapshot for a single stock.
 *
 * @property code          - Stock ticker (e.g. "VCB", "HPG")
 * @property exchange      - Exchange identifier (always 'HOSE' for this fetcher)
 * @property price         - Current/close price in VND
 * @property previousPrice - Previous close price in VND
 * @property changePct     - Percentage change from previous close (e.g. 3.53 = +3.53%)
 * @property volume        - Today's total traded volume (number of shares)
 * @property avgVolume     - N-day average daily volume; 0 if insufficient history
 * @property fetchedAt     - ISO 8601 timestamp when this data was fetched
 */
export interface MarketPrice {
  code: string;
  exchange: string;
  price: number;
  previousPrice: number;
  changePct: number;
  volume: number;
  /** 20-day average daily volume. 0 if no history is available. */
  avgVolume: number;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// VnDirect API response types (internal)
// ---------------------------------------------------------------------------

/** A single stock record as returned by VnDirect finfo-api v4. */
interface VnDirectStockRecord {
  code?: string;
  exchange?: string;
  /** Close/current price in VND */
  close?: number;
  /** Previous close price in VND */
  previousClose?: number;
  /** Price change in VND */
  change?: number;
  /** Percentage change */
  pctChange?: number;
  /** Total traded quantity (shares) */
  nmTotalTradedQty?: number;
}

/** Top-level shape of the VnDirect API response. */
interface VnDirectResponse {
  data?: VnDirectStockRecord[];
  totalCount?: number;
}

// ---------------------------------------------------------------------------
// Default HTTP client (axios)
// ---------------------------------------------------------------------------

/**
 * Creates the default production HTTP client backed by axios.
 * Lazy-imported so tests that inject a mock never load axios.
 */
async function makeDefaultHttpClient(): Promise<HttpClient> {
  const axiosModule = await import("axios");
  const axios = axiosModule.default;

  return {
    async get(url: string): Promise<string> {
      const response = await axios.get<string>(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; VN-Market-Intelligence/1.0; +https://github.com/vn-market)",
          Accept: "application/json",
        },
        timeout: 15_000,
        responseType: "text",
      });
      return response.data;
    },
  };
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

/**
 * Builds the VnDirect finfo-api URL for a list of stock codes.
 *
 * Example:
 *   buildVnDirectUrl(["VCB", "HPG"])
 *   → "https://finfo-api.vndirect.com.vn/v4/stocks?q=code:VCB,HPG&size=100"
 *
 * @param codes - Array of stock tickers (uppercase).
 * @returns Fully qualified API URL string.
 */
export function buildVnDirectUrl(codes: string[]): string {
  const codeList = codes.map((c) => c.toUpperCase()).join(",");
  const params = new URLSearchParams({
    q: `code:${codeList}`,
    size: String(VNDIRECT_MAX_PAGE_SIZE),
  });
  return `${VNDIRECT_API_BASE}/stocks?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

/**
 * Parses the raw JSON string from VnDirect into an array of VnDirectStockRecord.
 *
 * @param json - Raw JSON string from the API.
 * @returns Parsed stock records. Empty array on parse error.
 */
export function parseVnDirectResponse(json: string): VnDirectStockRecord[] {
  try {
    const parsed: unknown = JSON.parse(json);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("data" in parsed)
    ) {
      return [];
    }

    const response = parsed as VnDirectResponse;
    if (!Array.isArray(response.data)) {
      return [];
    }

    return response.data;
  } catch {
    return [];
  }
}

/**
 * Maps a VnDirectStockRecord to a MarketPrice.
 *
 * VnDirect returns prices in VND directly (e.g. 88000 = 88,000 VND).
 * avgVolume is always 0 here — it is populated by a separate history query.
 *
 * @param record    - Raw API record.
 * @param fetchedAt - ISO 8601 timestamp for this fetch.
 * @returns MarketPrice or null if the record lacks a stock code.
 */
function recordToMarketPrice(
  record: VnDirectStockRecord,
  fetchedAt: string,
): MarketPrice | null {
  if (!record.code) return null;

  return {
    code: record.code,
    exchange: record.exchange ?? "HOSE",
    price: record.close ?? 0,
    previousPrice: record.previousClose ?? 0,
    changePct: record.pctChange ?? 0,
    volume: record.nmTotalTradedQty ?? 0,
    avgVolume: 0, // populated separately via getAvgVolume()
    fetchedAt,
  };
}

// ---------------------------------------------------------------------------
// SQLite history helpers
// ---------------------------------------------------------------------------

/**
 * Ensures the `market_prices_history` table exists in the database.
 * Called lazily before any history read/write operation.
 *
 * Schema:
 *   code       TEXT    — stock ticker
 *   price      REAL    — closing price in VND
 *   volume     REAL    — traded volume (shares)
 *   fetched_at TEXT    — ISO 8601 timestamp
 *
 * Primary key: (code, fetched_at) — prevents duplicate entries.
 */
function ensureHistoryTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      volume     REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (code, fetched_at)
    );

    CREATE INDEX IF NOT EXISTS idx_mph_code_fetched
      ON market_prices_history(code, fetched_at DESC);
  `);
}

/**
 * Persists an array of MarketPrice snapshots into the `market_prices_history`
 * table. Uses INSERT OR REPLACE to handle duplicate (code, fetched_at) pairs
 * gracefully.
 *
 * Also updates the `market_prices` snapshot table (latest price per stock).
 *
 * @param prices - Array of MarketPrice snapshots to persist.
 */
export async function storeMarketPrices(prices: MarketPrice[]): Promise<void> {
  if (prices.length === 0) return;

  ensureHistoryTable();
  const db = getDb();

  const insertHistory = db.prepare(`
    INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at)
    VALUES (?, ?, ?, ?)
  `);

  const upsertLatest = db.prepare(`
    INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Run all inserts in a single transaction for performance
  const insertAll = db.transaction((rows: MarketPrice[]) => {
    for (const p of rows) {
      insertHistory.run(p.code, p.price, p.volume, p.fetchedAt);
      upsertLatest.run(p.code, p.price, p.changePct, p.volume, p.fetchedAt);
    }
  });

  insertAll(prices);

  logger.debug("[hose] stored market prices", { count: prices.length });
}

/**
 * Calculates the average daily volume for a stock over the last N days
 * by querying the `market_prices_history` table.
 *
 * Returns 0 if there are no rows for the stock in the history table.
 *
 * @param code - Stock ticker (e.g. "VCB").
 * @param days - Number of most-recent history rows to average. Defaults to 20.
 * @returns Average volume over the last `days` entries, or 0 if no data.
 */
export async function getAvgVolume(code: string, days = 20): Promise<number> {
  ensureHistoryTable();
  const db = getDb();

  const row = db
    .query<{ avg_volume: number | null }, [string, number]>(`
      SELECT AVG(volume) AS avg_volume
      FROM (
        SELECT volume
        FROM market_prices_history
        WHERE code = ?
        ORDER BY fetched_at DESC
        LIMIT ?
      )
    `)
    .get(code, days);

  return row?.avg_volume ?? 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches live price and volume data for a list of HOSE-listed stocks
 * from the VnDirect finfo-api.
 *
 * - Returns an empty array immediately if `codes` is empty.
 * - Returns an empty array (without throwing) on any network or parse error.
 * - `avgVolume` is always 0 in the returned records; call `getAvgVolume()`
 *   separately after storing history if you need the rolling average.
 *
 * @param codes      - List of stock tickers to fetch (e.g. ["VCB", "HPG"]).
 * @param httpClient - Optional HTTP client; defaults to an axios-backed client.
 *                     Inject a mock in tests to avoid real network calls.
 * @returns Promise resolving to an array of MarketPrice (empty on error).
 */
export async function fetchHosePrices(
  codes: string[],
  httpClient?: HttpClient,
): Promise<MarketPrice[]> {
  if (codes.length === 0) {
    logger.debug("[hose] no codes requested — returning empty");
    return [];
  }

  const client = httpClient ?? (await makeDefaultHttpClient());
  const url = buildVnDirectUrl(codes);
  const fetchedAt = new Date().toISOString();

  logger.debug("[hose] fetching prices from VnDirect", {
    codes,
    url,
  });

  try {
    const json = await client.get(url);
    const records = parseVnDirectResponse(json);

    const prices: MarketPrice[] = [];
    for (const record of records) {
      const price = recordToMarketPrice(record, fetchedAt);
      if (price !== null) {
        prices.push(price);
      }
    }

    logger.info("[hose] fetched market prices", {
      requested: codes.length,
      received: prices.length,
    });

    return prices;
  } catch (err) {
    logger.error("[hose] failed to fetch prices from VnDirect", {
      codes,
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
