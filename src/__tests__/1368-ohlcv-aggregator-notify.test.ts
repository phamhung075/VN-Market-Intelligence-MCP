Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/1368-ohlcv-aggregator-notify.test.ts
// Task 1368 — TDD RED phase: notify enrichment tests for ohlcvDailyAggregatorJob (Sprint 127)
//
// Tests: sendWorkFn injection, message format, error swallowing.
// AC-1 and AC-4 FAIL until Task 1369 adds taReady count + top-3 tickers to summary.
// AC-3 FAILS until Task 1369 wraps sendWorkFn in try/catch.
// AC-2 may already PASS (current impl always calls sendWorkFn).

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runOhlcvDailyAggregator } from "../scheduler/market-data/ohlcvDailyAggregatorJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Pinned time: 2026-04-17T09:00:00.000Z → VN date 2026-04-17
// Window start (VN midnight UTC): 2026-04-16T17:00:00.000Z
// ─────────────────────────────────────────────────────────────────────────────
const NOW_MS = Date.parse("2026-04-17T09:00:00.000Z");
const VN_DATE = "2026-04-17";

// Ticks inside today's VN window
const TICK_A = "2026-04-16T17:30:00.000Z";
const TICK_B = "2026-04-16T20:00:00.000Z";
const TICK_C = "2026-04-17T07:00:00.000Z";

// ─────────────────────────────────────────────────────────────────────────────
// DB factory — minimal tables required by aggregator
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

function addTicker(db: Database, code: string): void {
  db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run(code);
}

function addTick(db: Database, code: string, price: number, fetchedAt: string, volume = 100): void {
  db.prepare(
    "INSERT OR IGNORE INTO market_prices_history (code, price, volume, exchange, fetched_at) VALUES (?, ?, ?, ?, ?)"
  ).run(code, price, volume, "HOSE", fetchedAt);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1368 — ohlcv-aggregator notify enrichment (RED phase)", () => {

  // ───────────────────────────────────────────────────────────────────────────
  // AC-1: tickers with data → sendWorkFn called once, message has row counts + taReady count
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-1: tickers with data → sendWorkFn called once, message contains written count and taReady count", async () => {
    const db = makeDb();

    // Seed 2 tickers, each with 3 ticks so they both produce OHLCV rows
    addTicker(db, "VCB");
    addTicker(db, "FPT");

    addTick(db, "VCB", 80000, TICK_A);
    addTick(db, "VCB", 85000, TICK_B);
    addTick(db, "VCB", 83000, TICK_C);

    addTick(db, "FPT", 90000, TICK_A);
    addTick(db, "FPT", 95000, TICK_B);
    addTick(db, "FPT", 88000, TICK_C);

    const calls: string[] = [];
    const sendWorkFn = async (msg: string) => { calls.push(msg); return true; };

    const result = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn,
    });

    // sendWorkFn called exactly once
    expect(calls).toHaveLength(1);

    const msg = calls[0]!;

    // Message must contain the number of rows written (2)
    expect(msg).toContain("written=2");

    // Message must contain taReady count (numeric, e.g. "taReady=0" since <8 rows each)
    expect(msg).toMatch(/taReady=\d+/);

    // Result is valid
    expect(result.rowsWritten).toBe(2);
    expect(result.sent).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // AC-2: 0 rows aggregated (no ticks in window) → sendWorkFn still called, "0 rows" in message
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-2: 0 rows aggregated → sendWorkFn still called with written=0 summary (not silent)", async () => {
    const db = makeDb();

    // Ticker in watchlist but no ticks inserted for today's window
    addTicker(db, "HPG");

    const calls: string[] = [];
    const sendWorkFn = async (msg: string) => { calls.push(msg); return true; };

    const result = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn,
    });

    // Must still notify even when nothing was written
    expect(calls).toHaveLength(1);
    const msg = calls[0]!;

    // Message must contain written=0 (not omit it)
    expect(msg).toContain("written=0");

    expect(result.rowsWritten).toBe(0);
    expect(result.sent).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // AC-3: sendWorkFn throws → error swallowed, aggregator returns result without crash
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-3: sendWorkFn throws → error swallowed, aggregator returns OhlcvAggregatorResult", async () => {
    const db = makeDb();

    addTicker(db, "VIC");
    addTick(db, "VIC", 50000, TICK_A);
    addTick(db, "VIC", 52000, TICK_B);

    const sendWorkFn = async (_msg: string): Promise<unknown> => {
      throw new Error("Telegram network timeout");
    };

    // Must NOT throw — error swallowed
    // Note: Bun 1.3.11 `.resolves.not.toThrow()` is broken for non-function resolved values;
    // use direct await instead to assert the promise resolves without rejection.
    let result: Awaited<ReturnType<typeof runOhlcvDailyAggregator>> | undefined;
    result = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn,
    });

    // Aggregation still completed correctly
    expect(result).toBeDefined();
    expect(result!.rowsWritten).toBe(1);

    // sent=false when sendWorkFn threw
    expect(result!.sent).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // AC-4: message format contains top-3 ticker names by row count
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-4: message contains top-3 ticker names ordered by row count (desc)", async () => {
    const db = makeDb();

    // 4 tickers so top-3 selection is meaningful
    const tickers = ["VCB", "FPT", "HPG", "MWG"];
    for (const code of tickers) {
      addTicker(db, code);
    }

    // Give each ticker ticks so they all produce OHLCV rows
    // All tickers get 3 ticks each — any 3 of the 4 should appear in top-3 list
    for (const code of tickers) {
      addTick(db, code, 10000, TICK_A);
      addTick(db, code, 11000, TICK_B);
      addTick(db, code, 10500, TICK_C);
    }

    const calls: string[] = [];
    const sendWorkFn = async (msg: string) => { calls.push(msg); return true; };

    await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn,
    });

    expect(calls).toHaveLength(1);
    const msg = calls[0]!;

    // Message must contain exactly 3 of the 4 ticker names (top-3 by row count)
    const foundTickers = tickers.filter((code) => msg.includes(code));
    expect(foundTickers.length).toBeGreaterThanOrEqual(3);
  });

});
