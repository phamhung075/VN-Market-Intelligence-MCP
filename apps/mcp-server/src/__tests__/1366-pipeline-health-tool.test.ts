Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/1366-pipeline-health-tool.test.ts
// Task 1366 — TDD RED phase: 5 failing tests for getOhlcvPipelineHealth (Sprint 126)
//
// All 5 test cases MUST FAIL until Task 1367 implements getOhlcvPipelineHealth.
// Import is a stub that throws "Not implemented — task 1367".

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  getOhlcvPipelineHealth,
} from "../application/usecases/getOhlcvPipelineHealth.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB factory
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE IF NOT EXISTS watchlist (code TEXT PRIMARY KEY,
    exchange TEXT NOT NULL DEFAULT 'HOSE')`);
  db.exec(`CREATE TABLE IF NOT EXISTS daily_ohlcv (
    code TEXT NOT NULL, date TEXT NOT NULL, open REAL, high REAL,
    low REAL, close REAL NOT NULL, volume REAL, updated_at TEXT,
    PRIMARY KEY (code, date)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS ohlcv_backfill_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    queued_at TEXT NOT NULL DEFAULT (datetime('now')),
    done INTEGER NOT NULL DEFAULT 0
  )`);
  return db;
}

/** Insert a ticker into watchlist. */
function addTicker(db: Database, code: string): void {
  db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run(code);
}

/** Insert N rows of daily_ohlcv for a ticker with distinct dates. */
function addOhlcvRows(db: Database, code: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const date = `2026-04-${String(i + 1).padStart(2, "0")}`;
    db.prepare(
      "INSERT OR IGNORE INTO daily_ohlcv (code, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(code, date, 10000, 11000, 9000, 10500, 1000);
  }
}

/** Insert a pending row into ohlcv_backfill_queue. */
function addPendingQueueRow(db: Database): void {
  db.prepare(
    "INSERT INTO ohlcv_backfill_queue (queued_at, done) VALUES (datetime('now'), 0)"
  ).run();
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests (all RED until task 1367)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1366 — getOhlcvPipelineHealth (RED phase, all fail until 1367)", () => {

  // ───────────────────────────────────────────────────────────────────────────
  // AC-1: 2 tickers with 20 rows each → both taReady=true, pending=false
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-1: 2 tickers ×20 rows → both taReady=true, backfillQueue.pending=false, 2 taReady tickers", async () => {
    const db = makeDb();

    addTicker(db, "VIC");
    addTicker(db, "HPG");
    addOhlcvRows(db, "VIC", 20);
    addOhlcvRows(db, "HPG", 20);

    const result = await getOhlcvPipelineHealth({ db, tickers: ["VIC", "HPG"] });

    const vic = result.tickerStatus.find((t) => t.code === "VIC");
    const hpg = result.tickerStatus.find((t) => t.code === "HPG");

    expect(vic).toBeDefined();
    expect(vic!.ohlcvRows).toBe(20);
    expect(vic!.taReady).toBe(true);

    expect(hpg).toBeDefined();
    expect(hpg!.ohlcvRows).toBe(20);
    expect(hpg!.taReady).toBe(true);

    expect(result.backfillQueue.pending).toBe(false);

    // Both tickers are taReady
    const taReadyCount = result.tickerStatus.filter((t) => t.taReady).length;
    expect(taReadyCount).toBe(2);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // AC-2: 1 ticker with 3 rows (< 8 threshold) → taReady=false, taReadyCount=0
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-2: 1 ticker with 3 rows (<8) → taReady=false", async () => {
    const db = makeDb();

    addTicker(db, "FPT");
    addOhlcvRows(db, "FPT", 3);

    const result = await getOhlcvPipelineHealth({ db, tickers: ["FPT"] });

    const fpt = result.tickerStatus.find((t) => t.code === "FPT");
    expect(fpt).toBeDefined();
    expect(fpt!.ohlcvRows).toBe(3);
    expect(fpt!.taReady).toBe(false);

    const taReadyCount = result.tickerStatus.filter((t) => t.taReady).length;
    expect(taReadyCount).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // AC-3: pending row in ohlcv_backfill_queue (done=0) → backfillQueue.pending=true
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-3: pending row in ohlcv_backfill_queue → backfillQueue.pending=true", async () => {
    const db = makeDb();

    addPendingQueueRow(db);

    const result = await getOhlcvPipelineHealth({ db, tickers: [] });

    expect(result.backfillQueue.pending).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // AC-4: computeTaFn returns non-neutral signal → taSummaryCount > 0
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-4: computeTaFn returns rsiStatus='overbought' → taSummaryCount > 0", async () => {
    const db = makeDb();

    addTicker(db, "VHM");
    addOhlcvRows(db, "VHM", 10);

    const overboughtStub = (_code: string, _db: Database) =>
      ({ rsiStatus: "overbought", rsi14: 75 });

    const result = await getOhlcvPipelineHealth({
      db,
      tickers: ["VHM"],
      computeTaFn: overboughtStub,
    });

    expect(result.taSummaryCount).toBeGreaterThan(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // AC-5: computeTaFn returns null → taSummaryCount=0, no crash
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-5: computeTaFn returns null for all tickers → taSummaryCount=0, no crash", async () => {
    const db = makeDb();

    addTicker(db, "TCB");
    addOhlcvRows(db, "TCB", 10);

    const nullStub = (_code: string, _db: Database) => null;

    const result = await getOhlcvPipelineHealth({
      db,
      tickers: ["TCB"],
      computeTaFn: nullStub,
    });

    expect(result.taSummaryCount).toBe(0);
    expect(typeof result.taSummaryCount).toBe("number");
  });

});
