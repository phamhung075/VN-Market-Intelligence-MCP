/**
 * CONTAM-10-WRITER — writeOhlcvBatch writer guard tests
 * Sprint: OHLCV-UNIT-CONTAM-WHOLEROW-LT1000
 *
 * Tests the application layer fix: fetchCleanReferenceCloseMap supplements
 * prevClose when the standard prevClose is itself contaminated (whole-series
 * contamination — prevClose < CLEAN_CLOSE_FLOOR). The effectivePrevClose
 * enables detectAndNormalizeScaleFromPrevClose to detect the ÷1000 scale
 * error and apply the ×1000 correction.
 *
 * Architecture brief: docs/architecture-briefs/2026-06-30-OHLCV-UNIT-CONTAM-WHOLEROW-LT1000.md §4 C.1
 * Handoff:           docs/handoffs/FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM.md
 *
 * 3 test cases:
 *   TC-WG-1: Contaminated prevClose + clean historical reference → ×1000 correction applied
 *   TC-WG-2: Clean prevClose (>= 1000) → effectivePrevClose = prevClose → no regression
 *   TC-WG-3: Legitimately cheap stock (all-history close < 1000) → no cleanRef → no correction
 *
 * Uses real in-memory SQLite with daily_ohlcv table (minimal DDL).
 * No mocks — tests end-to-end through writeOhlcvBatch.
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { writeOhlcvBatch } from "../application/usecases/ohlcvWriteService.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared DB setup
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal DDL — mirrors apps/mcp-server/src/infrastructure/db/schema-market-data.ts */
const CREATE_DAILY_OHLCV = `
  CREATE TABLE IF NOT EXISTS daily_ohlcv (
    code             TEXT NOT NULL,
    date             TEXT NOT NULL,
    open             REAL NOT NULL DEFAULT 0,
    high             REAL NOT NULL DEFAULT 0,
    low              REAL NOT NULL DEFAULT 0,
    close            REAL NOT NULL,
    volume           REAL NOT NULL DEFAULT 0,
    updated_at       TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (code, date)
  );
  CREATE INDEX IF NOT EXISTS idx_daily_ohlcv_code_date
    ON daily_ohlcv(code, date DESC);
`;

const INSERT_ROW = `
  INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
`;

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(CREATE_DAILY_OHLCV);
  return db;
}

function seedRow(
  db: Database,
  code: string,
  date: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
): void {
  db.prepare(INSERT_ROW).run(code, date, open, high, low, close, volume);
}

function readRow(
  db: Database,
  code: string,
  date: string,
): { open: number; high: number; low: number; close: number; volume: number } | null {
  return db
    .prepare<
      { open: number; high: number; low: number; close: number; volume: number },
      [string, string]
    >("SELECT open, high, low, close, volume FROM daily_ohlcv WHERE code = ? AND date = ?")
    .get(code, date) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-WG-1: Contaminated prevClose + clean historical ref → ×1000 correction
// ─────────────────────────────────────────────────────────────────────────────

describe("CONTAM-10-WRITER: effectivePrevClose — contaminated prevClose bootstrap gap", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("TC-WG-1: contaminated prevClose (~130) + cleanRef (130000) → incoming close=130 corrected to 130000", async () => {
    // DB state: FPT series contaminated — one clean anchor bar buried in history.
    // 2026-06-01: close=130000 (clean, represents real FPT price ~130,000 VND)
    seedRow(db, "FPT", "2026-06-01", 129000, 131500, 128500, 130000, 1_200_000);
    // 2026-06-28: close=130 (contaminated — whole-row thousands scale)
    seedRow(db, "FPT", "2026-06-28", 129, 131, 128, 130, 900_000);

    // vnToday = 2026-06-30 → prevCloseMap fetches most recent bar with date < 2026-06-30 AND vol>0
    //   → picks 2026-06-28 → prevClose = 130 (contaminated)
    // cleanRefMap fetches most recent bar with close >= 1000 AND vol>0 (no date cutoff)
    //   → picks 2026-06-01 → cleanRef = 130000
    // effectivePrevClose = cleanRef = 130000 (since prevClose=130 < 1000 and cleanRef=130000 >= 1000)
    // detectAndNormalizeScaleFromPrevClose: 130000 / 130 ≈ 1000 >= SCALE_DETECTION_RATIO(50) → corrected

    const result = await writeOhlcvBatch(
      [
        {
          code: "FPT",
          date: "2026-06-29",
          open: 131,
          high: 133,
          low: 129,
          close: 130,
          volume: 1_000_000,
          type: "stock",
        },
      ],
      db,
      { vnToday: "2026-06-30", conflictStrategy: "backfill" },
    );

    expect(result.written).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.rejected).toHaveLength(0);

    const written = readRow(db, "FPT", "2026-06-29");
    expect(written).not.toBeNull();
    // All four OHLC fields corrected × 1000
    expect(written!.close).toBe(130_000);
    expect(written!.open).toBe(131_000);
    expect(written!.high).toBe(133_000);
    expect(written!.low).toBe(129_000);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-WG-2: Clean prevClose (>= 1000) → effectivePrevClose = prevClose → no regression
  // ─────────────────────────────────────────────────────────────────────────

  it("TC-WG-2: clean prevClose (130000) → effectivePrevClose = prevClose → no correction on normal incoming row", async () => {
    // DB state: FPT post-repair — prevClose row already clean.
    seedRow(db, "FPT", "2026-06-28", 129_000, 131_000, 128_000, 130_000, 900_000);

    // prevClose = 130000 (>= 1000) → effectivePrevClose = prevClose = 130000
    // Incoming close = 132000 → ratio = 130000/132000 < 1 → no correction

    const result = await writeOhlcvBatch(
      [
        {
          code: "FPT",
          date: "2026-06-29",
          open: 131_000,
          high: 133_000,
          low: 129_000,
          close: 132_000,
          volume: 1_000_000,
          type: "stock",
        },
      ],
      db,
      { vnToday: "2026-06-30", conflictStrategy: "backfill" },
    );

    expect(result.written).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.rejected).toHaveLength(0);

    const written = readRow(db, "FPT", "2026-06-29");
    expect(written).not.toBeNull();
    // No correction — values written as-is
    expect(written!.close).toBe(132_000);
    expect(written!.open).toBe(131_000);
    expect(written!.high).toBe(133_000);
    expect(written!.low).toBe(129_000);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-WG-3: Legitimately cheap stock → no cleanRef → effectivePrevClose = prevClose → no correction
  // ─────────────────────────────────────────────────────────────────────────

  it("TC-WG-3: legitimately cheap stock (all-history close < 1000) → no cleanRef → incoming cheap row written as-is", async () => {
    // DB state: CHEAP — a legitimately cheap stock, all historical bars below 1000 VND.
    seedRow(db, "CHEAP", "2026-06-28", 510, 530, 490, 500, 100_000);

    // cleanRefMap: no row with close >= 1000 → CHEAP absent → cleanRef = 0
    // prevClose = 500, effectivePrevClose = 500 (cleanRef condition fails)
    // Incoming close = 520 → ratio = 500/520 ≈ 0.96 → no correction, no rejection
    // validateOhlcvUnit: close=520 in [100, 10M] → valid

    const result = await writeOhlcvBatch(
      [
        {
          code: "CHEAP",
          date: "2026-06-29",
          open: 510,
          high: 530,
          low: 490,
          close: 520,
          volume: 150_000,
          type: "stock",
        },
      ],
      db,
      { vnToday: "2026-06-30", conflictStrategy: "backfill" },
    );

    expect(result.written).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.rejected).toHaveLength(0);

    const written = readRow(db, "CHEAP", "2026-06-29");
    expect(written).not.toBeNull();
    // No correction — cheap stock written at its face price
    expect(written!.close).toBe(520);
    expect(written!.open).toBe(510);
    expect(written!.high).toBe(530);
    expect(written!.low).toBe(490);
  });
});
