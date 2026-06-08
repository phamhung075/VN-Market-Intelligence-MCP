Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/1465-ohlcv-staleness-check.test.ts
// Task 1465 — TDD RED: ohlcv-staleness-check (Sprint 175)
//
// 5 test cases:
//   TC-1: all present — 3 watchlist tickers all have today's VN date row → no alert
//   TC-2: >50% missing — 2 of 3 tickers missing today's row → sendWorkFn called once
//   TC-3: exactly 50% missing — 1 of 2 tickers missing → no alert (threshold is >50%, not >=50%)
//   TC-4: empty watchlist — no tickers → no alert, sent===false
//   TC-5: VN date correct — job uses VN date (UTC+7), not raw UTC date

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { VN_OFFSET_MS } from "../domain/services/timeConstants.js";
import { runOhlcvStalenessCheck } from "../scheduler/market-data/ohlcvStalenessCheckJob.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      code   TEXT NOT NULL,
      date   TEXT NOT NULL,
      open   REAL,
      high   REAL,
      low    REAL,
      close  REAL,
      volume REAL
    )
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

function seedWatchlist(db: Database, codes: string[]): void {
  for (const code of codes) {
    db.run("INSERT OR IGNORE INTO watchlist (code) VALUES (?)", [code]);
  }
}

function seedOhlcvRow(db: Database, code: string, date: string): void {
  db.run(
    "INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [code, date, 100, 105, 95, 102, 1000]
  );
}

/** Returns VN date string (YYYY-MM-DD) for a given UTC epoch ms */
function vnDateOf(nowMs: number): string {
  return new Date(nowMs + VN_OFFSET_MS).toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1465 — ohlcv-staleness-check", () => {

  // TC-1: all tickers have today's VN date row → no alert
  it("TC-1: all tickers present — sendWorkFn NOT called, sent===false", async () => {
    const db = makeDb();
    const nowMs = Date.now();
    const today = vnDateOf(nowMs);
    seedWatchlist(db, ["VNM", "FPT", "VCB"]);
    seedOhlcvRow(db, "VNM", today);
    seedOhlcvRow(db, "FPT", today);
    seedOhlcvRow(db, "VCB", today);

    const calls: string[] = [];
    const result = await runOhlcvStalenessCheck({
      db,
      nowMsFn: () => nowMs,
      sendWorkFn: async (msg) => { calls.push(msg); return true; },
    });

    expect(calls).toHaveLength(0);
    expect(result.missingCount).toBe(0);
    expect(result.totalCount).toBe(3);
    expect(result.sent).toBe(false);
  });

  // TC-2: 2 of 3 tickers missing today → >50% → sendWorkFn called once
  it("TC-2: >50% missing — sendWorkFn called once, message lists missing tickers", async () => {
    const db = makeDb();
    const nowMs = Date.now();
    const today = vnDateOf(nowMs);
    seedWatchlist(db, ["VNM", "FPT", "VCB"]);
    seedOhlcvRow(db, "VNM", today); // only VNM present

    const calls: string[] = [];
    const result = await runOhlcvStalenessCheck({
      db,
      nowMsFn: () => nowMs,
      sendWorkFn: async (msg) => { calls.push(msg); return true; },
    });

    expect(calls).toHaveLength(1);
    const msg = calls[0] ?? "";
    expect(msg).toContain("FPT");
    expect(msg).toContain("VCB");
    expect(msg).not.toContain("VNM");
    expect(result.missingCount).toBe(2);
    expect(result.totalCount).toBe(3);
    expect(result.sent).toBe(true);
  });

  // TC-3: exactly 50% missing (1 of 2) → NOT >50% → no alert
  it("TC-3: exactly 50% missing — threshold is >50%, no alert sent", async () => {
    const db = makeDb();
    const nowMs = Date.now();
    const today = vnDateOf(nowMs);
    seedWatchlist(db, ["VNM", "FPT"]);
    seedOhlcvRow(db, "VNM", today); // 1 of 2 present = 50% missing = not >50%

    const calls: string[] = [];
    const result = await runOhlcvStalenessCheck({
      db,
      nowMsFn: () => nowMs,
      sendWorkFn: async (msg) => { calls.push(msg); return true; },
    });

    expect(calls).toHaveLength(0);
    expect(result.missingCount).toBe(1);
    expect(result.totalCount).toBe(2);
    expect(result.sent).toBe(false);
  });

  // TC-4: empty watchlist → no alert, sent===false
  it("TC-4: empty watchlist — sendWorkFn NOT called, sent===false", async () => {
    const db = makeDb();
    const nowMs = Date.now();

    const calls: string[] = [];
    const result = await runOhlcvStalenessCheck({
      db,
      nowMsFn: () => nowMs,
      sendWorkFn: async (msg) => { calls.push(msg); return true; },
    });

    expect(calls).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(result.sent).toBe(false);
  });

  // TC-5: VN date is used (UTC+7), not raw UTC
  // Inject nowMs = 2026-04-19T00:30:00Z → UTC date = 2026-04-19, VN date = 2026-04-19T07:30 = 2026-04-19
  // Inject nowMs = 2026-04-18T22:00:00Z → UTC date = 2026-04-18, VN date = 2026-04-19T05:00 = 2026-04-19
  // Seed with VN date 2026-04-19 for all tickers. Both nowMs cases should see zero missing.
  it("TC-5: VN date used — UTC+7 offset applied correctly", async () => {
    const db = makeDb();
    // nowMs = 2026-04-18T22:00:00Z → VN date = 2026-04-19 (because UTC+7 = 05:00 on Apr 19)
    const nowMs = new Date("2026-04-18T22:00:00Z").getTime();
    const vnDate = vnDateOf(nowMs); // expect "2026-04-19"
    expect(vnDate).toBe("2026-04-19");

    seedWatchlist(db, ["VNM"]);
    seedOhlcvRow(db, "VNM", "2026-04-19"); // matches VN date

    const calls: string[] = [];
    const result = await runOhlcvStalenessCheck({
      db,
      nowMsFn: () => nowMs,
      sendWorkFn: async (msg) => { calls.push(msg); return true; },
    });

    expect(calls).toHaveLength(0);
    expect(result.sent).toBe(false);
    expect(result.missingCount).toBe(0);
  });

});
