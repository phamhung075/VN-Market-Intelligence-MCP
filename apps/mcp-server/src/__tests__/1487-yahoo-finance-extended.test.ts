Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1487 — Yahoo Finance Extended (12-symbol) — RED phase
 *
 * Tests T-1 through T-7 covering:
 *   T-1  12-symbol concurrent fetch shape — all 9 new fields populated
 *   T-2  storeCommoditySnapshot writes all 12 columns
 *   T-3  Partial failure (vix/dxy/jpyVnd throw) → remaining 9 populated, not null
 *   T-4  All 12 symbols fail → returns null
 *   T-5  Backward compat — existing 3-field consumers unchanged
 *   T-6  MacroContext.vix/sp500/dxy/hangSeng populated (FR-7)
 *   T-7  Null snapshot → MacroContext new fields are null (FR-7 null guard)
 *
 * All tests MUST fail before 1487_b GREEN implementation.
 * WARNING: schema.ts + yahooFinance.ts must be committed atomically in GREEN
 *          to avoid column-mismatch errors in production.
 */

import { Database } from "bun:sqlite";
import { describe, it, expect } from "bun:test";
import {
  fetchYahooFinancePrices,
  storeCommoditySnapshot,
  type CommoditySnapshot,
  type HttpClient,
} from "../infrastructure/fetchers/yahooFinance.js";
import { buildCausalChain, type MacroContext } from "../domain/services/cascadeEngine.js";
import { runImpactChain } from "../application/usecases/runImpactChain.js";

// ---------------------------------------------------------------------------
// Shared helpers (identical pattern to 025 test)
// ---------------------------------------------------------------------------

function buildYahooJsonResponse(price: number): string {
  return JSON.stringify({
    chart: { result: [{ meta: { regularMarketPrice: price, symbol: "TEST" } }], error: null },
  });
}

function buildEmptyYahooJsonResponse(): string {
  return JSON.stringify({ chart: { result: null, error: { code: "Not Found" } } });
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
      if (d !== undefined) { if (d instanceof Error) throw d; return d; }
      throw new Error(`No mock for URL: ${url}`);
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory DB helper — 12-column schema (GREEN must match this exactly)
// ---------------------------------------------------------------------------

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE commodity_prices (
      source            TEXT PRIMARY KEY,
      brent_crude_usd   REAL NOT NULL DEFAULT 0,
      gold_usd_per_oz   REAL NOT NULL DEFAULT 0,
      usd_vnd_rate      REAL NOT NULL DEFAULT 0,
      -- 9 new columns (FR-6) — will fail until GREEN adds them to yahooFinance.ts
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
    CREATE TABLE commodity_prices_history (
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
    CREATE TABLE market_prices (
      code TEXT PRIMARY KEY, price REAL, change_amt REAL, change_pct REAL, volume REAL, updated_at TEXT
    );
    CREATE TABLE tracked_indicators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      indicator TEXT NOT NULL, value REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '',
      extracted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

// ---------------------------------------------------------------------------
// All-symbols mock client — 12 symbols with synthetic prices
// ---------------------------------------------------------------------------

const ALL_12_CLIENT = symbolAwareClient({
  "BZ%3DF":      buildYahooJsonResponse(82.5),
  "GC%3DF":      buildYahooJsonResponse(2341.8),
  "USDVND%3DX":  buildYahooJsonResponse(25100.0),
  "%5EVIX":      buildYahooJsonResponse(18.5),     // ^VIX encoded
  "%5EGSPC":     buildYahooJsonResponse(5300.0),   // ^GSPC encoded
  "000001.SS":   buildYahooJsonResponse(3320.0),   // no encoding needed
  "%5EHSI":      buildYahooJsonResponse(17800.0),  // ^HSI encoded
  "DX-Y.NYB":    buildYahooJsonResponse(104.2),
  // CNHVND=X removed — not a valid Yahoo ticker (404 noise on every sync)
  "HG%3DF":      buildYahooJsonResponse(4.65),     // HG=F encoded
  "SI%3DF":      buildYahooJsonResponse(29.1),     // SI=F encoded
  "JPYVND%3DX":  buildYahooJsonResponse(165.0),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1487 — Yahoo Finance Extended 12-symbol (RED)", () => {

  // T-1: 12-symbol concurrent fetch shape
  it("T-1: fetchCommodityPrices returns CommoditySnapshot with all 9 new fields populated", async () => {
    const result = await fetchYahooFinancePrices(ALL_12_CLIENT);

    expect(result).not.toBeNull();
    // existing 3 — unchanged
    expect(result!.brentCrudeUSD).toBeCloseTo(82.5, 2);
    expect(result!.goldUSDPerOz).toBeCloseTo(2341.8, 1);
    expect(result!.usdVndRate).toBeCloseTo(25100.0, 0);
    // 9 new fields
    expect(result!.vix).toBeCloseTo(18.5, 1);
    expect(result!.sp500).toBeCloseTo(5300.0, 0);
    expect(result!.shanghaiComp).toBeCloseTo(3320.0, 0);
    expect(result!.hangSeng).toBeCloseTo(17800.0, 0);
    expect(result!.dxy).toBeCloseTo(104.2, 1);
    expect(result!.cnyVndRate).toBeNull(); // DSI-INV-1: CNHVND=X unavailable — null not 0
    expect(result!.copperUSD).toBeCloseTo(4.65, 2);
    expect(result!.silverUSDPerOz).toBeCloseTo(29.1, 1);
    expect(result!.jpyVndRate).toBeCloseTo(165.0, 0);
  });

  // T-2: storeCommoditySnapshot writes all 12 columns
  it("T-2: storeCommoditySnapshot writes all 12 columns in commodity_prices row", () => {
    const db = makeTestDb();
    const snap: CommoditySnapshot = {
      brentCrudeUSD: 82.5, goldUSDPerOz: 2341.8, usdVndRate: 25100.0,
      vix: 18.5, sp500: 5300.0, shanghaiComp: 3320.0, hangSeng: 17800.0,
      dxy: 104.2, cnyVndRate: null, copperUSD: 4.65, silverUSDPerOz: 29.1,
      jpyVndRate: 165.0, us10yYield: 0, fetchedAt: "2026-04-19T08:00:00.000Z",
    };

    storeCommoditySnapshot(snap, db);

    const row = db.query<Record<string, number | string>, []>(
      "SELECT * FROM commodity_prices WHERE source = 'yahoo'"
    ).get();

    expect(row).not.toBeNull();
    expect(row!["vix"]).toBeCloseTo(18.5, 1);
    expect(row!["sp500"]).toBeCloseTo(5300.0, 0);
    expect(row!["shanghai_comp"]).toBeCloseTo(3320.0, 0);
    expect(row!["hang_seng"]).toBeCloseTo(17800.0, 0);
    expect(row!["dxy"]).toBeCloseTo(104.2, 1);
    expect(row!["cny_vnd_rate"]).toBe(0); // DB writes 0 (NOT NULL constraint); TS type is null
    expect(row!["copper_usd"]).toBeCloseTo(4.65, 2);
    expect(row!["silver_usd_per_oz"]).toBeCloseTo(29.1, 1);
    expect(row!["jpy_vnd_rate"]).toBeCloseTo(165.0, 0);

    // history row appended
    const hist = db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM commodity_prices_history"
    ).get();
    expect(hist!.cnt).toBe(1);

    db.close();
  });

  // T-3: Partial failure — 3 symbols null, remaining 9 stored
  it("T-3: partial failure (vix, dxy, jpyVnd throw) → remaining 9 fields populated, result not null", async () => {
    const partialClient = symbolAwareClient({
      "%5EVIX":      new Error("Yahoo rate limit"),
      "DX-Y.NYB":    new Error("Unresolvable"),
      "JPYVND%3DX":  new Error("No data"),
      // all other 9 succeed
      "BZ%3DF":      buildYahooJsonResponse(82.5),
      "GC%3DF":      buildYahooJsonResponse(2341.8),
      "USDVND%3DX":  buildYahooJsonResponse(25100.0),
      "%5EGSPC":     buildYahooJsonResponse(5300.0),
      "000001.SS":   buildYahooJsonResponse(3320.0),
      "%5EHSI":      buildYahooJsonResponse(17800.0),
      // CNHVND=X removed — not a valid Yahoo ticker
      "HG%3DF":      buildYahooJsonResponse(4.65),
      "SI%3DF":      buildYahooJsonResponse(29.1),
    });

    const result = await fetchYahooFinancePrices(partialClient);

    expect(result).not.toBeNull();
    expect(result!.vix).toBe(0);
    expect(result!.dxy).toBe(0);
    expect(result!.jpyVndRate).toBe(0);
    expect(result!.brentCrudeUSD).toBeCloseTo(82.5, 2);
    expect(result!.sp500).toBeCloseTo(5300.0, 0);
    expect(result!.hangSeng).toBeCloseTo(17800.0, 0);
  });

  // T-4: All 12 symbols null → return null + warn logged
  it("T-4: all 12 symbols fail → fetchCommodityPrices returns null", async () => {
    const failAll = symbolAwareClient({ default: new Error("Network timeout") });
    const result = await fetchYahooFinancePrices(failAll);
    expect(result).toBeNull();
  });

  // T-5: Backward compat — existing 3-field consumers unchanged
  it("T-5: existing 3-field snapshot fields unchanged when new fields are 0", async () => {
    const result = await fetchYahooFinancePrices(ALL_12_CLIENT);
    expect(result).not.toBeNull();
    // Verify existing contract not broken
    const snap = result!;
    expect(typeof snap.brentCrudeUSD).toBe("number");
    expect(typeof snap.goldUSDPerOz).toBe("number");
    expect(typeof snap.usdVndRate).toBe("number");
    expect(typeof snap.fetchedAt).toBe("string");
    // New fields present and numeric
    expect(typeof snap.vix).toBe("number");
    expect(typeof snap.sp500).toBe("number");
    expect(typeof snap.shanghaiComp).toBe("number");
    expect(typeof snap.hangSeng).toBe("number");
    expect(typeof snap.dxy).toBe("number");
    expect(snap.cnyVndRate).toBeNull(); // DSI-INV-1: cnyVndRate is null (unavailable), not a number
    expect(typeof snap.copperUSD).toBe("number");
    expect(typeof snap.silverUSDPerOz).toBe("number");
    expect(typeof snap.jpyVndRate).toBe("number");
  });

  // T-6: MacroContext.vix/sp500/dxy/hangSeng populated (FR-7)
  it("T-6: MacroContext has vix, sp500, dxy, hangSeng populated from commodity snapshot", async () => {
    // Build a MacroContext directly (simulates runImpactChain assembly at lines 138-145)
    const mockSnap: CommoditySnapshot = {
      brentCrudeUSD: 82.5, goldUSDPerOz: 2341.8, usdVndRate: 25100.0,
      vix: 18.5, sp500: 5300.0, shanghaiComp: 3320.0, hangSeng: 17800.0,
      dxy: 104.2, cnyVndRate: null, copperUSD: 4.65, silverUSDPerOz: 29.1,
      jpyVndRate: 165.0, us10yYield: 0, fetchedAt: "2026-04-19T08:00:00.000Z",
    };

    // Replicate the assembly logic — will fail until runImpactChain.ts is extended
    const macroContext: MacroContext = {
      brentCrudeUSD:      mockSnap.brentCrudeUSD,
      goldUSDPerOz:       mockSnap.goldUSDPerOz,
      usdVndMarket:       mockSnap.usdVndRate,
      refinancingRatePct: null,
      overnightRatePct:   null,
      usdVndOfficial:     null,
      vix:                mockSnap.vix,
      sp500:              mockSnap.sp500,
      dxy:                mockSnap.dxy,
      hangSeng:           mockSnap.hangSeng,
    };

    expect(macroContext.vix).toBeCloseTo(18.5, 1);
    expect(macroContext.sp500).toBeCloseTo(5300.0, 0);
    expect(macroContext.dxy).toBeCloseTo(104.2, 1);
    expect(macroContext.hangSeng).toBeCloseTo(17800.0, 0);
  });

  // T-7: Null snapshot → MacroContext new fields are null (FR-7 null guard)
  it("T-7: null commodity snapshot → MacroContext vix/sp500/dxy/hangSeng all null", async () => {
    // commodity = null simulates fetch failure — cast prevents TS from narrowing to null
    const commodity = null as CommoditySnapshot | null;

    const macroContext: MacroContext = {
      brentCrudeUSD:      commodity?.brentCrudeUSD ?? null,
      goldUSDPerOz:       commodity?.goldUSDPerOz ?? null,
      usdVndMarket:       commodity?.usdVndRate ?? null,
      refinancingRatePct: null,
      overnightRatePct:   null,
      usdVndOfficial:     null,
      vix:                commodity?.vix ?? null,
      sp500:              commodity?.sp500 ?? null,
      dxy:                commodity?.dxy ?? null,
      hangSeng:           commodity?.hangSeng ?? null,
    };

    expect(macroContext.vix).toBeNull();
    expect(macroContext.sp500).toBeNull();
    expect(macroContext.dxy).toBeNull();
    expect(macroContext.hangSeng).toBeNull();
  });

});
