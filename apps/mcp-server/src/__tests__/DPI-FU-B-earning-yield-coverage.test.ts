/**
 * DPI-FU-B — Market Earning Yield Coverage Fix Tests
 *
 * Covers the updated `computeAndStoreMarketEarningYield` use-case which:
 *   1. Uses reachableCount (tickers with ANY vnstock_financials row) as
 *      the coverage denominator — not the full watchlist size.
 *   2. Sends a WORK channel alert (fail-loud) when the job refuses due to
 *      coverage, instead of silently logging only to file.
 *
 * Root cause context:
 *   Watchlist expanded to 39 tickers; 12 new tickers have no vnstock API data
 *   (consistently returns null). Coverage = 27/39 = 69.2% < 70% threshold.
 *   With the fix, coverage = 27/27 = 100% (all reachable tickers have PE) →
 *   computation proceeds and rows are written to tracked_indicators.
 *
 * Tests:
 *   T1 — 27 reachable tickers (all with PE) out of 39 watchlist → STORED
 *        (proves the fix: 27/27=100% not 27/39=69.2%)
 *   T2 — 21 reachable tickers with PE out of 27 reachable → STORED (21/27=78%)
 *   T3 — reachable tickers with poor PE coverage → REFUSED + alert fired
 *   T4 — empty watchlist → returns early, no alert
 *   T5 — all watchlist tickers have financial data (original behavior preserved)
 *   T6 — fail-loud: refusal triggers Telegram alert
 *
 * @module __tests__/DPI-FU-B-earning-yield-coverage
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { computeAndStoreMarketEarningYield } from "../application/usecases/computeMarketEarningYield.js";

// ── DDL ────────────────────────────────────────────────────────────────────────

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS vnstock_financials (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT NOT NULL,
      pe           REAL,
      eps          REAL,
      year_report  INTEGER NOT NULL,
      quarter      INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS market_prices (
      code  TEXT PRIMARY KEY,
      price REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS tracked_indicators (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      indicator    TEXT NOT NULL,
      value        REAL NOT NULL,
      unit         TEXT NOT NULL DEFAULT '',
      source       TEXT NOT NULL DEFAULT '',
      extracted_at TEXT NOT NULL,
      hour_bucket  TEXT,
      UNIQUE(indicator, source, hour_bucket) ON CONFLICT REPLACE
    );
    CREATE TRIGGER IF NOT EXISTS trg_tracked_ind_hour_bucket
      AFTER INSERT ON tracked_indicators
      BEGIN
        UPDATE tracked_indicators
          SET hour_bucket = strftime('%Y-%m-%dT%H:00:00', NEW.extracted_at)
          WHERE id = NEW.id AND hour_bucket IS NULL;
      END;
  `);
  return db;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function addToWatchlist(db: Database, codes: string[]): void {
  const stmt = db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)");
  for (const c of codes) stmt.run(c);
}

function addFinancials(db: Database, code: string, pe: number | null, yr = 2025, q = 4): void {
  db.prepare(
    "INSERT INTO vnstock_financials (code, pe, eps, year_report, quarter) VALUES (?, ?, NULL, ?, ?)"
  ).run(code, pe, yr, q);
}

function countStoredRows(db: Database, indicator: string): number {
  return (
    db.prepare<{ cnt: number }, [string]>(
      "SELECT COUNT(*) AS cnt FROM tracked_indicators WHERE indicator = ?"
    ).get(indicator) ?? { cnt: 0 }
  ).cnt;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("DPI-FU-B — computeAndStoreMarketEarningYield: reachable-denominator coverage fix", () => {
  let db: Database;
  const alerts: string[] = [];
  let sendWorkFn: (msg: string) => Promise<unknown>;

  beforeEach(() => {
    db = buildDb();
    alerts.length = 0;
    sendWorkFn = async (msg: string) => { alerts.push(msg); };
  });

  afterEach(() => {
    db.close();
  });

  // T1: Production-scenario fix — 39 watchlist, 12 with no financials, 27 with PE
  it("T1: 39 watchlist / 12 unreachable / 27 with PE → STORED (fix: 27/27=100% not 27/39=69.2%)", async () => {
    // 39 watchlist tickers
    const allCodes = Array.from({ length: 39 }, (_, i) => `S${String(i).padStart(3, "0")}`);
    addToWatchlist(db, allCodes);

    // 12 tickers have NO financial data (unreachable — simulate new watchlist additions)
    // 27 tickers have financial data with valid PE
    const reachableCodes = allCodes.slice(0, 27);
    for (const code of reachableCodes) {
      addFinancials(db, code, 15.0);
    }

    const result = await computeAndStoreMarketEarningYield(db, sendWorkFn);

    // With fix: denominator = 27 (reachable), coverage = 27/27 = 100% → STORED
    expect(result.stored).toBe(true);
    expect(result.result).toBeDefined();
    expect(result.result?.coverageRatio).toBeCloseTo(1.0, 5); // 27/27
    expect(result.result?.medianPE).toBeCloseTo(15.0, 5);
    expect(result.result?.earningYield).toBeCloseTo((1 / 15.0) * 100, 5);

    // Rows written to tracked_indicators
    expect(countStoredRows(db, "market_earning_yield")).toBe(1);
    expect(countStoredRows(db, "market_median_pe")).toBe(1);

    // No refusal alert
    expect(alerts.length).toBe(0);
  });

  // T2: 27 reachable, 21 have valid PE (78%) → STORED
  it("T2: 27 reachable / 21 with valid PE (78%) → STORED", async () => {
    const allCodes = Array.from({ length: 39 }, (_, i) => `S${String(i).padStart(3, "0")}`);
    addToWatchlist(db, allCodes);

    // 27 reachable tickers
    const reachableCodes = allCodes.slice(0, 27);
    // 21 of 27 have valid PE (78% coverage over reachable set)
    for (let i = 0; i < 21; i++) addFinancials(db, reachableCodes[i]!, 12.0);
    // 6 reachable with NULL PE
    for (let i = 21; i < 27; i++) addFinancials(db, reachableCodes[i]!, null);

    const result = await computeAndStoreMarketEarningYield(db, sendWorkFn);

    expect(result.stored).toBe(true);
    expect(result.result?.coverageRatio).toBeCloseTo(21 / 27, 5);
    expect(countStoredRows(db, "market_earning_yield")).toBe(1);
  });

  // T3: reachable tickers with low PE coverage → REFUSED + alert
  it("T3: 27 reachable / 15 with valid PE (55%) → REFUSED + alert fired", async () => {
    const allCodes = Array.from({ length: 39 }, (_, i) => `S${String(i).padStart(3, "0")}`);
    addToWatchlist(db, allCodes);

    const reachableCodes = allCodes.slice(0, 27);
    // Only 15 of 27 reachable have valid PE (55.6% < 70%)
    for (let i = 0; i < 15; i++) addFinancials(db, reachableCodes[i]!, 14.0);
    for (let i = 15; i < 27; i++) addFinancials(db, reachableCodes[i]!, null);

    const result = await computeAndStoreMarketEarningYield(db, sendWorkFn);

    expect(result.stored).toBe(false);
    expect(result.refused).toBeDefined();
    expect(countStoredRows(db, "market_earning_yield")).toBe(0);

    // Fail-loud: alert must have been sent
    expect(alerts.length).toBe(1);
    expect(alerts[0]).toContain("DPI-FU-B");
    expect(alerts[0]).toContain("refused");
  });

  // T4: empty watchlist → early return, no alert
  it("T4: empty watchlist → returns stored=false, no alert", async () => {
    // No tickers added to watchlist

    const result = await computeAndStoreMarketEarningYield(db, sendWorkFn);

    expect(result.stored).toBe(false);
    expect(result.totalCount).toBe(0);
    expect(alerts.length).toBe(0);
  });

  // T5: all 30 watchlist tickers have data — original behavior preserved
  it("T5: all 30 watchlist tickers reachable with valid PE → STORED (backward compat)", async () => {
    const codes = Array.from({ length: 30 }, (_, i) => `T${String(i).padStart(3, "0")}`);
    addToWatchlist(db, codes);
    for (const code of codes) addFinancials(db, code, 20.0);

    const result = await computeAndStoreMarketEarningYield(db, sendWorkFn);

    expect(result.stored).toBe(true);
    expect(result.result?.coverageRatio).toBeCloseTo(1.0, 5); // 30/30
    expect(countStoredRows(db, "market_earning_yield")).toBe(1);
    expect(alerts.length).toBe(0);
  });

  // T6: fail-loud alert content check
  it("T6: refusal alert contains watchlist/reachable/valid PE counts", async () => {
    const allCodes = Array.from({ length: 39 }, (_, i) => `S${String(i).padStart(3, "0")}`);
    addToWatchlist(db, allCodes);

    // 27 reachable but only 10 with valid PE (37% of reachable < 70%)
    const reachableCodes = allCodes.slice(0, 27);
    for (let i = 0; i < 10; i++) addFinancials(db, reachableCodes[i]!, 13.0);
    for (let i = 10; i < 27; i++) addFinancials(db, reachableCodes[i]!, null);

    await computeAndStoreMarketEarningYield(db, sendWorkFn);

    expect(alerts.length).toBe(1);
    const msg = alerts[0]!;
    // Alert must mention watchlist count (39), reachable count (27), valid count (10)
    expect(msg).toContain("39");
    expect(msg).toContain("27");
    expect(msg).toContain("10");
    expect(msg).toContain("vnstock_financials");
  });

  // T7: totalCount=0 fallback when reachableCount=0 (safety guard)
  it("T7: no tickers have financials data → coverageDenominator falls back to totalCount", async () => {
    const allCodes = Array.from({ length: 5 }, (_, i) => `Z${i}`);
    addToWatchlist(db, allCodes);
    // No financial data for any ticker (all unreachable)

    const result = await computeAndStoreMarketEarningYield(db, sendWorkFn);

    // With 0 reachable, denominator = totalCount = 5, validCount = 0
    // 0/5 = 0% < 70% → refused
    expect(result.stored).toBe(false);
    expect(result.refused).toBeDefined();
    // No stored rows
    expect(countStoredRows(db, "market_earning_yield")).toBe(0);
  });
});
