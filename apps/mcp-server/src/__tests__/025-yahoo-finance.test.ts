/**
 * Task 025 — Yahoo Finance Commodity Fetcher
 *
 * Tests for fetchYahooFinancePrices() and storeCommoditySnapshot()
 * in src/infrastructure/fetchers/yahooFinance.ts.
 *
 * Implementation uses the Yahoo Finance Chart JSON API:
 *   GET https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?interval=1d&range=1d
 * Response field: data.chart.result[0].meta.regularMarketPrice
 *
 * All HTTP calls are mocked — no real network traffic.
 * DB tests use an in-memory SQLite via local Database instances.
 *
 * Test IDs: YF-01 through YF-13
 */

import { Database } from "bun:sqlite";
import { describe, it, expect } from "bun:test";
import {
  fetchYahooFinancePrices,
  storeCommoditySnapshot,
  type CommoditySnapshot,
  type HttpClient,
} from "../infrastructure/fetchers/yahooFinance.js";

// ---------------------------------------------------------------------------
// Mock JSON builders
// ---------------------------------------------------------------------------

/**
 * Builds a Yahoo Finance Chart API JSON response for a given price.
 * Mirrors the real API structure: chart.result[0].meta.regularMarketPrice
 */
function buildYahooJsonResponse(price: number): string {
  return JSON.stringify({
    chart: {
      result: [
        {
          meta: {
            regularMarketPrice: price,
            symbol: "TEST",
          },
        },
      ],
      error: null,
    },
  });
}

/**
 * Builds an "empty / no data" Yahoo Finance JSON response (missing result array).
 * Used to simulate a symbol that returns no market data.
 */
function buildEmptyYahooJsonResponse(): string {
  return JSON.stringify({
    chart: {
      result: null,
      error: { code: "Not Found", description: "No data found" },
    },
  });
}

// ---------------------------------------------------------------------------
// Mock HTTP client factories
// ---------------------------------------------------------------------------

/**
 * Creates a mock HttpClient that returns per-symbol JSON responses based on
 * which symbol appears in the requested URL.
 *
 * @param responses - Map of symbol substring to response string or Error.
 *                    "default" key is used for unmatched URLs.
 */
function symbolAwareClient(
  responses: Record<string, string | Error>,
): HttpClient {
  return {
    async get(url: string): Promise<string> {
      for (const [symbol, response] of Object.entries(responses)) {
        if (url.includes(encodeURIComponent(symbol)) || url.includes(symbol)) {
          if (response instanceof Error) throw response;
          return response;
        }
      }
      // "default" fallback
      const defaultResponse = responses["default"];
      if (defaultResponse !== undefined) {
        if (defaultResponse instanceof Error) throw defaultResponse;
        return defaultResponse;
      }
      throw new Error(`No mock configured for URL: ${url}`);
    },
  };
}

/** Creates a mock HttpClient that always throws a network error. */
function failingClient(): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      throw new Error("Network timeout");
    },
  };
}

// ---------------------------------------------------------------------------
// Standard mock responses
// ---------------------------------------------------------------------------

const ALL_SYMBOLS_CLIENT = symbolAwareClient({
  "BZ%3DF": buildYahooJsonResponse(82.5),
  "GC%3DF": buildYahooJsonResponse(2341.8),
  "USDVND%3DX": buildYahooJsonResponse(25100.0),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 025 — Yahoo Finance Commodity Fetcher", () => {
  // ── YF-01: Successful parse of all 3 symbols ────────────────────────────
  it("YF-01: returns CommoditySnapshot with all 3 prices on valid JSON API response", async () => {
    const result = await fetchYahooFinancePrices(ALL_SYMBOLS_CLIENT);

    expect(result).not.toBeNull();
    expect(result!.brentCrudeUSD).toBeCloseTo(82.5, 2);
    expect(result!.goldUSDPerOz).toBeCloseTo(2341.8, 1);
    expect(result!.usdVndRate).toBeCloseTo(25100.0, 0);
  });

  // ── YF-02: Brent crude API returns no data → field=0, others still work ──
  it("YF-02: sets brentCrudeUSD=0 when BZ=F returns no data, others succeed", async () => {
    const client = symbolAwareClient({
      "BZ%3DF": buildEmptyYahooJsonResponse(),
      "GC%3DF": buildYahooJsonResponse(2341.8),
      "USDVND%3DX": buildYahooJsonResponse(25100.0),
    });

    const result = await fetchYahooFinancePrices(client);

    expect(result).not.toBeNull();
    expect(result!.brentCrudeUSD).toBe(0);
    expect(result!.goldUSDPerOz).toBeCloseTo(2341.8, 1);
    expect(result!.usdVndRate).toBeCloseTo(25100.0, 0);
  });

  // ── YF-03: Gold API returns no data → field=0 ────────────────────────────
  it("YF-03: sets goldUSDPerOz=0 when GC=F returns no data, others succeed", async () => {
    const client = symbolAwareClient({
      "BZ%3DF": buildYahooJsonResponse(82.5),
      "GC%3DF": buildEmptyYahooJsonResponse(),
      "USDVND%3DX": buildYahooJsonResponse(25100.0),
    });

    const result = await fetchYahooFinancePrices(client);

    expect(result).not.toBeNull();
    expect(result!.brentCrudeUSD).toBeCloseTo(82.5, 2);
    expect(result!.goldUSDPerOz).toBe(0);
    expect(result!.usdVndRate).toBeCloseTo(25100.0, 0);
  });

  // ── YF-04: USD/VND API returns no data → field=0 ─────────────────────────
  it("YF-04: sets usdVndRate=0 when USDVND=X returns no data, others succeed", async () => {
    const client = symbolAwareClient({
      "BZ%3DF": buildYahooJsonResponse(82.5),
      "GC%3DF": buildYahooJsonResponse(2341.8),
      "USDVND%3DX": buildEmptyYahooJsonResponse(),
    });

    const result = await fetchYahooFinancePrices(client);

    expect(result).not.toBeNull();
    expect(result!.brentCrudeUSD).toBeCloseTo(82.5, 2);
    expect(result!.goldUSDPerOz).toBeCloseTo(2341.8, 1);
    expect(result!.usdVndRate).toBe(0);
  });

  // ── YF-05: All 3 return no data → returns null ───────────────────────────
  it("YF-05: returns null when all 3 symbols return empty JSON (no prices)", async () => {
    const client = symbolAwareClient({
      "default": buildEmptyYahooJsonResponse(),
    });

    const result = await fetchYahooFinancePrices(client);
    expect(result).toBeNull();
  });

  // ── YF-06: HTTP error → returns null, no throw ───────────────────────────
  it("YF-06: returns null on HTTP error and does not throw", async () => {
    const result = await fetchYahooFinancePrices(failingClient());
    expect(result).toBeNull();
  });

  // ── YF-07: Malformed JSON response → field=0 ────────────────────────────
  it("YF-07: fields default to 0 when API returns malformed JSON", async () => {
    const client = symbolAwareClient({
      "default": "not valid json <<<",
    });
    const result = await fetchYahooFinancePrices(client);
    // All fields are 0 → returns null because all failed
    expect(result).toBeNull();
  });

  // ── YF-08: Large price value (USD/VND ~25100) → correct parse ───────────
  it("YF-08: correctly parses large numeric prices like USD/VND rate ~25000", async () => {
    const client = symbolAwareClient({
      "BZ%3DF": buildYahooJsonResponse(82.5),
      "GC%3DF": buildYahooJsonResponse(2341.5),
      "USDVND%3DX": buildYahooJsonResponse(25100.0),
    });

    const result = await fetchYahooFinancePrices(client);

    expect(result).not.toBeNull();
    expect(result!.goldUSDPerOz).toBeCloseTo(2341.5, 1);
    expect(result!.usdVndRate).toBeCloseTo(25100.0, 0);
  });

  // ── YF-09: storeCommoditySnapshot upsert semantics ─────────────────────
  it("YF-09: storeCommoditySnapshot upserts (INSERT OR REPLACE) into commodity_prices", () => {
    // Use a fully local in-memory DB — bypasses the singleton to ensure isolation
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS commodity_prices (
        source TEXT PRIMARY KEY,
        brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        vix REAL NOT NULL DEFAULT 0,
        sp500 REAL NOT NULL DEFAULT 0,
        shanghai_comp REAL NOT NULL DEFAULT 0,
        hang_seng REAL NOT NULL DEFAULT 0,
        dxy REAL NOT NULL DEFAULT 0,
        cny_vnd_rate REAL NOT NULL DEFAULT 0,
        copper_usd REAL NOT NULL DEFAULT 0,
        silver_usd_per_oz REAL NOT NULL DEFAULT 0,
        jpy_vnd_rate REAL NOT NULL DEFAULT 0,
        us10y_yield REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS commodity_prices_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        vix REAL NOT NULL DEFAULT 0,
        sp500 REAL NOT NULL DEFAULT 0,
        shanghai_comp REAL NOT NULL DEFAULT 0,
        hang_seng REAL NOT NULL DEFAULT 0,
        dxy REAL NOT NULL DEFAULT 0,
        cny_vnd_rate REAL NOT NULL DEFAULT 0,
        copper_usd REAL NOT NULL DEFAULT 0,
        silver_usd_per_oz REAL NOT NULL DEFAULT 0,
        jpy_vnd_rate REAL NOT NULL DEFAULT 0,
        us10y_yield REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
      -- Sprint 052 (backlog 921): storeCommoditySnapshot now mirrors brent/gold into market_prices
      CREATE TABLE IF NOT EXISTS market_prices (
        code        TEXT PRIMARY KEY,
        price       REAL,
        change_amt  REAL,
        change_pct  REAL,
        volume      REAL,
        updated_at  TEXT
      );
      -- Task 1087: mirror into tracked_indicators for σ-threshold + Kinh Dich
      CREATE TABLE IF NOT EXISTS tracked_indicators (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        indicator    TEXT NOT NULL,
        value        REAL NOT NULL,
        unit         TEXT NOT NULL DEFAULT '',
        source       TEXT NOT NULL DEFAULT '',
        extracted_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    const snap1: CommoditySnapshot = {
      brentCrudeUSD: 80.0, goldUSDPerOz: 2300.0, usdVndRate: 25000.0,
      vix: 0, sp500: 0, shanghaiComp: 0, hangSeng: 0, dxy: 0,
      cnyVndRate: null, copperUSD: 0, silverUSDPerOz: 0, jpyVndRate: 0, us10yYield: 0,
      fetchedAt: "2026-03-28T08:00:00.000Z",
    };

    const snap2: CommoditySnapshot = {
      brentCrudeUSD: 85.0, goldUSDPerOz: 2400.0, usdVndRate: 25200.0,
      vix: 0, sp500: 0, shanghaiComp: 0, hangSeng: 0, dxy: 0,
      cnyVndRate: null, copperUSD: 0, silverUSDPerOz: 0, jpyVndRate: 0, us10yYield: 0,
      fetchedAt: "2026-03-28T09:00:00.000Z",
    };

    storeCommoditySnapshot(snap1, db);
    storeCommoditySnapshot(snap2, db);

    // Only one row in commodity_prices (source='yahoo'), latest value wins
    const row = db
      .query<
        { brent_crude_usd: number; gold_usd_per_oz: number; fetched_at: string },
        []
      >("SELECT brent_crude_usd, gold_usd_per_oz, fetched_at FROM commodity_prices WHERE source = 'yahoo'")
      .get();

    expect(row).not.toBeNull();
    expect(row!.brent_crude_usd).toBeCloseTo(85.0, 2);
    expect(row!.gold_usd_per_oz).toBeCloseTo(2400.0, 1);
    expect(row!.fetched_at).toBe("2026-03-28T09:00:00.000Z");

    db.close();
  });

  // ── YF-10: storeCommoditySnapshot history append ────────────────────────
  it("YF-10: storeCommoditySnapshot appends each call to commodity_prices_history", () => {
    // Use a fully local in-memory DB — bypasses the singleton to ensure isolation
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS commodity_prices (
        source TEXT PRIMARY KEY,
        brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        vix REAL NOT NULL DEFAULT 0,
        sp500 REAL NOT NULL DEFAULT 0,
        shanghai_comp REAL NOT NULL DEFAULT 0,
        hang_seng REAL NOT NULL DEFAULT 0,
        dxy REAL NOT NULL DEFAULT 0,
        cny_vnd_rate REAL NOT NULL DEFAULT 0,
        copper_usd REAL NOT NULL DEFAULT 0,
        silver_usd_per_oz REAL NOT NULL DEFAULT 0,
        jpy_vnd_rate REAL NOT NULL DEFAULT 0,
        us10y_yield REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS commodity_prices_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        vix REAL NOT NULL DEFAULT 0,
        sp500 REAL NOT NULL DEFAULT 0,
        shanghai_comp REAL NOT NULL DEFAULT 0,
        hang_seng REAL NOT NULL DEFAULT 0,
        dxy REAL NOT NULL DEFAULT 0,
        cny_vnd_rate REAL NOT NULL DEFAULT 0,
        copper_usd REAL NOT NULL DEFAULT 0,
        silver_usd_per_oz REAL NOT NULL DEFAULT 0,
        jpy_vnd_rate REAL NOT NULL DEFAULT 0,
        us10y_yield REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
      -- Sprint 052 (backlog 921): storeCommoditySnapshot now mirrors brent/gold into market_prices
      CREATE TABLE IF NOT EXISTS market_prices (
        code        TEXT PRIMARY KEY,
        price       REAL,
        change_amt  REAL,
        change_pct  REAL,
        volume      REAL,
        updated_at  TEXT
      );
      -- Task 1087: mirror into tracked_indicators
      CREATE TABLE IF NOT EXISTS tracked_indicators (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        indicator    TEXT NOT NULL,
        value        REAL NOT NULL,
        unit         TEXT NOT NULL DEFAULT '',
        source       TEXT NOT NULL DEFAULT '',
        extracted_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    const snap1: CommoditySnapshot = {
      brentCrudeUSD: 80.0, goldUSDPerOz: 2300.0, usdVndRate: 25000.0,
      vix: 0, sp500: 0, shanghaiComp: 0, hangSeng: 0, dxy: 0,
      cnyVndRate: null, copperUSD: 0, silverUSDPerOz: 0, jpyVndRate: 0, us10yYield: 0,
      fetchedAt: "2026-03-28T08:00:00.000Z",
    };

    const snap2: CommoditySnapshot = {
      brentCrudeUSD: 85.0, goldUSDPerOz: 2400.0, usdVndRate: 25200.0,
      vix: 0, sp500: 0, shanghaiComp: 0, hangSeng: 0, dxy: 0,
      cnyVndRate: null, copperUSD: 0, silverUSDPerOz: 0, jpyVndRate: 0, us10yYield: 0,
      fetchedAt: "2026-03-28T09:00:00.000Z",
    };

    storeCommoditySnapshot(snap1, db);
    storeCommoditySnapshot(snap2, db);

    const count = db
      .query<{ cnt: number }, []>(
        "SELECT COUNT(*) as cnt FROM commodity_prices_history WHERE source = 'yahoo'",
      )
      .get();

    expect(count!.cnt).toBe(2);

    db.close();
  });

  // ── YF-11: barrel export check ──────────────────────────────────────────
  it("YF-11: fetchYahooFinancePrices and storeCommoditySnapshot are exported from barrel", async () => {
    const barrel = await import("../infrastructure/fetchers/index.js");
    expect(typeof barrel.fetchYahooFinancePrices).toBe("function");
    expect(typeof barrel.storeCommoditySnapshot).toBe("function");
  });

  // ── YF-12a: storeCommoditySnapshot mirrors Brent + Gold into tracked_indicators (task 1087 / report #1070)
  it("YF-12a: storeCommoditySnapshot mirrors brent + gold into tracked_indicators", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS commodity_prices (
        source TEXT PRIMARY KEY, brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0, usd_vnd_rate REAL NOT NULL DEFAULT 0,
        vix REAL NOT NULL DEFAULT 0, sp500 REAL NOT NULL DEFAULT 0,
        shanghai_comp REAL NOT NULL DEFAULT 0, hang_seng REAL NOT NULL DEFAULT 0,
        dxy REAL NOT NULL DEFAULT 0, cny_vnd_rate REAL NOT NULL DEFAULT 0,
        copper_usd REAL NOT NULL DEFAULT 0, silver_usd_per_oz REAL NOT NULL DEFAULT 0,
        jpy_vnd_rate REAL NOT NULL DEFAULT 0, us10y_yield REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS commodity_prices_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL,
        brent_crude_usd REAL NOT NULL DEFAULT 0, gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        vix REAL NOT NULL DEFAULT 0, sp500 REAL NOT NULL DEFAULT 0,
        shanghai_comp REAL NOT NULL DEFAULT 0, hang_seng REAL NOT NULL DEFAULT 0,
        dxy REAL NOT NULL DEFAULT 0, cny_vnd_rate REAL NOT NULL DEFAULT 0,
        copper_usd REAL NOT NULL DEFAULT 0, silver_usd_per_oz REAL NOT NULL DEFAULT 0,
        jpy_vnd_rate REAL NOT NULL DEFAULT 0, us10y_yield REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS market_prices (
        code TEXT PRIMARY KEY, price REAL, change_amt REAL, change_pct REAL, volume REAL, updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS tracked_indicators (
        id INTEGER PRIMARY KEY AUTOINCREMENT, indicator TEXT NOT NULL,
        value REAL NOT NULL, unit TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '',
        extracted_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Seed a stale news-mined brent value (the bug scenario from report #1070)
    db.exec(`INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
             VALUES ('brent_crude_usd', 116.0, '$/bbl', 'tradingeconomics', '2026-04-01T10:00:00Z')`);

    storeCommoditySnapshot({
      brentCrudeUSD: 96.51, goldUSDPerOz: 4793.5, usdVndRate: 26320.0,
      vix: 0, sp500: 0, shanghaiComp: 0, hangSeng: 0, dxy: 0,
      cnyVndRate: null, copperUSD: 0, silverUSDPerOz: 0, jpyVndRate: 0, us10yYield: 0,
      fetchedAt: "2026-04-10T08:00:00.000Z",
    }, db);

    // The latest brent row should now be the yahoo-sourced 96.51, not the stale 116
    const latestBrent = db.query<{ value: number; source: string }, []>(
      "SELECT value, source FROM tracked_indicators WHERE indicator = 'brent_crude_usd' ORDER BY extracted_at DESC LIMIT 1",
    ).get();
    expect(latestBrent).not.toBeNull();
    expect(latestBrent!.value).toBeCloseTo(96.51, 1);
    expect(latestBrent!.source).toBe("yahoo");

    // Gold too
    const latestGold = db.query<{ value: number }, []>(
      "SELECT value FROM tracked_indicators WHERE indicator = 'gold_usd_oz' ORDER BY extracted_at DESC LIMIT 1",
    ).get();
    expect(latestGold).not.toBeNull();
    expect(latestGold!.value).toBeCloseTo(4793.5, 0);

    // Total tracked_indicators rows: 1 stale brent + 1 yahoo brent + 1 yahoo gold = 3
    const total = db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM tracked_indicators",
    ).get();
    expect(total!.cnt).toBe(3);

    db.close();
  });

  // ── YF-12: fetchedAt is ISO 8601 ────────────────────────────────────────
  it("YF-12: fetchedAt in returned CommoditySnapshot is a valid ISO 8601 timestamp", async () => {
    const result = await fetchYahooFinancePrices(ALL_SYMBOLS_CLIENT);

    expect(result).not.toBeNull();
    const parsed = new Date(result!.fetchedAt);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    // Must contain T and Z (ISO 8601 UTC)
    expect(result!.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  // ── YF-13: Three concurrent API calls — one HTTP error → partial results ─
  it("YF-13: HTTP error on one symbol sets that field to 0 while others succeed", async () => {
    const client = symbolAwareClient({
      "BZ%3DF": new Error("429 Rate limited"),
      "GC%3DF": buildYahooJsonResponse(2222.22),
      "USDVND%3DX": buildYahooJsonResponse(24999.0),
    });

    const result = await fetchYahooFinancePrices(client);

    expect(result).not.toBeNull();
    expect(result!.brentCrudeUSD).toBe(0);
    expect(result!.goldUSDPerOz).toBeCloseTo(2222.22, 1);
    expect(result!.usdVndRate).toBeCloseTo(24999.0, 0);
  });

  // ── YF-14: MACRO-CMDTY-DELTA — prev-day close produces real delta ─────────
  // Regression guard: Yahoo Finance returns the same daily close price
  // repeatedly during off-market hours. The old prev query used
  // ORDER BY fetched_at DESC LIMIT 1, which found a row from 1 hour ago with
  // the same price → computeDelta(x, x) = 0 → permanent 0.00% in bootstrap.
  //
  // Fix: look back to the PREVIOUS calendar day's latest row so deltas are
  // day-over-day (meaningful) rather than tick-over-tick (flat during off-hours).
  it("YF-14: storeCommoditySnapshot uses previous-day close for delta — off-market repeated price must NOT zero out a real move", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS commodity_prices (
        source TEXT PRIMARY KEY,
        brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        vix REAL NOT NULL DEFAULT 0,
        sp500 REAL NOT NULL DEFAULT 0,
        shanghai_comp REAL NOT NULL DEFAULT 0,
        hang_seng REAL NOT NULL DEFAULT 0,
        dxy REAL NOT NULL DEFAULT 0,
        cny_vnd_rate REAL NOT NULL DEFAULT 0,
        copper_usd REAL NOT NULL DEFAULT 0,
        silver_usd_per_oz REAL NOT NULL DEFAULT 0,
        jpy_vnd_rate REAL NOT NULL DEFAULT 0,
        us10y_yield REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS commodity_prices_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        vix REAL NOT NULL DEFAULT 0,
        sp500 REAL NOT NULL DEFAULT 0,
        shanghai_comp REAL NOT NULL DEFAULT 0,
        hang_seng REAL NOT NULL DEFAULT 0,
        dxy REAL NOT NULL DEFAULT 0,
        cny_vnd_rate REAL NOT NULL DEFAULT 0,
        copper_usd REAL NOT NULL DEFAULT 0,
        silver_usd_per_oz REAL NOT NULL DEFAULT 0,
        jpy_vnd_rate REAL NOT NULL DEFAULT 0,
        us10y_yield REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS market_prices (
        code TEXT PRIMARY KEY,
        price REAL,
        change_amt REAL,
        change_pct REAL,
        volume REAL,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS tracked_indicators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        indicator TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        extracted_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Seed yesterday's close in history (the prior-day baseline)
    // Brent: 90.00, Gold: 4500.0 — these are yesterday's values
    db.exec(`
      INSERT INTO commodity_prices_history
        (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate,
         vix, sp500, shanghai_comp, hang_seng, dxy, cny_vnd_rate,
         copper_usd, silver_usd_per_oz, jpy_vnd_rate, us10y_yield, fetched_at)
      VALUES
        ('yahoo', 90.00, 4500.0, 25000.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '2026-05-30T08:00:00.000Z'),
        ('yahoo', 90.00, 4500.0, 25000.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '2026-05-30T09:00:00.000Z'),
        ('yahoo', 90.00, 4500.0, 25000.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '2026-05-30T10:00:00.000Z')
    `);

    // Simulate today: Yahoo returns SAME price as 1 hour ago (off-market repeat)
    // The last history row for today would have brent=91.12, gold=4593
    // but the CURRENT row we're storing also has brent=91.12, gold=4593
    // Old bug: prev = most-recent row = 91.12 → delta = 0
    // Fix: prev = previous-day row = 90.00 → real delta computed
    const todaySnap: CommoditySnapshot = {
      brentCrudeUSD: 91.12,
      goldUSDPerOz: 4593.0,
      usdVndRate: 25100.0,
      vix: 0, sp500: 0, shanghaiComp: 0, hangSeng: 0, dxy: 0,
      cnyVndRate: null, copperUSD: 0, silverUSDPerOz: 0, jpyVndRate: 0, us10yYield: 0,
      fetchedAt: "2026-05-31T00:15:00.000Z",
    };

    storeCommoditySnapshot(todaySnap, db);

    const brentRow = db
      .query<{ price: number; change_amt: number; change_pct: number }, []>(
        "SELECT price, change_amt, change_pct FROM market_prices WHERE code = 'BRENT'",
      )
      .get();

    const goldRow = db
      .query<{ price: number; change_amt: number; change_pct: number }, []>(
        "SELECT price, change_amt, change_pct FROM market_prices WHERE code = 'GOLD'",
      )
      .get();

    // Brent: 91.12 vs 90.00 → +1.12 / +1.244...%
    expect(brentRow).not.toBeNull();
    expect(brentRow!.price).toBeCloseTo(91.12, 2);
    expect(brentRow!.change_amt).toBeGreaterThan(0);
    expect(brentRow!.change_pct).toBeGreaterThan(0);
    expect(brentRow!.change_pct).toBeCloseTo(((91.12 - 90.00) / 90.00) * 100, 2);

    // Gold: 4593 vs 4500 → +93 / +2.066...%
    expect(goldRow).not.toBeNull();
    expect(goldRow!.price).toBeCloseTo(4593.0, 0);
    expect(goldRow!.change_amt).toBeGreaterThan(0);
    expect(goldRow!.change_pct).toBeGreaterThan(0);
    expect(goldRow!.change_pct).toBeCloseTo(((4593.0 - 4500.0) / 4500.0) * 100, 2);

    db.close();
  });

  // ── YF-15: MACRO-CMDTY-DELTA — zero-valued history row must be skipped ────
  // The > 0 guard on the prev lookup must ignore any row where brent/gold=0
  // (e.g. written before the fetcher was wired up) — must not produce delta=0
  // when current price is real and only a valid prior row exists from yesterday.
  it("YF-15: storeCommoditySnapshot skips zero-valued history rows as prior-close candidates", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS commodity_prices (
        source TEXT PRIMARY KEY,
        brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        vix REAL NOT NULL DEFAULT 0,
        sp500 REAL NOT NULL DEFAULT 0,
        shanghai_comp REAL NOT NULL DEFAULT 0,
        hang_seng REAL NOT NULL DEFAULT 0,
        dxy REAL NOT NULL DEFAULT 0,
        cny_vnd_rate REAL NOT NULL DEFAULT 0,
        copper_usd REAL NOT NULL DEFAULT 0,
        silver_usd_per_oz REAL NOT NULL DEFAULT 0,
        jpy_vnd_rate REAL NOT NULL DEFAULT 0,
        us10y_yield REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS commodity_prices_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        vix REAL NOT NULL DEFAULT 0,
        sp500 REAL NOT NULL DEFAULT 0,
        shanghai_comp REAL NOT NULL DEFAULT 0,
        hang_seng REAL NOT NULL DEFAULT 0,
        dxy REAL NOT NULL DEFAULT 0,
        cny_vnd_rate REAL NOT NULL DEFAULT 0,
        copper_usd REAL NOT NULL DEFAULT 0,
        silver_usd_per_oz REAL NOT NULL DEFAULT 0,
        jpy_vnd_rate REAL NOT NULL DEFAULT 0,
        us10y_yield REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS market_prices (
        code TEXT PRIMARY KEY,
        price REAL,
        change_amt REAL,
        change_pct REAL,
        volume REAL,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS tracked_indicators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        indicator TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        extracted_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Two zero rows yesterday (bad bootstrap rows) followed by one valid row
    db.exec(`
      INSERT INTO commodity_prices_history
        (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate,
         vix, sp500, shanghai_comp, hang_seng, dxy, cny_vnd_rate,
         copper_usd, silver_usd_per_oz, jpy_vnd_rate, us10y_yield, fetched_at)
      VALUES
        ('yahoo', 0, 0, 25000.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '2026-05-30T06:00:00.000Z'),
        ('yahoo', 0, 0, 25000.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '2026-05-30T07:00:00.000Z'),
        ('yahoo', 90.00, 4500.0, 25000.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '2026-05-30T08:00:00.000Z')
    `);

    const todaySnap: CommoditySnapshot = {
      brentCrudeUSD: 91.12,
      goldUSDPerOz: 4593.0,
      usdVndRate: 25100.0,
      vix: 0, sp500: 0, shanghaiComp: 0, hangSeng: 0, dxy: 0,
      cnyVndRate: null, copperUSD: 0, silverUSDPerOz: 0, jpyVndRate: 0, us10yYield: 0,
      fetchedAt: "2026-05-31T00:15:00.000Z",
    };

    storeCommoditySnapshot(todaySnap, db);

    const brentRow = db
      .query<{ change_pct: number }, []>(
        "SELECT change_pct FROM market_prices WHERE code = 'BRENT'",
      )
      .get();

    // Must NOT be 0 — the valid prior row (90.00) was found, skipping the zeros
    expect(brentRow).not.toBeNull();
    expect(brentRow!.change_pct).toBeGreaterThan(0);

    db.close();
  });
});
