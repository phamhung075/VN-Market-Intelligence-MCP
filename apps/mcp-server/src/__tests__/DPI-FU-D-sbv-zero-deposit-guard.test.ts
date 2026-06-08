/**
 * DPI-FU-D — SBV deposit-rate zero-overwrite guard
 *
 * Root cause: storeSbvSnapshot does an unconditional INSERT OR REPLACE.
 * When the fetcher returns max_deposit_rate_pct=0 (parse miss / upstream gap),
 * the good prior row (5.0) is silently overwritten with 0. DPI-2b then
 * safe-degrades to fixture 4.7, masking the clobber.
 *
 * Fix: storeSbvSnapshot must REJECT writes where any rate column that is
 * sentinel-for-missing (max_deposit_rate_pct, max_lending_rate_pct,
 * overnight_rate_pct, refinancing_rate_pct, usd_vnd_official) is ≤0,
 * when the table already holds a positive prior value for that column.
 *
 * Tests:
 *   DFD-01 (RED→GREEN): zero deposit-rate write is rejected — prior good row preserved
 *   DFD-02 (RED→GREEN): zero usd_vnd_official write is rejected — prior good row preserved
 *   DFD-03 (GREEN): positive deposit-rate write OVER positive prior row — accepted (normal upsert)
 *   DFD-04 (GREEN): first-ever write with deposit-rate=0 — accepted (no prior row to protect)
 *   DFD-05 (RED→GREEN): job-level: runSbvRatesRefreshJob sends WORK alert and skips store when snapshot has deposit_rate=0
 *   DFD-06 (GREEN): zero interbank_overnight_pct (may be legitimately zero) — write accepted regardless (NOT guarded)
 *   DFD-07 (RED→GREEN): zero overnight_rate_pct write is rejected — prior good row preserved
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  storeSbvSnapshot,
  type SbvMacroSnapshot,
} from "../infrastructure/fetchers/sbv.js";
import {
  runSbvRatesRefreshJob,
  type SbvRatesRefreshOptions,
} from "../scheduler/macro/sbvRatesJob.js";

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sbv_rates (
      source                  TEXT PRIMARY KEY,
      overnight_rate_pct      REAL NOT NULL DEFAULT 0,
      refinancing_rate_pct    REAL NOT NULL DEFAULT 0,
      usd_vnd_official        REAL NOT NULL DEFAULT 0,
      discount_rate_pct       REAL NOT NULL DEFAULT 0,
      max_deposit_rate_pct    REAL NOT NULL DEFAULT 0,
      max_lending_rate_pct    REAL NOT NULL DEFAULT 0,
      interbank_overnight_pct REAL NOT NULL DEFAULT 0,
      fetched_at              TEXT NOT NULL,
      is_estimate             INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sbv_rates_history (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      source                  TEXT NOT NULL,
      overnight_rate_pct      REAL NOT NULL DEFAULT 0,
      refinancing_rate_pct    REAL NOT NULL DEFAULT 0,
      usd_vnd_official        REAL NOT NULL DEFAULT 0,
      discount_rate_pct       REAL NOT NULL DEFAULT 0,
      max_deposit_rate_pct    REAL NOT NULL DEFAULT 0,
      max_lending_rate_pct    REAL NOT NULL DEFAULT 0,
      interbank_overnight_pct REAL NOT NULL DEFAULT 0,
      fetched_at              TEXT NOT NULL,
      is_estimate             INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_sbv_history_source_time
      ON sbv_rates_history(source, fetched_at DESC);
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

let testDb: Database;

beforeEach(() => { testDb = setupTestDb(); });
afterEach(() => { testDb.close(); });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GOOD_SNAPSHOT: SbvMacroSnapshot = {
  overnightRatePct: 3.0,
  refinancingRatePct: 4.5,
  usdVndOfficial: 26115,
  discountRatePct: 1.5,
  maxDepositRatePct: 5.0,
  maxLendingRatePct: 12.0,
  interbankOvernightPct: 4.0,
  fetchedAt: "2026-05-29T23:15:00.000Z",
};

/** Snapshot that simulates a parse-miss run: deposit-rate and FX came back 0 */
const ZERO_DEPOSIT_SNAPSHOT: SbvMacroSnapshot = {
  overnightRatePct: 3.0,
  refinancingRatePct: 4.5,
  usdVndOfficial: 26115,   // FX still valid
  discountRatePct: 1.5,
  maxDepositRatePct: 0,    // parse miss — sentinel-for-missing
  maxLendingRatePct: 12.0,
  interbankOvernightPct: 4.0,
  fetchedAt: "2026-05-30T08:36:00.000Z",
};

/** Snapshot with FX=0 (e.g. VCB unreachable) but deposit-rate valid */
const ZERO_FX_SNAPSHOT: SbvMacroSnapshot = {
  overnightRatePct: 3.0,
  refinancingRatePct: 4.5,
  usdVndOfficial: 0,       // VCB unreachable — sentinel-for-missing
  discountRatePct: 1.5,
  maxDepositRatePct: 5.0,
  maxLendingRatePct: 12.0,
  interbankOvernightPct: 4.0,
  fetchedAt: "2026-05-30T08:36:00.000Z",
};

/** Snapshot with overnight_rate=0 */
const ZERO_OVERNIGHT_SNAPSHOT: SbvMacroSnapshot = {
  overnightRatePct: 0,     // parse miss
  refinancingRatePct: 4.5,
  usdVndOfficial: 26115,
  discountRatePct: 1.5,
  maxDepositRatePct: 5.0,
  maxLendingRatePct: 12.0,
  interbankOvernightPct: 4.0,
  fetchedAt: "2026-05-30T08:36:00.000Z",
};

/** First-ever write with deposit-rate=0 (no prior row) */
const FIRST_ZERO_DEPOSIT_SNAPSHOT: SbvMacroSnapshot = {
  overnightRatePct: 3.0,
  refinancingRatePct: 4.5,
  usdVndOfficial: 26115,
  discountRatePct: 1.5,
  maxDepositRatePct: 0,
  maxLendingRatePct: 12.0,
  interbankOvernightPct: 0,   // interbank can legitimately be 0
  fetchedAt: "2026-05-30T08:36:00.000Z",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DPI-FU-D — SBV deposit-rate zero-overwrite guard", () => {

  // DFD-01: zero deposit-rate write REJECTED when prior good row exists
  it("DFD-01: storeSbvSnapshot REJECTS zero max_deposit_rate_pct over a good prior row", () => {
    // Seed the good row
    storeSbvSnapshot(GOOD_SNAPSHOT, testDb);

    // Attempt zero-overwrite
    storeSbvSnapshot(ZERO_DEPOSIT_SNAPSHOT, testDb);

    // Prior good row must be preserved
    const row = testDb
      .query<{ max_deposit_rate_pct: number; fetched_at: string }, []>(
        "SELECT max_deposit_rate_pct, fetched_at FROM sbv_rates WHERE source = 'sbv'"
      )
      .get();

    expect(row).not.toBeNull();
    expect(row!.max_deposit_rate_pct).toBe(5.0);
    expect(row!.fetched_at).toBe("2026-05-29T23:15:00.000Z"); // original, not the zero-write
  });

  // DFD-02: zero usd_vnd_official write REJECTED when prior good row exists
  it("DFD-02: storeSbvSnapshot REJECTS zero usd_vnd_official over a good prior row", () => {
    storeSbvSnapshot(GOOD_SNAPSHOT, testDb);
    storeSbvSnapshot(ZERO_FX_SNAPSHOT, testDb);

    const row = testDb
      .query<{ usd_vnd_official: number; fetched_at: string }, []>(
        "SELECT usd_vnd_official, fetched_at FROM sbv_rates WHERE source = 'sbv'"
      )
      .get();

    expect(row).not.toBeNull();
    expect(row!.usd_vnd_official).toBe(26115); // prior good value preserved
    expect(row!.fetched_at).toBe("2026-05-29T23:15:00.000Z");
  });

  // DFD-03: positive write OVER positive prior row — normal upsert, accepted
  it("DFD-03: storeSbvSnapshot accepts a positive deposit-rate write over a prior positive row", () => {
    storeSbvSnapshot(GOOD_SNAPSHOT, testDb);

    const newGood: SbvMacroSnapshot = {
      ...GOOD_SNAPSHOT,
      maxDepositRatePct: 5.5, // updated rate
      fetchedAt: "2026-05-30T12:00:00.000Z",
    };
    storeSbvSnapshot(newGood, testDb);

    const row = testDb
      .query<{ max_deposit_rate_pct: number }, []>(
        "SELECT max_deposit_rate_pct FROM sbv_rates WHERE source = 'sbv'"
      )
      .get();

    expect(row).not.toBeNull();
    expect(row!.max_deposit_rate_pct).toBe(5.5); // updated
  });

  // DFD-04: first-ever write with deposit-rate=0 — no prior row to protect, accepted
  it("DFD-04: storeSbvSnapshot accepts a zero deposit-rate write when no prior row exists", () => {
    // No seed row — empty DB
    storeSbvSnapshot(FIRST_ZERO_DEPOSIT_SNAPSHOT, testDb);

    const row = testDb
      .query<{ max_deposit_rate_pct: number }, []>(
        "SELECT max_deposit_rate_pct FROM sbv_rates WHERE source = 'sbv'"
      )
      .get();

    // Written (no prior good row to protect)
    expect(row).not.toBeNull();
    expect(row!.max_deposit_rate_pct).toBe(0);
  });

  // DFD-05: job-level guard — runSbvRatesRefreshJob sends WORK alert when deposit-rate=0
  it("DFD-05: runSbvRatesRefreshJob sends WORK alert and returns skipped=true when snapshot has deposit-rate=0", async () => {
    const workMessages: string[] = [];
    let storeCalled = false;

    const opts: SbvRatesRefreshOptions = {
      fetchFn: async () => ({ ...ZERO_DEPOSIT_SNAPSHOT }),
      storeFn: (snap) => {
        storeCalled = true;
        storeSbvSnapshot(snap, testDb);
      },
      sendWorkFn: async (msg: string) => { workMessages.push(msg); },
    };

    const result = await runSbvRatesRefreshJob(opts);

    // Must alert WORK channel
    expect(workMessages.length).toBeGreaterThan(0);
    const alertText = workMessages[0]!;
    expect(alertText.toLowerCase()).toContain("deposit");

    // Must report the skipped write
    expect(result.zeroRateSkipped).toBe(true);
  });

  // DFD-06: interbank_overnight_pct=0 is NOT guarded (may legitimately be 0)
  it("DFD-06: storeSbvSnapshot accepts zero interbank_overnight_pct (not a sentinel-for-missing rate)", () => {
    storeSbvSnapshot(GOOD_SNAPSHOT, testDb);

    const withZeroInterbank: SbvMacroSnapshot = {
      ...GOOD_SNAPSHOT,
      interbankOvernightPct: 0, // legitimately 0 on holiday / market close
      fetchedAt: "2026-05-30T12:00:00.000Z",
    };
    storeSbvSnapshot(withZeroInterbank, testDb);

    const row = testDb
      .query<{ interbank_overnight_pct: number }, []>(
        "SELECT interbank_overnight_pct FROM sbv_rates WHERE source = 'sbv'"
      )
      .get();

    expect(row).not.toBeNull();
    expect(row!.interbank_overnight_pct).toBe(0); // accepted
  });

  // DFD-07: zero overnight_rate_pct write REJECTED when prior good row exists
  it("DFD-07: storeSbvSnapshot REJECTS zero overnight_rate_pct over a good prior row", () => {
    storeSbvSnapshot(GOOD_SNAPSHOT, testDb);
    storeSbvSnapshot(ZERO_OVERNIGHT_SNAPSHOT, testDb);

    const row = testDb
      .query<{ overnight_rate_pct: number }, []>(
        "SELECT overnight_rate_pct FROM sbv_rates WHERE source = 'sbv'"
      )
      .get();

    expect(row).not.toBeNull();
    expect(row!.overnight_rate_pct).toBe(3.0); // prior preserved
  });
});
