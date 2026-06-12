// scripts/migrations/__tests__/CONTAM-6-repair-ohlcv-unit-contamination.test.ts
//
// Integration tests for the repair-ohlcv-unit-contamination migration.
//
// Strategy: in-memory SQLite DB seeded with known contaminated rows.
// Tests call the exported `runRepair()` function directly (no CLI subprocess).
// All assertions verify the SQL repair logic matches the CONTAM-6 spec.
//
// Binding amendment: all-zero rows (open=0,low=0,high=0,close=0) must be
// skipped (logged, not updated). Verified in AC-3.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runRepair, type RepairResult, type RepairOptions } from "../repair-ohlcv-unit-contamination.js";

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
    .query<{ code: string; date: string; open: number; high: number; low: number; close: number; data_env: string | null }, [string, string]>(
      "SELECT code,date,open,high,low,close,data_env FROM daily_ohlcv WHERE code=? AND date=?"
    )
    .get(code, date);
}

function countContaminated(db: Database): number {
  const r = db
    .query<{ cnt: number }, []>(
      `SELECT COUNT(*) AS cnt FROM daily_ohlcv
       WHERE (open < 100 OR low < 100)
         AND close > 1000
         AND open > 0
         AND low > 0
         AND NOT (open = 0 AND low = 0 AND high = 0 AND close = 0)`
    )
    .get();
  return r?.cnt ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: Dry-run identifies contaminated rows without modifying DB
// ─────────────────────────────────────────────────────────────────────────────

describe("CONTAM-6 — repair-ohlcv-unit-contamination", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  it("AC-1a: dry-run returns correct count for 5 contaminated rows", () => {
    // Seed 5 contaminated rows: open/low in thousand-VND, close in full-VND
    insertRow(db, "VNH", "2026-05-19", 0.9, 1000.0, 0.9, 1001.0);
    insertRow(db, "FPT", "2026-05-20", 74.5, 75300.0, 73.8, 73601.0);
    insertRow(db, "TRA", "2026-05-22", 79.0, 80000.0, 79.0, 79001.0);
    insertRow(db, "PVI", "2026-05-18", 79.3, 81900.0, 79.3, 81001.0);
    insertRow(db, "HBC", "2026-05-18", 5.1, 5200.0, 5.1, 5201.0);

    const result: RepairResult = runRepair(db, { dryRun: true });

    expect(result.contaminated_count).toBe(5);
    expect(result.rows_updated).toBe(0); // dry-run = no writes
    expect(result.sample_before.length).toBeGreaterThan(0);
  });

  it("AC-1b: dry-run does NOT modify DB values", () => {
    insertRow(db, "VNH", "2026-05-19", 0.9, 1000.0, 0.9, 1001.0);
    runRepair(db, { dryRun: true });

    const row = getRow(db, "VNH", "2026-05-19");
    expect(row?.open).toBe(0.9); // unchanged
    expect(row?.low).toBe(0.9);  // unchanged
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-2: Live-run updates contaminated rows (open*1000, low*1000)
  // ─────────────────────────────────────────────────────────────────────────

  it("AC-2a: live-run normalizes 10 contaminated rows", () => {
    for (let i = 0; i < 10; i++) {
      insertRow(db, "TEST", `2026-05-${String(18 + i).padStart(2, "0")}`, 15.0, 15500.0, 14.8, 15501.0);
    }
    // also add one of the sample tickers so post-verify returns rows
    insertRow(db, "VNH", "2026-05-19", 0.9, 1000.0, 0.9, 1001.0);
    expect(countContaminated(db)).toBe(11);

    const result = runRepair(db, { dryRun: false });

    expect(result.rows_updated).toBe(11);
    expect(result.contaminated_count).toBe(11);
    expect(result.sample_after.length).toBeGreaterThan(0); // VNH should appear
  });

  it("AC-2b: live-run multiplies open and low by 1000", () => {
    insertRow(db, "VNH", "2026-05-19", 0.9, 1000.0, 0.9, 1001.0);
    runRepair(db, { dryRun: false });

    const row = getRow(db, "VNH", "2026-05-19");
    expect(row?.open).toBeCloseTo(900.0, 1);
    expect(row?.low).toBeCloseTo(900.0, 1);
    expect(row?.high).toBe(1000.0); // unchanged
    expect(row?.close).toBe(1001.0); // unchanged
  });

  it("AC-2c: live-run preserves data_env column (RF-5)", () => {
    insertRow(db, "PVI", "2026-05-18", 79.3, 81900.0, 79.3, 81001.0, "production");
    runRepair(db, { dryRun: false });

    const row = getRow(db, "PVI", "2026-05-18");
    expect(row?.data_env).toBe("production"); // must not be wiped
  });

  it("AC-2d: live-run does not touch high or close", () => {
    insertRow(db, "TRA", "2026-05-22", 79.0, 80000.0, 79.0, 79001.0);
    runRepair(db, { dryRun: false });

    const row = getRow(db, "TRA", "2026-05-22");
    expect(row?.high).toBe(80000.0);
    expect(row?.close).toBe(79001.0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-3: All-zero rows are skipped (binding amendment)
  // ─────────────────────────────────────────────────────────────────────────

  it("AC-3a: all-zero rows are NOT counted as contaminated", () => {
    // genuine contaminated row
    insertRow(db, "VNH", "2026-05-19", 0.9, 1000.0, 0.9, 1001.0);
    // all-zero row (2026-05-30T11:47Z bulk zeros — separate defect, out of scope)
    insertRow(db, "XYZ", "2026-05-30", 0.0, 0.0, 0.0, 0.0);

    const result = runRepair(db, { dryRun: true });

    expect(result.contaminated_count).toBe(1); // only VNH
    expect(result.zero_rows_skipped).toBeGreaterThanOrEqual(1);
  });

  it("AC-3b: live-run does not update all-zero rows", () => {
    insertRow(db, "XYZ", "2026-05-30", 0.0, 0.0, 0.0, 0.0);
    runRepair(db, { dryRun: false });

    const row = getRow(db, "XYZ", "2026-05-30");
    expect(row?.open).toBe(0.0); // unchanged
    expect(row?.low).toBe(0.0);  // unchanged
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-4: Post-update verification — no contamination remains
  // ─────────────────────────────────────────────────────────────────────────

  it("AC-4: after live-run, 0 contaminated rows remain", () => {
    insertRow(db, "VNH", "2026-05-19", 0.9, 1000.0, 0.9, 1001.0);
    insertRow(db, "FPT", "2026-05-20", 74.5, 75300.0, 73.8, 73601.0);
    insertRow(db, "HBC", "2026-05-18", 5.1, 5200.0, 5.1, 5201.0);

    runRepair(db, { dryRun: false });

    expect(countContaminated(db)).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-5: Genuinely low-priced stocks not incorrectly flagged
  // ─────────────────────────────────────────────────────────────────────────

  it("AC-5: genuinely low-priced stock (open=80, close=80) not flagged", () => {
    // A stock trading at 80 VND — very low but not contaminated
    // (close <= 1000, so not in contamination heuristic)
    insertRow(db, "LOWP", "2026-05-19", 80.0, 85.0, 78.0, 82.0);

    const result = runRepair(db, { dryRun: true });

    expect(result.contaminated_count).toBe(0);
  });

  it("AC-5b: stock with open=50, close=500 not flagged (close ≤ 1000)", () => {
    // close is 500 — below 1000 threshold, so this is not a contamination
    insertRow(db, "EDGEP", "2026-05-19", 50.0, 600.0, 48.0, 500.0);

    const result = runRepair(db, { dryRun: true });

    expect(result.contaminated_count).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-6: Only open and low are multiplied; not high or close
  // ─────────────────────────────────────────────────────────────────────────

  it("AC-6: only open < 100 fields are multiplied (CASE logic)", () => {
    // open=50 (< 100, contaminated), low=50 (< 100, contaminated)
    // high=55000 (> 1000, full-VND), close=54000 (> 1000, full-VND)
    insertRow(db, "MIX", "2026-05-19", 50.0, 55000.0, 50.0, 54001.0);
    runRepair(db, { dryRun: false });

    const row = getRow(db, "MIX", "2026-05-19");
    expect(row?.open).toBeCloseTo(50000.0, 0);  // 50 * 1000
    expect(row?.low).toBeCloseTo(50000.0, 0);   // 50 * 1000
    expect(row?.high).toBe(55000.0);            // unchanged
    expect(row?.close).toBe(54001.0);           // unchanged
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-7: Returns zero_rows_skipped count from separate defect
  // ─────────────────────────────────────────────────────────────────────────

  it("AC-7: result includes zero_rows_skipped informational count", () => {
    insertRow(db, "AAA", "2026-05-30", 0.0, 0.0, 0.0, 0.0);
    insertRow(db, "BBB", "2026-05-30", 0.0, 0.0, 0.0, 0.0);
    insertRow(db, "VNH", "2026-05-19", 0.9, 1000.0, 0.9, 1001.0);

    const result = runRepair(db, { dryRun: true });

    expect(result.zero_rows_skipped).toBe(2);
    expect(result.contaminated_count).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-8: Empty table — no crash, returns 0
  // ─────────────────────────────────────────────────────────────────────────

  it("AC-8: empty table does not crash and returns 0 contaminated", () => {
    const result = runRepair(db, { dryRun: true });

    expect(result.contaminated_count).toBe(0);
    expect(result.rows_updated).toBe(0);
  });
});
