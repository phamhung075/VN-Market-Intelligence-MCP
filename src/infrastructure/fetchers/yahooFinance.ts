/**
 * Infrastructure — Yahoo Finance Commodity Fetcher (Task 025)
 *
 * Fetches live commodity prices and the USD/VND exchange rate from
 * Yahoo Finance for three instruments:
 *
 *   BZ=F      — Brent crude oil (USD per barrel)
 *   GC=F      — Gold futures (USD per troy ounce)
 *   USDVND=X  — USD / Vietnamese Dong exchange rate
 *
 * Parsing strategy:
 *   1. Load HTML with cheerio.
 *   2. For each symbol, select:
 *        fin-streamer[data-symbol="<SYM>"][data-field="regularMarketPrice"]
 *   3. Read `value` attribute first; fall back to trimmed text content.
 *   4. Strip US comma separators before parseFloat.
 *   5. If the result is NaN, treat that symbol's field as 0.
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

import * as cheerio from "cheerio";
import type { Database } from "bun:sqlite";
import { logger } from "../logger.js";
import { getDb } from "../db/schema.js";

// Re-export HttpClient from ssc.ts so consumers have a single import point.
export type { HttpClient } from "./ssc.js";
import type { HttpClient } from "./ssc.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Yahoo Finance quote-summary base URL. */
const YAHOO_FINANCE_BASE_URL =
  Bun.env["YAHOO_FINANCE_BASE_URL"] ?? "https://finance.yahoo.com";

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
          Accept: "text/html,application/xhtml+xml",
        },
        timeout: 15_000,
        responseType: "text",
      });
      return response.data;
    },
  };
}

// ---------------------------------------------------------------------------
// HTML parsing helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the numeric price for a single Yahoo Finance symbol from the
 * parsed cheerio document.
 *
 * Selector: fin-streamer[data-symbol="SYM"][data-field="regularMarketPrice"]
 *
 * Priority:
 *   1. `value` attribute of the element (preferred — already a clean number string)
 *   2. Text content of the element (fallback — may be formatted for display)
 *
 * US comma separators (e.g. "2,341.50") are stripped before parseFloat.
 *
 * @param $ - Loaded cheerio document.
 * @param symbol - Yahoo Finance symbol string (e.g. "BZ=F").
 * @returns Parsed floating-point price, or 0 if the element is missing or value is non-numeric.
 */
function extractPrice($: cheerio.CheerioAPI, symbol: string): number {
  try {
    const el = $(
      `fin-streamer[data-symbol="${symbol}"][data-field="regularMarketPrice"]`,
    ).first();

    if (el.length === 0) {
      return 0;
    }

    // Try value= attribute first (no formatting applied by the browser)
    const attrVal = el.attr("value");
    const rawText = attrVal !== undefined && attrVal.trim() !== ""
      ? attrVal.trim()
      : el.text().trim();

    if (rawText === "") {
      return 0;
    }

    // Strip US comma separators before parsing
    const cleaned = rawText.replace(/,/g, "");
    const value = parseFloat(cleaned);

    return Number.isNaN(value) ? 0 : value;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Public API — fetch
// ---------------------------------------------------------------------------

/**
 * Fetches the latest commodity prices from Yahoo Finance.
 *
 * Makes a single HTTP GET request to the Yahoo Finance commodity page.
 * Uses cheerio to parse fin-streamer elements for BZ=F, GC=F, and USDVND=X.
 *
 * @param httpClient - Optional injectable HTTP client (defaults to axios).
 *                     Pass a mock in tests to avoid real network calls.
 *                     Reads YAHOO_FINANCE_BASE_URL env var to override the base URL.
 * @returns CommoditySnapshot if at least one price was parsed, null otherwise.
 *          Never throws — all errors are caught and logged as warnings.
 */
export async function fetchYahooFinancePrices(
  httpClient?: HttpClient,
): Promise<CommoditySnapshot | null> {
  const client = httpClient ?? (await makeDefaultHttpClient());
  const url = `${YAHOO_FINANCE_BASE_URL}/commodities`;
  const fetchedAt = new Date().toISOString();

  logger.debug("[yahooFinance] fetching commodity prices", { url });

  let html: string;
  try {
    html = await client.get(url);
  } catch (err) {
    logger.warn("[yahooFinance] HTTP request failed", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch (err) {
    logger.warn("[yahooFinance] failed to parse HTML", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const brentCrudeUSD = extractPrice($, SYMBOLS.brent);
  const goldUSDPerOz = extractPrice($, SYMBOLS.gold);
  const usdVndRate = extractPrice($, SYMBOLS.usdVnd);

  // If ALL three fields are 0, nothing was parsed — return null.
  if (brentCrudeUSD === 0 && goldUSDPerOz === 0 && usdVndRate === 0) {
    logger.warn("[yahooFinance] all three symbols returned 0 — no data parsed", {
      url,
    });
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

  const appendHistory = database.prepare(`
    INSERT INTO commodity_prices_history
      (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at)
    VALUES (?, ?, ?, ?, ?)
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
