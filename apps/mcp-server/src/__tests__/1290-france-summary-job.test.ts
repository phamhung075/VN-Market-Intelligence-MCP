// src/__tests__/1290-france-summary-job.test.ts
// Task 1290 — franceSummaryJob original tests, updated for 1316/1317 rewrite API
// The job now reads from market_prices and alerts (not rag_analyses).
// Return type changed: signalCount → { moverCount, alertCount, taCount }
import { describe, it, expect, beforeEach } from "bun:test"
import { Database } from "bun:sqlite"
import { runFranceSummary } from "../scheduler/briefings/franceSummaryJob.js"
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

function makeDb(): Database {
  const db = new Database(":memory:")
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
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
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      volume     REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      exchange   TEXT DEFAULT 'HOSE',
      PRIMARY KEY (code, fetched_at)
    )
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mph_code_fetched
      ON market_prices_history(code, fetched_at DESC)
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code   TEXT PRIMARY KEY,
      domain TEXT NOT NULL DEFAULT 'unknown'
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code TEXT NOT NULL, date TEXT NOT NULL,
      open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL,
      close REAL NOT NULL, volume REAL NOT NULL DEFAULT 0,
      foreign_net_vol REAL,
      updated_at TEXT NOT NULL, PRIMARY KEY (code, date)
    )
  `)
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
  `)
  return db
}

describe("Task 1290 — franceSummaryJob", () => {
  let db: Database

  beforeEach(() => {
    db = makeDb()
  })

  it("returns { sent: false } when DB has no market_prices or alerts rows", async () => {
    const sends: string[] = []
    const sendFn = async (text: string) => { sends.push(text); return true }

    const result = await runFranceSummary({ db, sendFn })

    expect(result.sent).toBe(false)
    expect(result.moverCount).toBe(0)
    expect(result.alertCount).toBe(0)
    expect(Array.isArray(result.taSignals)).toBe(true)
    expect(result.taSignals.length).toBe(0)
    expect(sends).toHaveLength(0)
  })

  it("returns { sent: true } when market_prices data exists", async () => {
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, updated_at) VALUES
        ('VCB', 88000, 3.5, '2026-04-15T06:00:00'),
        ('HPG', 22000, -5.2, '2026-04-15T06:00:00'),
        ('VNM', 75000, 1.1, '2026-04-15T06:00:00')
    `)
    db.exec(`
      INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at) VALUES
        ('VCB', 85000, 1000000, '2026-04-14T08:00:00'),
        ('VCB', 88000, 1000000, '2026-04-15T08:00:00'),
        ('HPG', 23000, 1000000, '2026-04-14T08:00:00'),
        ('HPG', 22000, 1000000, '2026-04-15T08:00:00'),
        ('VNM', 74000, 1000000, '2026-04-14T08:00:00'),
        ('VNM', 75000, 1000000, '2026-04-15T08:00:00')
    `)
    db.exec(`
      INSERT OR REPLACE INTO watchlist (code) VALUES ('VCB'), ('HPG'), ('VNM')
    `)
    db.exec(`
      INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES
        ('VCB', '2026-04-15', 85000, 89000, 84000, 88000, 1000000, '2026-04-15T16:00:00'),
        ('HPG', '2026-04-15', 23000, 23500, 21500, 22000, 1000000, '2026-04-15T16:00:00'),
        ('VNM', '2026-04-15', 74000, 76000, 73000, 75000, 1000000, '2026-04-15T16:00:00')
    `)

    const sends: string[] = []
    const sendFn = async (text: string) => { sends.push(text); return true }

    const result = await runFranceSummary({ db, sendFn })

    expect(result.sent).toBe(true)
    expect(result.moverCount).toBeGreaterThanOrEqual(1)
    expect(sends).toHaveLength(1)
  })

  it("returns correct shape with boolean sent and number fields", async () => {
    const result = await runFranceSummary({ db, sendFn: async () => true })
    expect(typeof result.sent).toBe("boolean")
    expect(typeof result.moverCount).toBe("number")
    expect(typeof result.alertCount).toBe("number")
    expect(Array.isArray(result.taSignals)).toBe(true)
  })

  it("caps moverCount at 3 top movers in the message", async () => {
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, updated_at) VALUES
        ('A', 1000, 9.0, '2026-04-15T06:00:00'),
        ('B', 1000, -8.5, '2026-04-15T06:00:00'),
        ('C', 1000, 8.0, '2026-04-15T06:00:00'),
        ('D', 1000, -5.0, '2026-04-15T06:00:00'),
        ('E', 1000, 4.0, '2026-04-15T06:00:00')
    `)
    db.exec(`
      INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at) VALUES
        ('A', 917, 1000000, '2026-04-14T08:00:00'),
        ('A', 1000, 1000000, '2026-04-15T08:00:00'),
        ('B', 1085, 1000000, '2026-04-14T08:00:00'),
        ('B', 1000, 1000000, '2026-04-15T08:00:00'),
        ('C', 926, 1000000, '2026-04-14T08:00:00'),
        ('C', 1000, 1000000, '2026-04-15T08:00:00'),
        ('D', 1053, 1000000, '2026-04-14T08:00:00'),
        ('D', 1000, 1000000, '2026-04-15T08:00:00'),
        ('E', 962, 1000000, '2026-04-14T08:00:00'),
        ('E', 1000, 1000000, '2026-04-15T08:00:00')
    `)
    db.exec(`
      INSERT OR REPLACE INTO watchlist (code) VALUES ('A'), ('B'), ('C'), ('D'), ('E')
    `)
    // daily_ohlcv: A=+9%, B=-8.5%, C=+8%, D=-5%, E=+4%
    db.exec(`
      INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES
        ('A', '2026-04-15', 917,  1010, 910,  1000, 1000000, '2026-04-15T16:00:00'),
        ('B', '2026-04-15', 1085, 1090, 995,  1000, 1000000, '2026-04-15T16:00:00'),
        ('C', '2026-04-15', 926,  1010, 920,  1000, 1000000, '2026-04-15T16:00:00'),
        ('D', '2026-04-15', 1053, 1060, 995,  1000, 1000000, '2026-04-15T16:00:00'),
        ('E', '2026-04-15', 962,  1010, 955,  1000, 1000000, '2026-04-15T16:00:00')
    `)

    const sends: string[] = []
    const sendFn = async (text: string) => { sends.push(text); return true }

    const result = await runFranceSummary({ db, sendFn })

    expect(result.sent).toBe(true)
    expect(result.moverCount).toBe(3)
    // Top 3 by ABS(change_pct): A(9.0), B(-8.5), C(8.0)
    expect(sends[0]).toContain("A")
    expect(sends[0]).toContain("B")
    expect(sends[0]).toContain("C")
    // Low movers should NOT appear
    expect(sends[0]).not.toContain("+4.00%")
  })

  it("does not throw when sendFn rejects", async () => {
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, updated_at) VALUES
        ('VCB', 88000, 3.5, '2026-04-15T06:00:00')
    `)
    db.exec(`
      INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at) VALUES
        ('VCB', 85000, 1000000, '2026-04-14T08:00:00'),
        ('VCB', 88000, 1000000, '2026-04-15T08:00:00')
    `)
    db.exec(`INSERT OR REPLACE INTO watchlist (code) VALUES ('VCB')`)
    db.exec(`
      INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES
        ('VCB', '2026-04-15', 85000, 89000, 84000, 88000, 1000000, '2026-04-15T16:00:00')
    `)

    const sendFn = async (_text: string) => { throw new Error("Telegram down") }

    // Should not throw — error is swallowed internally
    const result = await runFranceSummary({ db, sendFn })
    expect(result.sent).toBe(false)
    expect(result.moverCount).toBe(1)
  })
})
