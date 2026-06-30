// scripts/migrations/__tests__/CONTAM-10-repair-ohlcv-wholerow-lt1000.test.ts
//
// Unit tests for the repair-ohlcv-unit-contamination-wholerow-lt1000 migration.
//
// Strategy: in-memory SQLite DB seeded with known contaminated + clean rows.
// Tests call the exported `runRepair()` function directly (no CLI subprocess).
//
// Coverage:
//   AC-1: Dry-run counts contaminated rows per ticker, no DB writes
//   AC-2: Live-run applies ×1000 to ALL FOUR OHLC fields (open, high, low, close)
//   AC-3: data_env preserved (RF-5 — not touched in UPDATE)
//   AC-4a: INDEX_TICKERS excluded from anchor (no anchor → not a candidate)
//   AC-4b: INDEX_TICKERS excluded from candidates even if ratio >= 100
//   AC-5: Legitimately cheap stock skipped (all-history close < 1000 → no anchor)
//   AC-6: Dry-run leaves DB values unchanged
//   AC-7: Per-ticker summary in dry-run output (per_ticker array)
//   AC-8: Anchor = most recent bar with close >= 1000 (not older bars)
//   AC-9: Post-verify remaining_count = 0 after live repair
//   AC-10: Empty table does not crash, returns 0
//   AC-11: Multiple tickers repaired independently (FPT + VHM both fixed)
//   AC-12: Bar with at least one zero OHLC field is NOT a candidate (all-zero guard)
//   AC-13: Anchor bar itself (close >= 1000) is NOT a candidate (close < 1000 required)
//   AC-14: CONTAM-6 class (partial contamination: open/low in thousands, close in full-VND)
//           — NOT touched by this migration (CONTAM-6 handles it; this only touches close < 1000)

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runRepair,
  INDEX_TICKERS,
  type WholeRowRepairResult,
} from "../repair-ohlcv-unit-contamination-wholerow-lt1000.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Schema matches apps/mcp-server/src/infrastructure/db/schema-market-data.ts
// (simplified — only columns used by this migration)
const DDL = `
CREATE TABLE IF NOT EXISTS daily_ohlcv (
  code       TEXT NOT NULL,
  date       TEXT NOT NULL,
  open       REAL NOT NULL DEFAULT 0,
  high       REAL NOT NULL DEFAULT 0,
  low        REAL NOT NULL DEFAULT 0,
  close      REAL NOT NULL DEFAULT 0,
  volume     REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT '',
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
  volume: number = 1_000_000,
  data_env: string | null = null
): void {
  db.prepare(
    "INSERT OR REPLACE INTO daily_ohlcv (code,date,open,high,low,close,volume,data_env)" +
    " VALUES (?,?,?,?,?,?,?,?)"
  ).run(code, date, open, high, low, close, volume, data_env);
}

function getRow(db: Database, code: string, date: string) {
  return db
    .query<
      {
        code: string;
        date: string;
        open: number;
        high: number;
        low: number;
        close: number;
        data_env: string | null;
      },
      [string, string]
    >("SELECT code,date,open,high,low,close,data_env FROM daily_ohlcv WHERE code=? AND date=?")
    .get(code, date);
}

/** Convenience: count rows remaining that match the whole-row contamination pattern
 *  for a specific ticker (anchor logic approximated: close < 1000).
 *  Not the canonical predicate — used only to verify raw values changed. */
function countWholeRowLt1000(db: Database, code: string): number {
  const r = db
    .query<{ cnt: number }, [string]>(
      "SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code=? AND close < 1000 AND close > 0"
    )
    .get(code);
  return r?.cnt ?? 0;
}

// Suppress log output in tests
const noop = () => {};

// ─────────────────────────────────────────────────────────────────────────────
// Fixture: "recent" date (within last 180 days from 2026-06-30)
// anchor requires: date >= date('now', '-180 days')
// Using 2026-06-15 as a safe "recent" date.
// Old contaminated bars can be from any date.
// ─────────────────────────────────────────────────────────────────────────────

const RECENT = "2026-06-15";  // within 180 days — used for anchor rows
const OLD    = "2025-01-01";  // definitely older than 180 days — used for contaminated rows

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("CONTAM-10 — repair-ohlcv-unit-contamination-wholerow-lt1000", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  // ── AC-1: Dry-run counts contaminated rows per ticker, no writes ───────────

  it("AC-1a: dry-run returns correct candidate_count for 3 contaminated rows", () => {
    // FPT anchor: close=130000 (within 180 days) — gives anchor_close=130000
    insertRow(db, "FPT", RECENT, 131_000, 133_000, 129_000, 130_000, 2_000_000);
    // FPT contaminated rows: close≈130, ratio=130000/130≈1000 >= 100
    insertRow(db, "FPT", OLD,        128, 132, 127, 130, 5_000_000);
    insertRow(db, "FPT", "2025-02-01", 129, 133, 128, 131, 4_500_000);
    insertRow(db, "FPT", "2025-03-01", 130, 134, 129, 132, 4_000_000);

    const result: WholeRowRepairResult = runRepair(db, { dryRun: true, logger: noop });

    expect(result.candidate_count).toBe(3);
    expect(result.rows_updated).toBe(0);       // dry-run — no writes
    expect(result.ticker_count).toBe(1);
    expect(result.per_ticker).toHaveLength(1);
    expect(result.per_ticker[0].code).toBe("FPT");
    expect(result.per_ticker[0].row_count).toBe(3);
    expect(result.per_ticker[0].anchor_close).toBe(130_000);
  });

  it("AC-1b: dry-run sample_before is populated", () => {
    insertRow(db, "VHM", RECENT, 44_000, 46_000, 43_000, 45_000, 3_000_000);
    insertRow(db, "VHM", OLD,    43,     46,     42,     45,     6_000_000);

    const result = runRepair(db, { dryRun: true, logger: noop });

    expect(result.sample_before.length).toBeGreaterThan(0);
    const sample = result.sample_before[0];
    expect(sample.code).toBe("VHM");
    expect(sample.anchor_close).toBe(45_000);
    expect(sample.ratio).toBeGreaterThanOrEqual(100);
  });

  // ── AC-2: Live-run applies ×1000 to ALL FOUR OHLC fields ──────────────────

  it("AC-2: live-run multiplies open, high, low, close all by 1000", () => {
    // FPT anchor
    insertRow(db, "FPT", RECENT, 131_000, 133_000, 129_000, 130_000, 2_000_000);
    // FPT contaminated bar
    insertRow(db, "FPT", OLD, 128, 132, 127, 130, 5_000_000);

    runRepair(db, { dryRun: false, logger: noop });

    const row = getRow(db, "FPT", OLD);
    expect(row?.open).toBeCloseTo(128_000, 0);   // 128 × 1000
    expect(row?.high).toBeCloseTo(132_000, 0);   // 132 × 1000  ← whole-row fix
    expect(row?.low).toBeCloseTo(127_000, 0);    // 127 × 1000
    expect(row?.close).toBeCloseTo(130_000, 0);  // 130 × 1000  ← whole-row fix
  });

  it("AC-2b: rows_updated reflects actual DB changes", () => {
    insertRow(db, "FPT", RECENT, 131_000, 133_000, 129_000, 130_000, 2_000_000);
    insertRow(db, "FPT", OLD,        128,     132,     127,     130, 5_000_000);
    insertRow(db, "FPT", "2025-02-01", 129,  133,     128,     131, 4_500_000);

    const result = runRepair(db, { dryRun: false, logger: noop });

    expect(result.rows_updated).toBe(2);
    expect(result.candidate_count).toBe(2);
  });

  // ── AC-3: data_env preserved (RF-5) ───────────────────────────────────────

  it("AC-3: data_env column is preserved after live-run (RF-5)", () => {
    insertRow(db, "VHM", RECENT, 44_000, 46_000, 43_000, 45_000, 3_000_000, "production");
    insertRow(db, "VHM", OLD,    43,     46,     42,     45,     6_000_000, "production");

    runRepair(db, { dryRun: false, logger: noop });

    const row = getRow(db, "VHM", OLD);
    expect(row?.data_env).toBe("production");
  });

  // ── AC-4a: INDEX_TICKERS excluded from anchor ──────────────────────────────

  it("AC-4a: VNINDEX provides no anchor even though close >= 1000 (excluded from anchor query)", () => {
    // If VNINDEX were included in anchor, it could anchor some row incorrectly.
    // Insert a VNINDEX "clean" bar (legitimately high close)
    insertRow(db, "VNINDEX", RECENT, 1300, 1320, 1285, 1310, 5_000_000_000);
    // Insert a fake "contaminated" bar for a stock that has no own anchor
    // so if VNINDEX leaked into anchor it could incorrectly create a candidate.
    // But since VNINDEX is excluded from anchor, NOANCHOR has no anchor → skip.
    insertRow(db, "NOANCHOR", OLD, 1.3, 1.32, 1.28, 1.31, 1_000_000);

    const result = runRepair(db, { dryRun: true, logger: noop });

    expect(result.candidate_count).toBe(0);   // NOANCHOR has no anchor → skip
    expect(result.ticker_count).toBe(0);
  });

  it("AC-4a: INDEX_TICKERS set contains exactly the expected 5 tickers", () => {
    expect(INDEX_TICKERS.has("VNINDEX")).toBe(true);
    expect(INDEX_TICKERS.has("VN30")).toBe(true);
    expect(INDEX_TICKERS.has("HNXINDEX")).toBe(true);
    expect(INDEX_TICKERS.has("HNX30")).toBe(true);
    expect(INDEX_TICKERS.has("UPCOMINDEX")).toBe(true);
    expect(INDEX_TICKERS.size).toBe(5);
  });

  // ── AC-4b: INDEX_TICKERS excluded from candidates ─────────────────────────

  it("AC-4b: VNINDEX not flagged as candidate even if ratio >= 100", () => {
    // Simulate: VNINDEX has an old bar at close=1.3 (hypothetically) and a new
    // bar at close=1310. If not excluded from candidates, ratio=1310/1.3≈1007>=100.
    // It must remain untouched.
    insertRow(db, "VNINDEX", RECENT, 1300, 1320, 1285, 1310, 5_000_000_000);  // anchor candidate
    // VNINDEX should not appear in candidates even if we manually craft the scenario
    // by inserting a very-low-close VNINDEX bar (which can't happen in reality but tests exclusion)
    insertRow(db, "VNINDEX", OLD, 1.3, 1.32, 1.28, 1.31, 1_000_000);

    const result = runRepair(db, { dryRun: true, logger: noop });

    expect(result.candidate_count).toBe(0);

    // Verify VNINDEX bar is unchanged after live run
    runRepair(db, { dryRun: false, logger: noop });
    const row = getRow(db, "VNINDEX", OLD);
    expect(row?.open).toBeCloseTo(1.3, 1);    // NOT multiplied
    expect(row?.close).toBeCloseTo(1.31, 2);  // NOT multiplied
  });

  it("AC-4b: VN30 and other index tickers also excluded (not just VNINDEX)", () => {
    // VN30 "clean" bar
    insertRow(db, "VN30", RECENT, 1200, 1230, 1190, 1210, 2_000_000_000);
    // VN30 hypothetical "contaminated" bar
    insertRow(db, "VN30", OLD, 1.2, 1.23, 1.19, 1.21, 500_000);

    const result = runRepair(db, { dryRun: true, logger: noop });

    expect(result.candidate_count).toBe(0);
  });

  // ── AC-5: Legitimately cheap stock skipped (no anchor) ────────────────────

  it("AC-5a: stock with all-history close < 1000 has no anchor and is skipped", () => {
    // "CHEAP" stock: all bars have close < 1000 (legitimately low-priced)
    insertRow(db, "CHEAP", RECENT, 490, 510, 485, 500, 2_000_000);
    insertRow(db, "CHEAP", OLD,    480, 505, 475, 495, 1_500_000);

    const result = runRepair(db, { dryRun: true, logger: noop });

    expect(result.candidate_count).toBe(0);   // no anchor → skip
    expect(result.ticker_count).toBe(0);
  });

  it("AC-5b: a stock with close=999 (just under threshold) is not an anchor", () => {
    // "BORDERLINE": most recent bar has close=999 (just below 1000 threshold)
    insertRow(db, "BORDERLINE", RECENT, 995, 1005, 990, 999, 1_000_000);
    // Old bar with close=1 would look contaminated if 999 were accepted as anchor
    insertRow(db, "BORDERLINE", OLD, 1, 1.05, 0.99, 1, 500_000);

    const result = runRepair(db, { dryRun: true, logger: noop });

    // close=999 < 1000 → NOT a valid anchor → skip BORDERLINE entirely
    expect(result.candidate_count).toBe(0);
  });

  // ── AC-6: Dry-run leaves DB values unchanged ───────────────────────────────

  it("AC-6: dry-run does NOT modify DB values", () => {
    insertRow(db, "FPT", RECENT, 131_000, 133_000, 129_000, 130_000, 2_000_000);
    insertRow(db, "FPT", OLD, 128, 132, 127, 130, 5_000_000);

    runRepair(db, { dryRun: true, logger: noop });

    const row = getRow(db, "FPT", OLD);
    expect(row?.open).toBe(128);    // unchanged
    expect(row?.high).toBe(132);    // unchanged
    expect(row?.low).toBe(127);     // unchanged
    expect(row?.close).toBe(130);   // unchanged
  });

  // ── AC-7: Per-ticker summary in dry-run ───────────────────────────────────

  it("AC-7: per_ticker array contains code, row_count, date range, anchor_close", () => {
    insertRow(db, "FPT", RECENT, 131_000, 133_000, 129_000, 130_000, 2_000_000);
    insertRow(db, "FPT", "2025-01-10", 128, 132, 127, 130, 5_000_000);
    insertRow(db, "FPT", "2025-02-10", 129, 133, 128, 131, 4_500_000);

    const result = runRepair(db, { dryRun: true, logger: noop });

    expect(result.per_ticker).toHaveLength(1);
    const summary = result.per_ticker[0];
    expect(summary.code).toBe("FPT");
    expect(summary.row_count).toBe(2);
    expect(summary.first_date).toBe("2025-01-10");
    expect(summary.last_date).toBe("2025-02-10");
    expect(summary.anchor_close).toBe(130_000);
  });

  // ── AC-8: Anchor = most recent clean bar (not any bar) ────────────────────

  it("AC-8: anchor uses most recent bar with close >= 1000 (not an older bar)", () => {
    // Ticker "TEST" has two bars with close >= 1000 — anchor should pick the NEWER one
    // Newer clean bar: 2026-06-15 (RECENT), close=50000
    insertRow(db, "TEST", RECENT,      49_000, 51_000, 48_000, 50_000, 1_000_000);
    // Older clean bar: 2026-05-01, close=40000 — should NOT be anchor
    insertRow(db, "TEST", "2026-05-01", 39_000, 41_000, 38_000, 40_000, 800_000);
    // Contaminated bar: close=50 → ratio vs anchor_close(50000) = 1000 >= 100
    insertRow(db, "TEST", OLD, 48, 51, 47, 50, 2_000_000);

    const result = runRepair(db, { dryRun: true, logger: noop });

    expect(result.candidate_count).toBe(1);
    // Verify the anchor is the most recent one (50000, not 40000)
    expect(result.per_ticker[0].anchor_close).toBe(50_000);
    // Also verify the ratio is correctly computed against the newer anchor
    const sample = result.sample_before[0];
    expect(sample.ratio).toBeGreaterThanOrEqual(100);
    // ratio = 50000/50 = 1000 — far above threshold
    expect(sample.ratio).toBeCloseTo(1000, 0);
  });

  // ── AC-9: Post-verify remaining_count = 0 after live repair ───────────────

  it("AC-9: after live-run, remaining_count = 0", () => {
    insertRow(db, "FPT", RECENT, 131_000, 133_000, 129_000, 130_000, 2_000_000);
    insertRow(db, "FPT", OLD, 128, 132, 127, 130, 5_000_000);
    insertRow(db, "VHM", RECENT, 44_000,  46_000,  43_000,  45_000,  3_000_000);
    insertRow(db, "VHM", OLD, 43, 46, 42, 45, 6_000_000);

    const result = runRepair(db, { dryRun: false, logger: noop });

    expect(result.remaining_count).toBe(0);
    expect(result.rows_updated).toBe(2);
  });

  // ── AC-10: Empty table does not crash ─────────────────────────────────────

  it("AC-10: empty table does not crash, returns 0 candidate_count", () => {
    const result = runRepair(db, { dryRun: true, logger: noop });

    expect(result.candidate_count).toBe(0);
    expect(result.rows_updated).toBe(0);
    expect(result.ticker_count).toBe(0);
    expect(result.per_ticker).toHaveLength(0);
    expect(result.sample_before).toHaveLength(0);
  });

  // ── AC-11: Multiple tickers repaired independently ─────────────────────────

  it("AC-11: FPT and VHM both detected and fixed independently", () => {
    // FPT: anchor=130000, contaminated bar close=130
    insertRow(db, "FPT", RECENT, 131_000, 133_000, 129_000, 130_000, 2_000_000);
    insertRow(db, "FPT", OLD,    128,     132,     127,     130,     5_000_000);
    // VHM: anchor=45000, contaminated bar close=45
    insertRow(db, "VHM", RECENT, 44_000,  46_000,  43_000,  45_000,  3_000_000);
    insertRow(db, "VHM", OLD,    43,      46,      42,      45,      6_000_000);

    const result = runRepair(db, { dryRun: false, logger: noop });

    expect(result.candidate_count).toBe(2);
    expect(result.ticker_count).toBe(2);
    expect(result.rows_updated).toBe(2);
    expect(result.remaining_count).toBe(0);

    // FPT bar repaired
    const fptRow = getRow(db, "FPT", OLD);
    expect(fptRow?.open).toBeCloseTo(128_000, 0);
    expect(fptRow?.high).toBeCloseTo(132_000, 0);
    expect(fptRow?.low).toBeCloseTo(127_000, 0);
    expect(fptRow?.close).toBeCloseTo(130_000, 0);

    // VHM bar repaired
    const vhmRow = getRow(db, "VHM", OLD);
    expect(vhmRow?.open).toBeCloseTo(43_000, 0);
    expect(vhmRow?.high).toBeCloseTo(46_000, 0);
    expect(vhmRow?.low).toBeCloseTo(42_000, 0);
    expect(vhmRow?.close).toBeCloseTo(45_000, 0);
  });

  // ── AC-12: Bar with a zero OHLC field excluded (all-zero guard) ───────────

  it("AC-12: bar with open=0 is NOT a candidate (requires all OHLC > 0)", () => {
    // Valid anchor exists
    insertRow(db, "FPT", RECENT, 131_000, 133_000, 129_000, 130_000, 2_000_000);
    // Row with open=0 — not a valid contamination candidate (partial zero → CONTAM-9 scope)
    insertRow(db, "FPT", OLD, 0, 132, 127, 130, 5_000_000);

    const result = runRepair(db, { dryRun: true, logger: noop });

    expect(result.candidate_count).toBe(0);
  });

  it("AC-12b: all-zero row (open=0,high=0,low=0,close=0) is NOT a candidate", () => {
    insertRow(db, "FPT", RECENT, 131_000, 133_000, 129_000, 130_000, 2_000_000);
    insertRow(db, "FPT", OLD, 0, 0, 0, 0, 0);  // all-zero defect row

    const result = runRepair(db, { dryRun: true, logger: noop });

    expect(result.candidate_count).toBe(0);
  });

  // ── AC-13: Anchor bar itself is not a candidate (close >= 1000 guard) ─────

  it("AC-13: the clean anchor bar (close=130000) is NOT flagged as contaminated", () => {
    // The anchor bar has close=130000 which is NOT < 1000 → not a candidate
    insertRow(db, "FPT", RECENT, 131_000, 133_000, 129_000, 130_000, 2_000_000);

    const result = runRepair(db, { dryRun: true, logger: noop });

    expect(result.candidate_count).toBe(0);
  });

  // ── AC-14: CONTAM-6 class not touched (partial contamination) ─────────────

  it("AC-14: CONTAM-6 class (open/low small, close large) not touched by this migration", () => {
    // CONTAM-6 class: open < 100 AND close >= 1000 (mixed-scale row)
    // This migration only targets close < 1000 → CONTAM-6 class NOT a candidate here
    insertRow(db, "VNH", RECENT, 0.9, 1000.0, 0.9, 1001.0, 500_000);  // CONTAM-6 class
    // No anchor for VNH needed because close=1001 >= 1000 → fails candidates WHERE d.close < 1000

    const result = runRepair(db, { dryRun: true, logger: noop });

    expect(result.candidate_count).toBe(0);  // CONTAM-6 class filtered by close < 1000 guard
  });

  // ── Fixture dry-run output simulation ─────────────────────────────────────

  it("FIXTURE: dry-run output sample matches expected format (FPT scenario)", () => {
    // Seed realistic FPT contamination scenario
    insertRow(db, "FPT", RECENT, 131_000, 133_000, 129_000, 130_000, 2_000_000);
    insertRow(db, "FPT", "2025-03-15", 128, 132, 127, 130, 5_500_000);
    insertRow(db, "FPT", "2025-04-20", 129, 133, 128, 131, 4_800_000);

    const result = runRepair(db, { dryRun: true, logger: noop });

    // Structural assertions for dispatcher RAW-verify
    expect(result.candidate_count).toBe(2);
    expect(result.ticker_count).toBe(1);
    expect(result.rows_updated).toBe(0);       // dry-run
    expect(result.remaining_count).toBe(2);    // unchanged (dry-run)
    expect(result.per_ticker[0].code).toBe("FPT");
    expect(result.per_ticker[0].anchor_close).toBe(130_000);
    expect(result.sample_before.length).toBeGreaterThan(0);
    // Verify sample contains the expected ratio
    for (const s of result.sample_before) {
      expect(s.ratio).toBeGreaterThanOrEqual(100);
      expect(s.close).toBeLessThan(1000);
    }
  });
});
