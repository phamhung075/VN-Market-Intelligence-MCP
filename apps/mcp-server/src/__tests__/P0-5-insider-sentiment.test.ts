/**
 * P0-5-INSIDER-SENTIMENT — Test Suite
 *
 * Covers all ACs from HANDOFF-P05-INSIDER-SENTIMENT.md:
 *
 *   AC-1:  Net buy-sell value computed per window (30/90/180d); null when no valid data
 *   AC-2:  data_window_days counts included in every response (QA self-verification)
 *   AC-3:  Market-wide aggregation when code omitted (sum across watchlist tickers)
 *   AC-4:  Per-ticker signal when code supplied
 *   AC-5:  Free-float normalization using market_cap_bn (clamped [-1, +1])
 *   AC-6:  normalization_basis: 'market_cap_proxy' MANDATORY in every response
 *   AC-7:  ACCUMULATION/DISTRIBUTION/MIXED/NEUTRAL label derived correctly
 *   AC-8:  Large-deal flags computed (>10B VND threshold)
 *   AC-9:  Tool returns {error:'...'} on DB failure (NFR-P05-3)
 *   AC-10: price=0 rows excluded (computeWindowNetBuySell)
 *   AC-11: market_cap_bn=NULL → net_sentiment_score=NULL (null propagation)
 *   AC-12: executed_volume=0 rows excluded
 *   AC-13: buy + sell in same 30d window both counted faithfully
 *   AC-14: empty insider_transactions → NEUTRAL label
 *
 * Harness: _registeredTools direct-handler invocation + pure domain tests.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Domain
import {
  computeWindowNetBuySell,
  computeNormalizedScore,
  computeInsiderLabel,
  computeLargeDeals,
  DEFAULT_LARGE_DEAL_THRESHOLD_VND,
  type InsiderTxRow,
} from "../domain/services/market-data/insiderSentimentCalculator.js";

// Infrastructure
import {
  getInsiderTxForSentiment,
  getLatestMarketCapBn,
  getMarketCapBnBulk,
  getWatchlistCodes,
} from "../infrastructure/db/insiderSentimentStore.js";

// Application
import { getInsiderSentiment } from "../application/usecases/getInsiderSentiment.js";

// Tool
import { registerInsiderSentimentTools } from "../interface/mcp/tools/market-data/insiderSentimentTools.js";

// ---------------------------------------------------------------------------
// In-memory DB setup
// ---------------------------------------------------------------------------

/** Fixed "today" for deterministic window math (YYYY-MM-DD). */
const TODAY = "2026-06-30";
const TODAY_MS = new Date(TODAY + "T12:00:00Z").getTime();

/** Compute a date string N days before TODAY. */
function daysAgo(n: number): string {
  const d = new Date(TODAY_MS - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function buildTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS insider_transactions (
      id                TEXT PRIMARY KEY,
      code              TEXT NOT NULL,
      insider_name      TEXT NOT NULL DEFAULT 'Test Insider',
      position          TEXT NOT NULL DEFAULT 'CEO',
      type              TEXT NOT NULL CHECK(type IN ('buy','sell','other')),
      registered_volume INTEGER NOT NULL DEFAULT 0,
      executed_volume   INTEGER NOT NULL DEFAULT 0,
      price             REAL NOT NULL DEFAULT 0,
      from_date         TEXT NOT NULL,
      to_date           TEXT NOT NULL DEFAULT '2099-01-01',
      fetched_at        TEXT NOT NULL DEFAULT '2026-06-30T00:00:00Z'
    );
    CREATE INDEX IF NOT EXISTS idx_it_code_from_date
      ON insider_transactions(code, from_date DESC);

    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      code            TEXT NOT NULL,
      date            TEXT NOT NULL DEFAULT '1970-01-01',
      market_cap_bn   REAL,
      fetched_at      TEXT NOT NULL DEFAULT '2026-06-30T00:00:00Z',
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, date)
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE
    );
  `);
  return db;
}

let txCounter = 0;

function insertTx(
  db: Database,
  {
    code = 'VNM',
    type,
    executedVolume,
    price,
    fromDate,
  }: {
    code?: string;
    type: 'buy' | 'sell' | 'other';
    executedVolume: number;
    price: number;
    fromDate: string;
  },
): void {
  txCounter++;
  db.exec(
    `INSERT INTO insider_transactions (id, code, type, executed_volume, price, from_date)
     VALUES ('tx-${txCounter}', '${code}', '${type}', ${executedVolume}, ${price}, '${fromDate}')`,
  );
}

function insertMarketCap(db: Database, code: string, capBn: number | null, date = TODAY): void {
  db.exec(
    `INSERT OR REPLACE INTO vnstock_trading_stats (code, date, market_cap_bn)
     VALUES ('${code}', '${date}', ${capBn === null ? 'NULL' : capBn})`,
  );
}

function insertWatchlist(db: Database, codes: string[]): void {
  for (const code of codes) {
    db.exec(`INSERT OR IGNORE INTO watchlist (code) VALUES ('${code}')`);
  }
}

// ---------------------------------------------------------------------------
// AC-10: price=0 rows excluded
// ---------------------------------------------------------------------------

describe("AC-10: price=0 rows excluded from net buy-sell computation", () => {
  it("excludes price=0 buy rows and triggers WARN callback", () => {
    const warned: string[] = [];
    const rows: InsiderTxRow[] = [
      { code: 'VNM', type: 'buy',  executedVolume: 10_000, price: 0,       fromDate: daysAgo(5) },
      { code: 'VNM', type: 'buy',  executedVolume:  5_000, price: 50_000,  fromDate: daysAgo(4) },
    ];
    const result = computeWindowNetBuySell(rows, (msg) => warned.push(msg));
    // Only the price>0 row counts
    expect(result.netBnVnd).toBeCloseTo(5_000 * 50_000 / 1e9, 6);
    expect(result.distinctDates).toBe(1);
    // price=0 row triggers a WARN
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain("price≤0");
  });

  it("excludes price=0 sell rows", () => {
    const rows: InsiderTxRow[] = [
      { code: 'VNM', type: 'sell', executedVolume: 10_000, price: 0, fromDate: daysAgo(5) },
    ];
    const result = computeWindowNetBuySell(rows);
    expect(result.netBnVnd).toBeNull(); // no valid rows
    expect(result.distinctDates).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC-12: executed_volume=0 rows excluded
// ---------------------------------------------------------------------------

describe("AC-12: executed_volume=0 rows excluded", () => {
  it("excludes unexecuted (volume=0) buy rows", () => {
    const rows: InsiderTxRow[] = [
      { code: 'VNM', type: 'buy', executedVolume: 0,     price: 50_000, fromDate: daysAgo(5) },
      { code: 'VNM', type: 'buy', executedVolume: 1_000, price: 50_000, fromDate: daysAgo(4) },
    ];
    const result = computeWindowNetBuySell(rows);
    // Only the vol>0 row contributes
    expect(result.netBnVnd).toBeCloseTo(1_000 * 50_000 / 1e9, 6);
    expect(result.distinctDates).toBe(1);
  });

  it("excludes negative volume rows (defensive)", () => {
    const rows: InsiderTxRow[] = [
      { code: 'VNM', type: 'buy', executedVolume: -100, price: 50_000, fromDate: daysAgo(5) },
    ];
    const result = computeWindowNetBuySell(rows);
    expect(result.netBnVnd).toBeNull();
    expect(result.distinctDates).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC-13: buy + sell in same window both counted faithfully
// ---------------------------------------------------------------------------

describe("AC-13: buy + sell in same window both counted", () => {
  it("computes buy_value - sell_value correctly (same insider buys and sells)", () => {
    const rows: InsiderTxRow[] = [
      { code: 'VNM', type: 'buy',  executedVolume: 10_000, price: 50_000, fromDate: daysAgo(5) },
      { code: 'VNM', type: 'sell', executedVolume:  4_000, price: 50_000, fromDate: daysAgo(3) },
    ];
    const result = computeWindowNetBuySell(rows);
    const expectedNetVnd = (10_000 * 50_000) - (4_000 * 50_000); // 300_000_000 VND = 0.3 Bn
    expect(result.netBnVnd).toBeCloseTo(expectedNetVnd / 1e9, 6);
    expect(result.distinctDates).toBe(2); // 2 distinct dates
  });

  it("excludes 'other' type rows from net computation", () => {
    const rows: InsiderTxRow[] = [
      { code: 'VNM', type: 'other', executedVolume: 100_000, price: 50_000, fromDate: daysAgo(5) },
      { code: 'VNM', type: 'buy',   executedVolume:   1_000, price: 50_000, fromDate: daysAgo(3) },
    ];
    const result = computeWindowNetBuySell(rows);
    // Only the buy row contributes
    expect(result.netBnVnd).toBeCloseTo(1_000 * 50_000 / 1e9, 6);
    expect(result.distinctDates).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AC-1: Net buy-sell per window — null when no valid data
// ---------------------------------------------------------------------------

describe("AC-1: net buy-sell null when no valid data", () => {
  it("returns null when rows array is empty", () => {
    const result = computeWindowNetBuySell([]);
    expect(result.netBnVnd).toBeNull();
    expect(result.distinctDates).toBe(0);
  });

  it("returns null when all rows are 'other' type", () => {
    const rows: InsiderTxRow[] = [
      { code: 'VNM', type: 'other', executedVolume: 10_000, price: 50_000, fromDate: daysAgo(5) },
    ];
    const result = computeWindowNetBuySell(rows);
    expect(result.netBnVnd).toBeNull();
    expect(result.distinctDates).toBe(0);
  });

  it("computes correct netBnVnd for pure buy window", () => {
    const rows: InsiderTxRow[] = [
      { code: 'VNM', type: 'buy', executedVolume: 20_000, price: 100_000, fromDate: daysAgo(10) },
    ];
    const result = computeWindowNetBuySell(rows);
    // 20_000 * 100_000 = 2_000_000_000 VND = 2.0 Bn
    expect(result.netBnVnd).toBeCloseTo(2.0, 6);
    expect(result.distinctDates).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AC-5: Free-float normalization
// ---------------------------------------------------------------------------

describe("AC-5: computeNormalizedScore — free-float normalization", () => {
  it("computes score correctly: net/market_cap clamped to [-1,+1]", () => {
    // net = 10 Bn VND, market_cap = 100 Bn VND → score = 0.1
    const result = computeNormalizedScore(10, 100);
    expect(result.score).toBeCloseTo(0.1, 6);
    expect(result.null_reason).toBeNull();
  });

  it("clamps score to +1 when net exceeds market_cap", () => {
    // net = 200 Bn, market_cap = 100 Bn → raw = 2.0 → clamped to 1.0
    const result = computeNormalizedScore(200, 100);
    expect(result.score).toBe(1.0);
  });

  it("clamps score to -1 when net is highly negative", () => {
    // net = -500 Bn, market_cap = 100 Bn → raw = -5.0 → clamped to -1.0
    const result = computeNormalizedScore(-500, 100);
    expect(result.score).toBe(-1.0);
  });

  it("returns score=0 when net is exactly 0", () => {
    const result = computeNormalizedScore(0, 100);
    expect(result.score).toBe(0);
    expect(result.null_reason).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC-11: market_cap_bn=NULL → net_sentiment_score=NULL
// ---------------------------------------------------------------------------

describe("AC-11: market_cap_bn=NULL → net_sentiment_score=null", () => {
  it("returns null score when market_cap_bn is null", () => {
    const result = computeNormalizedScore(10, null);
    expect(result.score).toBeNull();
    expect(result.null_reason).toContain("MARKET_CAP_BN_UNAVAILABLE");
  });

  it("returns null score when net90dBnVnd is null (no 90d data)", () => {
    const result = computeNormalizedScore(null, 100);
    expect(result.score).toBeNull();
    expect(result.null_reason).toContain("INSUFFICIENT_DATA");
  });

  it("returns null score when market_cap_bn is 0 (invalid denominator)", () => {
    const result = computeNormalizedScore(10, 0);
    expect(result.score).toBeNull();
    expect(result.null_reason).toContain("MARKET_CAP_BN_ZERO");
  });
});

// ---------------------------------------------------------------------------
// AC-7: Label derivation
// ---------------------------------------------------------------------------

describe("AC-7: computeInsiderLabel — ACCUMULATION/DISTRIBUTION/MIXED/NEUTRAL", () => {
  it("returns ACCUMULATION when both 30d and 90d are positive", () => {
    expect(computeInsiderLabel(5, 20)).toBe('ACCUMULATION');
  });

  it("returns DISTRIBUTION when both 30d and 90d are negative", () => {
    expect(computeInsiderLabel(-3, -15)).toBe('DISTRIBUTION');
  });

  it("returns MIXED when 30d positive but 90d negative", () => {
    expect(computeInsiderLabel(5, -10)).toBe('MIXED');
  });

  it("returns MIXED when 30d negative but 90d positive", () => {
    expect(computeInsiderLabel(-5, 10)).toBe('MIXED');
  });

  it("returns NEUTRAL when both null (empty insider_transactions)", () => {
    expect(computeInsiderLabel(null, null)).toBe('NEUTRAL');
  });

  it("returns NEUTRAL when both exactly 0", () => {
    expect(computeInsiderLabel(0, 0)).toBe('NEUTRAL');
  });

  it("returns MIXED when one is null and other is non-zero", () => {
    expect(computeInsiderLabel(null, 10)).toBe('MIXED');
    expect(computeInsiderLabel(5, null)).toBe('MIXED');
  });
});

// ---------------------------------------------------------------------------
// AC-14: empty insider_transactions → NEUTRAL label
// ---------------------------------------------------------------------------

describe("AC-14: empty insider_transactions → NEUTRAL label", () => {
  it("returns NEUTRAL label via domain function when no rows", () => {
    const label = computeInsiderLabel(null, null);
    expect(label).toBe('NEUTRAL');
  });

  it("returns NEUTRAL label via integration when table is empty", async () => {
    const db = buildTestDb();
    insertMarketCap(db, 'VNM', 100); // market_cap available but no transactions
    insertWatchlist(db, ['VNM']);
    const result = await getInsiderSentiment(db, 'VNM', TODAY_MS);
    expect(result.insider_label).toBe('NEUTRAL');
    expect(result.net_buy_sell_30d_bn_vnd).toBeNull();
    expect(result.net_buy_sell_90d_bn_vnd).toBeNull();
    expect(result.net_buy_sell_180d_bn_vnd).toBeNull();
    db.close();
  });
});

// ---------------------------------------------------------------------------
// AC-8: Large-deal flags
// ---------------------------------------------------------------------------

describe("AC-8: computeLargeDeals — large-deal detection", () => {
  it("flags deals exceeding default 10B VND threshold", () => {
    const rows: InsiderTxRow[] = [
      // 200_000 shares × 55_000 VND = 11_000_000_000 VND (11 Bn) → LARGE
      { code: 'VNM', type: 'buy', executedVolume: 200_000, price: 55_000, fromDate: daysAgo(5) },
      // 100_000 × 50_000 = 5_000_000_000 (5 Bn) → NOT large
      { code: 'VNM', type: 'sell', executedVolume: 100_000, price: 50_000, fromDate: daysAgo(3) },
    ];
    const result = computeLargeDeals(rows);
    expect(result.large_deals_30d).toBe(true);
    expect(result.large_deal_count_30d).toBe(1);
    expect(result.largest_deal_value_30d_bn_vnd).toBeCloseTo(11.0, 4);
  });

  it("returns false when no deals exceed threshold", () => {
    const rows: InsiderTxRow[] = [
      { code: 'VNM', type: 'buy', executedVolume: 100, price: 50_000, fromDate: daysAgo(5) },
    ];
    const result = computeLargeDeals(rows);
    expect(result.large_deals_30d).toBe(false);
    expect(result.large_deal_count_30d).toBe(0);
    expect(result.largest_deal_value_30d_bn_vnd).toBeNull();
  });

  it("returns false for empty rows", () => {
    const result = computeLargeDeals([]);
    expect(result.large_deals_30d).toBe(false);
    expect(result.large_deal_count_30d).toBe(0);
    expect(result.largest_deal_value_30d_bn_vnd).toBeNull();
  });

  it("excludes price=0 and vol=0 rows from large-deal detection", () => {
    const rows: InsiderTxRow[] = [
      { code: 'VNM', type: 'buy', executedVolume: 1_000_000, price: 0,       fromDate: daysAgo(5) },
      { code: 'VNM', type: 'buy', executedVolume: 0,         price: 100_000, fromDate: daysAgo(4) },
    ];
    const result = computeLargeDeals(rows);
    expect(result.large_deals_30d).toBe(false);
  });

  it("uses custom threshold correctly", () => {
    const rows: InsiderTxRow[] = [
      // 100_000 × 50_000 = 5_000_000_000 VND → LARGE vs 1B threshold, NOT large vs 10B
      { code: 'VNM', type: 'buy', executedVolume: 100_000, price: 50_000, fromDate: daysAgo(5) },
    ];
    const resultDefault = computeLargeDeals(rows);
    const resultLowThreshold = computeLargeDeals(rows, 1_000_000_000); // 1 Bn threshold
    expect(resultDefault.large_deals_30d).toBe(false);      // 5Bn < 10Bn threshold
    expect(resultLowThreshold.large_deals_30d).toBe(true);  // 5Bn > 1Bn threshold
  });

  it("DEFAULT_LARGE_DEAL_THRESHOLD_VND is 10 billion", () => {
    expect(DEFAULT_LARGE_DEAL_THRESHOLD_VND).toBe(10_000_000_000);
  });
});

// ---------------------------------------------------------------------------
// Infrastructure store tests
// ---------------------------------------------------------------------------

describe("Infrastructure: insiderSentimentStore", () => {
  let db: Database;

  beforeEach(() => {
    txCounter = 0;
    db = buildTestDb();
  });

  it("getInsiderTxForSentiment returns rows since sinceDate", () => {
    insertTx(db, { type: 'buy', executedVolume: 1_000, price: 50_000, fromDate: daysAgo(10) });
    insertTx(db, { type: 'sell', executedVolume: 500, price: 50_000, fromDate: daysAgo(200) });

    const since90 = new Date(TODAY_MS - 90 * 86_400_000).toISOString().slice(0, 10);
    const rows = getInsiderTxForSentiment(db, { sinceDate: since90 });
    // Only the row from 10 days ago should be returned
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('buy');
    expect(rows[0]!.executedVolume).toBe(1_000);
  });

  it("getInsiderTxForSentiment filters by codes", () => {
    insertTx(db, { code: 'VNM', type: 'buy',  executedVolume: 1_000, price: 50_000, fromDate: daysAgo(5) });
    insertTx(db, { code: 'FPT', type: 'sell', executedVolume: 2_000, price: 80_000, fromDate: daysAgo(5) });

    const since30 = new Date(TODAY_MS - 30 * 86_400_000).toISOString().slice(0, 10);
    const rows = getInsiderTxForSentiment(db, { codes: ['FPT'], sinceDate: since30 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.code).toBe('FPT');
  });

  it("getLatestMarketCapBn returns latest value for code", () => {
    insertMarketCap(db, 'VNM', 50_000, daysAgo(5));
    insertMarketCap(db, 'VNM', 55_000, daysAgo(1)); // newer row

    const cap = getLatestMarketCapBn(db, 'VNM');
    expect(cap).toBe(55_000); // should return the latest (date DESC)
  });

  it("getLatestMarketCapBn returns null for unknown code", () => {
    const cap = getLatestMarketCapBn(db, 'UNKNOWN');
    expect(cap).toBeNull();
  });

  it("getMarketCapBnBulk returns map with all requested codes", () => {
    insertMarketCap(db, 'VNM', 100, TODAY);
    insertMarketCap(db, 'FPT', 200, TODAY);

    const capMap = getMarketCapBnBulk(db, ['VNM', 'FPT', 'HPG']);
    expect(capMap.get('VNM')).toBe(100);
    expect(capMap.get('FPT')).toBe(200);
    expect(capMap.get('HPG')).toBeNull(); // no data for HPG → null
  });

  it("getWatchlistCodes returns codes from watchlist table", () => {
    insertWatchlist(db, ['VNM', 'FPT', 'VCB']);
    const codes = getWatchlistCodes(db);
    expect(codes).toHaveLength(3);
    expect(codes).toContain('VNM');
    expect(codes).toContain('FPT');
  });

  it("getWatchlistCodes returns empty array when watchlist is empty", () => {
    const codes = getWatchlistCodes(db);
    expect(codes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC-2 + AC-4: data_window_days + per-ticker signal
// ---------------------------------------------------------------------------

describe("AC-2 + AC-4: data_window_days included; per-ticker signal", () => {
  let db: Database;

  beforeEach(() => {
    txCounter = 0;
    db = buildTestDb();
  });

  it("includes data_window_days in every response", async () => {
    insertMarketCap(db, 'VNM', 100);
    const result = await getInsiderSentiment(db, 'VNM', TODAY_MS);
    expect(result.data_window_days).toBeDefined();
    expect(typeof result.data_window_days.d30).toBe('number');
    expect(typeof result.data_window_days.d90).toBe('number');
    expect(typeof result.data_window_days.d180).toBe('number');
  });

  it("data_window_days reflects actual distinct dates with valid buy/sell rows", async () => {
    insertMarketCap(db, 'VNM', 100);
    // Insert 3 buy rows across 2 distinct dates in last 30d
    insertTx(db, { code: 'VNM', type: 'buy', executedVolume: 1_000, price: 50_000, fromDate: daysAgo(5) });
    insertTx(db, { code: 'VNM', type: 'buy', executedVolume: 2_000, price: 50_000, fromDate: daysAgo(5) }); // same date
    insertTx(db, { code: 'VNM', type: 'buy', executedVolume: 1_000, price: 50_000, fromDate: daysAgo(10) });

    const result = await getInsiderSentiment(db, 'VNM', TODAY_MS);
    // 2 distinct dates in 30d (and same 2 in 90d and 180d)
    expect(result.data_window_days.d30).toBe(2);
    expect(result.data_window_days.d90).toBe(2);
    expect(result.data_window_days.d180).toBe(2);
  });

  it("per-ticker: returns code in response and scope='ticker'", async () => {
    insertMarketCap(db, 'FPT', 200);
    const result = await getInsiderSentiment(db, 'FPT', TODAY_MS);
    expect(result.scope).toBe('ticker');
    expect(result.code).toBe('FPT');
  });

  it("older rows (>180d) do not appear in any window", async () => {
    insertMarketCap(db, 'VNM', 100);
    insertTx(db, { code: 'VNM', type: 'buy', executedVolume: 1_000, price: 50_000, fromDate: daysAgo(181) });
    const result = await getInsiderSentiment(db, 'VNM', TODAY_MS);
    expect(result.data_window_days.d180).toBe(0);
    expect(result.net_buy_sell_180d_bn_vnd).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC-3: Market-wide aggregation
// ---------------------------------------------------------------------------

describe("AC-3: market-wide aggregation when code omitted", () => {
  let db: Database;

  beforeEach(() => {
    txCounter = 0;
    db = buildTestDb();
  });

  it("returns scope='market_wide' when code omitted", async () => {
    insertWatchlist(db, ['VNM', 'FPT']);
    insertMarketCap(db, 'VNM', 100);
    insertMarketCap(db, 'FPT', 200);

    const result = await getInsiderSentiment(db, undefined, TODAY_MS);
    expect(result.scope).toBe('market_wide');
    expect(result.code).toBeUndefined();
  });

  it("aggregates buy/sell across all watchlist tickers", async () => {
    insertWatchlist(db, ['VNM', 'FPT']);
    insertMarketCap(db, 'VNM', 100);
    insertMarketCap(db, 'FPT', 200);

    // VNM: 2_000 shares × 100_000 VND = 200_000_000 VND buy
    insertTx(db, { code: 'VNM', type: 'buy', executedVolume: 2_000, price: 100_000, fromDate: daysAgo(5) });
    // FPT: 1_000 shares × 80_000 VND = 80_000_000 VND buy
    insertTx(db, { code: 'FPT', type: 'buy', executedVolume: 1_000, price: 80_000, fromDate: daysAgo(3) });

    const result = await getInsiderSentiment(db, undefined, TODAY_MS);
    // Combined net = (200_000_000 + 80_000_000) / 1e9 = 0.28 Bn
    expect(result.net_buy_sell_30d_bn_vnd).toBeCloseTo(0.28, 4);
    expect(result.insider_label).toBe('ACCUMULATION'); // both positive
  });

  it("uses sum of market_cap_bn across watchlist for normalization", async () => {
    insertWatchlist(db, ['VNM', 'FPT']);
    insertMarketCap(db, 'VNM', 100); // 100 Bn
    insertMarketCap(db, 'FPT', 200); // 200 Bn → total = 300 Bn

    // net = 30 Bn for 90d window
    insertTx(db, { code: 'VNM', type: 'buy', executedVolume: 300_000_000, price: 100, fromDate: daysAgo(20) }); // 30 Bn

    const result = await getInsiderSentiment(db, undefined, TODAY_MS);
    // score = 30 / 300 = 0.1
    expect(result.net_sentiment_score).toBeCloseTo(0.1, 4);
  });

  it("returns NEUTRAL when watchlist table is empty", async () => {
    // No watchlist entries → no codes → empty transaction result
    const result = await getInsiderSentiment(db, undefined, TODAY_MS);
    expect(result.scope).toBe('market_wide');
    expect(result.insider_label).toBe('NEUTRAL');
    expect(result.net_buy_sell_90d_bn_vnd).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC-5 + AC-6: Normalization + normalization_basis always present
// ---------------------------------------------------------------------------

describe("AC-5 + AC-6: normalization_basis always present", () => {
  let db: Database;

  beforeEach(() => {
    txCounter = 0;
    db = buildTestDb();
  });

  it("normalization_basis='market_cap_proxy' in response with score", async () => {
    insertMarketCap(db, 'VNM', 100);
    insertTx(db, { code: 'VNM', type: 'buy', executedVolume: 1_000_000_000, price: 10, fromDate: daysAgo(20) });

    const result = await getInsiderSentiment(db, 'VNM', TODAY_MS);
    expect(result.normalization_basis).toBe('market_cap_proxy');
    expect(result.net_sentiment_score).not.toBeNull();
  });

  it("normalization_basis='market_cap_proxy' even when score is null", async () => {
    // No market_cap_bn → score null but normalization_basis must still be present
    insertTx(db, { code: 'VNM', type: 'buy', executedVolume: 1_000, price: 50_000, fromDate: daysAgo(20) });

    const result = await getInsiderSentiment(db, 'VNM', TODAY_MS);
    expect(result.normalization_basis).toBe('market_cap_proxy');
    expect(result.net_sentiment_score).toBeNull();
    expect(result.null_reason).toContain('MARKET_CAP_BN_UNAVAILABLE');
  });

  it("normalization_basis='market_cap_proxy' in empty-table response", async () => {
    const result = await getInsiderSentiment(db, 'VNM', TODAY_MS);
    expect(result.normalization_basis).toBe('market_cap_proxy');
  });
});

// ---------------------------------------------------------------------------
// Integration: getInsiderSentiment use case — full pipeline
// ---------------------------------------------------------------------------

describe("Integration: getInsiderSentiment full pipeline", () => {
  let db: Database;

  beforeEach(() => {
    txCounter = 0;
    db = buildTestDb();
  });

  it("30d window correctly includes only rows from last 30 days", async () => {
    insertMarketCap(db, 'VNM', 100);
    // Row in 30d window
    insertTx(db, { code: 'VNM', type: 'buy', executedVolume: 1_000, price: 50_000, fromDate: daysAgo(20) });
    // Row in 90d but not 30d window
    insertTx(db, { code: 'VNM', type: 'sell', executedVolume: 2_000, price: 50_000, fromDate: daysAgo(45) });

    const result = await getInsiderSentiment(db, 'VNM', TODAY_MS);
    // 30d net = 1_000 × 50_000 / 1e9 = 0.05 Bn
    expect(result.net_buy_sell_30d_bn_vnd).toBeCloseTo(0.05, 6);
    // 90d net = (1_000 × 50_000 - 2_000 × 50_000) / 1e9 = -0.05 Bn
    expect(result.net_buy_sell_90d_bn_vnd).toBeCloseTo(-0.05, 6);
  });

  it("DISTRIBUTION label: both 30d and 90d negative", async () => {
    insertMarketCap(db, 'VNM', 100);
    // Heavy selling in both windows
    insertTx(db, { code: 'VNM', type: 'sell', executedVolume: 100_000, price: 50_000, fromDate: daysAgo(10) });
    insertTx(db, { code: 'VNM', type: 'sell', executedVolume: 200_000, price: 50_000, fromDate: daysAgo(60) });

    const result = await getInsiderSentiment(db, 'VNM', TODAY_MS);
    expect(result.insider_label).toBe('DISTRIBUTION');
    expect(result.net_buy_sell_30d_bn_vnd!).toBeLessThan(0);
    expect(result.net_buy_sell_90d_bn_vnd!).toBeLessThan(0);
  });

  it("gauge-readiness: all 6-field contract fields present", async () => {
    insertMarketCap(db, 'VNM', 100);
    const result = await getInsiderSentiment(db, 'VNM', TODAY_MS);

    // 6-field contract
    expect('value' in result).toBe(true);
    expect(result.unit).toBe('score');
    expect(result.asof).toBe(TODAY);
    expect(result.source_tier).toBe(1);
    expect('confidence' in result).toBe(true);
    expect('null_reason' in result).toBe(true);
  });

  it("confidence=0.8 when score is non-null", async () => {
    insertMarketCap(db, 'VNM', 100);
    // 10 Bn buy
    insertTx(db, { code: 'VNM', type: 'buy', executedVolume: 100_000_000, price: 100, fromDate: daysAgo(20) });

    const result = await getInsiderSentiment(db, 'VNM', TODAY_MS);
    expect(result.net_sentiment_score).not.toBeNull();
    expect(result.confidence).toBe(0.8);
  });

  it("confidence=0.4 when 90d data exists but market_cap_bn is null", async () => {
    // No market cap inserted → market_cap_bn null
    insertTx(db, { code: 'VNM', type: 'buy', executedVolume: 1_000, price: 50_000, fromDate: daysAgo(20) });

    const result = await getInsiderSentiment(db, 'VNM', TODAY_MS);
    expect(result.net_sentiment_score).toBeNull();
    expect(result.confidence).toBe(0.4);
  });

  it("confidence=null when no 90d transactions", async () => {
    insertMarketCap(db, 'VNM', 100);
    // No transactions at all

    const result = await getInsiderSentiment(db, 'VNM', TODAY_MS);
    expect(result.confidence).toBeNull();
  });

  it("large deals correctly detected in 30d window only", async () => {
    insertMarketCap(db, 'VNM', 100);
    // 11 Bn deal in 30d window
    insertTx(db, { code: 'VNM', type: 'buy', executedVolume: 200_000, price: 55_000, fromDate: daysAgo(10) });
    // 11 Bn deal in 90d-30d window (should NOT count in large_deals_30d)
    insertTx(db, { code: 'VNM', type: 'buy', executedVolume: 200_000, price: 55_000, fromDate: daysAgo(60) });

    const result = await getInsiderSentiment(db, 'VNM', TODAY_MS);
    expect(result.large_deals_30d).toBe(true);
    expect(result.large_deal_count_30d).toBe(1); // only the 30d window deal
    expect(result.largest_deal_value_30d_bn_vnd).toBeCloseTo(11.0, 2);
  });
});

// ---------------------------------------------------------------------------
// AC-9: Tool returns {error:'...'} on DB failure
// ---------------------------------------------------------------------------

type ToolHandler = {
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
};
type ToolServer = { _registeredTools: Record<string, ToolHandler> };

describe("AC-9: tool returns {error:'...'} on DB failure (NFR-P05-3)", () => {
  it("returns {error:...} when DB is closed", async () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const brokenDb = new Database(":memory:");
    brokenDb.close();

    registerInsiderSentimentTools(server, brokenDb);

    const registry = (server as unknown as ToolServer)._registeredTools;
    const entry = registry["get_insider_sentiment"];
    expect(entry).toBeDefined();

    const result = await entry!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.error).toBeDefined();
    expect(typeof parsed.error).toBe("string");
    expect(parsed.error).toContain("unavailable");
  });
});
