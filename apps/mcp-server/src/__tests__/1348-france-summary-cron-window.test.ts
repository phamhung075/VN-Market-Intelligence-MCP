Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/1348-france-summary-cron-window.test.ts
// Task 1348 — TDD: cron window tests for france-summary job (Sprint 117)
//
// Validates:
//   - runFranceSummary fires at various UTC times within the 06:00-08:59 window
//   - dedup guard (alreadySentToday) blocks re-send on same day
//   - yesterday's send row does NOT block today's send
//   - CRONS.franceSummary default equals '*/30 6-8 * * 1-5' (AC-6, passes after Task 1349)
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runFranceSummary } from "../scheduler/briefings/franceSummaryJob.js";
import { CRONS } from "../scheduler/jobs.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers (reused verbatim from 1344-france-summary-stale-alerts.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT,
      exchange    TEXT DEFAULT 'HOSE'
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      volume     REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      exchange   TEXT DEFAULT 'HOSE',
      PRIMARY KEY (code, fetched_at)
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mph_code_fetched
      ON market_prices_history(code, fetched_at DESC)
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code   TEXT PRIMARY KEY,
      domain TEXT NOT NULL DEFAULT 'unknown'
    ,
    exchange TEXT NOT NULL DEFAULT 'HOSE')
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code TEXT NOT NULL, date TEXT NOT NULL,
      open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL,
      close REAL NOT NULL, volume REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL, foreign_buy_vol  REAL,
    foreign_sell_vol REAL,
    foreign_net_vol  REAL,
    put_through_vol  REAL,
      PRIMARY KEY (code, date))
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      signals_json          TEXT,
      affected_actions_json TEXT,
      analysis_ids_json     TEXT,
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      user_note             TEXT,
      notified_telegram     INTEGER NOT NULL DEFAULT 0,
      resolved_at           TEXT,
      resolution_notes      TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent   TEXT NOT NULL,
      message_type TEXT NOT NULL,
      ticker       TEXT,
      text         TEXT,
      sent_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

/** Insert a price mover so the digest has data to send.
 * Uses daily_ohlcv (task 205 fix) — open=85000, close=88000 ≈ +3.53% */
function seedMover(db: Database): void {
  db.exec(`
    INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
    VALUES ('VCB', '2026-04-16', 85000, 90000, 84000, 88000, 1000000, '2026-04-16T16:00:00')
  `);
  db.exec(`INSERT OR REPLACE INTO watchlist (code) VALUES ('VCB')`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1348 — france-summary cron window", () => {

  // TC-1: nowFn = 06:00 UTC → fires and sends (06:00 is within window)
  it("TC-1: nowFn = 06:00 UTC — no prior send today → digest sends", async () => {
    const db = makeDb();
    seedMover(db);
    const sends: string[] = [];
    const sendFn = async (t: string) => { sends.push(t); return true; };
    const nowFn = () => new Date("2026-04-16T06:00:00.000Z");

    const result = await runFranceSummary({ db, sendFn, nowFn });

    expect(result.sent).toBe(true);
    expect(sends).toHaveLength(1);
  });

  // TC-2: nowFn = 07:00 UTC → fires and sends (original single-point tick)
  it("TC-2: nowFn = 07:00 UTC — no prior send today → digest sends", async () => {
    const db = makeDb();
    seedMover(db);
    const sends: string[] = [];
    const sendFn = async (t: string) => { sends.push(t); return true; };
    const nowFn = () => new Date("2026-04-16T07:00:00.000Z");

    const result = await runFranceSummary({ db, sendFn, nowFn });

    expect(result.sent).toBe(true);
    expect(sends).toHaveLength(1);
  });

  // TC-3: nowFn = 08:30 UTC → fires and sends (08:30 is within window)
  it("TC-3: nowFn = 08:30 UTC — no prior send today → digest sends", async () => {
    const db = makeDb();
    seedMover(db);
    const sends: string[] = [];
    const sendFn = async (t: string) => { sends.push(t); return true; };
    const nowFn = () => new Date("2026-04-16T08:30:00.000Z");

    const result = await runFranceSummary({ db, sendFn, nowFn });

    expect(result.sent).toBe(true);
    expect(sends).toHaveLength(1);
  });

  // TC-4: digest already sent today at 06:30, nowFn = 07:00 → dedup blocks re-send
  it("TC-4: digest already sent today → dedup guard returns early, sendFn NOT called", async () => {
    const db = makeDb();
    seedMover(db);
    // Simulate today's send row (sent at 06:30 UTC)
    db.exec(`
      INSERT INTO market_messages (from_agent, message_type, sent_at)
      VALUES ('france-summary', 'france_summary', datetime('now'))
    `);
    const sends: string[] = [];
    const sendFn = async (t: string) => { sends.push(t); return true; };
    const nowFn = () => new Date("2026-04-16T07:00:00.000Z");

    const result = await runFranceSummary({ db, sendFn, nowFn });

    expect(result.sent).toBe(false);
    expect(sends).toHaveLength(0);
  });

  // TC-5: digest sent yesterday, nowFn = today 07:00 → sends again (yesterday doesn't block today)
  it("TC-5: yesterday's send row does NOT block today's digest — sent===true", async () => {
    const db = makeDb();
    seedMover(db);
    // Simulate yesterday's send row
    db.exec(`
      INSERT INTO market_messages (from_agent, message_type, sent_at)
      VALUES ('france-summary', 'france_summary', datetime('now', '-1 day'))
    `);
    const sends: string[] = [];
    const sendFn = async (t: string) => { sends.push(t); return true; };
    const nowFn = () => new Date("2026-04-16T07:00:00.000Z");

    const result = await runFranceSummary({ db, sendFn, nowFn });

    expect(result.sent).toBe(true);
    expect(sends).toHaveLength(1);
  });

  // TC-6: nowFn = 06:30, data available (movers + no alerts) → send called with non-empty content
  it("TC-6: nowFn = 06:30 UTC, mover data available → sendFn called with non-empty content", async () => {
    const db = makeDb();
    seedMover(db);
    const sends: string[] = [];
    const sendFn = async (t: string) => { sends.push(t); return true; };
    const nowFn = () => new Date("2026-04-16T06:30:00.000Z");

    const result = await runFranceSummary({ db, sendFn, nowFn });

    expect(result.sent).toBe(true);
    expect(sends).toHaveLength(1);
    const msg = sends[0] ?? "";
    expect(msg.length).toBeGreaterThan(0);
    // Message should contain the date formatted for the France user
    expect(msg).toContain("16/04/2026");
  });

  // AC-6: CRONS.franceSummary default after Task 1349 fix
  // This test FAILS before Task 1349 is applied (old value: '0 7 * * 1-5')
  // and PASSES after Task 1349 is applied (new value: '*/30 6-8 * * 1-5')
  it("AC-6: CRONS.franceSummary default equals '*/30 6-8 * * 1-5' (passes after Task 1349)", () => {
    expect(CRONS.franceSummary).toBe("*/30 6-8 * * 1-5");
  });

});
