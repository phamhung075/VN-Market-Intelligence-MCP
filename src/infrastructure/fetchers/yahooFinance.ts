/**
 * Infrastructure — Yahoo Finance Commodity Fetcher (Task 025)
 *
 * Fetches live commodity prices and the USD/VND exchange rate from the
 * Yahoo Finance Chart API for three instruments:
 *
 *   BZ=F      — Brent crude oil (USD per barrel)
 *   GC=F      — Gold futures (USD per troy ounce)
 *   USDVND=X  — USD / Vietnamese Dong exchange rate
 *
 * API strategy (replaces the deprecated HTML scraping approach):
 *   1. For each symbol, call:
 *        GET https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?interval=1d&range=1d
 *   2. Parse `data.chart.result[0].meta.regularMarketPrice` from the JSON response.
 *   3. If the result is missing or NaN, treat that symbol's field as 0.
 *
 * The three symbol requests run concurrently via Promise.allSettled.
 *
 * Return semantics:
 *   - Individual field failures set the field to 0 and do NOT abort others.
 *   - Returns null ONLY when ALL THREE fields are 0 (nothing parsed).
 *   - NEVER throws — all errors are caught and logged as warnings.
 *
 * Storage:
 *   - `storeCommoditySnapshot` writes a dual-table transaction:
 *       • INSERT OR REPLACE INTO commodity_prices  (upsert latest)
 *       • INSERT INTO commodity_prices_history     (append)
 *
 * Layer: infrastructure/fetchers — may use HTTP and SQLite.
 *        Must NOT import anything from domain/.
 */

import type { Database } from "bun:sqlite";
import { logger } from "../logger.js";
import { getDb } from "../db/schema.js";

// Re-export HttpClient from ssc.ts so consumers have a single import point.
export type { HttpClient } from "./ssc.js";
import type { HttpClient } from "./ssc.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Yahoo Finance Chart API base URL — overridable via YAHOO_FINANCE_API_URL env var. */
const YAHOO_API_BASE =
  Bun.env["YAHOO_FINANCE_API_URL"] ??
  "https://query1.finance.yahoo.com/v8/finance/chart";

/** The three commodity symbols fetched on every call. */
const SYMBOLS = {
  brent: "BZ=F",
  gold: "GC=F",
  usdVnd: "USDVND=X",
} as const;

/** Source identifier written to SQLite rows. */
const SOURCE = "yahoo";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A snapshot of the three commodity prices at a single point in time.
 *
 * All prices are in USD (or USD/VND for the exchange rate).
 * A value of 0 means the field could not be parsed from the response.
 */
export interface CommoditySnapshot {
  /** Brent crude oil price in USD per barrel. 0 if unavailable. */
  brentCrudeUSD: number;
  /** Gold futures price in USD per troy ounce. 0 if unavailable. */
  goldUSDPerOz: number;
  /** USD to Vietnamese Dong exchange rate. 0 if unavailable. */
  usdVndRate: number;
  /** ISO 8601 timestamp of when this snapshot was fetched. */
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Default HTTP client (axios) — lazy import keeps tests free of axios
// ---------------------------------------------------------------------------

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
// JSON parsing helper
// ---------------------------------------------------------------------------

/**
 * Fetches the regularMarketPrice for a single Yahoo Finance symbol using the
 * v8/finance/chart JSON API.
 *
 * Endpoint: GET {YAHOO_API_BASE}/{symbol}?interval=1d&range=1d
 * Response field: data.chart.result[0].meta.regularMarketPrice
 *
 * @param symbol     - Yahoo Finance symbol (e.g. "BZ=F").
 * @param client     - HTTP client to use for the request.
 * @param apiBase    - Base URL for the chart API.
 * @returns Parsed price as a number, or null on any failure.
 */
async function fetchSymbolPrice(
  symbol: string,
  client: HttpClient,
  apiBase: string,
): Promise<number | null> {
  const url = `${apiBase}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

  try {
    logger.debug("[yahooFinance] fetching symbol price", { symbol, url });
    const raw = await client.get(url);

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      logger.warn("[yahooFinance] JSON parse failed for symbol", { symbol });
      return null;
    }

    // Navigate: data.chart.result[0].meta.regularMarketPrice
    const price =
      (data as Record<string, unknown>)?.chart &&
      (
        (data as Record<string, unknown>).chart as Record<string, unknown>
      )?.result &&
      Array.isArray(
        (
          (data as Record<string, unknown>).chart as Record<string, unknown>
        ).result,
      )
        ? (
            (
              (
                (data as Record<string, unknown>).chart as Record<
                  string,
                  unknown
                >
              ).result as Array<Record<string, unknown>>
            )[0]?.meta as Record<string, unknown>
          )?.regularMarketPrice
        : undefined;

    if (typeof price !== "number" || Number.isNaN(price)) {
      logger.debug("[yahooFinance] regularMarketPrice missing or non-numeric", {
        symbol,
        price,
      });
      return null;
    }

    return price;
  } catch (err) {
    logger.warn("[yahooFinance] HTTP request failed for symbol", {
      symbol,
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API — fetch
// ---------------------------------------------------------------------------

/**
 * Fetches the latest commodity prices from the Yahoo Finance Chart JSON API.
 *
 * Makes three concurrent HTTP GET requests — one per symbol (BZ=F, GC=F, USDVND=X).
 * Uses Promise.allSettled so a failure for one symbol does not abort others.
 *
 * @param httpClient - Optional injectable HTTP client (defaults to axios).
 *                     Pass a mock in tests to avoid real network calls.
 *                     Reads YAHOO_FINANCE_API_URL env var to override the base URL.
 * @returns CommoditySnapshot if at least one price was parsed, null otherwise.
 *          Never throws — all errors are caught and logged as warnings.
 */
export async function fetchYahooFinancePrices(
  httpClient?: HttpClient,
): Promise<CommoditySnapshot | null> {
  const client = httpClient ?? (await makeDefaultHttpClient());
  const apiBase =
    Bun.env["YAHOO_FINANCE_API_URL"] ?? YAHOO_API_BASE;
  const fetchedAt = new Date().toISOString();

  logger.debug("[yahooFinance] fetching commodity prices via JSON API", {
    apiBase,
  });

  // Fetch all three symbols concurrently
  const [brentResult, goldResult, usdVndResult] = await Promise.allSettled([
    fetchSymbolPrice(SYMBOLS.brent, client, apiBase),
    fetchSymbolPrice(SYMBOLS.gold, client, apiBase),
    fetchSymbolPrice(SYMBOLS.usdVnd, client, apiBase),
  ]);

  const brentCrudeUSD =
    brentResult.status === "fulfilled" && brentResult.value !== null
      ? brentResult.value
      : 0;

  const goldUSDPerOz =
    goldResult.status === "fulfilled" && goldResult.value !== null
      ? goldResult.value
      : 0;

  const usdVndRate =
    usdVndResult.status === "fulfilled" && usdVndResult.value !== null
      ? usdVndResult.value
      : 0;

  // If ALL three fields are 0, nothing was parsed — return null.
  if (brentCrudeUSD === 0 && goldUSDPerOz === 0 && usdVndRate === 0) {
    logger.warn(
      "[yahooFinance] all three symbols returned 0 — no data parsed",
      { apiBase },
    );
    return null;
  }

  const snapshot: CommoditySnapshot = {
    brentCrudeUSD,
    goldUSDPerOz,
    usdVndRate,
    fetchedAt,
  };

  logger.info("[yahooFinance] fetched commodity prices", {
    brentCrudeUSD,
    goldUSDPerOz,
    usdVndRate,
    fetchedAt,
  });

  return snapshot;
}

// ---------------------------------------------------------------------------
// Public API — store
// ---------------------------------------------------------------------------

/**
 * Persists a CommoditySnapshot to SQLite in a single transaction:
 *
 *   1. INSERT OR REPLACE INTO commodity_prices — upserts the latest snapshot
 *      for source='yahoo' (overwrites the previous row).
 *   2. INSERT INTO commodity_prices_history — appends an immutable history row.
 *
 * @param snapshot - The snapshot to persist.
 * @param db       - Optional database instance (defaults to the app singleton via getDb()).
 */
export function storeCommoditySnapshot(
  snapshot: CommoditySnapshot,
  db?: Database,
): void {
  const database = db ?? getDb();

  const upsertLatest = database.prepare(`
    INSERT OR REPLACE INTO commodity_prices
      (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Dedup: only append history if no row exists for the same hour
  const appendHistory = database.prepare(`
    INSERT INTO commodity_prices_history
      (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at)
    SELECT ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM commodity_prices_history
      WHERE source = ? AND strftime('%Y-%m-%d %H', fetched_at) = strftime('%Y-%m-%d %H', ?)
    )
  `);

  const runTransaction = database.transaction(() => {
    upsertLatest.run(
      SOURCE,
      snapshot.brentCrudeUSD,
      snapshot.goldUSDPerOz,
      snapshot.usdVndRate,
      snapshot.fetchedAt,
    );
    appendHistory.run(
      SOURCE,
      snapshot.brentCrudeUSD,
      snapshot.goldUSDPerOz,
      snapshot.usdVndRate,
      snapshot.fetchedAt,
      SOURCE,
      snapshot.fetchedAt,
    );
  });

  try {
    runTransaction();
    logger.debug("[yahooFinance] stored commodity snapshot", {
      fetchedAt: snapshot.fetchedAt,
    });
  } catch (err) {
    logger.error("[yahooFinance] failed to store commodity snapshot", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
