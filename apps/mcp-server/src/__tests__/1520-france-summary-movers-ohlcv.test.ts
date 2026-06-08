Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/1520-france-summary-movers-ohlcv.test.ts
// Task 205 — TDD: fetchTopMovers reads daily_ohlcv instead of market_prices_history
//
// Verifies that movers are ranked by ABS(change_pct) computed from
// daily_ohlcv (close-open)/open*100, not from consecutive 60s VPS ticks.
//
// Test strategy: seed daily_ohlcv with 3 watchlist tickers at distinct
// open/close values, assert that the top mover is correctly identified
// and that change_pct is non-zero when open != close.

import { describe, it, expect, beforeEach } from "bun:test"
import { Database } from "bun:sqlite"
import { runFranceSummary } from "../scheduler/briefings/franceSummaryJob.js"
import type { FranceSummaryOptions } from "../scheduler/briefings/franceSummaryJob.js"

// ─────────────────────────────────────────────────────────────────────────────
// DB helper — minimal tables required by franceSummaryJob
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:")
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent   TEXT NOT NULL,
      message_type TEXT NOT NULL,
      sent_at      TEXT NOT NULL DEFAULT (datetime('now')),
      payload      TEXT
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code   TEXT PRIMARY KEY,
      domain TEXT NOT NULL DEFAULT 'unknown'
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL,
      high       REAL NOT NULL,
      low        REAL NOT NULL,
      close      REAL NOT NULL,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
    )
  `)
  return db
}

const noopSend = async (_text: string) => true
const now = () => new Date("2026-04-17T07:00:00.000Z")

/** Insert a ticker into daily_ohlcv with explicit open/close values. */
function insertOhlcv(
  db: Database,
  code: string,
  date: string,
  open: number,
  close: number,
): void {
  const high = Math.max(open, close) * 1.01
  const low = Math.min(open, close) * 0.99
  db.exec(
    `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
     VALUES ('${code}', '${date}', ${open}, ${high}, ${low}, ${close}, 1000000, '${date}T16:00:00')`,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 205 — fetchTopMovers uses daily_ohlcv (open/close)", () => {
  let db: Database

  beforeEach(() => {
    db = makeDb()
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-1: Top mover is the ticker with largest (close-open)/open, not 0%
  //
  // Seed: 3 watchlist tickers on '2026-04-17'
  //   BIG: open=100, close=110 → +10%
  //   MED: open=100, close=105 → +5%
  //   SML: open=100, close=102 → +2%
  //
  // VPS ticks would show 0% (same price in market_prices_history).
  // Expect: moverCount=3, message contains "BIG" before "MED" before "SML"
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-1: top mover ranked by daily_ohlcv ABS(change_pct), non-zero", async () => {
    const date = "2026-04-17"
    insertOhlcv(db, "BIG", date, 100_000, 110_000)  // +10%
    insertOhlcv(db, "MED", date, 100_000, 105_000)  // +5%
    insertOhlcv(db, "SML", date, 100_000, 102_000)  // +2%

    db.exec(`INSERT INTO watchlist (code) VALUES ('BIG'), ('MED'), ('SML')`)

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const opts: FranceSummaryOptions = { db, sendFn, nowFn: now, getPnlFn: async () => null }
    const result = await runFranceSummary(opts)

    expect(result.sent).toBe(true)
    expect(result.moverCount).toBe(3)

    const msg = sends[0] ?? ""
    // All three must appear
    expect(msg).toContain("BIG")
    expect(msg).toContain("MED")
    expect(msg).toContain("SML")
    // BIG must appear before MED (sorted descending by abs change_pct)
    expect(msg.indexOf("BIG")).toBeLessThan(msg.indexOf("MED"))
    expect(msg.indexOf("MED")).toBeLessThan(msg.indexOf("SML"))
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-2: VPS ticks with identical prices do NOT produce 0% movers
  //
  // Seed: market_prices_history has same price for cur and prev (60s apart) → 0%
  //       daily_ohlcv has open != close → non-zero %
  // Expect: moverCount >= 1 with non-zero change in message
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-2: VPS ticks at same price → daily_ohlcv still shows non-zero move", async () => {
    const date = "2026-04-17"
    // daily_ohlcv: open=50000, close=55000 → +10%
    insertOhlcv(db, "VIC", date, 50_000, 55_000)
    db.exec(`INSERT INTO watchlist (code) VALUES ('VIC')`)

    // VPS ticks: same price (would produce 0% in old query)
    db.exec(`
      INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at)
      VALUES ('VIC', 55000, 1000000, '2026-04-17T07:59:00'),
             ('VIC', 55000, 1000000, '2026-04-17T08:00:00')
    `)

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const opts: FranceSummaryOptions = { db, sendFn, nowFn: now, getPnlFn: async () => null }
    const result = await runFranceSummary(opts)

    expect(result.sent).toBe(true)
    expect(result.moverCount).toBeGreaterThanOrEqual(1)

    const msg = sends[0] ?? ""
    expect(msg).toContain("VIC")
    // Must NOT show 0.00%
    expect(msg).not.toContain("VIC +0.00%")
    expect(msg).not.toContain("VIC -0.00%")
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-3: Only the MAX(date) row is used — older rows do not affect result
  //
  // Seed: 'AAA' has rows on '2026-04-16' (open=100, close=50 → -50%) and
  //       '2026-04-17' (open=100, close=103 → +3%)
  // Expect: change_pct reflects the 2026-04-17 row (+3%), not the -50% stale row
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-3: only MAX(date) daily_ohlcv row is used for change_pct", async () => {
    // Old row (should be ignored)
    insertOhlcv(db, "AAA", "2026-04-16", 100_000, 50_000)  // -50% if used
    // Latest row
    insertOhlcv(db, "AAA", "2026-04-17", 100_000, 103_000)  // +3%

    db.exec(`INSERT INTO watchlist (code) VALUES ('AAA')`)

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const opts: FranceSummaryOptions = { db, sendFn, nowFn: now, getPnlFn: async () => null }
    const result = await runFranceSummary(opts)

    expect(result.sent).toBe(true)
    expect(result.moverCount).toBeGreaterThanOrEqual(1)

    const msg = sends[0] ?? ""
    expect(msg).toContain("AAA")
    // Should show roughly +3%, definitely not -50%
    expect(msg).not.toContain("-50")
    expect(msg).not.toContain("-49")
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-4: Non-watchlist ticker in daily_ohlcv is excluded
  //
  // Seed: 'NOWL' in daily_ohlcv but NOT in watchlist (big mover +20%)
  //       'WL1' in both watchlist and daily_ohlcv (+3%)
  // Expect: moverCount=1, message contains 'WL1' but NOT 'NOWL'
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-4: non-watchlist ticker in daily_ohlcv is excluded", async () => {
    const date = "2026-04-17"
    insertOhlcv(db, "NOWL", date, 100_000, 120_000)  // +20%, not in watchlist
    insertOhlcv(db, "WL1",  date, 100_000, 103_000)  // +3%, in watchlist

    db.exec(`INSERT INTO watchlist (code) VALUES ('WL1')`)
    // NOWL intentionally NOT inserted into watchlist

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const opts: FranceSummaryOptions = { db, sendFn, nowFn: now, getPnlFn: async () => null }
    const result = await runFranceSummary(opts)

    expect(result.sent).toBe(true)
    expect(result.moverCount).toBe(1)

    const msg = sends[0] ?? ""
    expect(msg).toContain("WL1")
    expect(msg).not.toContain("NOWL")
  })
})
