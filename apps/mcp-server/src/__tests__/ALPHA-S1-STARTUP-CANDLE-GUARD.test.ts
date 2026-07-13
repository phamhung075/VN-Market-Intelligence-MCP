Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/ALPHA-S1-STARTUP-CANDLE-GUARD.test.ts
//
// ALPHA-S1-STARTUP-CANDLE-GUARD (2026-07-13) — calendar-aware OHLCV startup catch-up guard.
// Design: docs/handoffs/ALPHA-S1-architect-design.md §1 (recoverMissingOhlcvSession) + §2
// (runOhlcvCandlePresenceGuard).
//
// Every test injects its own in-memory bun:sqlite Database — never touches the shared
// getDb() singleton — so no createBunServer/HTTP server is needed (neither function under
// test is an HTTP route; both are scheduler/application-layer functions taking an injected
// `db`, mirroring the existing 1358-ohlcv-aggregator.test.ts pattern for this exact module).
//
// Test groups:
//   CAL-1/CAL-2: domain helper sanity (mostRecentTradingDayOnOrBefore backward walk)
//   REC-1..REC-4: recoverMissingOhlcvSession direct branch coverage
//   G-1..G-6: runOhlcvCandlePresenceGuard — calendar-skip (weekend + holiday), real-gap
//             catch-up, VNINDEX-only gap, fail-loud (not swallowed)

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  mostRecentTradingDayOnOrBefore,
  shiftDateDays,
} from "../domain/services/vnTradingCalendar.js";
import { recoverMissingOhlcvSession } from "../application/usecases/recoverMissingOhlcvSession.js";
import { runOhlcvCandlePresenceGuard } from "../scheduler/market-data/ohlcvCandleGuard.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB factory — mirrors 1358-ohlcv-aggregator.test.ts's makeDb() shape + adds
// ohlcv_backfill_queue (schema-market-data.ts's real DDL, minus the migration ALTERs
// this test never needs).
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
      PRIMARY KEY (code, date)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ohlcv_backfill_queue (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      queued_at   TEXT NOT NULL DEFAULT (datetime('now')),
      done        INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

function addWatchlistCode(db: Database, code: string): void {
  db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run(code);
}

function addOhlcvRow(db: Database, code: string, date: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES (?, ?, 10, 12, 9, 11, 1000, datetime('now'))"
  ).run(code, date);
}

function addTick(db: Database, code: string, price: number, fetchedAt: string, volume = 100): void {
  db.prepare(
    "INSERT OR IGNORE INTO market_prices_history (code, price, volume, exchange, fetched_at) VALUES (?, ?, ?, ?, ?)"
  ).run(code, price, volume, "HOSE", fetchedAt);
}

function countPendingQueueRows(db: Database): number {
  const row = db
    .prepare<{ cnt: number }, []>("SELECT COUNT(*) AS cnt FROM ohlcv_backfill_queue WHERE done = 0")
    .get();
  return row?.cnt ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// CAL-1/CAL-2 — domain helper sanity (net-new export, no prior test coverage)
// ─────────────────────────────────────────────────────────────────────────────

describe("mostRecentTradingDayOnOrBefore — backward calendar walk", () => {
  it("CAL-1: weekend input walks back through Sat+Sun to the prior Friday (2026-07-12 Sun -> 2026-07-10 Fri)", () => {
    expect(mostRecentTradingDayOnOrBefore("2026-07-12")).toBe("2026-07-10");
  });

  it("CAL-2: known VN holiday block (Reunification Day + Labour Day, 2026-04-30/05-01) walks back to the last real trading day 2026-04-29", () => {
    expect(mostRecentTradingDayOnOrBefore("2026-05-01")).toBe("2026-04-29");
  });

  it("CAL-3: a plain trading-day input returns itself unchanged (no walk needed)", () => {
    expect(mostRecentTradingDayOnOrBefore("2026-07-13")).toBe("2026-07-13");
  });

  it("shiftDateDays: -1 day across a month-agnostic boundary", () => {
    expect(shiftDateDays("2026-07-13", -1)).toBe("2026-07-12");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REC-1..REC-4 — recoverMissingOhlcvSession direct branch coverage
// ─────────────────────────────────────────────────────────────────────────────

describe("recoverMissingOhlcvSession", () => {
  it("REC-1: date already has a daily_ohlcv row -> action:none, no side effects", async () => {
    const db = makeDb();
    addOhlcvRow(db, "VCB", "2026-07-10");

    const result = await recoverMissingOhlcvSession("2026-07-10", { db });

    expect(result.alreadyPresent).toBe(true);
    expect(result.action).toBe("none");
    expect(result.ticksFound).toBe(0);
  });

  it("REC-2: surviving ticks for the date -> re-aggregates via the real aggregator, writes daily_ohlcv", async () => {
    const db = makeDb();
    addWatchlistCode(db, "VCB");
    // VN midnight(2026-07-10) in UTC = 2026-07-09T17:00:00.000Z
    addTick(db, "VCB", 80000, "2026-07-09T17:30:00.000Z");
    addTick(db, "VCB", 85000, "2026-07-09T19:00:00.000Z");
    addTick(db, "VCB", 83000, "2026-07-10T08:30:00.000Z");

    const result = await recoverMissingOhlcvSession("2026-07-10", { db });

    expect(result.alreadyPresent).toBe(false);
    expect(result.action).toBe("reaggregated");
    expect(result.ticksFound).toBe(3);
    expect(result.aggregatorResult?.rowsWritten).toBe(1);

    const row = db
      .prepare<{ open: number; close: number }, [string, string]>(
        "SELECT open, close FROM daily_ohlcv WHERE code = ? AND date = ?"
      )
      .get("VCB", "2026-07-10");
    expect(row?.open).toBe(80000);
    expect(row?.close).toBe(83000);
  });

  it("REC-3: no surviving ticks, no pending queue row -> vps-relay-triggered, one new queue row inserted", async () => {
    const db = makeDb();

    const result = await recoverMissingOhlcvSession("2026-07-10", { db });

    expect(result.action).toBe("vps-relay-triggered");
    expect(result.ticksFound).toBe(0);
    expect(countPendingQueueRows(db)).toBe(1);
  });

  it("REC-4: no surviving ticks, a pending queue row already exists -> vps-relay-already-pending, no duplicate insert", async () => {
    const db = makeDb();
    db.prepare("INSERT INTO ohlcv_backfill_queue (queued_at, done) VALUES (datetime('now'), 0)").run();

    const result = await recoverMissingOhlcvSession("2026-07-10", { db });

    expect(result.action).toBe("vps-relay-already-pending");
    expect(countPendingQueueRows(db)).toBe(1); // still exactly 1 — no duplicate
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G-1..G-6 — runOhlcvCandlePresenceGuard
// ─────────────────────────────────────────────────────────────────────────────

// Monday 2026-07-13, 01:00 UTC (= 08:00 ICT, before the 09:00 ICT market-open cutoff)
// -> vnToday="2026-07-13", cutoffDate=shiftDateDays(-1)="2026-07-12" (Sunday)
// -> mostRecentTradingDayOnOrBefore("2026-07-12") walks Sun->Sat->Fri = "2026-07-10"
const MONDAY_MORNING_NOW_MS = Date.parse("2026-07-13T01:00:00.000Z");
const WEEKEND_EXPECTED_DATE = "2026-07-10";

describe("runOhlcvCandlePresenceGuard — calendar-skip (weekend)", () => {
  it("G-1: Monday-morning check resolves expectedDate to the prior Friday, all present -> action:none, no recovery/alert", async () => {
    const db = makeDb();
    addWatchlistCode(db, "VCB");
    addWatchlistCode(db, "FPT");
    addOhlcvRow(db, "VCB", WEEKEND_EXPECTED_DATE);
    addOhlcvRow(db, "FPT", WEEKEND_EXPECTED_DATE);
    addOhlcvRow(db, "VNINDEX", WEEKEND_EXPECTED_DATE);

    let recoverCalls = 0;
    let workCalls = 0;
    const result = await runOhlcvCandlePresenceGuard({
      db,
      nowMs: MONDAY_MORNING_NOW_MS,
      sendWorkFn: async () => { workCalls++; },
      recoverFn: async () => { recoverCalls++; return { date: WEEKEND_EXPECTED_DATE, alreadyPresent: true, ticksFound: 0, action: "none" }; },
    });

    expect(result.expectedDate).toBe(WEEKEND_EXPECTED_DATE); // Friday, NEVER Sat/Sun
    expect(result.action).toBe("none");
    expect(recoverCalls).toBe(0);
    expect(workCalls).toBe(0);
  });

  it("G-2: catch-up fires on a REAL missing trading-day gap (Friday candle genuinely absent) — recovery called once, one WORK alert", async () => {
    const db = makeDb();
    addWatchlistCode(db, "VCB");
    addWatchlistCode(db, "FPT");
    // Deliberately do NOT seed daily_ohlcv for WEEKEND_EXPECTED_DATE — genuine gap.

    let recoverCalls = 0;
    let recoverArgDate = "";
    const workMsgs: string[] = [];
    const result = await runOhlcvCandlePresenceGuard({
      db,
      nowMs: MONDAY_MORNING_NOW_MS,
      sendWorkFn: async (msg: string) => { workMsgs.push(msg); },
      recoverFn: async (date) => {
        recoverCalls++;
        recoverArgDate = date;
        return { date, alreadyPresent: false, ticksFound: 12, action: "reaggregated" };
      },
    });

    expect(result.expectedDate).toBe(WEEKEND_EXPECTED_DATE);
    expect(result.missingCodes.sort()).toEqual(["FPT", "VCB"]);
    expect(recoverCalls).toBe(1);
    expect(recoverArgDate).toBe(WEEKEND_EXPECTED_DATE);
    expect(workMsgs).toHaveLength(1);
    expect(workMsgs[0]).toContain(WEEKEND_EXPECTED_DATE);
    expect(workMsgs[0]).toContain("reaggregated");
    expect(result.action).toBe("reaggregated");
  });

  it("G-3: VNINDEX-only gap is detected separately from the watchlist check", async () => {
    const db = makeDb();
    addWatchlistCode(db, "VCB");
    addOhlcvRow(db, "VCB", WEEKEND_EXPECTED_DATE);
    // VNINDEX row NOT seeded — VNINDEX-only gap.

    let recoverCalls = 0;
    const result = await runOhlcvCandlePresenceGuard({
      db,
      nowMs: MONDAY_MORNING_NOW_MS,
      sendWorkFn: async () => {},
      recoverFn: async (date) => { recoverCalls++; return { date, alreadyPresent: false, ticksFound: 0, action: "vps-relay-triggered" }; },
    });

    expect(result.vnindexMissing).toBe(true);
    expect(result.missingCodes).toEqual([]); // watchlist itself is fully present
    expect(recoverCalls).toBe(1);
  });
});

describe("runOhlcvCandlePresenceGuard — calendar-skip (holiday)", () => {
  // 2026-05-01 ICT afternoon -> vnToday="2026-05-01" (Quốc Tế Lao Động, holiday), no
  // beforeMarketOpen shift needed -> mostRecentTradingDayOnOrBefore walks the 4-day
  // 04-30/05-01 holiday + 05-02/05-03 weekend-adjacent block back to 2026-04-29.
  const HOLIDAY_NOW_MS = Date.parse("2026-05-01T05:00:00.000Z"); // 12:00 ICT
  const HOLIDAY_EXPECTED_DATE = "2026-04-29";

  it("G-4: a VN public holiday is NEVER selected as the expected trading day — resolves to the last real trading day before it", async () => {
    const db = makeDb();
    addWatchlistCode(db, "VCB");
    addOhlcvRow(db, "VCB", HOLIDAY_EXPECTED_DATE);
    addOhlcvRow(db, "VNINDEX", HOLIDAY_EXPECTED_DATE);

    let recoverCalls = 0;
    const result = await runOhlcvCandlePresenceGuard({
      db,
      nowMs: HOLIDAY_NOW_MS,
      sendWorkFn: async () => {},
      recoverFn: async () => { recoverCalls++; return { date: HOLIDAY_EXPECTED_DATE, alreadyPresent: true, ticksFound: 0, action: "none" }; },
    });

    expect(result.expectedDate).toBe(HOLIDAY_EXPECTED_DATE);
    expect(result.action).toBe("none");
    expect(recoverCalls).toBe(0); // holiday correctly never treated as a gap
  });
});

describe("runOhlcvCandlePresenceGuard — fail-loud (not swallowed)", () => {
  it("G-5: recoverFn throws -> the guard does NOT swallow the error (rejects with the same failure)", async () => {
    const db = makeDb();
    addWatchlistCode(db, "VCB");
    // No daily_ohlcv row -> genuine gap -> recoverFn invoked -> throws.

    const boom = new Error("boom: DB unreachable");
    await expect(
      runOhlcvCandlePresenceGuard({
        db,
        nowMs: MONDAY_MORNING_NOW_MS,
        sendWorkFn: async () => {},
        recoverFn: async () => { throw boom; },
      })
    ).rejects.toThrow("boom: DB unreachable");
    // sendTelegramBug is called internally (real infra call — safe no-op in test env,
    // no TELEGRAM_BOT_TOKEN configured, per telegram.ts's "never throws" contract) —
    // the assertion above already proves the guard re-throws rather than swallowing.
  });

  it("G-6: all-present path never calls recoverFn even when nowMs lands mid-gap window (no false alert)", async () => {
    const db = makeDb();
    addWatchlistCode(db, "VCB");
    addOhlcvRow(db, "VCB", WEEKEND_EXPECTED_DATE);
    addOhlcvRow(db, "VNINDEX", WEEKEND_EXPECTED_DATE);

    let recoverCalls = 0;
    let workCalls = 0;
    await runOhlcvCandlePresenceGuard({
      db,
      nowMs: MONDAY_MORNING_NOW_MS,
      sendWorkFn: async () => { workCalls++; },
      recoverFn: async () => { recoverCalls++; return { date: WEEKEND_EXPECTED_DATE, alreadyPresent: true, ticksFound: 0, action: "none" }; },
    });

    expect(recoverCalls).toBe(0);
    expect(workCalls).toBe(0);
  });
});
