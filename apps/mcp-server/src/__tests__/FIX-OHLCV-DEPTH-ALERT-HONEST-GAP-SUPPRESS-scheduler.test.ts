/**
 * FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS — scheduler depth-gap trigger tests
 *
 * ohlcvHistoryBackfillJob.ts's production depth-gap check (gapTickers, no fetchFn injected)
 * used to insert a fresh ohlcv_backfill_queue trigger row EVERY cron cycle for any code below
 * HISTORY_TARGET_BARS — including permanently-empty/long-delisted "honest gap" codes (RAW-verified
 * example set: BDI, DLC, JSH, SIS, VDC) that can never reach that depth. Fixed: those codes are
 * now excluded via the data-driven isHonestGapCode predicate before deciding whether to trigger.
 *
 * DoD (a): a delisted-only depth shortfall => NO new done=0 re-queue trigger.
 * Regression control: a genuine (fresh, recoverable) shortfall still triggers normally.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runOhlcvHistoryBackfill } from "../scheduler/market-data/ohlcvHistoryBackfillJob.js";

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code             TEXT NOT NULL,
      date             TEXT NOT NULL,
      open             REAL NOT NULL DEFAULT 0,
      high             REAL NOT NULL DEFAULT 0,
      low              REAL NOT NULL DEFAULT 0,
      close            REAL NOT NULL,
      volume           REAL NOT NULL DEFAULT 0,
      updated_at       TEXT NOT NULL DEFAULT '',
      foreign_buy_vol  REAL,
      foreign_sell_vol REAL,
      foreign_net_vol  REAL,
      put_through_vol  REAL,
      PRIMARY KEY (code, date)
    );
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE'
    );
    CREATE TABLE IF NOT EXISTS ohlcv_backfill_queue (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      queued_at   TEXT NOT NULL DEFAULT (datetime('now')),
      done        INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0,
      bars_inserted INTEGER
    );
  `);
  return db;
}

function seedWatchlist(db: Database, code: string): void {
  db.prepare("INSERT OR IGNORE INTO watchlist(code) VALUES (?)").run(code);
}

/** Seed `count` fresh bars (recent dates, going back from today) for `code`. */
function seedFreshBars(db: Database, code: string, count: number): void {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES (?, ?, 25000, 25500, 24500, 25200, 1000, datetime('now'))"
  );
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    stmt.run(code, d);
  }
}

/** Seed a single, long-stale bar (2016-vintage) for `code` — DLC-class honest gap. */
function seedStaleBar(db: Database, code: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES (?, '2016-06-21', 25000, 25500, 24500, 25200, 1000, datetime('now'))"
  ).run(code);
}

function pendingQueueCount(db: Database): number {
  const row = db.query("SELECT COUNT(*) as c FROM ohlcv_backfill_queue WHERE done = 0").get() as { c: number };
  return row.c;
}

describe("ohlcvHistoryBackfillJob — FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS depth-gap trigger", () => {
  it("DoD(a): all shallow watchlist codes are honest-gap (0-bar never-listed / years-stale) → no VPS queue trigger inserted", async () => {
    const db = makeDb();
    // VNINDEX must be pre-seeded healthy — VNINDEX is never honest-gap-exempt in this job.
    seedFreshBars(db, "VNINDEX", 500);
    seedWatchlist(db, "ZOMBIE1"); // 0 bars ever — JSH/SIS/VDC class
    seedWatchlist(db, "ZOMBIE2"); // 1 long-stale bar — DLC class
    seedStaleBar(db, "ZOMBIE2");

    // No fetchFn injected → production path (defaultFetchFn + depth-gap trigger block run)
    await runOhlcvHistoryBackfill({ db, delayMs: 0 });

    expect(pendingQueueCount(db)).toBe(0);
  });

  it("regression control: a genuine fresh shortfall (not honest-gap) still triggers the VPS queue", async () => {
    const db = makeDb();
    seedFreshBars(db, "VNINDEX", 500);
    seedWatchlist(db, "REALGAP");
    seedFreshBars(db, "REALGAP", 10); // fresh dates, only 10 bars — recoverable, real shortfall

    await runOhlcvHistoryBackfill({ db, delayMs: 0 });

    expect(pendingQueueCount(db)).toBe(1);
  });

  it("mixed set: honest-gap code excluded, genuine shortfall code still triggers exactly one row", async () => {
    const db = makeDb();
    seedFreshBars(db, "VNINDEX", 500);
    seedWatchlist(db, "ZOMBIE1"); // 0 bars — honest gap
    seedWatchlist(db, "REALGAP");
    seedFreshBars(db, "REALGAP", 10); // real shortfall

    await runOhlcvHistoryBackfill({ db, delayMs: 0 });

    // Single INSERT regardless of how many codes are in gapTickers — proves the trigger
    // still fires for the genuine gap even with an honest-gap code present alongside it.
    expect(pendingQueueCount(db)).toBe(1);
  });

  it("a stalled VNINDEX (0 bars) is NEVER honest-gap-excluded — still triggers", async () => {
    const db = makeDb();
    // VNINDEX deliberately left unseeded (0 bars) — must never be treated as an honest gap.
    seedWatchlist(db, "ACB");
    seedFreshBars(db, "ACB", 500); // watchlist itself healthy

    await runOhlcvHistoryBackfill({ db, delayMs: 0 });

    expect(pendingQueueCount(db)).toBe(1);
  });
});
