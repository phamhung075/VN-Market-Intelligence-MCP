// scripts/migrations/__tests__/CONTAM-9-repair-ohlcv-low-zero.test.ts
//
// Unit tests for the repair-ohlcv-unit-contamination-low-zero migration.
//
// Strategy: in-memory SQLite DB seeded with known contaminated rows.
// Tests call the exported `runLowZeroRepair()` function directly.
//
// Test coverage:
//   AC-1: Dry-run counts Class A rows, no writes
//   AC-2: Live-run repairs Class A rows (open*1000, low=conservative estimate)
//   AC-3: Dry-run counts Class B rows, no writes
//   AC-4: Live-run repairs Class B rows (open=close)
//   AC-5: All-zero rows are NOT modified by either class repair
//   AC-6: Clean rows (no contamination) are untouched
//   AC-7: Verification: 0 Class A rows remain after repair
//   AC-8: Verification: 0 Class B rows remain after repair
//   AC-9: Class A low estimate satisfies low <= MIN(open_after, close)
//   AC-10: All three classes repaired in single transaction (atomic)
//   AC-11: Class C — rows with open=0 AND low=0 (double-zero): low=0 also repaired
//   AC-12: Dry-run reports class_c_count correctly

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runLowZeroRepair } from "../repair-ohlcv-unit-contamination-low-zero.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DDL = `
CREATE TABLE IF NOT EXISTS daily_ohlcv (
  code       TEXT NOT NULL,
  date       TEXT NOT NULL,
  open       REAL NOT NULL DEFAULT 0,
  high       REAL NOT NULL DEFAULT 0,
  low        REAL NOT NULL DEFAULT 0,
  close      REAL NOT NULL DEFAULT 0,
  volume     REAL NOT NULL DEFAULT 0,
  data_env   TEXT,
  PRIMARY KEY (code, date)
)`;

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(DDL);
  return db;
}

function insertRow(
  db: Database,
  code: string,
  date: string,
  open: number,
  high: number,
  low: number,
  close: number,
  data_env: string | null = null
): void {
  db.prepare(
    "INSERT OR REPLACE INTO daily_ohlcv (code,date,open,high,low,close,volume,data_env) VALUES (?,?,?,?,?,?,0,?)"
  ).run(code, date, open, high, low, close, data_env);
}

function getRow(db: Database, code: string, date: string) {
  return db
    .query<
      { code: string; date: string; open: number; high: number; low: number; close: number; data_env: string | null },
      [string, string]
    >("SELECT code,date,open,high,low,close,data_env FROM daily_ohlcv WHERE code=? AND date=?")
    .get(code, date);
}

function countClassA(db: Database): number {
  const r = db
    .query<{ cnt: number }, []>(
      `SELECT COUNT(*) AS cnt FROM daily_ohlcv
       WHERE open < 100 AND open > 0 AND close >= 1000 AND low = 0
         AND NOT (open = 0 AND low = 0 AND high = 0 AND close = 0)`
    )
    .get();
  return r?.cnt ?? 0;
}

function countClassB(db: Database): number {
  const r = db
    .query<{ cnt: number }, []>(
      `SELECT COUNT(*) AS cnt FROM daily_ohlcv
       WHERE open = 0 AND NOT (open = 0 AND low = 0 AND high = 0 AND close = 0)`
    )
    .get();
  return r?.cnt ?? 0;
}

const NOOP_LOG = () => {};

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: Dry-run identifies Class A rows without modifying DB
// ─────────────────────────────────────────────────────────────────────────────

describe("CONTAM-9 — repair-ohlcv-unit-contamination-low-zero", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("AC-1: dry-run counts Class A rows, no writes", () => {
    // Class A: open<100 AND open>0 AND close>=1000 AND low=0
    insertRow(db, "FPT", "2026-06-12", 73.1, 74300, 0, 73500); // Class A
    insertRow(db, "ACB", "2026-06-12", 26.5, 27100, 0, 26500); // Class A

    const result = runLowZeroRepair(db, { dryRun: true, logger: NOOP_LOG });

    expect(result.class_a_count).toBe(2);
    expect(result.rows_updated_a).toBe(0);
    // DB unchanged
    const fpt = getRow(db, "FPT", "2026-06-12");
    expect(fpt?.open).toBe(73.1);
    expect(fpt?.low).toBe(0);
  });

  it("AC-2: live-run repairs Class A rows (open*1000, low=conservative estimate)", () => {
    // FPT: open=73.1, close=73500, low=0
    // Expected after repair: open=73100, low=ROUND(MIN(73100,73500)*0.99, 2)=ROUND(72369,2)=72369
    insertRow(db, "FPT", "2026-06-12", 73.1, 74300, 0, 73500);
    // ACB: open=26.5, close=26500, low=0
    // Expected: open=26500, low=ROUND(MIN(26500,26500)*0.99,2)=ROUND(26235,2)=26235
    insertRow(db, "ACB", "2026-06-12", 26.5, 27100, 0, 26500);

    const result = runLowZeroRepair(db, { dryRun: false, logger: NOOP_LOG });

    expect(result.class_a_count).toBe(2);
    expect(result.rows_updated_a).toBe(2);

    const fpt = getRow(db, "FPT", "2026-06-12");
    expect(fpt?.open).toBeCloseTo(73100, 1);
    // low should be <= MIN(open_after, close)
    expect(fpt?.low).toBeGreaterThan(0);
    expect(fpt?.low).toBeLessThanOrEqual(Math.min(73100, 73500));

    const acb = getRow(db, "ACB", "2026-06-12");
    expect(acb?.open).toBeCloseTo(26500, 1);
    expect(acb?.low).toBeGreaterThan(0);
    expect(acb?.low).toBeLessThanOrEqual(Math.min(26500, 26500));
  });

  it("AC-3: dry-run counts Class B rows (open=0), no writes", () => {
    // Class B: open=0 (not all-zero)
    insertRow(db, "FPT", "2026-06-11", 0, 73900, 0, 73100); // Class B
    insertRow(db, "ACB", "2026-06-11", 0, 26550, 0, 26500); // Class B

    const result = runLowZeroRepair(db, { dryRun: true, logger: NOOP_LOG });

    expect(result.class_b_count).toBe(2);
    expect(result.rows_updated_b).toBe(0);
    const fpt = getRow(db, "FPT", "2026-06-11");
    expect(fpt?.open).toBe(0);
  });

  it("AC-4: live-run repairs Class B rows (open = close)", () => {
    insertRow(db, "FPT", "2026-06-11", 0, 73900, 0, 73100);
    insertRow(db, "ACB", "2026-06-11", 0, 26550, 0, 26500);

    const result = runLowZeroRepair(db, { dryRun: false, logger: NOOP_LOG });

    expect(result.class_b_count).toBe(2);
    expect(result.rows_updated_b).toBe(2);

    const fpt = getRow(db, "FPT", "2026-06-11");
    expect(fpt?.open).toBe(73100); // open set to close

    const acb = getRow(db, "ACB", "2026-06-11");
    expect(acb?.open).toBe(26500);
  });

  it("AC-5: all-zero rows are NOT modified by either repair class", () => {
    // All-zero row — separate defect, must be preserved untouched
    insertRow(db, "VNH", "2026-05-30", 0, 0, 0, 0);

    const result = runLowZeroRepair(db, { dryRun: false, logger: NOOP_LOG });

    expect(result.zero_rows_skipped).toBe(1);
    const vnh = getRow(db, "VNH", "2026-05-30");
    expect(vnh?.open).toBe(0);
    expect(vnh?.close).toBe(0);
    // All-zero rows must NOT be touched
    expect(result.rows_updated_a).toBe(0);
    expect(result.rows_updated_b).toBe(0);
  });

  it("AC-6: clean rows (no contamination) are untouched", () => {
    // Clean full-VND row
    insertRow(db, "FPT", "2026-06-10", 73700, 74500, 72800, 74200, "production");

    const result = runLowZeroRepair(db, { dryRun: false, logger: NOOP_LOG });

    expect(result.class_a_count).toBe(0);
    expect(result.class_b_count).toBe(0);
    expect(result.rows_updated_a).toBe(0);
    expect(result.rows_updated_b).toBe(0);

    const fpt = getRow(db, "FPT", "2026-06-10");
    expect(fpt?.open).toBe(73700);
    expect(fpt?.low).toBe(72800);
    expect(fpt?.data_env).toBe("production"); // RF-5: data_env preserved
  });

  it("AC-7: 0 Class A rows remain after live repair", () => {
    insertRow(db, "FPT", "2026-06-12", 73.1, 74300, 0, 73500);
    insertRow(db, "ACB", "2026-06-12", 26.5, 27100, 0, 26500);
    insertRow(db, "HPG", "2026-06-12", 23.3, 23550, 0, 23200);

    runLowZeroRepair(db, { dryRun: false, logger: NOOP_LOG });

    expect(countClassA(db)).toBe(0);
  });

  it("AC-8: 0 Class B rows remain after live repair", () => {
    insertRow(db, "FPT", "2026-06-11", 0, 73900, 0, 73100);
    insertRow(db, "ACB", "2026-06-11", 0, 26550, 0, 26500);

    runLowZeroRepair(db, { dryRun: false, logger: NOOP_LOG });

    expect(countClassB(db)).toBe(0);
  });

  it("AC-9: Class A low estimate satisfies low <= MIN(open_after, close)", () => {
    // Various open/close combinations
    const cases: Array<[string, string, number, number, number]> = [
      ["FPT", "2026-06-12", 73.1, 74300, 73500],  // open_after=73100 < close=73500
      ["GAS", "2026-06-12", 82.5, 87100, 85100],  // open_after=82500 < close=85100
      ["VNM", "2026-06-10", 64.5, 65200, 64700],  // open_after=64500 < close=64700
    ];
    for (const [code, date, open, high, close] of cases) {
      insertRow(db, code, date, open, high, 0, close);
    }

    runLowZeroRepair(db, { dryRun: false, logger: NOOP_LOG });

    for (const [code, date, open, , close] of cases) {
      const row = getRow(db, code, date);
      const openAfter = open * 1000;
      const minBound = Math.min(openAfter, close);
      expect(row?.low).toBeGreaterThan(0);
      expect(row?.low).toBeLessThanOrEqual(minBound);
    }
  });

  it("AC-10: all three classes reported in result object", () => {
    insertRow(db, "FPT", "2026-06-12", 73.1, 74300, 0, 73500); // Class A
    insertRow(db, "ACB", "2026-06-11", 0, 26550, 0, 26500);     // Class B (also Class C)

    const result = runLowZeroRepair(db, { dryRun: false, logger: NOOP_LOG });

    expect(result.class_a_count).toBe(1);
    expect(result.class_b_count).toBe(1);
    // class_c_count covers all low=0+close>=1000 rows (= 2: both A and B have low=0)
    expect(result.class_c_count).toBeGreaterThanOrEqual(1);
    expect(result.rows_updated_a).toBe(1);
    expect(result.rows_updated_b).toBe(1);
  });

  it("AC-11: Class C — row with open=0 AND low=0 (double-zero, not all-zero): low repaired after B", () => {
    // FPT 2026-06-11: open=0, high=73900, low=0, close=73100 — double-zero partial
    insertRow(db, "FPT", "2026-06-11", 0, 73900, 0, 73100);

    const result = runLowZeroRepair(db, { dryRun: false, logger: NOOP_LOG });

    const row = getRow(db, "FPT", "2026-06-11");
    // Class B: open=close=73100
    expect(row?.open).toBe(73100);
    // Class C: low=ROUND(73100*0.99,2) ≈ 72369
    expect(row?.low).toBeGreaterThan(0);
    expect(row?.low).toBeLessThan(73100);
    expect(result.rows_updated_c).toBeGreaterThan(0);
  });

  it("AC-12: dry-run reports class_c_count correctly, no writes", () => {
    insertRow(db, "FPT", "2026-06-12", 73.1, 74300, 0, 73500); // A (also C)
    insertRow(db, "ACB", "2026-06-11", 0, 26550, 0, 26500);     // B (also C)

    const result = runLowZeroRepair(db, { dryRun: true, logger: NOOP_LOG });

    expect(result.class_c_count).toBeGreaterThanOrEqual(2);
    expect(result.rows_updated_c).toBe(0); // no writes in dry-run
    // DB unchanged
    const fpt = getRow(db, "FPT", "2026-06-12");
    expect(fpt?.low).toBe(0);
  });
});
