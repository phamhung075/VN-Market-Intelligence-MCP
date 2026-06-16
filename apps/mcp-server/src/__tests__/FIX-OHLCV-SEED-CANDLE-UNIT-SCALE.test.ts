/**
 * FIX-OHLCV-SEED-CANDLE-UNIT-SCALE — Regression suite
 *
 * FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 / SUBTASK-7
 *
 * Covers architect AC-T1..T8 (BA-spec §5.2 + architect §8):
 *
 *   AC-T1  FR-S1 seed-bar rejection: date>=vnToday + vol=0 + O=H=L=C → writeOhlcvBatch SKIPS.
 *   AC-T2  ÷1000 class: prevClose=136100, incoming close=136.1 → corrected to ~136100.
 *           No single-digit-RSI-producing value lands in DB.
 *   AC-T3  ×1000 class: prevClose=7260, incoming 7,260,000 → normalizeOhlcvToVnd + FR-S1
 *           together keep DB clean.  No ×1000 inflated value lands.
 *   AC-T4  conflictStrategy='intraday' Writer A rules:
 *     AC-T4a  self-heal-open: existing open < 100 → overwritten by incoming.
 *     AC-T4b  accumulate-high: MAX of existing / incoming wins.
 *     AC-T4c  protected-low: existing low = 0 → replaced; else MIN.
 *   AC-T5  conflictStrategy='backfill' overwrites all fields (no regression).
 *   AC-T6  FR-G2 sanity detector flags scale_mismatch_vs_prior for both ×1000 and ÷1000.
 *   AC-T7  FR-G3 sanity detector flags synthetic_seed_bar for date>=vnToday + vol=0 + flat.
 *   AC-T8  Repair idempotency: DELETE twice → second run deletes 0 rows (no crash).
 *   AC-T-NOCRASH  prevClose absent (no prior real row) → prevClose=0 → row passes through
 *                  normalizeOhlcvToVnd only (no crash, no false rejection).
 *
 * Design constraints (BA spec NFR-5, architect §8):
 *   - In-memory SQLite (:memory:) — no named-volume, no network.
 *   - Preload from src/__tests__/setup.ts sets DB_PATH=:memory: (bunfig.toml).
 *   - No per-ticker hardcode beyond fixtures (NFR-3 / FR-W3).
 *   - Generic across all tickers — VHM/AAA used only as illustrative fixture labels.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";

import { writeOhlcvBatch } from "../application/usecases/ohlcvWriteService.js";
import { runOhlcvSanityCheck } from "../scheduler/market-data/ohlcvSanityCheckJob.js";
import {
  runRepair,
  type RepairOptions,
} from "../../../../scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.js";

// ─────────────────────────────────────────────────────────────────────────────
// Pinned time constants
// All test dates are pinned deterministically; no wall-clock dependency.
// vnToday is injected into writeOhlcvBatch via options?.vnToday.
// ─────────────────────────────────────────────────────────────────────────────

const VN_TODAY        = "2026-06-16";   // pinned "today" injected into service
const YESTERDAY       = "2026-06-15";   // prior real close day
const TWO_DAYS_AGO    = "2026-06-14";   // older real row
const FUTURE_DATE     = "2026-06-17";   // one day past vnToday (still rejected by FR-S1)

// Sanity check now-ms: pins the 7-day window for runOhlcvSanityCheck
// "today" for the sanity job: same VN_TODAY
const SANITY_NOW_ISO  = "2026-06-16T02:00:00.000Z"; // 09:00 VNT — after 01:30 UTC backfill
const SANITY_NOW_MS   = Date.parse(SANITY_NOW_ISO);

// ─────────────────────────────────────────────────────────────────────────────
// DB DDL helpers
// ─────────────────────────────────────────────────────────────────────────────

const DDL_DAILY_OHLCV = `
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
  )
`;

const DDL_WATCHLIST = `
  CREATE TABLE IF NOT EXISTS watchlist (
    code     TEXT PRIMARY KEY,
    exchange TEXT NOT NULL DEFAULT 'HOSE'
  )
`;

/** Create a fresh in-memory DB with the required tables. */
function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(DDL_DAILY_OHLCV);
  db.exec(DDL_WATCHLIST);
  return db;
}

/** Seed a ticker in the watchlist. */
function addTicker(db: Database, code: string): void {
  db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run(code);
}

/** Insert a real OHLCV row (volume > 0 means real trading data). */
function insertRealRow(
  db: Database,
  code: string,
  date: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1_000_000,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO daily_ohlcv
     (code, date, open, high, low, close, volume, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(code, date, open, high, low, close, volume);
}

/** Read a row from daily_ohlcv. */
function getRow(
  db: Database,
  code: string,
  date: string,
): { open: number; high: number; low: number; close: number; volume: number } | null {
  return db
    .prepare(
      "SELECT open, high, low, close, volume FROM daily_ohlcv WHERE code = ? AND date = ?",
    )
    .get(code, date) as {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null;
}

/** Count rows in daily_ohlcv for a given code. */
function rowCount(db: Database, code: string): number {
  return (
    db
      .prepare("SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code = ?")
      .get(code) as { cnt: number }
  ).cnt;
}

/** Count all daily_ohlcv rows matching the repair fingerprint for TARGET_DATE. */
function seedRowCount(db: Database, date: string): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM daily_ohlcv
         WHERE date = ?
           AND volume = 0
           AND open = high
           AND high = low
           AND low = close
           AND data_env IS NULL`,
      )
      .get(date) as { cnt: number }
  ).cnt;
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-T1 — FR-S1 seed-bar rejection
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T1: FR-S1 seed-bar rejection — writeOhlcvBatch skips vol=0 + flat O=H=L=C >= vnToday", () => {
  it("T1-a: seed bar with date = vnToday, vol=0, O=H=L=C → skipped (result.skipped=1, no DB row)", async () => {
    const db = makeDb();

    const result = await writeOhlcvBatch(
      [
        {
          code: "VHM",
          date: VN_TODAY,
          open: 136_100,
          high: 136_100,
          low: 136_100,
          close: 136_100,
          volume: 0,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    expect(result.skipped).toBe(1);
    expect(result.written).toBe(0);
    expect(result.rejected).toHaveLength(0);
    expect(getRow(db, "VHM", VN_TODAY)).toBeNull();

    db.close();
  });

  it("T1-b: seed bar with date = FUTURE_DATE, vol=0, O=H=L=C → also skipped (date >= vnToday check)", async () => {
    const db = makeDb();

    const result = await writeOhlcvBatch(
      [
        {
          code: "AAA",
          date: FUTURE_DATE,
          open: 7_260,
          high: 7_260,
          low: 7_260,
          close: 7_260,
          volume: 0,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    expect(result.skipped).toBe(1);
    expect(getRow(db, "AAA", FUTURE_DATE)).toBeNull();

    db.close();
  });

  it("T1-c: PAST date (YESTERDAY), vol=0, flat O=H=L=C → NOT skipped (past = legitimate zero-vol day)", async () => {
    const db = makeDb();

    // A past day with zero vol (e.g. partial data) must not be rejected
    const result = await writeOhlcvBatch(
      [
        {
          code: "VHM",
          date: YESTERDAY,
          open: 136_100,
          high: 136_100,
          low: 136_100,
          close: 136_100,
          volume: 0,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    // validateOhlcvUnit will reject vol=0 row only if OHLCV fields are 0.
    // These values are non-zero and in range → should be WRITTEN (not skipped by FR-S1).
    // (FR-S1 only activates for date >= vnToday)
    expect(result.skipped).toBe(0);
    // The row passes normalize + validate + write
    expect(result.written).toBe(1);

    db.close();
  });

  it("T1-d: vol>0 row for vnToday is NOT skipped — only seed signature triggers FR-S1", async () => {
    const db = makeDb();

    const result = await writeOhlcvBatch(
      [
        {
          code: "VHM",
          date: VN_TODAY,
          open: 135_000,
          high: 137_000,
          low: 134_000,
          close: 136_100,
          volume: 8_140_900,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    // Real intraday candle (vol > 0, OHLC different) — must be written
    expect(result.skipped).toBe(0);
    expect(result.written).toBe(1);
    const row = getRow(db, "VHM", VN_TODAY);
    expect(row).not.toBeNull();
    expect(row!.close).toBeCloseTo(136_100, 0);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T2 — ÷1000 class: prevClose=136100, incoming close=136.1 → corrected
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T2: ÷1000 class — detectAndNormalizeScaleFromPrevClose corrects 136.1 → ~136100", () => {
  it("T2-a: prior real row 136100; incoming PAST row 136.1 → corrected to 136100 before write", async () => {
    const db = makeDb();

    // Seed prior real close for a high-priced ticker (generic — "HIGHPRICE_TICKER" pattern)
    insertRealRow(db, "VHM", TWO_DAYS_AGO, 136_000, 137_000, 135_000, 136_100, 8_140_900);

    // Incoming row: yesterday's date (PAST), in-range but thousand-scale (136.1 >= STOCK_MIN_VND=100)
    // normalizeOhlcvToVnd: 136.1 >= 100 → no-op. detectAndNormalizeScaleFromPrevClose: ratio=136100/136.1≈1000 >= 50 → ×1000.
    const result = await writeOhlcvBatch(
      [
        {
          code: "VHM",
          date: YESTERDAY,
          open: 136.1,
          high: 137.0,
          low: 135.5,
          close: 136.1,
          volume: 8_140_900,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    expect(result.written).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.rejected).toHaveLength(0);

    const row = getRow(db, "VHM", YESTERDAY);
    expect(row).not.toBeNull();
    // After ×1000 correction: 136.1 → 136100
    expect(row!.close).toBeCloseTo(136_100, 0);
    // No single-digit-RSI-producing value (close must be >= STOCK_MIN_VND * 1000 range)
    expect(row!.close).toBeGreaterThan(100_000);

    db.close();
  });

  it("T2-b: today's seed bar (136.1, vol=0, flat) → FR-S1 rejects BEFORE scale correction is needed", async () => {
    const db = makeDb();
    insertRealRow(db, "VHM", YESTERDAY, 136_000, 137_000, 135_000, 136_100, 8_140_900);

    // The classic incident row: today's seed from VNDIRECT
    const result = await writeOhlcvBatch(
      [
        {
          code: "VHM",
          date: VN_TODAY,
          open: 136.1,
          high: 136.1,
          low: 136.1,
          close: 136.1,
          volume: 0,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    // FR-S1 must catch it before it can corrupt the DB
    expect(result.skipped).toBe(1);
    expect(result.written).toBe(0);
    expect(getRow(db, "VHM", VN_TODAY)).toBeNull();

    db.close();
  });

  it("T2-c: generic ticker with prevClose=196000, incoming close=195.5 → corrected ~196000 (VIC class)", async () => {
    const db = makeDb();
    insertRealRow(db, "VIC", YESTERDAY, 195_000, 197_000, 194_000, 196_000, 5_000_000);

    const result = await writeOhlcvBatch(
      [
        {
          code: "VIC",
          date: TWO_DAYS_AGO,
          open: 195.5,
          high: 196.0,
          low: 195.0,
          close: 195.5,
          volume: 5_000_000,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    expect(result.written).toBe(1);
    const row = getRow(db, "VIC", TWO_DAYS_AGO);
    expect(row).not.toBeNull();
    // 195.5 × 1000 = 195500; should not be a single-digit or sub-1000 value
    expect(row!.close).toBeGreaterThan(100_000);
    expect(row!.close).toBeCloseTo(195_500, 0);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T3 — ×1000 class: no inflated value lands in DB
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T3: ×1000 class — inflated value (7260000) rejected/normalized before DB write", () => {
  it("T3-a: incoming close=7.26 (thousand-VND, below STOCK_MIN_VND=100) → normalizeOhlcvToVnd multiplies → 7260; FR-S1 (vol=0, flat, today) skips entirely", async () => {
    const db = makeDb();
    insertRealRow(db, "AAA", YESTERDAY, 7_100, 7_400, 7_000, 7_260, 1_000_000);

    // VNDIRECT seed row for today: 7.26 in thousands, vol=0, flat O=H=L=C
    const result = await writeOhlcvBatch(
      [
        {
          code: "AAA",
          date: VN_TODAY,
          open: 7.26,
          high: 7.26,
          low: 7.26,
          close: 7.26,
          volume: 0,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    // FR-S1 skips it — no inflated value in DB
    expect(result.skipped).toBe(1);
    expect(result.written).toBe(0);
    expect(getRow(db, "AAA", VN_TODAY)).toBeNull();

    db.close();
  });

  it("T3-b: PAST row at 7.26 (thousand-VND) → normalizeOhlcvToVnd corrects to 7260 (not 7260000)", async () => {
    const db = makeDb();
    insertRealRow(db, "AAA", TWO_DAYS_AGO, 7_100, 7_400, 7_000, 7_260, 1_000_000);

    // Past day fetch at thousand-scale
    const result = await writeOhlcvBatch(
      [
        {
          code: "AAA",
          date: YESTERDAY,
          open: 7.26,
          high: 7.40,
          low: 7.10,
          close: 7.26,
          volume: 1_000_000,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    expect(result.written).toBe(1);
    const row = getRow(db, "AAA", YESTERDAY);
    expect(row).not.toBeNull();
    // normalizeOhlcvToVnd: 7.26 < 100 → ×1000 → 7260
    expect(row!.close).toBeCloseTo(7_260, 0);
    // Must NOT be 7,260,000 (the ×1000 overscale that caused the incident)
    expect(row!.close).toBeLessThan(100_000);

    db.close();
  });

  it("T3-c: ×1000 overscale above STOCK_MAX_VND=10M is rejected by validateOhlcvUnit", async () => {
    // Guard boundary: detectAndNormalizeScaleFromPrevClose uses ratio = prevClose/close.
    // For ×1000 class: prevClose=9220, close=9220000 → ratio = 9220/9220000 = 0.001 < 50.
    // The ratio check is NOT triggered (÷1000 detection, not ×1000).
    // However, validateOhlcvUnit Rule 2: if close > STOCK_MAX_VND=10,000,000 → above_10m reject.
    // To test this defense-in-depth: use a value that IS above 10M.
    // (ADS at 9.22M is a known gap per BA spec §2.2: passes validateOhlcvUnit. That gap is
    //  covered by FR-G2 in ohlcvSanityCheckJob — tested in AC-T6-b above.)
    const db = makeDb();
    insertRealRow(db, "HIGHVOL_T", YESTERDAY, 9_100, 9_300, 9_000, 9_220, 500_000);

    // Value that is unambiguously above STOCK_MAX_VND (10,000,001 > 10,000,000)
    const result = await writeOhlcvBatch(
      [
        {
          code: "HIGHVOL_T",
          date: TWO_DAYS_AGO,
          open: 10_000_001,
          high: 10_000_001,
          low: 10_000_001,
          close: 10_000_001,
          volume: 500_000,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    // validateOhlcvUnit Rule 2: 10,000,001 > STOCK_MAX_VND=10,000,000 → above_10m → rejected
    expect(result.written).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toContain("above_10m");
    expect(getRow(db, "HIGHVOL_T", TWO_DAYS_AGO)).toBeNull();

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T4 — conflictStrategy='intraday' — Writer A rules
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T4a: intraday — self-heal-open (existing open < 100 → overwritten)", () => {
  it("T4a: contaminated open=90 (< STOCK_MIN_VND) in existing row → intraday strategy overwrites with incoming open=135000", async () => {
    const db = makeDb();

    // Seed a contaminated existing row (open < 100 — thousand-VND leakage, CONTAM-2 class)
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run("GENERIC1", YESTERDAY, 90, 135_000, 130_000, 135_000, 100_000);

    // Intraday push with correct full-VND open
    const result = await writeOhlcvBatch(
      [
        {
          code: "GENERIC1",
          date: YESTERDAY,
          open: 135_000,
          high: 136_000,
          low: 131_000,
          close: 134_000,
          volume: 200_000,
        },
      ],
      db,
      { conflictStrategy: "intraday", vnToday: VN_TODAY },
    );

    expect(result.written).toBe(1);
    const row = getRow(db, "GENERIC1", YESTERDAY);
    expect(row).not.toBeNull();
    // self-heal-open: existing.open=90 < 100 → replaced by incoming.open=135000
    expect(row!.open).toBeCloseTo(135_000, 0);

    db.close();
  });
});

describe("AC-T4b: intraday — accumulate-high (MAX of existing/incoming wins)", () => {
  it("T4b: existing high=140000, incoming high=138000 → existing high preserved (MAX)", async () => {
    const db = makeDb();

    // Seed an existing row with a higher intraday peak
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run("GENERIC2", YESTERDAY, 135_000, 140_000, 132_000, 138_000, 100_000);

    // Incoming push with lower high (price pulled back)
    const result = await writeOhlcvBatch(
      [
        {
          code: "GENERIC2",
          date: YESTERDAY,
          open: 135_000,
          high: 138_000,
          low: 132_000,
          close: 137_000,
          volume: 150_000,
        },
      ],
      db,
      { conflictStrategy: "intraday", vnToday: VN_TODAY },
    );

    expect(result.written).toBe(1);
    const row = getRow(db, "GENERIC2", YESTERDAY);
    expect(row).not.toBeNull();
    // accumulate-high: MAX(140000, 138000) = 140000 — existing peak preserved
    expect(row!.high).toBeCloseTo(140_000, 0);

    db.close();
  });

  it("T4b-2: existing high=138000, incoming high=141000 → incoming high wins (MAX)", async () => {
    const db = makeDb();

    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run("GENERIC3", YESTERDAY, 135_000, 138_000, 132_000, 137_000, 100_000);

    const result = await writeOhlcvBatch(
      [
        {
          code: "GENERIC3",
          date: YESTERDAY,
          open: 135_000,
          high: 141_000,
          low: 133_000,
          close: 140_000,
          volume: 200_000,
        },
      ],
      db,
      { conflictStrategy: "intraday", vnToday: VN_TODAY },
    );

    expect(result.written).toBe(1);
    const row = getRow(db, "GENERIC3", YESTERDAY);
    expect(row).not.toBeNull();
    // accumulate-high: MAX(138000, 141000) = 141000 — new peak wins
    expect(row!.high).toBeCloseTo(141_000, 0);

    db.close();
  });
});

describe("AC-T4c: intraday — protected-low (low=0 → replaced; else MIN)", () => {
  it("T4c-1: existing low=0 (sentinel) → replaced by incoming low (CONTAM-9 self-heal)", async () => {
    const db = makeDb();

    // Seed a row with low=0 sentinel (corrupt low from prior bug)
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run("GENERIC4", YESTERDAY, 134_000, 140_000, 0, 138_000, 100_000);

    const result = await writeOhlcvBatch(
      [
        {
          code: "GENERIC4",
          date: YESTERDAY,
          open: 134_000,
          high: 140_000,
          low: 132_000,
          close: 138_000,
          volume: 150_000,
        },
      ],
      db,
      { conflictStrategy: "intraday", vnToday: VN_TODAY },
    );

    expect(result.written).toBe(1);
    const row = getRow(db, "GENERIC4", YESTERDAY);
    expect(row).not.toBeNull();
    // protected-low: existing.low=0 → replaced by incoming.low=132000
    expect(row!.low).toBeCloseTo(132_000, 0);

    db.close();
  });

  it("T4c-2: existing low=133000, incoming low=131000 → MIN wins (131000)", async () => {
    const db = makeDb();

    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run("GENERIC5", YESTERDAY, 134_000, 140_000, 133_000, 138_000, 100_000);

    const result = await writeOhlcvBatch(
      [
        {
          code: "GENERIC5",
          date: YESTERDAY,
          open: 134_000,
          high: 140_000,
          low: 131_000,
          close: 137_000,
          volume: 150_000,
        },
      ],
      db,
      { conflictStrategy: "intraday", vnToday: VN_TODAY },
    );

    expect(result.written).toBe(1);
    const row = getRow(db, "GENERIC5", YESTERDAY);
    expect(row).not.toBeNull();
    // protected-low: existing.low=133000 (non-zero) → MIN(133000, 131000) = 131000
    expect(row!.low).toBeCloseTo(131_000, 0);

    db.close();
  });

  it("T4c-3: existing low=131000, incoming low=133000 → existing low preserved (MIN=131000)", async () => {
    const db = makeDb();

    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run("GENERIC6", YESTERDAY, 134_000, 140_000, 131_000, 138_000, 100_000);

    const result = await writeOhlcvBatch(
      [
        {
          code: "GENERIC6",
          date: YESTERDAY,
          open: 134_000,
          high: 140_000,
          low: 133_000,
          close: 137_000,
          volume: 150_000,
        },
      ],
      db,
      { conflictStrategy: "intraday", vnToday: VN_TODAY },
    );

    expect(result.written).toBe(1);
    const row = getRow(db, "GENERIC6", YESTERDAY);
    expect(row).not.toBeNull();
    // protected-low: MIN(131000, 133000) = 131000 — existing trough preserved
    expect(row!.low).toBeCloseTo(131_000, 0);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T5 — conflictStrategy='backfill' overwrites all fields (no regression)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T5: conflictStrategy='backfill' — unconditionally overwrites all fields", () => {
  it("T5: existing row has different OHLCV; backfill strategy replaces all fields exactly", async () => {
    const db = makeDb();

    // Existing row
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run("BACKFILL_T", YESTERDAY, 100_000, 105_000, 98_000, 102_000, 50_000);

    // Backfill with new full-VND values
    const result = await writeOhlcvBatch(
      [
        {
          code: "BACKFILL_T",
          date: YESTERDAY,
          open: 135_000,
          high: 140_000,
          low: 133_000,
          close: 138_000,
          volume: 1_000_000,
        },
      ],
      db,
      { conflictStrategy: "backfill", vnToday: VN_TODAY },
    );

    expect(result.written).toBe(1);
    expect(result.rejected).toHaveLength(0);

    const row = getRow(db, "BACKFILL_T", YESTERDAY);
    expect(row).not.toBeNull();
    // All four OHLCV fields must be overwritten to the incoming values
    expect(row!.open).toBeCloseTo(135_000, 0);
    expect(row!.high).toBeCloseTo(140_000, 0);
    expect(row!.low).toBeCloseTo(133_000, 0);
    expect(row!.close).toBeCloseTo(138_000, 0);
    expect(row!.volume).toBeCloseTo(1_000_000, 0);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T6 — FR-G2: sanity detector flags scale_mismatch_vs_prior
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T6: FR-G2 — ohlcvSanityCheck flags scale_mismatch_vs_prior", () => {
  it("T6-a: ÷1000 class — close=136.1 with prior_real_close=136100 → ratio=0.001 < 0.002 → flag scale_mismatch_vs_prior", async () => {
    const db = makeDb();
    addTicker(db, "VHM");

    // Prior real row (vol > 0)
    insertRealRow(db, "VHM", TWO_DAYS_AGO, 136_000, 137_000, 135_000, 136_100, 8_140_900);

    // Corrupt row: yesterday with thousand-scale close (the ÷1000 class)
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run("VHM", YESTERDAY, 136.1, 137.0, 135.5, 136.1, 0);

    const bugCalls: string[] = [];
    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => SANITY_NOW_MS,
      sendBugFn: async (msg) => { bugCalls.push(msg); },
    });

    expect(result.hitCount).toBeGreaterThanOrEqual(1);
    const scaleFlagHit = result.hits.find(
      (h) => h.code === "VHM" && h.flag.includes("scale_mismatch_vs_prior"),
    );
    expect(scaleFlagHit).toBeDefined();

    db.close();
  });

  it("T6-b: ×1000 class — close=7260000 with prior_real_close=7260 → ratio=1000 > 500 → flag scale_mismatch_vs_prior", async () => {
    const db = makeDb();
    addTicker(db, "AAA");

    // Prior real row
    insertRealRow(db, "AAA", TWO_DAYS_AGO, 7_100, 7_400, 7_000, 7_260, 1_000_000);

    // Corrupt row: inflated by ×1000 (the double-write race class)
    // 7,260,000 < STOCK_MAX_VND=10,000,000 so it bypasses validateOhlcvUnit — but FR-G2 catches it
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run("AAA", YESTERDAY, 7_260_000, 7_260_000, 7_260_000, 7_260_000, 500_000);

    const bugCalls: string[] = [];
    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => SANITY_NOW_MS,
      sendBugFn: async (msg) => { bugCalls.push(msg); },
    });

    expect(result.hitCount).toBeGreaterThanOrEqual(1);
    const scaleFlagHit = result.hits.find(
      (h) => h.code === "AAA" && h.flag.includes("scale_mismatch_vs_prior"),
    );
    expect(scaleFlagHit).toBeDefined();

    db.close();
  });

  it("T6-c: clean close within ±50% of prior close → no scale_mismatch_vs_prior flag", async () => {
    const db = makeDb();
    addTicker(db, "CLEAN_T");

    insertRealRow(db, "CLEAN_T", TWO_DAYS_AGO, 50_000, 55_000, 48_000, 52_000, 200_000);
    // Normal ±5% move
    insertRealRow(db, "CLEAN_T", YESTERDAY, 52_000, 54_000, 51_000, 53_000, 200_000);

    const bugCalls: string[] = [];
    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => SANITY_NOW_MS,
      sendBugFn: async (msg) => { bugCalls.push(msg); },
    });

    const scaleFlagHit = result.hits.find((h) => h.code === "CLEAN_T");
    expect(scaleFlagHit).toBeUndefined();

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T7 — FR-G3: sanity detector flags synthetic_seed_bar
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T7: FR-G3 — ohlcvSanityCheck flags synthetic_seed_bar", () => {
  it("T7-a: row with O=H=L=C=136100, vol=0, date=VN_TODAY → flags synthetic_seed_bar", async () => {
    const db = makeDb();
    addTicker(db, "VHM");

    // This is the synthetic seed row that should have been skipped by FR-S1
    // but if it somehow landed (e.g., from a prior code version), FR-G3 detects it.
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run("VHM", VN_TODAY, 136_100, 136_100, 136_100, 136_100, 0);

    const bugCalls: string[] = [];
    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => SANITY_NOW_MS,
      sendBugFn: async (msg) => { bugCalls.push(msg); },
    });

    expect(result.hitCount).toBeGreaterThanOrEqual(1);
    const seedHit = result.hits.find(
      (h) => h.code === "VHM" && h.flag.includes("synthetic_seed_bar"),
    );
    expect(seedHit).toBeDefined();

    db.close();
  });

  it("T7-b: row with O=H=L=C but vol>0 (real flat day) → NOT flagged as synthetic_seed_bar", async () => {
    const db = makeDb();
    addTicker(db, "VHM");

    // A real trading day where price didn't move at all (rare but valid)
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run("VHM", VN_TODAY, 136_100, 136_100, 136_100, 136_100, 1_000);

    const bugCalls: string[] = [];
    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => SANITY_NOW_MS,
      sendBugFn: async (msg) => { bugCalls.push(msg); },
    });

    const seedHit = result.hits.find(
      (h) => h.code === "VHM" && h.flag.includes("synthetic_seed_bar"),
    );
    // vol>0 → NOT a synthetic seed bar
    expect(seedHit).toBeUndefined();

    db.close();
  });

  it("T7-c: synthetic seed on YESTERDAY (past) → NOT flagged as synthetic_seed_bar (date < vnToday)", async () => {
    const db = makeDb();
    addTicker(db, "VHM");

    // Same fingerprint but on a past date — FR-G3 only flags date >= vnToday
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run("VHM", YESTERDAY, 136_100, 136_100, 136_100, 136_100, 0);

    const bugCalls: string[] = [];
    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => SANITY_NOW_MS,
      sendBugFn: async (msg) => { bugCalls.push(msg); },
    });

    const seedHit = result.hits.find(
      (h) => h.code === "VHM" && h.flag.includes("synthetic_seed_bar"),
    );
    expect(seedHit).toBeUndefined();

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T8 — Repair idempotency
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T8: Repair idempotency — DELETE twice → second run deletes 0 rows (no crash)", () => {
  const TARGET_DATE = "2026-06-16";

  /** Build a minimal repair DB with the daily_ohlcv table. */
  function makeRepairDb(): Database {
    const db = new Database(":memory:");
    db.exec(`
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
      )
    `);
    return db;
  }

  /** Insert synthetic seed rows matching the repair fingerprint. */
  function insertSeedRows(db: Database, codes: string[]): void {
    const stmt = db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, data_env)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    );
    for (const code of codes) {
      const price = 136_100; // flat O=H=L=C, data_env=NULL, volume=0
      stmt.run(code, TARGET_DATE, price, price, price, price);
    }
  }

  const silentLog = (_msg: string): void => {};
  const applyOpts: RepairOptions = { dryRun: false, logger: silentLog };
  const dryOpts: RepairOptions = { dryRun: true, logger: silentLog };

  it("T8-a: first apply deletes N rows; second apply deletes 0 rows (idempotent)", () => {
    const db = makeRepairDb();
    const tickers = ["VHM", "VIC", "VJC"];
    insertSeedRows(db, tickers);

    // Confirm rows exist before first run
    expect(seedRowCount(db, TARGET_DATE)).toBe(3);

    // First apply
    const first = runRepair(db, applyOpts);
    expect(first.deleted_count).toBe(3);
    expect(first.matched_count).toBe(3);
    expect(seedRowCount(db, TARGET_DATE)).toBe(0);

    // Second apply — idempotent, no crash, deletes 0
    const second = runRepair(db, applyOpts);
    expect(second.deleted_count).toBe(0);
    expect(second.matched_count).toBe(0);
    expect(seedRowCount(db, TARGET_DATE)).toBe(0);

    db.close();
  });

  it("T8-b: dry-run does NOT delete rows; subsequent apply still deletes all", () => {
    const db = makeRepairDb();
    insertSeedRows(db, ["AAA", "ADS"]);

    expect(seedRowCount(db, TARGET_DATE)).toBe(2);

    // Dry-run: counts but no delete
    const dry = runRepair(db, dryOpts);
    expect(dry.matched_count).toBe(2);
    expect(dry.deleted_count).toBe(0);
    expect(seedRowCount(db, TARGET_DATE)).toBe(2); // still present

    // Apply: deletes all
    const apply = runRepair(db, applyOpts);
    expect(apply.deleted_count).toBe(2);
    expect(seedRowCount(db, TARGET_DATE)).toBe(0);

    db.close();
  });

  it("T8-c: repair does NOT delete real rows (vol>0 or non-flat OHLCV or data_env set)", () => {
    const db = makeRepairDb();

    // Synthetic seed row (should be deleted)
    const seedPrice = 7_260;
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, data_env)
       VALUES ('AAA', ?, ?, ?, ?, ?, 0, NULL)`,
    ).run(TARGET_DATE, seedPrice, seedPrice, seedPrice, seedPrice);

    // Real row: same date, same code but volume > 0 (should survive)
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, data_env)
       VALUES ('FPT', ?, 135000, 140000, 133000, 138000, 1000000, NULL)`,
    ).run(TARGET_DATE);

    // Row with data_env set (should survive — Writer E sets data_env)
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, data_env)
       VALUES ('VCB', ?, ?, ?, ?, ?, 0, 'production')`,
    ).run(TARGET_DATE, seedPrice, seedPrice, seedPrice, seedPrice);

    const apply = runRepair(db, applyOpts);
    expect(apply.deleted_count).toBe(1); // only AAA (vol=0, flat, data_env=NULL)

    // FPT real row survives
    const fptRow = db
      .prepare("SELECT * FROM daily_ohlcv WHERE code = 'FPT' AND date = ?")
      .get(TARGET_DATE);
    expect(fptRow).not.toBeNull();

    // VCB with data_env='production' survives
    const vcbRow = db
      .prepare("SELECT * FROM daily_ohlcv WHERE code = 'VCB' AND date = ?")
      .get(TARGET_DATE);
    expect(vcbRow).not.toBeNull();

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T-NOCRASH — prevClose absent → no-op, no crash
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T-NOCRASH: no prior real row → prevClose=0 → row passes through without crash", () => {
  it("TNOCRASH-a: ticker with no prior real row in DB, incoming full-VND past row → written correctly (normalize no-op, scale guard no-op)", async () => {
    const db = makeDb();
    // No prior rows seeded — prevCloseMap will be empty for this code

    const result = await writeOhlcvBatch(
      [
        {
          code: "NEWCODE",
          date: YESTERDAY,
          open: 50_000,
          high: 52_000,
          low: 49_000,
          close: 51_000,
          volume: 500_000,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    // No crash; row is written (prevClose=0 → scale guard is a no-op; values are full-VND)
    expect(result.written).toBe(1);
    expect(result.rejected).toHaveLength(0);
    expect(result.skipped).toBe(0);

    const row = getRow(db, "NEWCODE", YESTERDAY);
    expect(row).not.toBeNull();
    expect(row!.close).toBeCloseTo(51_000, 0);

    db.close();
  });

  it("TNOCRASH-b: ticker with no prior real row, incoming thousand-VND row → normalizeOhlcvToVnd applies ×1000, no crash", async () => {
    const db = makeDb();

    const result = await writeOhlcvBatch(
      [
        {
          code: "NEWCODE2",
          date: YESTERDAY,
          open: 7.26,
          high: 7.40,
          low: 7.10,
          close: 7.26,
          volume: 500_000,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    // normalizeOhlcvToVnd: 7.26 < 100 → ×1000 → 7260
    // No prior close → scale guard no-op
    expect(result.written).toBe(1);
    const row = getRow(db, "NEWCODE2", YESTERDAY);
    expect(row).not.toBeNull();
    expect(row!.close).toBeCloseTo(7_260, 0);

    db.close();
  });

  it("TNOCRASH-c: empty batch → no crash, written=0, skipped=0, rejected=0", async () => {
    const db = makeDb();

    const result = await writeOhlcvBatch([], db, { vnToday: VN_TODAY });

    expect(result.written).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.rejected).toHaveLength(0);

    db.close();
  });
});
