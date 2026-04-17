process.env["DB_PATH"] = ":memory:";
// src/__tests__/1370-france-watchlist-movers.test.ts
// Task 1370 — TDD: franceSummaryJob fetchTopMovers filters by watchlist
//
// Tests are RED until task 1371 changes fetchTopMovers to JOIN watchlist.
//
// Current behavior (task 1316/1317): fetchTopMovers queries market_prices
// globally — non-watchlist tickers can appear in movers. Task 1371 will
// change the query to only return tickers present in the watchlist table.
//
// Test strategy: direct DB setup + call runFranceSummary with sendMarketFn
// and sendWorkFn spies. Insert tickers into watchlist + market_prices_history.
// Verify movers array only contains watchlist tickers.

import { describe, it, expect, beforeEach } from "bun:test"
import { Database } from "bun:sqlite"
import { runFranceSummary } from "../scheduler/franceSummaryJob.js"
import type { FranceSummaryOptions } from "../scheduler/franceSummaryJob.js"

// ─────────────────────────────────────────────────────────────────────────────
// DB helper — creates all tables needed by franceSummaryJob
// market_prices_history is the source task 1371 will query for movers.
// market_prices is kept to avoid silent-skip (the current impl reads it).
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

// Helper: insert a ticker into market_prices_history with a given change_pct
// (computed from two price rows: day-before vs today)
function insertPriceHistory(
  db: Database,
  code: string,
  priceToday: number,
  changePct: number,
): void {
  const priceYesterday = priceToday / (1 + changePct / 100)
  // Insert yesterday row
  db.exec(
    `INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at)
     VALUES ('${code}', ${priceYesterday.toFixed(2)}, 1000000, '2026-04-16T08:00:00')`,
  )
  // Insert today row (most recent)
  db.exec(
    `INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at)
     VALUES ('${code}', ${priceToday}, 1000000, '2026-04-17T08:00:00')`,
  )
  // Also insert into market_prices so current impl can find it (avoids silent skip)
  db.exec(
    `INSERT OR REPLACE INTO market_prices (code, price, change_pct, updated_at)
     VALUES ('${code}', ${priceToday}, ${changePct}, '2026-04-17T08:00:00')`,
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
  // RED until task 1371: current impl returns NON_WL (no watchlist filter).
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-1: non-watchlist ticker excluded; watchlist ticker appears in movers", async () => {
    // NON_WL: highest move but NOT in watchlist
    insertPriceHistory(db, "NON_WL", 100_000, 20.0)
    // WL1: in watchlist, lower move
    insertPriceHistory(db, "WL1", 50_000, 5.0)
    db.exec(`INSERT INTO watchlist (code) VALUES ('WL1')`)

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const opts: FranceSummaryOptions = { db, sendFn, nowFn: now }
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
  // Setup: 3 tickers with prices in market_prices_history; watchlist is empty.
  // Expect: result.moverCount === 0, no crash, job does not send
  //         (all sources empty → silent skip).
  //
  // RED until task 1371: current impl returns movers from market_prices
  //         regardless of watchlist, so moverCount > 0 currently.
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-2: empty watchlist → movers is empty, no crash", async () => {
    // Tickers in price tables but NOT in watchlist
    insertPriceHistory(db, "VIC", 80_000, 3.0)
    insertPriceHistory(db, "VHM", 45_000, 2.5)
    insertPriceHistory(db, "HPG", 22_000, -4.0)
    // watchlist is empty — no INSERT

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const opts: FranceSummaryOptions = { db, sendFn, nowFn: now }

    let threw = false
    let result: Awaited<ReturnType<typeof runFranceSummary>>
    try {
      result = await runFranceSummary(opts)
    } catch {
      threw = true
      result = { sent: false, moverCount: 0, alertCount: 0, taSignals: [] }
    }

    expect(threw).toBe(false)
    // No watchlist tickers → moverCount must be 0
    expect(result!.moverCount).toBe(0)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-3: Watchlist ticker has no price row → handled gracefully, not included
  //       in movers.
  //
  // Setup: WL_NO_PRICE is in watchlist but has no entry in market_prices_history.
  //        WL_WITH_PRICE has both.
  // Expect: no crash, WL_NO_PRICE not in movers, WL_WITH_PRICE appears.
  //
  // RED until task 1371: current impl ignores watchlist entirely.
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-3: watchlist ticker with no price row is handled gracefully, not in movers", async () => {
    // WL_WITH_PRICE: in watchlist AND has price data
    insertPriceHistory(db, "WL_WITH_PRICE", 30_000, 6.0)
    db.exec(`INSERT INTO watchlist (code) VALUES ('WL_WITH_PRICE')`)

    // WL_NO_PRICE: in watchlist but NO price data in market_prices_history
    db.exec(`INSERT INTO watchlist (code) VALUES ('WL_NO_PRICE')`)
    // Do NOT insert any price rows for WL_NO_PRICE

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const opts: FranceSummaryOptions = { db, sendFn, nowFn: now }

    let threw = false
    let result: Awaited<ReturnType<typeof runFranceSummary>>
    try {
      result = await runFranceSummary(opts)
    } catch {
      threw = true
      result = { sent: false, moverCount: 0, alertCount: 0, taSignals: [] }
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
  // RED until task 1371 (which must also keep the LIMIT 3 cap).
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
      insertPriceHistory(db, t.code, t.price, t.changePct)
      db.exec(`INSERT INTO watchlist (code) VALUES ('${t.code}')`)
    }

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const opts: FranceSummaryOptions = { db, sendFn, nowFn: now }
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
})
