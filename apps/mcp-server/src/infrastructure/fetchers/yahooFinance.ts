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
import { currentDataEnv } from "../envCheck.js";

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

/** The 12 commodity/index symbols fetched on every call.
 *  NOTE: CNHVND=X (CNH/VND) removed — ticker returns 404 on Yahoo Finance
 *  and is not a valid symbol. cnyVndRate is always stored as 0.
 *  Alternative: derive via USDCNH + USDVND cross if needed in future.
 */
const SYMBOLS = {
  // existing
  brent:  "BZ=F",
  gold:   "GC=F",
  usdVnd: "USDVND=X",
  // new (FR-1) — 8 global risk-off symbols
  vix:      "^VIX",       // CBOE Volatility Index (fear gauge)
  sp500:    "^GSPC",      // S&P 500 index
  shanghai: "000001.SS",  // Shanghai Composite — 15-min delay on Yahoo free tier
  hangSeng: "^HSI",       // Hang Seng index
  dxy:      "DX-Y.NYB",  // US Dollar Index (NYB venue; 0 stored if unresolvable)
  // cnyVnd removed: "CNHVND=X" is not a valid Yahoo Finance ticker (404)
  copper:   "HG=F",       // Copper futures (USD/lb)
  silver:   "SI=F",       // Silver futures (USD/oz)
  jpyVnd:   "JPYVND=X",  // JPY/VND exchange rate
  // Task 1423a — US 10-year Treasury yield
  us10y:    "^TNX",       // CBOE 10-Year Treasury Note Yield Index (% annualised)
} as const;

/** Source identifier written to SQLite rows. */
const SOURCE = "yahoo";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A snapshot of 12 commodity/index prices at a single point in time.
 *
 * All prices are in USD (or USD/VND for exchange rates).
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
  // ── new fields (FR-2) — all 0 when individual fetch fails ─────────────────
  /** CBOE Volatility Index level. 0 if unavailable. */
  vix: number;
  /** S&P 500 index level. 0 if unavailable. */
  sp500: number;
  /** Shanghai Composite level (15-min delay on Yahoo free tier). 0 if unavailable. */
  shanghaiComp: number;
  /** Hang Seng index level. 0 if unavailable. */
  hangSeng: number;
  /** US Dollar Index (DXY) level. 0 if unavailable (DX-Y.NYB venue). */
  dxy: number;
  /** CNH to VND offshore exchange rate. 0 if unavailable. */
  cnyVndRate: number;
  /** Copper futures price in USD per lb. 0 if unavailable. */
  copperUSD: number;
  /** Silver futures price in USD per troy oz. 0 if unavailable. */
  silverUSDPerOz: number;
  /** JPY to VND exchange rate. 0 if unavailable. */
  jpyVndRate: number;
  // ── Task 1423a ─────────────────────────────────────────────────────────────
  /** US 10-year Treasury yield (% annualised, ^TNX). 0 if unavailable. */
  us10yYield: number;
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
        timeout: 30_000,
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
    // 404 → unknown or delisted ticker — warn with a clear skip message, no stack trace
    const status =
      err != null &&
      typeof err === "object" &&
      "response" in err &&
      err.response != null &&
      typeof err.response === "object" &&
      "status" in err.response
        ? (err.response as { status: unknown }).status
        : undefined;

    if (status === 404) {
      logger.warn(`[yahooFinance] Ticker ${symbol} not found (404) — skipping`);
      return null;
    }

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

  // Fetch all 12 symbols concurrently (FR-3 + Task 1423a)
  // cnyVnd (CNHVND=X) omitted — not a valid Yahoo ticker, always returns 404
  const [
    brentResult, goldResult, usdVndResult,
    vixResult, sp500Result, shanghaiResult, hangSengResult,
    dxyResult, copperResult, silverResult, jpyVndResult,
    us10yResult,
  ] = await Promise.allSettled([
    fetchSymbolPrice(SYMBOLS.brent,    client, apiBase),
    fetchSymbolPrice(SYMBOLS.gold,     client, apiBase),
    fetchSymbolPrice(SYMBOLS.usdVnd,   client, apiBase),
    fetchSymbolPrice(SYMBOLS.vix,      client, apiBase),
    fetchSymbolPrice(SYMBOLS.sp500,    client, apiBase),
    fetchSymbolPrice(SYMBOLS.shanghai, client, apiBase),
    fetchSymbolPrice(SYMBOLS.hangSeng, client, apiBase),
    fetchSymbolPrice(SYMBOLS.dxy,      client, apiBase),
    fetchSymbolPrice(SYMBOLS.copper,   client, apiBase),
    fetchSymbolPrice(SYMBOLS.silver,   client, apiBase),
    fetchSymbolPrice(SYMBOLS.jpyVnd,   client, apiBase),
    fetchSymbolPrice(SYMBOLS.us10y,    client, apiBase),
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

  const vix =
    vixResult.status === "fulfilled" && vixResult.value !== null ? vixResult.value : 0;
  const sp500 =
    sp500Result.status === "fulfilled" && sp500Result.value !== null ? sp500Result.value : 0;
  const shanghaiComp =
    shanghaiResult.status === "fulfilled" && shanghaiResult.value !== null ? shanghaiResult.value : 0;
  const hangSeng =
    hangSengResult.status === "fulfilled" && hangSengResult.value !== null ? hangSengResult.value : 0;
  const dxy =
    dxyResult.status === "fulfilled" && dxyResult.value !== null ? dxyResult.value : 0;
  // cnyVndRate: CNHVND=X is not a valid Yahoo ticker (404 on every sync).
  // Field kept in CommoditySnapshot and DB schema for compatibility; always 0.
  const cnyVndRate = 0;
  const copperUSD =
    copperResult.status === "fulfilled" && copperResult.value !== null ? copperResult.value : 0;
  const silverUSDPerOz =
    silverResult.status === "fulfilled" && silverResult.value !== null ? silverResult.value : 0;
  const jpyVndRate =
    jpyVndResult.status === "fulfilled" && jpyVndResult.value !== null ? jpyVndResult.value : 0;
  const us10yYield =
    us10yResult.status === "fulfilled" && us10yResult.value !== null ? us10yResult.value : 0;

  // Return null ONLY when ALL 12 fetched fields are 0 (FR-3 business rule + Task 1423a)
  // cnyVndRate is excluded from this check — it is always 0 (ticker removed)
  if (
    brentCrudeUSD === 0 && goldUSDPerOz === 0 && usdVndRate === 0 &&
    vix === 0 && sp500 === 0 && shanghaiComp === 0 && hangSeng === 0 &&
    dxy === 0 && copperUSD === 0 && silverUSDPerOz === 0 &&
    jpyVndRate === 0 && us10yYield === 0
  ) {
    logger.warn("[yahooFinance] all 12 symbols returned 0 — no data parsed", { apiBase });
    return null;
  }

  const snapshot: CommoditySnapshot = {
    // existing
    brentCrudeUSD,
    goldUSDPerOz,
    usdVndRate,
    fetchedAt,
    // new (FR-4)
    vix,
    sp500,
    shanghaiComp,
    hangSeng,
    dxy,
    cnyVndRate,
    copperUSD,
    silverUSDPerOz,
    jpyVndRate,
    // Task 1423a
    us10yYield,
  };

  logger.info("[yahooFinance] fetched commodity prices", {
    brentCrudeUSD,
    goldUSDPerOz,
    usdVndRate,
    vix,
    sp500,
    shanghaiComp,
    hangSeng,
    dxy,
    cnyVndRate,
    copperUSD,
    silverUSDPerOz,
    jpyVndRate,
    us10yYield,
    fetchedAt,
  });

  return snapshot;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Computes the change amount and percentage from a previous price to a current price.
 * Returns {amt: 0, pct: 0} when either value is missing/null or prev is zero
 * (guards against division-by-zero and first-run scenarios).
 *
 * Module-private — not exported.
 */
function computeDelta(
  current: number | null,
  prev: number | null,
): { amt: number; pct: number } {
  if (current == null || prev == null || prev === 0) return { amt: 0, pct: 0 };
  const amt = current - prev;
  const pct = (amt / prev) * 100;
  return { amt, pct };
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
 *   3. Upserts BRENT and GOLD into market_prices with computed change deltas
 *      (derived from the previous history row before this snapshot's fetched_at).
 *      USDVND is excluded from market_prices per FR-DPI-3d (macro-indicators
 *      surfaces USDVND via the SBV rate path; Yahoo USDVND is an offshore rate).
 *
 * DPI-3: prev-close for BRENT and GOLD is read BEFORE the write transaction to
 * keep the transaction body write-only (better DDD readability). If
 * commodity_prices_history has <2 rows, prev is null → delta=0 (tolerated on
 * first run; next daily tick produces non-zero delta — see R-2 in DPI-ARCH.md).
 *
 * @param snapshot - The snapshot to persist.
 * @param db       - Optional database instance (defaults to the app singleton via getDb()).
 */
export function storeCommoditySnapshot(
  snapshot: CommoditySnapshot,
  db?: Database,
): void {
  const database = db ?? getDb();

  // DPI-3 / MACRO-CMDTY-DELTA: Read prev-close for BRENT and GOLD BEFORE the
  // write transaction.
  //
  // Root cause of permanent-0% bug: Yahoo Finance regularMarketPrice returns
  // the same daily close value repeatedly during off-market hours. The old
  // query (ORDER BY fetched_at DESC LIMIT 1) would find a row from 1 hour ago
  // with the same price → computeDelta(x, x) = 0 forever.
  //
  // Fix: look back to the PREVIOUS calendar day's earliest row so we compute
  // a meaningful day-over-day delta. If no previous-day row exists (first run
  // or history is empty) → null → delta=0 (honest: no baseline yet).
  //
  // "Previous calendar day" is relative to the snapshot's UTC date, so it is
  // timezone-consistent with the fetched_at values written by fetchYahooFinancePrices.
  const snapshotDate = snapshot.fetchedAt.slice(0, 10); // "YYYY-MM-DD"

  const prevBrent: number | null =
    (
      database
        .prepare(
          `SELECT brent_crude_usd FROM commodity_prices_history
           WHERE source = 'yahoo'
             AND date(fetched_at) < date(?)
             AND brent_crude_usd > 0
           ORDER BY fetched_at DESC LIMIT 1`,
        )
        .get(snapshotDate) as { brent_crude_usd?: number } | null
    )?.brent_crude_usd ?? null;

  const prevGold: number | null =
    (
      database
        .prepare(
          `SELECT gold_usd_per_oz FROM commodity_prices_history
           WHERE source = 'yahoo'
             AND date(fetched_at) < date(?)
             AND gold_usd_per_oz > 0
           ORDER BY fetched_at DESC LIMIT 1`,
        )
        .get(snapshotDate) as { gold_usd_per_oz?: number } | null
    )?.gold_usd_per_oz ?? null;

  const brentDelta = computeDelta(snapshot.brentCrudeUSD, prevBrent);
  const goldDelta  = computeDelta(snapshot.goldUSDPerOz,  prevGold);

  const upsertLatest = database.prepare(`
    INSERT OR REPLACE INTO commodity_prices
      (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate,
       vix, sp500, shanghai_comp, hang_seng, dxy, cny_vnd_rate,
       copper_usd, silver_usd_per_oz, jpy_vnd_rate, us10y_yield, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Sprint 052 / backlog 921: yahooFinance is the single source of truth for
  // commodity prices. Mirror brent + gold into market_prices so the existing
  // get_market_context macro query finds them and consumers no longer fall
  // back to news-mined values in tracked_indicators (which were producing
  // a $3+ gap vs the live yahoo number — see report 921, signal #509).
  // DPI-3: ON CONFLICT branch now updates change_amt and change_pct so that
  // get_macro_snapshot surfaces directional deltas (not hardcoded 0).
  // USDVND excluded per FR-DPI-3d.
  const upsertMacroPrice = database.prepare(`
    INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
    VALUES (?, ?, ?, ?, 0, ?)
    ON CONFLICT(code) DO UPDATE SET
      price      = excluded.price,
      change_amt = excluded.change_amt,
      change_pct = excluded.change_pct,
      updated_at = excluded.updated_at
  `);

  // Dedup: only append history if no row exists for the same hour
  const appendHistory = database.prepare(`
    INSERT INTO commodity_prices_history
      (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate,
       vix, sp500, shanghai_comp, hang_seng, dxy, cny_vnd_rate,
       copper_usd, silver_usd_per_oz, jpy_vnd_rate, us10y_yield, fetched_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
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
      snapshot.vix,
      snapshot.sp500,
      snapshot.shanghaiComp,
      snapshot.hangSeng,
      snapshot.dxy,
      snapshot.cnyVndRate,
      snapshot.copperUSD,
      snapshot.silverUSDPerOz,
      snapshot.jpyVndRate,
      snapshot.us10yYield,
      snapshot.fetchedAt,
    );
    appendHistory.run(
      SOURCE,
      snapshot.brentCrudeUSD,
      snapshot.goldUSDPerOz,
      snapshot.usdVndRate,
      snapshot.vix,
      snapshot.sp500,
      snapshot.shanghaiComp,
      snapshot.hangSeng,
      snapshot.dxy,
      snapshot.cnyVndRate,
      snapshot.copperUSD,
      snapshot.silverUSDPerOz,
      snapshot.jpyVndRate,
      snapshot.us10yYield,
      snapshot.fetchedAt,
      // dedup WHERE bindings
      SOURCE,
      snapshot.fetchedAt,
    );
    if (snapshot.brentCrudeUSD != null) {
      upsertMacroPrice.run("BRENT", snapshot.brentCrudeUSD, brentDelta.amt, brentDelta.pct, snapshot.fetchedAt);
    }
    if (snapshot.goldUSDPerOz != null) {
      upsertMacroPrice.run("GOLD", snapshot.goldUSDPerOz, goldDelta.amt, goldDelta.pct, snapshot.fetchedAt);
    }

    // Task 1087 / report #1070: mirror Brent + Gold into tracked_indicators
    // so the σ-threshold system and Kinh Dich macro score (computeMacroScore)
    // use fresh Yahoo-sourced values. Sprint 052 removed Brent from news
    // extraction patterns (backlog 921) but did not wire Yahoo into
    // tracked_indicators — the stale news-mined values stayed as the latest
    // rows (e.g. brent_crude_usd=116 vs live 96.51), causing a dual-source
    // conflict visible to digest-writer and analysis agents.
    //
    // Task 1489: DELETE existing yahoo rows for the two indicators before
    // re-inserting to prevent unbounded row growth. tracked_indicators has no
    // UNIQUE(indicator, source) constraint (it's a time-series table used by
    // news-mining paths), so we guard dedup explicitly here for the yahoo source.
    database.exec(`DELETE FROM tracked_indicators WHERE source = 'yahoo'
                   AND indicator IN ('brent_crude_usd', 'gold_usd_oz')`);
    const insertTrackedIndicator = database.prepare(`
      INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at, data_env)
      VALUES (?, ?, ?, 'yahoo', ?, ?)
    `);
    const dataEnvYahoo = currentDataEnv();
    if (snapshot.brentCrudeUSD != null && snapshot.brentCrudeUSD > 0) {
      insertTrackedIndicator.run("brent_crude_usd", snapshot.brentCrudeUSD, "$/bbl", snapshot.fetchedAt, dataEnvYahoo);
    }
    if (snapshot.goldUSDPerOz != null && snapshot.goldUSDPerOz > 0) {
      insertTrackedIndicator.run("gold_usd_oz", snapshot.goldUSDPerOz, "$/oz", snapshot.fetchedAt, dataEnvYahoo);
    }
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
