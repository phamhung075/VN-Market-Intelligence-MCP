/**
 * Infrastructure — HNX + UPCOM Market Data Fetcher (Task 027)
 *
 * Fetches live price and volume data for Vietnamese stocks listed on HNX and UPCOM
 * from the HNX public API.
 *
 * Primary endpoint:
 *   GET https://api.hnx.vn/api/snapshot?code=ACB,NVB&type=stock   (HNX)
 *   GET https://api.hnx.vn/api/snapshot?code=FRT&type=upcom        (UPCOM)
 *
 * The API returns prices in VND directly. No multiplication factor is needed.
 *
 * Layer: infrastructure/fetchers — may use HTTP and SQLite, must not import domain/.
 */

import { logger } from "../logger.js";
import { getDb } from "../db/schema.js";
import type { HttpClient } from "./ssc.js";
import { isTradingSession, fetchFromVnDirectStockPrices } from "./hose.js";
import { globalRateLimiter } from "../../domain/services/rateLimiter.js";
import { isVnTradingWindow } from "../../domain/services/tradingWindow.js";

// Re-export for callers who only import from hnx.ts
export type { MarketPrice } from "./hose.js";
export type { HttpClient } from "./ssc.js";

import type { MarketPrice } from "./hose.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base URL for HNX public API. */
const HNX_API_BASE = "https://api.hnx.vn/api/snapshot";

/** HTTP timeout in milliseconds — matches HOSE fetcher. */
const HTTP_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Schema migration (exchange column)
// ---------------------------------------------------------------------------

/**
 * Ensures the `exchange` column exists in `market_prices` and
 * `market_prices_history`. Runs at most once per process via module-level flag.
 *
 * Uses PRAGMA table_info guard — idempotent and safe to call at startup.
 */
function ensureExchangeColumn(): void {
  const db = getDb();

  // Only migrate if the table exists — initDatabase() may not have run yet
  const mainTableExists = db
    .query<{ name: string }, [string]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    )
    .get("market_prices");

  if (mainTableExists) {
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(market_prices)")
      .all();
    if (!cols.some((c) => c.name === "exchange")) {
      db.exec(
        "ALTER TABLE market_prices ADD COLUMN exchange TEXT DEFAULT 'HOSE'",
      );
      logger.debug("[hnx] added exchange column to market_prices");
    }
  }

  // market_prices_history may not exist yet — only migrate if it does
  const histTableExists = db
    .query<{ name: string }, [string]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    )
    .get("market_prices_history");

  if (histTableExists) {
    const histCols = db
      .query<{ name: string }, []>(
        "PRAGMA table_info(market_prices_history)",
      )
      .all();
    if (!histCols.some((c) => c.name === "exchange")) {
      db.exec(
        "ALTER TABLE market_prices_history ADD COLUMN exchange TEXT DEFAULT 'HOSE'",
      );
      logger.debug(
        "[hnx] added exchange column to market_prices_history",
      );
    }
  }
}

/** Guard so ensureExchangeColumn runs at most once per process. */
let exchangeColumnEnsured = false;

/**
 * Lazily ensures the exchange column exists.
 * Called on the first actual fetch rather than at module load time,
 * so the database is guaranteed to be initialized first.
 */
function ensureExchangeColumnOnce(): void {
  if (exchangeColumnEnsured) return;
  exchangeColumnEnsured = true;
  ensureExchangeColumn();
}

// ---------------------------------------------------------------------------
// HNX API response types (internal)
// ---------------------------------------------------------------------------

/** A single stock record as returned by the HNX snapshot API. */
interface HnxStockRecord {
  code?: string;
  /** Close / current price in VND */
  closePrice?: number;
  /** Previous close / reference price in VND */
  referencePrice?: number;
  /** Percentage change from reference price */
  percentChange?: number;
  /** Total traded volume (shares) */
  totalVolume?: number;
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
        timeout: HTTP_TIMEOUT_MS,
        responseType: "text",
      });
      return response.data;
    },
  };
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

/**
 * Builds the HNX API URL for HNX-listed stock queries.
 *
 * Example:
 *   buildHnxUrl(["ACB", "NVB"])
 *   → "https://api.hnx.vn/api/snapshot?code=ACB,NVB&type=stock"
 *
 * @param codes - Array of stock tickers (uppercase).
 * @returns Fully qualified API URL string.
 */
export function buildHnxUrl(codes: string[]): string {
  const codeList = codes.map((c) => c.toUpperCase()).join(",");
  const params = new URLSearchParams({
    code: codeList,
    type: "stock",
  });
  return `${HNX_API_BASE}?${params.toString()}`;
}

/**
 * Builds the HNX API URL for UPCOM-listed stock queries.
 *
 * Example:
 *   buildUpcomUrl(["FRT"])
 *   → "https://api.hnx.vn/api/snapshot?code=FRT&type=upcom"
 *
 * @param codes - Array of stock tickers (uppercase).
 * @returns Fully qualified API URL string.
 */
export function buildUpcomUrl(codes: string[]): string {
  const codeList = codes.map((c) => c.toUpperCase()).join(",");
  const params = new URLSearchParams({
    code: codeList,
    type: "upcom",
  });
  return `${HNX_API_BASE}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

/**
 * Maps a single HNX stock record to a MarketPrice.
 *
 * All numeric fields default to 0 when absent or null.
 * avgVolume is always 0 here — populated separately via getAvgVolume().
 *
 * @param record    - Raw HNX API record.
 * @param exchange  - Exchange identifier: "HNX" or "UPCOM".
 * @param fetchedAt - ISO 8601 timestamp for this fetch.
 * @returns MarketPrice or null if the record lacks a stock code.
 */
function recordToMarketPrice(
  record: HnxStockRecord,
  exchange: "HNX" | "UPCOM",
  fetchedAt: string,
): MarketPrice | null {
  if (!record.code) return null;

  return {
    code: record.code,
    exchange,
    price: record.closePrice ?? 0,
    previousPrice: record.referencePrice ?? 0,
    changePct: record.percentChange ?? 0,
    volume: record.totalVolume ?? 0,
    avgVolume: 0,
    fetchedAt,
  };
}

/**
 * Parses a HNX API JSON array response into an array of MarketPrice objects.
 *
 * The HNX API returns a JSON array (not wrapped in an object like VnDirect).
 * Returns [] on any parse or validation error.
 *
 * @param json     - Raw JSON string from the HNX API.
 * @param exchange - Exchange to tag on each MarketPrice: "HNX" or "UPCOM".
 * @returns Parsed MarketPrice array. Empty array on parse error.
 */
export function parseHnxResponse(
  json: string,
  exchange: "HNX" | "UPCOM",
): MarketPrice[] {
  const fetchedAt = new Date().toISOString();

  try {
    const parsed: unknown = JSON.parse(json);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const prices: MarketPrice[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const record = item as HnxStockRecord;
      const price = recordToMarketPrice(record, exchange, fetchedAt);
      if (price !== null) {
        prices.push(price);
      }
    }

    return prices;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches live price and volume data for a list of HNX-listed stocks.
 *
 * - Returns an empty array immediately if `codes` is empty.
 * - Returns an empty array (without throwing) on any network or parse error.
 * - Sets `exchange: 'HNX'` on all returned MarketPrice objects.
 * - `avgVolume` is always 0; call `getAvgVolume()` separately after storing history.
 *
 * @param codes      - List of HNX stock tickers to fetch (e.g. ["ACB", "NVB"]).
 * @param httpClient - Optional HTTP client; defaults to an axios-backed client.
 *                     Inject a mock in tests to avoid real network calls.
 * @returns Promise resolving to an array of MarketPrice (empty on error).
 */
export async function fetchHnxPrices(
  codes: string[],
  httpClient?: HttpClient,
  options?: { force?: boolean; now?: Date },
): Promise<MarketPrice[]> {
  ensureExchangeColumnOnce();

  if (codes.length === 0) {
    logger.debug("[hnx] no codes requested — returning empty");
    return [];
  }

  if (!options?.force && !isTradingSession()) {
    logger.debug("[hnx] market closed — skipping HNX fetch", { codes });
    return [];
  }

  // Rate limit guard — skip if called too soon (bypassed in test mode via httpClient)
  if (!httpClient && !globalRateLimiter.canCall("api.hnx.vn")) {
    logger.debug("[hnx] rate-limited — skipping fetch", {
      waitMs: globalRateLimiter.getWaitMs("api.hnx.vn"),
    });
    return [];
  }
  if (!httpClient) globalRateLimiter.recordCall("api.hnx.vn");

  const fetchedAt = new Date().toISOString();

  // Source 1: HNX native API
  const client = httpClient ?? (await makeDefaultHttpClient());
  const url = buildHnxUrl(codes);

  logger.debug("[hnx] fetching HNX prices", { codes, url });

  try {
    const json = await client.get(url);
    const prices = parseHnxResponse(json, "HNX");

    if (prices.length > 0) {
      logger.info("[hnx] fetched HNX prices", {
        requested: codes.length,
        received: prices.length,
      });
      return prices;
    }
  } catch (err) {
    logger.debug("[hnx] HNX API failed, trying VnDirect stock_prices fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Source 2: VnDirect stock_prices API (works for HNX)
  // Skip when an httpClient is injected (test mode).
  if (!httpClient) {
    try {
      const prices = await fetchFromVnDirectStockPrices(codes, fetchedAt, "HNX");
      if (prices.length > 0) {
        logger.info("[hnx] fetched HNX from VnDirect stock_prices fallback", {
          requested: codes.length,
          received: prices.length,
        });
        return prices;
      }
    } catch {
      // silent — fall through
    }
  }

  if (isVnTradingWindow(options?.now)) {
    logger.error("[hnx] all HNX price sources failed", { codes });
  } else {
    logger.debug("[hnx] all HNX price sources returned empty — no off-hours data (market closed)", { codes });
  }
  return [];
}

/**
 * Fetches live price and volume data for a list of UPCOM-listed stocks.
 *
 * Strategy: HNX native API → VnDirect stock_prices fallback.
 *
 * - Returns an empty array immediately if `codes` is empty.
 * - Returns an empty array (without throwing) on any network or parse error.
 * - Sets `exchange: 'UPCOM'` on all returned MarketPrice objects.
 * - `avgVolume` is always 0; call `getAvgVolume()` separately after storing history.
 *
 * @param codes      - List of UPCOM stock tickers to fetch (e.g. ["FRT"]).
 * @param httpClient - Optional HTTP client; defaults to an axios-backed client.
 *                     Inject a mock in tests to avoid real network calls.
 * @returns Promise resolving to an array of MarketPrice (empty on error).
 */
export async function fetchUpcomPrices(
  codes: string[],
  httpClient?: HttpClient,
  options?: { force?: boolean; now?: Date },
): Promise<MarketPrice[]> {
  ensureExchangeColumnOnce();

  if (codes.length === 0) {
    logger.debug("[hnx] no UPCOM codes requested — returning empty");
    return [];
  }

  if (!options?.force && !isTradingSession()) {
    logger.debug("[hnx] market closed — skipping UPCOM fetch", { codes });
    return [];
  }

  const fetchedAt = new Date().toISOString();

  // Source 1: HNX native API (type=upcom)
  const client = httpClient ?? (await makeDefaultHttpClient());
  const url = buildUpcomUrl(codes);

  logger.debug("[hnx] fetching UPCOM prices", { codes, url });

  try {
    const json = await client.get(url);
    const prices = parseHnxResponse(json, "UPCOM");

    if (prices.length > 0) {
      logger.info("[hnx] fetched UPCOM prices", {
        requested: codes.length,
        received: prices.length,
      });
      return prices;
    }
  } catch (err) {
    logger.debug("[hnx] UPCOM API failed, trying VnDirect stock_prices fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Source 2: VnDirect stock_prices API (works for UPCOM)
  // Skip when an httpClient is injected (test mode).
  if (!httpClient) {
    try {
      const prices = await fetchFromVnDirectStockPrices(codes, fetchedAt, "UPCOM");
      if (prices.length > 0) {
        logger.info("[hnx] fetched UPCOM from VnDirect stock_prices fallback", {
          requested: codes.length,
          received: prices.length,
        });
        return prices;
      }
    } catch {
      // silent — fall through
    }
  }

  if (isVnTradingWindow(options?.now)) {
    logger.error("[hnx] all UPCOM price sources failed", { codes });
  } else {
    logger.debug("[hnx] all UPCOM price sources returned empty — no off-hours data (market closed)", { codes });
  }
  return [];
}
