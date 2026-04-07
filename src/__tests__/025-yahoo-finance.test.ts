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
      CREATE TABLE commodity_prices (
        source TEXT PRIMARY KEY,
        brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
      CREATE TABLE commodity_prices_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
      -- Sprint 052 (backlog 921): storeCommoditySnapshot now mirrors brent/gold into market_prices
      CREATE TABLE market_prices (
        code        TEXT PRIMARY KEY,
        price       REAL,
        change_amt  REAL,
        change_pct  REAL,
        volume      REAL,
        updated_at  TEXT
      );
    `);

    const snap1: CommoditySnapshot = {
      brentCrudeUSD: 80.0,
      goldUSDPerOz: 2300.0,
      usdVndRate: 25000.0,
      fetchedAt: "2026-03-28T08:00:00.000Z",
    };

    const snap2: CommoditySnapshot = {
      brentCrudeUSD: 85.0,
      goldUSDPerOz: 2400.0,
      usdVndRate: 25200.0,
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
      CREATE TABLE commodity_prices (
        source TEXT PRIMARY KEY,
        brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
      CREATE TABLE commodity_prices_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        brent_crude_usd REAL NOT NULL DEFAULT 0,
        gold_usd_per_oz REAL NOT NULL DEFAULT 0,
        usd_vnd_rate REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL
      );
      -- Sprint 052 (backlog 921): storeCommoditySnapshot now mirrors brent/gold into market_prices
      CREATE TABLE market_prices (
        code        TEXT PRIMARY KEY,
        price       REAL,
        change_amt  REAL,
        change_pct  REAL,
        volume      REAL,
        updated_at  TEXT
      );
    `);

    const snap1: CommoditySnapshot = {
      brentCrudeUSD: 80.0,
      goldUSDPerOz: 2300.0,
      usdVndRate: 25000.0,
      fetchedAt: "2026-03-28T08:00:00.000Z",
    };

    const snap2: CommoditySnapshot = {
      brentCrudeUSD: 85.0,
      goldUSDPerOz: 2400.0,
      usdVndRate: 25200.0,
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
});
