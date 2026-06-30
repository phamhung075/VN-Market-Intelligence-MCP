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

  // TC-1: sparse — 2 tickers with < 8 rows each (VNM=300 healthy, FPT=5 sparse, VCB=0 sparse)
  // sendWorkFn called once (sparse alert only — VNM is healthy and not shallow),
  // message contains FPT(5) and VCB(0), does NOT mention VNM.
  // sparseTickers.length === 2, sent === true
  it("TC-1: sparse tickers found — sendWorkFn called once, sparse list in message", async () => {
    const db = makeDb();
    seedWatchlist(db, ["VNM", "FPT", "VCB"]);
    seedOhlcv(db, "VNM", 300); // healthy (≥252) — no alert
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
    expect(msg).not.toContain("VNM");
    expect(msg).toContain("backfill");
    expect(result.sparseTickers).toHaveLength(2);
    expect(result.sent).toBe(true);
  });

  // TC-2: healthy — all tickers have >= 252 rows (DEPTH_FLOOR) → sendWorkFn NOT called
  // (Tickers with 8–251 rows are shallow and DO trigger an alert; healthy means ≥252.)
  it("TC-2: healthy DB — sendWorkFn NOT called, sent === false", async () => {
    const db = makeDb();
    seedWatchlist(db, ["VNM", "FPT"]);
    seedOhlcv(db, "VNM", 300); // healthy
    seedOhlcv(db, "FPT", 300); // healthy

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

  // TC-5: boundary — exactly 7 rows → sparse (included in sparse alert)
  //                  exactly 252 rows → healthy (silent — at DEPTH_FLOOR, not shallow)
  it("TC-5: boundary — 7 rows is sparse, 252 rows is healthy/silent", async () => {
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

    // --- 252 rows (healthy — at DEPTH_FLOOR, no alert) ---
    const db252 = makeDb();
    seedWatchlist(db252, ["HPG"]);
    seedOhlcv(db252, "HPG", 252);

    const calls252: string[] = [];
    const sendFn252 = async (msg: string): Promise<boolean> => {
      calls252.push(msg);
      return true;
    };

    const result252 = await runOhlcvStartupProbe({ db: db252, sendWorkFn: sendFn252 });

    expect(calls252).toHaveLength(0);
    expect(result252.sparseTickers).toHaveLength(0);
    expect(result252.sent).toBe(false);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// SUBTASK-D — DEPTH_FLOOR shallow classification (FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR)
// ─────────────────────────────────────────────────────────────────────────────

describe("SUBTASK-D — ohlcv depth-floor shallow classification", () => {
  // TD-1: cnt < 8 → sparse path unchanged
  // Sparse alert still fires as before; backfill still triggered; shallowTickers empty.
  it("TD-1: cnt<8 — sparse path unchanged, sparse alert fires, shallowTickers empty", async () => {
    const db = makeDb();
    seedWatchlist(db, ["VCB"]);
    seedOhlcv(db, "VCB", 3); // sparse

    const calls: string[] = [];
    const sendWorkFn = async (msg: string): Promise<boolean> => {
      calls.push(msg);
      return true;
    };

    const result = await runOhlcvStartupProbe({ db, sendWorkFn, runBackfillFn: noopBackfill });

    expect(result.sparseTickers).toHaveLength(1);
    expect(result.sparseTickers[0]).toEqual({ code: "VCB", count: 3 });
    expect(result.shallowTickers).toHaveLength(0);
    expect(result.sent).toBe(true);
    expect(result.shallowSent).toBe(false);
    // Sparse alert was sent
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("VCB(3)");
    expect(calls[0]).toContain("backfill");
  });

  // TD-2: 8 <= cnt < 252 → classified as shallow + ONE aggregated alert (not per-ticker)
  it("TD-2: 8<=cnt<252 — classified shallow, ONE aggregated Telegram WORK call, not per-ticker", async () => {
    const db = makeDb();
    seedWatchlist(db, ["HPG", "VCB", "FPT"]);
    seedOhlcv(db, "HPG", 49);  // shallow
    seedOhlcv(db, "VCB", 100); // shallow
    seedOhlcv(db, "FPT", 200); // shallow

    const calls: string[] = [];
    const sendWorkFn = async (msg: string): Promise<boolean> => {
      calls.push(msg);
      return true;
    };

    const result = await runOhlcvStartupProbe({ db, sendWorkFn });

    // Exactly ONE Telegram WORK call for all shallow tickers combined
    expect(calls).toHaveLength(1);

    // All three shallow tickers listed in the single message
    expect(calls[0]).toContain("HPG(49)");
    expect(calls[0]).toContain("VCB(100)");
    expect(calls[0]).toContain("FPT(200)");
    expect(calls[0]).toContain("252"); // references DEPTH_FLOOR

    // Result fields
    expect(result.sparseTickers).toHaveLength(0);
    expect(result.shallowTickers).toHaveLength(3);
    expect(result.sent).toBe(false);
    expect(result.shallowSent).toBe(true);
  });

  // TD-3: cnt >= 252 → healthy, no alert at all
  it("TD-3: cnt>=252 — healthy, no Telegram call, shallowTickers empty", async () => {
    const db = makeDb();
    seedWatchlist(db, ["VCB"]);
    seedOhlcv(db, "VCB", 300); // healthy

    const calls: string[] = [];
    const sendWorkFn = async (msg: string): Promise<boolean> => {
      calls.push(msg);
      return true;
    };

    const result = await runOhlcvStartupProbe({ db, sendWorkFn });

    expect(calls).toHaveLength(0);
    expect(result.sparseTickers).toHaveLength(0);
    expect(result.shallowTickers).toHaveLength(0);
    expect(result.sent).toBe(false);
    expect(result.shallowSent).toBe(false);
  });

  // TD-4: multiple shallow tickers → exactly ONE Telegram WORK call (not one per ticker)
  it("TD-4: 5 shallow tickers → exactly 1 Telegram WORK call total", async () => {
    const db = makeDb();
    const tickers = ["A", "B", "C", "D", "E"];
    seedWatchlist(db, tickers);
    // Each ticker has a different count in 8–251 range
    const counts = [8, 50, 100, 150, 251];
    tickers.forEach((t, i) => seedOhlcv(db, t, counts[i] as number));

    const calls: string[] = [];
    const sendWorkFn = async (msg: string): Promise<boolean> => {
      calls.push(msg);
      return true;
    };

    await runOhlcvStartupProbe({ db, sendWorkFn });

    // Must be EXACTLY ONE call regardless of ticker count
    expect(calls).toHaveLength(1);
  });

  // TD-5: boundary — exactly 8 rows → shallow (alert), exactly 252 rows → healthy (no alert)
  it("TD-5: boundary — 8 rows is shallow (alert), 252 rows is healthy (no alert)", async () => {
    // --- 8 rows (shallow) ---
    const db8 = makeDb();
    seedWatchlist(db8, ["HPG"]);
    seedOhlcv(db8, "HPG", 8);

    const calls8: string[] = [];
    await runOhlcvStartupProbe({
      db: db8,
      sendWorkFn: async (msg) => { calls8.push(msg); return true; },
    });

    expect(calls8).toHaveLength(1); // shallow alert
    expect(calls8[0]).toContain("HPG(8)");

    // --- 252 rows (healthy — at DEPTH_FLOOR) ---
    const db252 = makeDb();
    seedWatchlist(db252, ["HPG"]);
    seedOhlcv(db252, "HPG", 252);

    const calls252: string[] = [];
    await runOhlcvStartupProbe({
      db: db252,
      sendWorkFn: async (msg) => { calls252.push(msg); return true; },
    });

    expect(calls252).toHaveLength(0); // no alert — healthy
  });
});
