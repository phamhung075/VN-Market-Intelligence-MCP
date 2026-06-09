/**
 * Task 1423a — US10Y yield (^TNX) symbol added to Yahoo Finance fetcher
 *
 * Tests:
 *   T-1  fetchYahooFinancePrices fetches ^TNX and populates us10y_yield
 *   T-2  CommoditySnapshot contains us10y_yield as a number
 *   T-3  storeCommoditySnapshot persists us10y_yield to commodity_prices row
 *   T-4  ^TNX fetch failure → us10y_yield = 0, result not null
 *   T-5  all 13 symbols fail → returns null
 *
 * RED phase — all tests must fail before GREEN implementation.
 */

Bun.env["DB_PATH"] = ":memory:";

import { Database } from "bun:sqlite";
import { describe, it, expect } from "bun:test";
import {
  fetchYahooFinancePrices,
  storeCommoditySnapshot,
  type CommoditySnapshot,
  type HttpClient,
} from "../infrastructure/fetchers/yahooFinance.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildYahooJsonResponse(price: number): string {
  return JSON.stringify({
    chart: { result: [{ meta: { regularMarketPrice: price, symbol: "TEST" } }], error: null },
  });
}

function symbolAwareClient(responses: Record<string, string | Error>): HttpClient {
  return {
    async get(url: string): Promise<string> {
      for (const [symbol, response] of Object.entries(responses)) {
        if (url.includes(encodeURIComponent(symbol)) || url.includes(symbol)) {
          if (response instanceof Error) throw response;
          return response;
        }
      }
      const d = responses["default"];
      if (d !== undefined) {
        if (d instanceof Error) throw d;
        return d;
      }
      throw new Error(`No mock for URL: ${url}`);
    },
  };
}

/** 13-column schema including us10y_yield */
function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS commodity_prices (
      source            TEXT PRIMARY KEY,
      brent_crude_usd   REAL NOT NULL DEFAULT 0,
      gold_usd_per_oz   REAL NOT NULL DEFAULT 0,
      usd_vnd_rate      REAL NOT NULL DEFAULT 0,
      vix               REAL NOT NULL DEFAULT 0,
      sp500             REAL NOT NULL DEFAULT 0,
      shanghai_comp     REAL NOT NULL DEFAULT 0,
      hang_seng         REAL NOT NULL DEFAULT 0,
      dxy               REAL NOT NULL DEFAULT 0,
      cny_vnd_rate      REAL NOT NULL DEFAULT 0,
      copper_usd        REAL NOT NULL DEFAULT 0,
      silver_usd_per_oz REAL NOT NULL DEFAULT 0,
      jpy_vnd_rate      REAL NOT NULL DEFAULT 0,
      us10y_yield       REAL NOT NULL DEFAULT 0,
      fetched_at        TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS commodity_prices_history (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      source            TEXT NOT NULL,
      brent_crude_usd   REAL NOT NULL DEFAULT 0,
      gold_usd_per_oz   REAL NOT NULL DEFAULT 0,
      usd_vnd_rate      REAL NOT NULL DEFAULT 0,
      vix               REAL NOT NULL DEFAULT 0,
      sp500             REAL NOT NULL DEFAULT 0,
      shanghai_comp     REAL NOT NULL DEFAULT 0,
      hang_seng         REAL NOT NULL DEFAULT 0,
      dxy               REAL NOT NULL DEFAULT 0,
      cny_vnd_rate      REAL NOT NULL DEFAULT 0,
      copper_usd        REAL NOT NULL DEFAULT 0,
      silver_usd_per_oz REAL NOT NULL DEFAULT 0,
      jpy_vnd_rate      REAL NOT NULL DEFAULT 0,
      us10y_yield       REAL NOT NULL DEFAULT 0,
      fetched_at        TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS market_prices (
      code TEXT PRIMARY KEY, price REAL, change_amt REAL, change_pct REAL, volume REAL, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS tracked_indicators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      indicator TEXT NOT NULL, value REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '',
      extracted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

/** All-12 mock client including ^TNX (CNHVND=X removed — invalid ticker) */
const ALL_13_CLIENT = symbolAwareClient({
  "BZ%3DF":      buildYahooJsonResponse(82.5),
  "GC%3DF":      buildYahooJsonResponse(2341.8),
  "USDVND%3DX":  buildYahooJsonResponse(25100.0),
  "%5EVIX":      buildYahooJsonResponse(18.5),
  "%5EGSPC":     buildYahooJsonResponse(5300.0),
  "000001.SS":   buildYahooJsonResponse(3320.0),
  "%5EHSI":      buildYahooJsonResponse(17800.0),
  "DX-Y.NYB":    buildYahooJsonResponse(104.2),
  // CNHVND=X removed — not a valid Yahoo ticker (404 on every sync)
  "HG%3DF":      buildYahooJsonResponse(4.65),
  "SI%3DF":      buildYahooJsonResponse(29.1),
  "JPYVND%3DX":  buildYahooJsonResponse(165.0),
  "%5ETNX":      buildYahooJsonResponse(4.35),   // ^TNX encoded
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1423a — US10Y yield symbol (^TNX)", () => {

  // T-1: ^TNX is fetched and us10yYield is populated
  it("T-1: fetchYahooFinancePrices fetches ^TNX and populates us10yYield", async () => {
    const result = await fetchYahooFinancePrices(ALL_13_CLIENT);

    expect(result).not.toBeNull();
    expect(result!.us10yYield).toBeCloseTo(4.35, 2);
  });

  // T-2: us10yYield is a number in the snapshot
  it("T-2: CommoditySnapshot.us10yYield is present and numeric", async () => {
    const result = await fetchYahooFinancePrices(ALL_13_CLIENT);

    expect(result).not.toBeNull();
    expect(typeof result!.us10yYield).toBe("number");
    // existing fields unchanged
    expect(typeof result!.brentCrudeUSD).toBe("number");
    expect(typeof result!.vix).toBe("number");
    expect(typeof result!.jpyVndRate).toBe("number");
  });

  // T-3: storeCommoditySnapshot writes us10y_yield column
  it("T-3: storeCommoditySnapshot persists us10yYield as us10y_yield column", () => {
    const db = makeTestDb();
    const snap: CommoditySnapshot = {
      brentCrudeUSD: 82.5, goldUSDPerOz: 2341.8, usdVndRate: 25100.0,
      vix: 18.5, sp500: 5300.0, shanghaiComp: 3320.0, hangSeng: 17800.0,
      dxy: 104.2, cnyVndRate: null, copperUSD: 4.65, silverUSDPerOz: 29.1,
      jpyVndRate: 165.0, us10yYield: 4.35,
      fetchedAt: "2026-04-29T08:00:00.000Z",
    };

    storeCommoditySnapshot(snap, db);

    const row = db.query<Record<string, number | string>, []>(
      "SELECT * FROM commodity_prices WHERE source = 'yahoo'"
    ).get();

    expect(row).not.toBeNull();
    expect(row!["us10y_yield"]).toBeCloseTo(4.35, 2);

    db.close();
  });

  // T-4: ^TNX failure → us10yYield = 0, result not null
  it("T-4: ^TNX fetch failure → us10yYield defaults to 0, result is not null", async () => {
    const partialClient = symbolAwareClient({
      "%5ETNX":      new Error("Rate limited"),
      "BZ%3DF":      buildYahooJsonResponse(82.5),
      "GC%3DF":      buildYahooJsonResponse(2341.8),
      "USDVND%3DX":  buildYahooJsonResponse(25100.0),
      "%5EVIX":      buildYahooJsonResponse(18.5),
      "%5EGSPC":     buildYahooJsonResponse(5300.0),
      "000001.SS":   buildYahooJsonResponse(3320.0),
      "%5EHSI":      buildYahooJsonResponse(17800.0),
      "DX-Y.NYB":    buildYahooJsonResponse(104.2),
      // CNHVND=X removed — not a valid Yahoo ticker
      "HG%3DF":      buildYahooJsonResponse(4.65),
      "SI%3DF":      buildYahooJsonResponse(29.1),
      "JPYVND%3DX":  buildYahooJsonResponse(165.0),
    });

    const result = await fetchYahooFinancePrices(partialClient);

    expect(result).not.toBeNull();
    expect(result!.us10yYield).toBe(0);
    expect(result!.brentCrudeUSD).toBeCloseTo(82.5, 2);
    expect(result!.vix).toBeCloseTo(18.5, 1);
  });

  // T-5: all 12 symbols fail → null
  it("T-5: all 12 symbols fail → fetchYahooFinancePrices returns null", async () => {
    const failAll = symbolAwareClient({ default: new Error("Network down") });
    const result = await fetchYahooFinancePrices(failAll);
    expect(result).toBeNull();
  });

});
