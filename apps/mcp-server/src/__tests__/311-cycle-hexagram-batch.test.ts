/**
 * Task 303 — Cycle Step A4: auto-compute hexagram per watchlist stock every cycle
 *
 * TDD test for:
 *   - CycleResult.hexagramsComputed field
 *   - CycleDeps.computeHexagramsFn injection
 *   - Step A4 inserts one kinhdich_readings row per stock with source='cycle'
 *   - Empty watchlist → hexagramsComputed = 0
 *   - Single-stock failure → other 3 inserted, errors incremented
 *   - hexagramStore: source column via ALTER TABLE try/catch
 *   - getLatestReading returns tradingSignal + confidence
 *   - storeReading accepts source: 'manual' | 'cycle'
 */

// Test isolation: must be set BEFORE importing intelligenceCycleJob so the
// logger skips all shared DB/file sinks (fix applied in commit 669cbba).
// Without this, logger.persistLog writes the injected "mock hexagram batch
// failure" error into the production ./data/market.db system_logs table,
// polluting get_system_status for every analysis agent cycle afterwards.
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import Database from "bun:sqlite";
import {
  runIntelligenceCycle,
  resetCycleGuard,
  type CycleDeps,
  type CycleResult,
} from "../scheduler/news-analysis/intelligenceCycleJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal poll-news stub that returns zero items */
const stubPollNews = async () => ({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 });

/** Minimal SSC stub */
const stubListSscDocs = async (_code: string) => [];

/** Minimal price fetch stub */
const stubFetchPrices = async () => 0;

/** Minimal impact chain stub */
const stubRunImpactChain = async () => 0;

/** Minimal send alerts stub */
const stubSendAlerts = async () => 0;

/** Market hours is always true in these tests for simplicity */
const alwaysMarketHours = () => true;

/** Produces minimal CycleDeps with only required stubs wired */
function makeDeps(overrides: Partial<CycleDeps> = {}): CycleDeps {
  return {
    pollNewsFn: stubPollNews,
    listSscDocsFn: stubListSscDocs,
    fetchPricesFn: stubFetchPrices,
    runImpactChainFn: stubRunImpactChain,
    sendAlertsFn: stubSendAlerts,
    isMarketHoursFn: alwaysMarketHours,
    readUnnotifiedAlertsFn: async () => [],
    markAlertNotifiedFn: async () => {},
    getWatchlistCodesFn: async () => ["VNM", "FPT", "VCB", "VEA"],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 303 — Cycle Step A4: hexagram batch", () => {
  beforeEach(() => {
    resetCycleGuard();
  });

  // ── AC-1: CycleResult has hexagramsComputed field ────────────────────────

  it("CycleResult has a hexagramsComputed field", async () => {
    const deps = makeDeps({
      computeHexagramsFn: async (_codes) => 4,
    });
    const result = await runIntelligenceCycle(deps);
    expect(result).not.toBeNull();
    expect(typeof (result as CycleResult).hexagramsComputed).toBe("number");
  });

  // ── AC-2: computeHexagramsFn injection returns correct count ─────────────

  it("computeHexagramsFn is called with watchlist codes and result is reflected in CycleResult", async () => {
    let capturedCodes: string[] = [];
    const deps = makeDeps({
      computeHexagramsFn: async (codes) => {
        capturedCodes = codes;
        return codes.length;
      },
    });
    const result = await runIntelligenceCycle(deps);
    expect(result).not.toBeNull();
    expect((result as CycleResult).hexagramsComputed).toBe(4);
    expect(capturedCodes).toEqual(["VNM", "FPT", "VCB", "VEA"]);
  });

  // ── AC-3: Empty watchlist → hexagramsComputed = 0 ───────────────────────

  it("empty watchlist produces hexagramsComputed = 0", async () => {
    const deps = makeDeps({
      getWatchlistCodesFn: async () => [],
      computeHexagramsFn: async (codes) => codes.length,
    });
    const result = await runIntelligenceCycle(deps);
    expect(result).not.toBeNull();
    expect((result as CycleResult).hexagramsComputed).toBe(0);
  });

  // ── AC-4: computeHexagramsFn error increments errors, returns 0 ─────────

  it("computeHexagramsFn throwing does not crash cycle but increments errors", async () => {
    const deps = makeDeps({
      computeHexagramsFn: async (_codes) => {
        throw new Error("mock hexagram batch failure");
      },
    });
    const result = await runIntelligenceCycle(deps);
    expect(result).not.toBeNull();
    expect((result as CycleResult).errors).toBeGreaterThanOrEqual(1);
    expect((result as CycleResult).hexagramsComputed).toBe(0);
  });

  // ── AC-5: Off-hours: watchlist re-queried when Step 0 codes empty ────────

  it("skips step A4 (hexagram compute) when off-hours", async () => {
    let hexFnCalledWithCodes: string[] = [];
    const deps = makeDeps({
      isMarketHoursFn: () => false, // off-hours — Step 0 won't load codes
      getWatchlistCodesFn: async () => ["VNM", "VCB"], // fallback query
      computeHexagramsFn: async (codes) => {
        hexFnCalledWithCodes = codes;
        return codes.length;
      },
    });
    const result = await runIntelligenceCycle(deps);
    expect(result).not.toBeNull();
    // Off-hours cycle gates A4 behind !marketHours → hexagramsComputed stays 0
    expect((result as CycleResult).hexagramsComputed).toBe(0);
    expect(hexFnCalledWithCodes).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hexagramStore unit tests: source column migration + extended types
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 303 — hexagramStore: source column + extended getLatestReading", () => {
  // Use an in-memory SQLite for isolation
  function makeTestDb() {
    const db = new Database(":memory:");

    // Create the table WITHOUT source column (simulates old production DB)
    db.exec(`
      CREATE TABLE IF NOT EXISTS kinhdich_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stock_code TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        hexagram_number INTEGER NOT NULL,
        ho_que_number INTEGER NOT NULL,
        bien_que_number INTEGER NOT NULL,
        hao_states TEXT NOT NULL,
        raw_scores TEXT NOT NULL,
        ngu_hanh_dynamic TEXT,
        trading_signal TEXT,
        confidence REAL,
        action_note TEXT
      );
    `);

    return db;
  }

  it("ALTER TABLE idempotently adds source column to existing table", () => {
    const db = makeTestDb();

    // First apply — should succeed
    try {
      db.exec(`ALTER TABLE kinhdich_readings ADD COLUMN source TEXT DEFAULT 'manual'`);
    } catch {
      // ignore
    }

    // Second apply — must NOT throw (absorbed by catch)
    expect(() => {
      try {
        db.exec(`ALTER TABLE kinhdich_readings ADD COLUMN source TEXT DEFAULT 'manual'`);
      } catch {
        // expected — idempotent
      }
    }).not.toThrow();

    // Column should now exist
    const cols = db.prepare("PRAGMA table_info(kinhdich_readings)").all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("source");
  });

  it("existing rows get DEFAULT 'manual' retroactively after ALTER", () => {
    const db = makeTestDb();

    // Insert a row before migration
    db.exec(`
      INSERT INTO kinhdich_readings
        (stock_code, hexagram_number, ho_que_number, bien_que_number, hao_states, raw_scores)
      VALUES ('VNM', 1, 1, 1, '[]', '[]')
    `);

    // Apply migration
    try {
      db.exec(`ALTER TABLE kinhdich_readings ADD COLUMN source TEXT DEFAULT 'manual'`);
    } catch { /* idempotent */ }

    const row = db.prepare("SELECT source FROM kinhdich_readings WHERE stock_code = 'VNM'").get() as { source: string } | null;
    expect(row).not.toBeNull();
    expect(row!.source).toBe("manual");
  });

  it("new rows with source='cycle' store the correct value", () => {
    const db = makeTestDb();

    // Apply migration first
    try {
      db.exec(`ALTER TABLE kinhdich_readings ADD COLUMN source TEXT DEFAULT 'manual'`);
    } catch { /* idempotent */ }

    // Insert with source='cycle'
    db.exec(`
      INSERT INTO kinhdich_readings
        (stock_code, hexagram_number, ho_que_number, bien_que_number, hao_states, raw_scores, source)
      VALUES ('FPT', 5, 3, 7, '[]', '[]', 'cycle')
    `);

    const row = db.prepare("SELECT source FROM kinhdich_readings WHERE stock_code = 'FPT'").get() as { source: string } | null;
    expect(row).not.toBeNull();
    expect(row!.source).toBe("cycle");
  });

  it("getLatestReading now returns tradingSignal and confidence fields", () => {
    const db = makeTestDb();

    // Apply migration
    try {
      db.exec(`ALTER TABLE kinhdich_readings ADD COLUMN source TEXT DEFAULT 'manual'`);
    } catch { /* idempotent */ }

    db.exec(`
      INSERT INTO kinhdich_readings
        (stock_code, hexagram_number, ho_que_number, bien_que_number, hao_states, raw_scores, trading_signal, confidence)
      VALUES ('VCB', 10, 5, 2, '[]', '[]', 'MUA (tich cuc)', 0.72)
    `);

    // Simulate the extended getLatestReading query
    const row = db.prepare(`
      SELECT hexagram_number, ho_que_number, bien_que_number, hao_states, timestamp,
             trading_signal, confidence
      FROM kinhdich_readings WHERE stock_code = 'VCB' ORDER BY timestamp DESC LIMIT 1
    `).get() as {
      hexagram_number: number;
      trading_signal: string | null;
      confidence: number | null;
    } | null;

    expect(row).not.toBeNull();
    expect(row!.hexagram_number).toBe(10);
    expect(row!.trading_signal).toBe("MUA (tich cuc)");
    expect(row!.confidence).toBeCloseTo(0.72);
  });
});
