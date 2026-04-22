Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/1277-ohlcv-guard-checks.test.ts
// Task 1277a — TDD RED phase: 6 failing tests for OHLCV guard checks (Sprint 1277)
//
// All 6 test cases validate that ohlcvDailyAggregatorJob properly guards against
// missing OHLCV components (open/close/high/low) using the logic at lines 103–112:
//
//   if (open === undefined || close === undefined || high === undefined || low === undefined) {
//     tickersSkipped++;
//     continue;  // Skip ticker if any component missing
//   }
//
// VN timezone: UTC+7. VN midnight in UTC = (today_VN - 1 day)T17:00:00.000Z
// Pin nowMs to 2026-04-17T09:00:00.000Z so:
//   vnDateString  = "2026-04-17"
//   windowStart   = "2026-04-16T17:00:00.000Z"
//   windowEnd     = "2026-04-17T09:00:00.000Z" (== nowMs as ISO)

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runOhlcvDailyAggregator } from "../scheduler/market-data/ohlcvDailyAggregatorJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Pinned time constants
// ─────────────────────────────────────────────────────────────────────────────
const NOW_ISO = "2026-04-17T09:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO); // pinned "now"
const VN_DATE = "2026-04-17";       // today in VN (UTC+7)
const WINDOW_START = "2026-04-16T17:00:00.000Z"; // VN midnight in UTC
// WINDOW_END == NOW_ISO

// Ticks inside today's VN window (between 2026-04-16T17:00Z and 2026-04-17T09:00Z)
const TICK_1 = "2026-04-16T17:30:00.000Z"; // earliest (open)
const TICK_2 = "2026-04-16T19:00:00.000Z"; // middle (high/low)
const TICK_3 = "2026-04-17T08:30:00.000Z"; // latest (close)

// ─────────────────────────────────────────────────────────────────────────────
// DB factory helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE watchlist (
      code TEXT PRIMARY KEY
    );
  `);
  db.exec(`
    CREATE TABLE market_prices_history (
      code       TEXT,
      price      REAL,
      volume     REAL,
      exchange   TEXT,
      fetched_at TEXT,
      PRIMARY KEY (code, fetched_at)
    );
  `);
  db.exec(`
    CREATE TABLE daily_ohlcv (
      code       TEXT,
      date       TEXT,
      open       REAL,
      high       REAL,
      low        REAL,
      close      REAL,
      volume     REAL,
      updated_at TEXT,
      PRIMARY KEY (code, date)
    );
  `);
  return db;
}

/** Insert a watchlist ticker. */
function addTicker(db: Database, code: string): void {
  db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run(code);
}

/** Insert a price tick into market_prices_history. All params bound — no interpolation. */
function addTick(
  db: Database,
  code: string,
  price: number,
  fetchedAt: string,
  volume = 100
): void {
  db.prepare(
    "INSERT OR IGNORE INTO market_prices_history (code, price, volume, exchange, fetched_at) VALUES (?, ?, ?, ?, ?)"
  ).run(code, price, volume, "HOSE", fetchedAt);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1277 — OHLCV guard checks (6 test cases)", () => {

  // ───────────────────────────────────────────────────────────────────────────
  // TC-1: All OHLCV Present (Happy Path)
  // ───────────────────────────────────────────────────────────────────────────
  it("TC-1: All OHLCV present → insert to daily_ohlcv, tickersSkipped=0", async () => {
    const db = makeDb();

    addTicker(db, "VCB");
    addTick(db, "VCB", 80000, TICK_1); // open
    addTick(db, "VCB", 85000, TICK_2); // high
    addTick(db, "VCB", 83000, TICK_3); // close

    const result = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn: async () => true,
    });

    expect(result.tickersProcessed).toBe(1);
    expect(result.rowsWritten).toBe(1);
    expect(result.tickersSkipped).toBe(0);

    const rows = db.prepare("SELECT * FROM daily_ohlcv").all() as Array<any>;
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe("VCB");
    expect(rows[0].open).toBe(80000);
    expect(rows[0].high).toBe(85000);
    expect(rows[0].low).toBe(80000);
    expect(rows[0].close).toBe(83000);
    expect(rows[0].volume).toBe(3);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TC-2: Open Undefined (No Early Tick)
  // Guard: open === undefined → skip
  // ───────────────────────────────────────────────────────────────────────────
  it("TC-2: Open undefined (no early tick) → skip ticker, tickersSkipped=1", async () => {
    const db = makeDb();

    addTicker(db, "VCB");
    // Insert two ticks AFTER TICK_1 (no earliest tick for open)
    addTick(db, "VCB", 85000, TICK_2);
    addTick(db, "VCB", 83000, TICK_3);

    const result = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn: async () => true,
    });

    expect(result.tickersProcessed).toBe(1);
    expect(result.rowsWritten).toBe(0);
    expect(result.tickersSkipped).toBe(1);

    const rows = db.prepare("SELECT * FROM daily_ohlcv").all();
    expect(rows).toHaveLength(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TC-3: Close Undefined (No Late Tick)
  // Guard: close === undefined → skip
  // ───────────────────────────────────────────────────────────────────────────
  it("TC-3: Close undefined (no late tick) → skip ticker, tickersSkipped=1", async () => {
    const db = makeDb();

    addTicker(db, "VCB");
    // Insert two ticks BEFORE TICK_3 (no latest tick for close)
    addTick(db, "VCB", 80000, TICK_1);
    addTick(db, "VCB", 85000, TICK_2);

    const result = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn: async () => true,
    });

    expect(result.tickersProcessed).toBe(1);
    expect(result.rowsWritten).toBe(0);
    expect(result.tickersSkipped).toBe(1);

    const rows = db.prepare("SELECT * FROM daily_ohlcv").all();
    expect(rows).toHaveLength(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TC-4: High Undefined (Empty Window)
  // Guard: high === undefined → skip (MAX of empty set = undefined)
  // ───────────────────────────────────────────────────────────────────────────
  it("TC-4: High undefined (empty window, 0 ticks) → skip ticker, tickersSkipped=1", async () => {
    const db = makeDb();

    addTicker(db, "VCB");
    // No ticks inserted (empty window)

    const result = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn: async () => true,
    });

    expect(result.tickersProcessed).toBe(1);
    expect(result.rowsWritten).toBe(0);
    expect(result.tickersSkipped).toBe(1);

    const rows = db.prepare("SELECT * FROM daily_ohlcv").all();
    expect(rows).toHaveLength(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TC-5: Low Undefined (Empty Window)
  // Guard: low === undefined → skip (MIN of empty set = undefined)
  // ───────────────────────────────────────────────────────────────────────────
  it("TC-5: Low undefined (empty window, 0 ticks) → skip ticker, tickersSkipped=1", async () => {
    const db = makeDb();

    addTicker(db, "FPT");
    // No ticks inserted (empty window)

    const result = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn: async () => true,
    });

    expect(result.tickersProcessed).toBe(1);
    expect(result.rowsWritten).toBe(0);
    expect(result.tickersSkipped).toBe(1);

    const rows = db.prepare("SELECT * FROM daily_ohlcv").all();
    expect(rows).toHaveLength(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TC-6: Batch with Mixed Completeness
  // T1 (VCB): complete → insert
  // T2 (FPT): missing open (no early tick) → skip
  // T3 (SSI): missing close (no late tick) → skip
  // ───────────────────────────────────────────────────────────────────────────
  it("TC-6: 3 tickers mixed completeness → 1 insert (T1), tickersSkipped=2", async () => {
    const db = makeDb();

    // T1: complete
    addTicker(db, "VCB");
    addTick(db, "VCB", 80000, TICK_1);
    addTick(db, "VCB", 85000, TICK_2);
    addTick(db, "VCB", 83000, TICK_3);

    // T2: missing open (no early tick)
    addTicker(db, "FPT");
    addTick(db, "FPT", 92000, TICK_2);
    addTick(db, "FPT", 90000, TICK_3);

    // T3: missing close (no late tick)
    addTicker(db, "SSI");
    addTick(db, "SSI", 50000, TICK_1);
    addTick(db, "SSI", 52000, TICK_2);

    const result = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn: async () => true,
    });

    expect(result.tickersProcessed).toBe(3);
    expect(result.rowsWritten).toBe(1);
    expect(result.tickersSkipped).toBe(2);

    const rows = db.prepare("SELECT * FROM daily_ohlcv ORDER BY code ASC").all() as Array<any>;
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe("VCB");
    expect(rows[0].open).toBe(80000);
    expect(rows[0].high).toBe(85000);
    expect(rows[0].low).toBe(80000);
    expect(rows[0].close).toBe(83000);
  });

});
