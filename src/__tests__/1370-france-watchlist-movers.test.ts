Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/1370-france-watchlist-movers.test.ts
// Task 1370 — TDD: franceSummaryJob fetchTopMovers filters by watchlist
//
// Updated by task 205: seeds changed from market_prices_history to
// daily_ohlcv (open/close) since fetchTopMovers now reads daily_ohlcv.
//
// Test strategy: direct DB setup + call runFranceSummary with sendFn spy.
// Insert tickers into watchlist + daily_ohlcv.
// Verify movers array only contains watchlist tickers.

import { describe, it, expect, beforeEach } from "bun:test"
import { Database } from "bun:sqlite"
import { runFranceSummary } from "../scheduler/briefings/franceSummaryJob.js"
import type { FranceSummaryOptions } from "../scheduler/briefings/franceSummaryJob.js"

// ─────────────────────────────────────────────────────────────────────────────
// DB helper — creates all tables needed by franceSummaryJob
// daily_ohlcv is the movers source (task 205 fix).
// market_prices_history kept to satisfy any other callers that reference it.
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
    CREATE INDEX IF NOT EXISTS idx_mph_code_fetched
      ON market_prices_history(code, fetched_at DESC)
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

// Helper: insert a ticker into daily_ohlcv with a given change_pct.
// open is derived from priceToday and changePct so that
// (close-open)/open*100 == changePct.
function insertOhlcv(
  db: Database,
  code: string,
  priceToday: number,
  changePct: number,
): void {
  const open = priceToday / (1 + changePct / 100)
  const close = priceToday
  const high = Math.max(open, close) * 1.01
  const low = Math.min(open, close) * 0.99
  const date = "2026-04-17"
  db.exec(
    `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
     VALUES ('${code}', '${date}', ${open.toFixed(2)}, ${high.toFixed(2)}, ${low.toFixed(2)}, ${close}, 1000000, '${date}T16:00:00')`,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1370 — fetchTopMovers filters by watchlist", () => {
  let db: Database

  beforeEach(() => {
    db = makeDb()
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-1: Non-watchlist ticker has highest % move → excluded from movers;
  //       watchlist ticker appears in movers result.
  //
  // Setup: NON_WL has change_pct=+20% (highest), WL1 has change_pct=+5%
  //        Only WL1 is in watchlist.
  // Expect: result.moverCount >= 1 and the sent message contains "WL1" but
  //         NOT "NON_WL" in the movers section.
  //
  // GREEN since task 1371 + task 205.
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-1: non-watchlist ticker excluded; watchlist ticker appears in movers", async () => {
    // NON_WL: highest move but NOT in watchlist
    insertOhlcv(db, "NON_WL", 100_000, 20.0)
    // WL1: in watchlist, lower move
    insertOhlcv(db, "WL1", 50_000, 5.0)
    db.exec(`INSERT INTO watchlist (code) VALUES ('WL1')`)

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const opts: FranceSummaryOptions = { db, sendFn, nowFn: now, getPnlFn: async () => null }
    const result = await runFranceSummary(opts)

    // Job must send (there is at least one watchlist mover)
    expect(result.sent).toBe(true)
    expect(result.moverCount).toBeGreaterThanOrEqual(1)

    const msg = sends[0] ?? ""
    // Watchlist ticker must appear in the message movers section
    expect(msg).toContain("WL1")
    // Non-watchlist ticker must NOT appear in the movers section
    expect(msg).not.toContain("NON_WL")
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-2: Empty watchlist → movers array is empty (no crash).
  //
  // Setup: 3 tickers with prices in daily_ohlcv; watchlist is empty.
  // Expect: result.moverCount === 0, no crash, job does not send
  //         (all sources empty → silent skip).
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-2: empty watchlist → movers is empty, no crash", async () => {
    // Tickers in price tables but NOT in watchlist
    insertOhlcv(db, "VIC", 80_000, 3.0)
    insertOhlcv(db, "VHM", 45_000, 2.5)
    insertOhlcv(db, "HPG", 22_000, -4.0)
    // watchlist is empty — no INSERT

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const opts: FranceSummaryOptions = { db, sendFn, nowFn: now, getPnlFn: async () => null }

    let threw = false
    let result: Awaited<ReturnType<typeof runFranceSummary>>
    try {
      result = await runFranceSummary(opts)
    } catch {
      threw = true
      result = { sent: false, moverCount: 0, alertCount: 0, alerts: [], taSignals: [], vnIndex: null, globalSnapshot: null }
    }

    expect(threw).toBe(false)
    // No watchlist tickers → moverCount must be 0
    expect(result!.moverCount).toBe(0)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-3: Watchlist ticker has no price row → handled gracefully, not included
  //       in movers.
  //
  // Setup: WL_NO_PRICE is in watchlist but has no entry in daily_ohlcv.
  //        WL_WITH_PRICE has both.
  // Expect: no crash, WL_NO_PRICE not in movers, WL_WITH_PRICE appears.
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-3: watchlist ticker with no price row is handled gracefully, not in movers", async () => {
    // WL_WITH_PRICE: in watchlist AND has price data
    insertOhlcv(db, "WL_WITH_PRICE", 30_000, 6.0)
    db.exec(`INSERT INTO watchlist (code) VALUES ('WL_WITH_PRICE')`)

    // WL_NO_PRICE: in watchlist but NO price data in daily_ohlcv
    db.exec(`INSERT INTO watchlist (code) VALUES ('WL_NO_PRICE')`)
    // Do NOT insert any price rows for WL_NO_PRICE

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const opts: FranceSummaryOptions = { db, sendFn, nowFn: now, getPnlFn: async () => null }

    let threw = false
    let result: Awaited<ReturnType<typeof runFranceSummary>>
    try {
      result = await runFranceSummary(opts)
    } catch {
      threw = true
      result = { sent: false, moverCount: 0, alertCount: 0, alerts: [], taSignals: [], vnIndex: null, globalSnapshot: null }
    }

    expect(threw).toBe(false)
    // WL_WITH_PRICE has price data → at least 1 mover
    expect(result!.moverCount).toBeGreaterThanOrEqual(1)
    // WL_NO_PRICE must not appear in movers
    const msg = sends[0] ?? ""
    expect(msg).not.toContain("WL_NO_PRICE")
    // WL_WITH_PRICE must appear (it has price data)
    expect(msg).toContain("WL_WITH_PRICE")
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-4: 5 watchlist tickers with moves → movers capped at top 3 by abs(change%).
  //
  // Setup: 5 watchlist tickers with distinct change_pct values.
  //        change_pct values: 10%, 8%, 6%, 4%, 2%
  // Expect: moverCount === 3, message contains the top 3 tickers (10%, 8%, 6%)
  //         and does NOT contain the bottom 2 (4%, 2%).
  //
  // GREEN since task 1371 + task 205.
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-4: 5 watchlist tickers → movers capped at top 3 by abs(change%)", async () => {
    const tickers = [
      { code: "TOP1", price: 50_000, changePct: 10.0 },
      { code: "TOP2", price: 40_000, changePct: 8.0 },
      { code: "TOP3", price: 30_000, changePct: 6.0 },
      { code: "BOT4", price: 20_000, changePct: 4.0 },
      { code: "BOT5", price: 10_000, changePct: 2.0 },
    ]

    for (const t of tickers) {
      insertOhlcv(db, t.code, t.price, t.changePct)
      db.exec(`INSERT INTO watchlist (code) VALUES ('${t.code}')`)
    }

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const opts: FranceSummaryOptions = { db, sendFn, nowFn: now, getPnlFn: async () => null }
    const result = await runFranceSummary(opts)

    expect(result.sent).toBe(true)
    // Must be capped at 3
    expect(result.moverCount).toBe(3)

    const msg = sends[0] ?? ""
    // Top 3 tickers must appear
    expect(msg).toContain("TOP1")
    expect(msg).toContain("TOP2")
    expect(msg).toContain("TOP3")
    // Bottom 2 must NOT appear
    expect(msg).not.toContain("BOT4")
    expect(msg).not.toContain("BOT5")
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-5 (task 1522): today's rows have open==close (0% change, pre-market);
  //                   yesterday has real moves → movers must come from yesterday.
  //
  // Setup:
  //   today   (2026-04-17): STOCK_A open==close  (0.00% change)
  //   today   (2026-04-17): STOCK_B open==close  (0.00% change)
  //   yesterday (2026-04-16): STOCK_A +5%,  STOCK_B +3%
  // Expect: moverCount >= 1, codes in message are from yesterday's session
  //         (i.e. movers come from 2026-04-16, not the flat today rows).
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-5 (1522): today pre-market rows (0% change) skipped; movers from yesterday", async () => {
    // Insert today's flat rows (open == close, simulates pre-market OHLCV)
    db.exec(`
      INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES
        ('STOCK_A', '2026-04-17', 100.0, 100.0, 100.0, 100.0, 0, '2026-04-17T06:00:00'),
        ('STOCK_B', '2026-04-17', 50.0,  50.0,  50.0,  50.0,  0, '2026-04-17T06:00:00')
    `)
    // Insert yesterday's rows with real moves
    db.exec(`
      INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES
        ('STOCK_A', '2026-04-16', 95.24, 102.0, 94.0, 100.0, 1000000, '2026-04-16T15:00:00'),
        ('STOCK_B', '2026-04-16', 48.54, 52.0,  48.0, 50.0,  800000,  '2026-04-16T15:00:00')
    `)
    // Both stocks in watchlist
    db.exec(`
      INSERT INTO watchlist (code) VALUES ('STOCK_A'), ('STOCK_B')
    `)

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const opts: FranceSummaryOptions = { db, sendFn, nowFn: now, getPnlFn: async () => null }
    const result = await runFranceSummary(opts)

    // Should produce movers (from yesterday, not today's 0% rows)
    expect(result.moverCount).toBeGreaterThanOrEqual(1)

    const msg = sends[0] ?? ""
    // At least one of our tickers must appear in the message
    const hasMover = msg.includes("STOCK_A") || msg.includes("STOCK_B")
    expect(hasMover).toBe(true)
  })
})
