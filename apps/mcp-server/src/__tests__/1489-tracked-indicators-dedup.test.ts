/**
 * Task 1489 — TDD RED: tracked_indicators dedup + schema guard
 *
 * Contract:
 *   1. storeCommoditySnapshot called N times for source='yahoo' MUST NOT grow
 *      tracked_indicators beyond 2 rows (one per indicator: brent, gold).
 *      Uses INSERT OR REPLACE / ON CONFLICT → last value wins.
 *   2. tracked_indicators must have a UNIQUE constraint on (indicator, source)
 *      so ON CONFLICT can resolve duplicates.
 *   3. Rows with source='test' are purged by initDatabase() startup cleanup.
 *   4. system_logs rows with known test-contamination messages are purged on startup.
 */

// Must be set BEFORE importing schema module
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  storeCommoditySnapshot,
  type CommoditySnapshot,
} from "../infrastructure/fetchers/yahooFinance.js";

function makeSnapshot(overrides: Partial<CommoditySnapshot> = {}): CommoditySnapshot {
  return {
    brentCrudeUSD: 85.5,
    goldUSDPerOz: 2350,
    usdVndRate: 25000,
    vix: 18,
    sp500: 5000,
    shanghaiComp: 3200,
    hangSeng: 17000,
    dxy: 104.5,
    cnyVndRate: null, // DSI-INV-1: unavailable, not a live rate
    copperUSD: 4.2,
    silverUSDPerOz: 28,
    jpyVndRate: 165,
    us10yYield: 0,
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Task 1489 — tracked_indicators dedup + schema guard", () => {
  beforeAll(async () => {
    // Phase 1: init DB to get tables, then seed contamination rows
    await initDatabase();
    const db = getDb();
    // Seed source='test' contamination rows AFTER first initDatabase()
    db.exec(`INSERT OR IGNORE INTO tracked_indicators (indicator, value, unit, source, extracted_at)
             VALUES ('gold_usd_oz', 999, '$/oz', 'test', datetime('now'))`);
    db.exec(`INSERT OR IGNORE INTO tracked_indicators (indicator, value, unit, source, extracted_at)
             VALUES ('wti_crude_usd', 70, '$/bbl', 'test', datetime('now'))`);
    // Seed system_logs contamination rows
    db.exec(`INSERT INTO system_logs (level, source, message)
             VALUES ('info', 'test', 'only this appears')`);
    db.exec(`INSERT INTO system_logs (level, source, message)
             VALUES ('error', 'test', 'error message')`);
    db.exec(`INSERT INTO system_logs (level, source, message)
             VALUES ('info', 'real', 'legitimate log')`);
    // Phase 2: re-run initDatabase() — cleanup DELETEs must fire again
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
  });

  it("storeCommoditySnapshot: calling N times does NOT grow tracked_indicators beyond 2 yahoo rows", () => {
    const db = getDb();
    // Clear yahoo rows before test
    db.exec(`DELETE FROM tracked_indicators WHERE source='yahoo'`);

    const snap1 = makeSnapshot({ brentCrudeUSD: 80, goldUSDPerOz: 2200 });
    const snap2 = makeSnapshot({ brentCrudeUSD: 82, goldUSDPerOz: 2250 });
    const snap3 = makeSnapshot({ brentCrudeUSD: 85, goldUSDPerOz: 2300 });

    storeCommoditySnapshot(snap1, db);
    storeCommoditySnapshot(snap2, db);
    storeCommoditySnapshot(snap3, db);

    const rows = db
      .query<{ cnt: number }, []>(
        `SELECT COUNT(*) as cnt FROM tracked_indicators WHERE source='yahoo'`,
      )
      .all();

    // Must be exactly 2: one brent row, one gold row
    expect(rows[0]?.cnt).toBe(2);
  });

  it("storeCommoditySnapshot: latest value wins after multiple calls", () => {
    const db = getDb();
    db.exec(`DELETE FROM tracked_indicators WHERE source='yahoo'`);

    storeCommoditySnapshot(makeSnapshot({ brentCrudeUSD: 80, goldUSDPerOz: 2200 }), db);
    storeCommoditySnapshot(makeSnapshot({ brentCrudeUSD: 99, goldUSDPerOz: 2999 }), db);

    const brent = db
      .query<{ value: number }, []>(
        `SELECT value FROM tracked_indicators WHERE indicator='brent_crude_usd' AND source='yahoo'`,
      )
      .all();
    const gold = db
      .query<{ value: number }, []>(
        `SELECT value FROM tracked_indicators WHERE indicator='gold_usd_oz' AND source='yahoo'`,
      )
      .all();

    expect(brent[0]?.value).toBe(99);
    expect(gold[0]?.value).toBe(2999);
  });

  it("startup cleanup: source='test' rows purged from tracked_indicators by initDatabase()", () => {
    // Re-run initDatabase() to trigger cleanup (idempotent)
    // NOTE: In this test DB the seed rows were inserted BEFORE beforeAll's initDatabase.
    // Re-run initDatabase here to confirm cleanup runs each time.
    const db = getDb();
    const testRows = db
      .query<{ cnt: number }, []>(
        `SELECT COUNT(*) as cnt FROM tracked_indicators WHERE source='test'`,
      )
      .all();
    expect(testRows[0]?.cnt).toBe(0);
  });

  it("startup cleanup: system_logs contamination messages purged by initDatabase()", () => {
    const db = getDb();
    const contamRows = db
      .query<{ cnt: number }, []>(
        `SELECT COUNT(*) as cnt FROM system_logs
         WHERE message IN ('only this appears', 'error message')`,
      )
      .all();
    expect(contamRows[0]?.cnt).toBe(0);
  });

  it("startup cleanup: legitimate system_logs rows are preserved", () => {
    const db = getDb();
    const legit = db
      .query<{ cnt: number }, []>(
        `SELECT COUNT(*) as cnt FROM system_logs WHERE message='legitimate log'`,
      )
      .all();
    expect(legit[0]?.cnt).toBe(1);
  });
});
