Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/1352-ohlcv-startup-probe.test.ts
// Task 1352 — TDD: ohlcv-startup-probe (Sprint 119)
//
// Tests are written FIRST (RED state). The implementation file
// src/scheduler/market-data/ohlcvStartupProbe.ts does not exist yet.
//
// 5 test cases:
//   TC-1: sparse — 2 tickers with < 8 rows → sendWorkFn called once, both listed
//   TC-2: populated — all tickers >= 8 rows → sendWorkFn NOT called
//   TC-3: empty watchlist — [] → sendWorkFn NOT called
//   TC-4: DB error → error caught, sendWorkFn NOT called, resolves without throw
//   TC-5: boundary — exactly 7 rows sparse, exactly 8 rows silent

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runOhlcvStartupProbe } from "../scheduler/market-data/ohlcvStartupProbe.js";

// No-op backfill stub — prevents real VNDirect network calls in unit tests
const noopBackfill = async (_db: unknown) => ({ fetched: 0, skipped: 0, errors: [] });

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY
    ,
    exchange TEXT NOT NULL DEFAULT 'HOSE')
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      code      TEXT NOT NULL,
      date      TEXT NOT NULL,
      open      REAL,
      high      REAL,
      low       REAL,
      close     REAL,
      volume    REAL
    )
  `);
  return db;
}

function seedWatchlist(db: Database, codes: string[]): void {
  for (const code of codes) {
    db.run("INSERT OR IGNORE INTO watchlist (code) VALUES (?)", [code]);
  }
}

function seedOhlcv(db: Database, code: string, rowCount: number): void {
  for (let i = 0; i < rowCount; i++) {
    db.run(
      "INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [code, `2026-04-${String(i + 1).padStart(2, "0")}`, 100, 105, 95, 102, 1000]
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1352 — ohlcv-startup-probe", () => {

  // TC-1: sparse — 2 tickers with < 8 rows each (VNM=20 ok, FPT=5 sparse, VCB=0 sparse)
  // sendWorkFn called once, message contains FPT(5) and VCB(0), does NOT mention VNM
  // sparseTickers.length === 2, sent === true
  it("TC-1: sparse tickers found — sendWorkFn called once, sparse list in message", async () => {
    const db = makeDb();
    seedWatchlist(db, ["VNM", "FPT", "VCB"]);
    seedOhlcv(db, "VNM", 20);
    seedOhlcv(db, "FPT", 5);
    // VCB has 0 rows (absent from daily_ohlcv)

    const calls: string[] = [];
    const sendWorkFn = async (msg: string): Promise<boolean> => {
      calls.push(msg);
      return true;
    };

    const result = await runOhlcvStartupProbe({ db, sendWorkFn, runBackfillFn: noopBackfill });

    expect(calls).toHaveLength(1);
    const msg = calls[0] ?? "";
    expect(msg).toContain("FPT(5)");
    expect(msg).toContain("VCB(0)");
    expect(msg).not.toContain("VNM(20)");
    expect(msg).toContain("backfill");
    expect(result.sparseTickers).toHaveLength(2);
    expect(result.sent).toBe(true);
  });

  // TC-2: populated — all tickers have >= 8 rows → sendWorkFn NOT called
  it("TC-2: populated DB — sendWorkFn NOT called, sent === false", async () => {
    const db = makeDb();
    seedWatchlist(db, ["VNM", "FPT"]);
    seedOhlcv(db, "VNM", 20);
    seedOhlcv(db, "FPT", 15);

    const calls: string[] = [];
    const sendWorkFn = async (msg: string): Promise<boolean> => {
      calls.push(msg);
      return true;
    };

    const result = await runOhlcvStartupProbe({ db, sendWorkFn });

    expect(calls).toHaveLength(0);
    expect(result.sparseTickers).toHaveLength(0);
    expect(result.sent).toBe(false);
  });

  // TC-3: empty watchlist — sendWorkFn NOT called, sent === false
  it("TC-3: empty watchlist — sendWorkFn NOT called, sent === false", async () => {
    const db = makeDb();
    // watchlist table exists but has zero rows

    const calls: string[] = [];
    const sendWorkFn = async (msg: string): Promise<boolean> => {
      calls.push(msg);
      return true;
    };

    const result = await runOhlcvStartupProbe({ db, sendWorkFn });

    expect(calls).toHaveLength(0);
    expect(result.sparseTickers).toHaveLength(0);
    expect(result.sent).toBe(false);
  });

  // TC-4: DB error → error caught, sendWorkFn NOT called, function resolves (does not throw)
  it("TC-4: DB error — caught, sendWorkFn NOT called, no throw, sent === false", async () => {
    const db = makeDb();
    // Drop watchlist table so the first query throws SQLITE_ERROR: no such table
    db.exec("DROP TABLE watchlist");

    const calls: string[] = [];
    const sendWorkFn = async (msg: string): Promise<boolean> => {
      calls.push(msg);
      return true;
    };

    // Must not throw
    let result: Awaited<ReturnType<typeof runOhlcvStartupProbe>> | undefined;
    await expect(async () => {
      result = await runOhlcvStartupProbe({ db, sendWorkFn });
    }).not.toThrow();

    expect(calls).toHaveLength(0);
    expect(result?.sent).toBe(false);
  });

  // TC-5: boundary — exactly 7 rows → sparse (included in alert)
  //                  exactly 8 rows → NOT sparse (silent)
  it("TC-5: boundary — 7 rows is sparse, 8 rows is silent", async () => {
    // --- 7 rows (sparse) ---
    const db7 = makeDb();
    seedWatchlist(db7, ["HPG"]);
    seedOhlcv(db7, "HPG", 7);

    const calls7: string[] = [];
    const sendFn7 = async (msg: string): Promise<boolean> => {
      calls7.push(msg);
      return true;
    };

    const result7 = await runOhlcvStartupProbe({ db: db7, sendWorkFn: sendFn7, runBackfillFn: noopBackfill });

    expect(calls7).toHaveLength(1);
    expect(result7.sparseTickers).toHaveLength(1);
    expect(result7.sent).toBe(true);

    // --- 8 rows (not sparse) ---
    const db8 = makeDb();
    seedWatchlist(db8, ["HPG"]);
    seedOhlcv(db8, "HPG", 8);

    const calls8: string[] = [];
    const sendFn8 = async (msg: string): Promise<boolean> => {
      calls8.push(msg);
      return true;
    };

    const result8 = await runOhlcvStartupProbe({ db: db8, sendWorkFn: sendFn8 });

    expect(calls8).toHaveLength(0);
    expect(result8.sparseTickers).toHaveLength(0);
    expect(result8.sent).toBe(false);
  });

});
