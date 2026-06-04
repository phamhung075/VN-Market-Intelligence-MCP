/**
 * Task 1497 — SBV rates fix: non-zero overnight/refinancing + 4 new schema columns
 *
 * Tests:
 *   SBV97-01: storeSbvRates writes non-zero overnight_rate_pct
 *   SBV97-02: storeSbvRates writes non-zero refinancing_rate_pct
 *   SBV97-03: discount_rate_pct column exists in sbv_rates
 *   SBV97-04: max_deposit_rate_pct column exists in sbv_rates
 *   SBV97-05: max_lending_rate_pct column exists in sbv_rates
 *   SBV97-06: interbank_overnight_pct column exists in sbv_rates
 *   SBV97-07: new columns stored and retrieved correctly
 *   SBV97-08: sbv_rates_history also has 4 new columns
 *   SBV97-09: SbvMacroSnapshot type has all 4 new fields
 *   SBV97-10: storeSbvSnapshot with new fields round-trips through history table
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  storeSbvSnapshot,
  type SbvMacroSnapshot,
} from "../infrastructure/fetchers/sbv.js";

// ---------------------------------------------------------------------------
// DB helpers — mirror schema.ts but with 4 new columns
// ---------------------------------------------------------------------------

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sbv_rates (
      source                TEXT PRIMARY KEY,
      overnight_rate_pct    REAL NOT NULL DEFAULT 0,
      refinancing_rate_pct  REAL NOT NULL DEFAULT 0,
      usd_vnd_official      REAL NOT NULL DEFAULT 0,
      discount_rate_pct     REAL NOT NULL DEFAULT 0,
      max_deposit_rate_pct  REAL NOT NULL DEFAULT 0,
      max_lending_rate_pct  REAL NOT NULL DEFAULT 0,
      interbank_overnight_pct REAL NOT NULL DEFAULT 0,
      fetched_at            TEXT NOT NULL,
      is_estimate           INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sbv_rates_history (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      source                TEXT NOT NULL,
      overnight_rate_pct    REAL NOT NULL DEFAULT 0,
      refinancing_rate_pct  REAL NOT NULL DEFAULT 0,
      usd_vnd_official      REAL NOT NULL DEFAULT 0,
      discount_rate_pct     REAL NOT NULL DEFAULT 0,
      max_deposit_rate_pct  REAL NOT NULL DEFAULT 0,
      max_lending_rate_pct  REAL NOT NULL DEFAULT 0,
      interbank_overnight_pct REAL NOT NULL DEFAULT 0,
      fetched_at            TEXT NOT NULL,
      is_estimate           INTEGER NOT NULL DEFAULT 1
    );
  `);
  return db;
}

let testDb: Database;

beforeEach(() => {
  testDb = setupTestDb();
});

afterEach(() => {
  testDb.close();
});

// ---------------------------------------------------------------------------
// Full snapshot fixture
// ---------------------------------------------------------------------------

const FULL_SNAPSHOT: SbvMacroSnapshot = {
  overnightRatePct: 3.0,
  refinancingRatePct: 4.5,
  usdVndOfficial: 26135,
  discountRatePct: 3.0,
  maxDepositRatePct: 5.0,
  maxLendingRatePct: 9.0,
  interbankOvernightPct: 4.2,
  fetchedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1497 — SBV rates fix: non-zero rates + 4 new schema columns", () => {

  // SBV97-01: overnight_rate_pct is non-zero
  it("SBV97-01: storeSbvSnapshot stores non-zero overnight_rate_pct", () => {
    storeSbvSnapshot(FULL_SNAPSHOT, testDb);
    const row = testDb
      .query<{ overnight_rate_pct: number }, []>(
        "SELECT overnight_rate_pct FROM sbv_rates WHERE source = 'sbv'"
      )
      .get();
    expect(row).not.toBeNull();
    expect(row!.overnight_rate_pct).toBeGreaterThan(0);
  });

  // SBV97-02: refinancing_rate_pct is non-zero
  it("SBV97-02: storeSbvSnapshot stores non-zero refinancing_rate_pct", () => {
    storeSbvSnapshot(FULL_SNAPSHOT, testDb);
    const row = testDb
      .query<{ refinancing_rate_pct: number }, []>(
        "SELECT refinancing_rate_pct FROM sbv_rates WHERE source = 'sbv'"
      )
      .get();
    expect(row).not.toBeNull();
    expect(row!.refinancing_rate_pct).toBeGreaterThan(0);
  });

  // SBV97-03: discount_rate_pct column exists
  it("SBV97-03: discount_rate_pct column exists in sbv_rates", () => {
    storeSbvSnapshot(FULL_SNAPSHOT, testDb);
    const row = testDb
      .query<{ discount_rate_pct: number }, []>(
        "SELECT discount_rate_pct FROM sbv_rates WHERE source = 'sbv'"
      )
      .get();
    expect(row).not.toBeNull();
    expect(typeof row!.discount_rate_pct).toBe("number");
  });

  // SBV97-04: max_deposit_rate_pct column exists
  it("SBV97-04: max_deposit_rate_pct column exists in sbv_rates", () => {
    storeSbvSnapshot(FULL_SNAPSHOT, testDb);
    const row = testDb
      .query<{ max_deposit_rate_pct: number }, []>(
        "SELECT max_deposit_rate_pct FROM sbv_rates WHERE source = 'sbv'"
      )
      .get();
    expect(row).not.toBeNull();
    expect(typeof row!.max_deposit_rate_pct).toBe("number");
  });

  // SBV97-05: max_lending_rate_pct column exists
  it("SBV97-05: max_lending_rate_pct column exists in sbv_rates", () => {
    storeSbvSnapshot(FULL_SNAPSHOT, testDb);
    const row = testDb
      .query<{ max_lending_rate_pct: number }, []>(
        "SELECT max_lending_rate_pct FROM sbv_rates WHERE source = 'sbv'"
      )
      .get();
    expect(row).not.toBeNull();
    expect(typeof row!.max_lending_rate_pct).toBe("number");
  });

  // SBV97-06: interbank_overnight_pct column exists
  it("SBV97-06: interbank_overnight_pct column exists in sbv_rates", () => {
    storeSbvSnapshot(FULL_SNAPSHOT, testDb);
    const row = testDb
      .query<{ interbank_overnight_pct: number }, []>(
        "SELECT interbank_overnight_pct FROM sbv_rates WHERE source = 'sbv'"
      )
      .get();
    expect(row).not.toBeNull();
    expect(typeof row!.interbank_overnight_pct).toBe("number");
  });

  // SBV97-07: all 4 new columns stored with correct values
  it("SBV97-07: all 4 new columns stored and retrieved correctly", () => {
    storeSbvSnapshot(FULL_SNAPSHOT, testDb);
    const row = testDb
      .query<{
        discount_rate_pct: number;
        max_deposit_rate_pct: number;
        max_lending_rate_pct: number;
        interbank_overnight_pct: number;
      }, []>(
        "SELECT discount_rate_pct, max_deposit_rate_pct, max_lending_rate_pct, interbank_overnight_pct FROM sbv_rates WHERE source = 'sbv'"
      )
      .get();
    expect(row).not.toBeNull();
    expect(row!.discount_rate_pct).toBe(3.0);
    expect(row!.max_deposit_rate_pct).toBe(5.0);
    expect(row!.max_lending_rate_pct).toBe(9.0);
    expect(row!.interbank_overnight_pct).toBe(4.2);
  });

  // SBV97-08: sbv_rates_history also has 4 new columns
  it("SBV97-08: sbv_rates_history stores 4 new columns per row", () => {
    const snap1 = { ...FULL_SNAPSHOT, fetchedAt: new Date(Date.now() - 7200_000).toISOString() };
    const snap2 = { ...FULL_SNAPSHOT, fetchedAt: new Date().toISOString() };
    storeSbvSnapshot(snap1, testDb);
    storeSbvSnapshot(snap2, testDb);

    const rows = testDb
      .query<{
        discount_rate_pct: number;
        max_deposit_rate_pct: number;
        max_lending_rate_pct: number;
        interbank_overnight_pct: number;
      }, []>(
        "SELECT discount_rate_pct, max_deposit_rate_pct, max_lending_rate_pct, interbank_overnight_pct FROM sbv_rates_history"
      )
      .all();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      expect(r.discount_rate_pct).toBe(3.0);
      expect(r.max_deposit_rate_pct).toBe(5.0);
      expect(r.max_lending_rate_pct).toBe(9.0);
      expect(r.interbank_overnight_pct).toBe(4.2);
    }
  });

  // SBV97-09: SbvMacroSnapshot type has all 4 new fields (compile-time + runtime check)
  it("SBV97-09: SbvMacroSnapshot snapshot object has all 4 new fields", () => {
    const snap: SbvMacroSnapshot = FULL_SNAPSHOT;
    expect(typeof snap.discountRatePct).toBe("number");
    expect(typeof snap.maxDepositRatePct).toBe("number");
    expect(typeof snap.maxLendingRatePct).toBe("number");
    expect(typeof snap.interbankOvernightPct).toBe("number");
  });

  // SBV97-10: storeSbvSnapshot with new fields round-trips via history
  it("SBV97-10: storeSbvSnapshot new fields survive upsert + history round-trip", () => {
    const snap1 = { ...FULL_SNAPSHOT, maxLendingRatePct: 8.5, fetchedAt: new Date(Date.now() - 7200_000).toISOString() };
    const snap2 = { ...FULL_SNAPSHOT, maxLendingRatePct: 9.5, fetchedAt: new Date().toISOString() };
    storeSbvSnapshot(snap1, testDb);
    storeSbvSnapshot(snap2, testDb);

    // Latest row in sbv_rates should have snap2 value
    const latest = testDb
      .query<{ max_lending_rate_pct: number }, []>(
        "SELECT max_lending_rate_pct FROM sbv_rates WHERE source = 'sbv'"
      )
      .get();
    expect(latest!.max_lending_rate_pct).toBe(9.5);

    // History should have snap1's value in some row
    const hist = testDb
      .query<{ max_lending_rate_pct: number }, []>(
        "SELECT max_lending_rate_pct FROM sbv_rates_history ORDER BY id ASC LIMIT 1"
      )
      .get();
    expect(hist!.max_lending_rate_pct).toBe(8.5);
  });
});
