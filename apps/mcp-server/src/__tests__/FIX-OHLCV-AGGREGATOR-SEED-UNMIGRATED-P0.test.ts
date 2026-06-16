Bun.env["DB_PATH"] = ":memory:";
/**
 * FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0 — TDD tests
 *
 * Proves that ohlcvDailyAggregatorJob now routes ALL writes through
 * writeOhlcvBatch so FR-S1 seed-rejection, C=0 guard,
 * detectAndNormalizeScaleFromPrevClose, and validateOhlcvUnit apply
 * to ALL tickers generically.
 *
 * Class 1: flat vol=0 seed bar → FR-S1 must reject it (no row in DB)
 * Class 2: all-zero bar (O=H=L=C=0) → C=0 guard + validateOhlcvUnit zero_ohlc must reject
 * Class 3: ÷1000 scale leak with prevClose → detectAndNormalizeScaleFromPrevClose must correct
 * Generic: synthetic wrong-scale row → guards fire without per-ticker allowlist
 *
 * VN date pinned to 2026-04-17 (a past date → FR-S1 date>=vnToday is false for
 * ticks on that date, so the "past" aggregation path is NOT affected by FR-S1.
 * To exercise FR-S1 we use the SAME date as vnToday by pinning nowMs so
 * vnDateString == "2026-04-17" AND vnToday inside writeOhlcvBatch computes to
 * the real Date.now() + 7h → "2026-06-16". Since "2026-04-17" < "2026-06-16",
 * the FR-S1 condition (row.date >= vnToday) is false for past dates.
 *
 * HOWEVER: the aggregator now passes vnToday=dateStr to writeOhlcvBatch, which
 * makes FR-S1 compare row.date >= dateStr. Both are "2026-04-17" in the past tests.
 * So FR-S1 DOES fire when the aggregated bar is flat+vol=0 for the same date.
 * This is the correct behaviour: a flat vol=0 bar on any date is a synthetic seed.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runOhlcvDailyAggregator } from "../scheduler/market-data/ohlcvDailyAggregatorJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Pinned time: 2026-04-17T09:00:00.000Z → VN date 2026-04-17
// ─────────────────────────────────────────────────────────────────────────────
const NOW_ISO = "2026-04-17T09:00:00.000Z";
const NOW_MS  = Date.parse(NOW_ISO);
const VN_DATE = "2026-04-17";

// Ticks inside today's VN window
const TICK_1 = "2026-04-16T17:30:00.000Z"; // earliest (open)
const TICK_2 = "2026-04-16T19:00:00.000Z";
const TICK_3 = "2026-04-17T08:30:00.000Z"; // latest (close)

// ─────────────────────────────────────────────────────────────────────────────
// DB factory — includes data_env column (production schema)
// ─────────────────────────────────────────────────────────────────────────────
function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE'
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT,
      price      REAL,
      volume     REAL,
      exchange   TEXT,
      fetched_at TEXT,
      PRIMARY KEY (code, fetched_at)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT,
      date       TEXT,
      open       REAL,
      high       REAL,
      low        REAL,
      close      REAL,
      volume     REAL,
      updated_at TEXT,
      data_env   TEXT,
      PRIMARY KEY (code, date)
    );
  `);
  return db;
}

function addTicker(db: Database, code: string): void {
  db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run(code);
}

function addTick(
  db: Database,
  code: string,
  price: number,
  fetchedAt: string,
  volume = 0,
): void {
  db.prepare(
    "INSERT OR IGNORE INTO market_prices_history (code, price, volume, exchange, fetched_at) VALUES (?, ?, ?, ?, ?)",
  ).run(code, price, volume, "HOSE", fetchedAt);
}

/** Seed a prior real close into daily_ohlcv (simulates a backfill row). */
function seedPriorClose(db: Database, code: string, date: string, close: number): void {
  db.prepare(
    `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 100000, datetime('now'))`,
  ).run(code, date, close, close, close, close);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0 — aggregator routes through writeOhlcvBatch", () => {

  // ──────────────────────────────────────────────────────────────────────────
  // Class 1 — FR-S1: flat vol=0 bar rejected (seed-rejection)
  // Scenario: aggregator derives O=H=L=C (single same-price tick, vol=0)
  //           → writeOhlcvBatch FR-S1 must reject it → no row in daily_ohlcv
  // ──────────────────────────────────────────────────────────────────────────
  it("Class-1 FR-S1: flat vol=0 seed bar → rejected, 0 rows in daily_ohlcv", async () => {
    const db = makeDb();
    addTicker(db, "DCR");

    // Single tick — produces O=H=L=C=5900, vol=MAX(0)=0 (seed-bar pattern)
    addTick(db, "DCR", 5900, TICK_1, 0);

    const result = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn: async () => true,
    });

    // FR-S1 must have skipped it — rowsWritten=0
    expect(result.rowsWritten).toBe(0);
    // tickersSkipped accounts for FR-S1 skips
    expect(result.tickersSkipped).toBeGreaterThanOrEqual(1);

    const rows = db.prepare("SELECT * FROM daily_ohlcv").all();
    expect(rows).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Class 2 — C=0 / zero guard: all-zero bar rejected
  // Scenario: no ticks (or zero-price ticks with vol=0) → O=H=L=C=0
  //           wait — if count=0, ticker is skipped before building the row.
  //           If ticks exist but ALL have price=0 → aggregator computes O=H=L=C=0
  //           → writeOhlcvBatch C=0 guard + validateOhlcvUnit must reject it
  // ──────────────────────────────────────────────────────────────────────────
  it("Class-2 C=0 guard: all-zero O=H=L=C bar rejected generically", async () => {
    const db = makeDb();
    addTicker(db, "DAG");

    // Tick with price=0 and vol=0 → aggregator computes O=H=L=C=0, vol=0
    addTick(db, "DAG", 0, TICK_1, 0);

    const result = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn: async () => true,
    });

    // Zero-close guard must reject this row
    expect(result.rowsWritten).toBe(0);

    const rows = db.prepare("SELECT * FROM daily_ohlcv").all();
    expect(rows).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Class 3 — ÷1000 correction via detectAndNormalizeScaleFromPrevClose
  // Scenario: ticker with prior real close=99800 in daily_ohlcv (backfill row)
  //           intraday tick price=99.8 (thousand-VND, stored ÷1000 in history)
  //           → aggregator gets O=H=L=C=99.8, vol>0
  //           → writeOhlcvBatch sees prevClose=99800, ratio=99800/99.8≈1000 ≥ 50
  //           → corrects to 99800 → plausible value written
  // ──────────────────────────────────────────────────────────────────────────
  it("Class-3 ÷1000 correction: PDN-style prevClose=99800 × ratio ≥ 50 → ×1000 applied", async () => {
    const db = makeDb();
    addTicker(db, "PDN");

    // Seed prior real close (backfill row, date before VN_DATE)
    seedPriorClose(db, "PDN", "2026-04-16", 99800);

    // Intraday tick with price=99.8 (÷1000 scale) and non-zero vol
    addTick(db, "PDN", 99.8, TICK_1, 1000);
    addTick(db, "PDN", 100.2, TICK_2, 1200);
    addTick(db, "PDN", 99.9, TICK_3, 1100);

    const result = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn: async () => true,
    });

    // Row must be written (after correction)
    expect(result.rowsWritten).toBe(1);

    const row = db.prepare(
      "SELECT * FROM daily_ohlcv WHERE code = ? AND date = ?",
    ).get("PDN", VN_DATE) as { close: number; open: number; high: number; low: number } | undefined;

    expect(row).toBeDefined();
    // After ×1000 correction: close should be ~99900 (99.9×1000), not 99.9
    expect(row!.close).toBeGreaterThan(1000);
    // Must be within HOSE ±7% of prior close 99800 → [92814, 106786]
    expect(row!.close).toBeGreaterThanOrEqual(92000);
    expect(row!.close).toBeLessThanOrEqual(107000);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Generic guard: synthetic wrong-scale row rejected without per-ticker allowlist
  // Scenario: inject a row where close=100 (÷1000 of 100000) but prevClose=100000
  //           → ratio=1000 → ×1000 correction → 100000 → plausible
  //           Tests that the guard is generic (no hardcoded ticker logic)
  // ──────────────────────────────────────────────────────────────────────────
  it("Generic: synthetic ÷1000 row corrected for any unknown ticker (no allowlist)", async () => {
    const db = makeDb();
    addTicker(db, "XTICKER");

    // Prior real close = 100000 VND
    seedPriorClose(db, "XTICKER", "2026-04-16", 100000);

    // Tick at 100 (÷1000 of 100000), non-zero vol
    addTick(db, "XTICKER", 100, TICK_1, 500);
    addTick(db, "XTICKER", 101, TICK_2, 600);
    addTick(db, "XTICKER", 100.5, TICK_3, 550);

    const result = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn: async () => true,
    });

    expect(result.rowsWritten).toBe(1);
    const row = db.prepare(
      "SELECT close FROM daily_ohlcv WHERE code = ? AND date = ?",
    ).get("XTICKER", VN_DATE) as { close: number } | undefined;

    expect(row).toBeDefined();
    // 100.5 × 1000 = 100500 → within 7% of 100000 → plausible
    expect(row!.close).toBeGreaterThan(1000);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Happy path preserved: valid real-tick bar still written correctly
  // Existing behaviour must not regress — normal tickers with vol>0 still written
  // ──────────────────────────────────────────────────────────────────────────
  it("Happy path: valid vol>0 ticks → correct OHLCV row written (existing behaviour preserved)", async () => {
    const db = makeDb();
    addTicker(db, "VCB");

    addTick(db, "VCB", 80000, TICK_1, 5000);
    addTick(db, "VCB", 85000, TICK_2, 6000);
    addTick(db, "VCB", 83000, TICK_3, 5500);

    const result = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn: async () => true,
    });

    expect(result.rowsWritten).toBe(1);
    expect(result.tickersSkipped).toBe(0);

    const row = db.prepare(
      "SELECT * FROM daily_ohlcv WHERE code = ? AND date = ?",
    ).get("VCB", VN_DATE) as { open: number; high: number; low: number; close: number; volume: number } | undefined;

    expect(row).toBeDefined();
    expect(row!.open).toBe(80000);
    expect(row!.high).toBe(85000);
    expect(row!.low).toBe(80000);
    expect(row!.close).toBe(83000);
    expect(row!.volume).toBe(6000); // MAX(volume) across ticks
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Multi-ticker: mixed valid + flat-seed → only valid written
  // Class 1 in a multi-ticker context (the PRIMARY gap scenario)
  // ──────────────────────────────────────────────────────────────────────────
  it("Multi-ticker: valid ticker written, flat-seed ticker rejected by FR-S1", async () => {
    const db = makeDb();
    addTicker(db, "VCB"); // valid
    addTicker(db, "H11"); // flat seed (vol=0, O=H=L=C)

    // VCB: real ticks with volume
    addTick(db, "VCB", 80000, TICK_1, 5000);
    addTick(db, "VCB", 85000, TICK_2, 6000);
    addTick(db, "VCB", 83000, TICK_3, 5500);

    // H11: single tick with vol=0 → flat seed bar
    addTick(db, "H11", 25700, TICK_1, 0);

    const result = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn: async () => true,
    });

    // Only VCB written; H11 flat-seed rejected
    expect(result.rowsWritten).toBe(1);

    const vcbRow = db.prepare(
      "SELECT * FROM daily_ohlcv WHERE code = ?",
    ).get("VCB") as { close: number } | undefined;
    expect(vcbRow).toBeDefined();
    expect(vcbRow!.close).toBe(83000);

    const h11Row = db.prepare(
      "SELECT * FROM daily_ohlcv WHERE code = ?",
    ).get("H11");
    expect(h11Row).toBeNull();
  });

});
