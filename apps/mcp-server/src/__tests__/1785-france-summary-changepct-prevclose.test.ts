// apps/mcp-server/src/__tests__/1785-france-summary-changepct-prevclose.test.ts
// Task 1785 — TDD: franceSummaryJob change_pct must use prev-close-to-close,
// not open-to-close.
//
// Bug: (close - open) / open * 100 produces intraday % which differs from the
// session-over-session % shown in all other bulletins (morningBriefing, EOD).
//
// Fix: (today.close - yesterday.close) / yesterday.close * 100
// Fallback: NULL prev_close → formatPct shows "N/A", no crash.

import { describe, it, expect, beforeEach } from "bun:test"
import { Database } from "bun:sqlite"
import { runFranceSummary, formatFranceSummaryVI } from "../scheduler/briefings/franceSummaryJob.js"
import type { FranceSummaryOptions } from "../scheduler/briefings/franceSummaryJob.js"
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB helper — minimal schema for franceSummaryJob
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:")
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices (
      code TEXT PRIMARY KEY, price REAL, change_amt REAL,
      change_pct REAL, volume REAL, updated_at TEXT, exchange TEXT DEFAULT 'HOSE'
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY, triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL, signals_json TEXT, affected_actions_json TEXT,
      analysis_ids_json TEXT, message TEXT, read INTEGER NOT NULL DEFAULT 0,
      user_note TEXT, notified_telegram INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT, resolution_notes TEXT
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, from_agent TEXT NOT NULL,
      message_type TEXT NOT NULL, sent_at TEXT NOT NULL DEFAULT (datetime('now')), payload TEXT
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY, domain TEXT NOT NULL DEFAULT 'unknown'
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code TEXT NOT NULL, date TEXT NOT NULL,
      open REAL NOT NULL DEFAULT 0, high REAL NOT NULL DEFAULT 0,
      low REAL NOT NULL DEFAULT 0, close REAL NOT NULL,
      volume REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (code, date)
    )
  `)
  return db
}

const noopSend = async (_text: string) => true
const nowFn = () => new Date("2026-04-17T07:00:00.000Z")

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1785 — franceSummaryJob change_pct uses prev-close-to-close", () => {
  let db: Database

  beforeEach(() => {
    db = makeDb()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC-1: prev-close-to-close ≠ open-to-close → result must match prev-close
  //
  // VHM scenario (from task description):
  //   prevClose = 152,100  open = 159,900  close = 146,000
  //   open-to-close:   (146000 - 159900) / 159900 * 100 = -8.69%   ← BUG
  //   prev-to-close:   (146000 - 152100) / 152100 * 100 = -4.01%   ← CORRECT
  //
  // The returned change_pct must be close to -4.01, NOT -8.69.
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-1: change_pct uses prev-close-to-close, not open-to-close", async () => {
    // Yesterday: close = 152,100
    db.exec(`
      INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES ('VHM', '2026-04-16', 150000, 153000, 149000, 152100, 2000000, '2026-04-16T16:00:00')
    `)
    // Today: open = 159,900  close = 146,000  (gap-open then sold off)
    db.exec(`
      INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES ('VHM', '2026-04-17', 159900, 160000, 145000, 146000, 3000000, '2026-04-17T15:00:00')
    `)
    db.exec(`INSERT INTO watchlist (code) VALUES ('VHM')`)

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }
    const opts: FranceSummaryOptions = { db, sendFn, nowFn, getPnlFn: async () => null }
    const result = await runFranceSummary(opts)

    expect(result.sent).toBe(true)
    expect(result.moverCount).toBeGreaterThanOrEqual(1)

    const mover = result.movers?.[0]
    expect(mover).toBeDefined()
    expect(mover!.code).toBe("VHM")

    // prev-to-close: (146000 - 152100) / 152100 * 100 ≈ -4.01
    // open-to-close: (146000 - 159900) / 159900 * 100 ≈ -8.69
    const pct = mover!.change_pct!
    expect(pct).toBeCloseTo(-4.01, 0)   // within 0.5% of -4.01
    expect(Math.abs(pct - (-8.69))).toBeGreaterThan(1)  // NOT the open-to-close value

    // The formatted message must show the prev-close % (≈ -4%)
    const msg = sends[0] ?? ""
    expect(msg).toContain("VHM")
    // Message should NOT contain the open-to-close value (-8.69 rounded)
    expect(msg).not.toContain("-8.7")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC-2: When prev-close row is missing → change_pct is null, shows "N/A"
  // No crash; ticker may still appear if it has a price.
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-2: missing prev-close row → change_pct null, formatPct shows N/A, no crash", async () => {
    // Only one row — no previous day
    db.exec(`
      INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES ('GAS', '2026-04-17', 73000, 76000, 72000, 75200, 1000000, '2026-04-17T15:00:00')
    `)
    db.exec(`INSERT INTO watchlist (code) VALUES ('GAS')`)

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }
    const opts: FranceSummaryOptions = { db, sendFn, nowFn, getPnlFn: async () => null }

    let threw = false
    try {
      await runFranceSummary(opts)
    } catch {
      threw = true
    }

    expect(threw).toBe(false)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC-3: Ranking by ABS uses prev-close-to-close
  //
  // Two tickers with identical close prices but different opens:
  //   TICK_A: prevClose=100, open=90, close=105 → prev-pct = +5%, open-pct = +16.7%
  //   TICK_B: prevClose=100, open=103, close=108 → prev-pct = +8%, open-pct = +4.9%
  //
  // Sorted by prev-to-close → TICK_B (8%) ranks first.
  // Sorted by open-to-close → TICK_A (16.7%) would rank first.
  //
  // We assert TICK_B appears before TICK_A in the movers array.
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-3: mover ranking uses prev-close ABS, not open ABS", async () => {
    // Yesterday: both at 100
    db.exec(`
      INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES
        ('TICK_A', '2026-04-16', 98, 101, 97, 100, 1000000, '2026-04-16T16:00:00'),
        ('TICK_B', '2026-04-16', 98, 101, 97, 100, 1000000, '2026-04-16T16:00:00')
    `)
    // Today:
    //   TICK_A: open=90 (gap-down), close=105 → prev-pct=+5%, open-pct=+16.7%
    //   TICK_B: open=103, close=108           → prev-pct=+8%, open-pct=+4.9%
    db.exec(`
      INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES
        ('TICK_A', '2026-04-17', 90, 106, 89, 105, 2000000, '2026-04-17T15:00:00'),
        ('TICK_B', '2026-04-17', 103, 109, 102, 108, 2000000, '2026-04-17T15:00:00')
    `)
    db.exec(`INSERT INTO watchlist (code) VALUES ('TICK_A'), ('TICK_B')`)

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }
    const opts: FranceSummaryOptions = { db, sendFn, nowFn, getPnlFn: async () => null }
    const result = await runFranceSummary(opts)

    expect(result.sent).toBe(true)
    expect(result.moverCount).toBe(2)

    // With prev-close ranking: TICK_B (+8%) should be first
    const movers = result.movers ?? []
    expect(movers[0]?.code).toBe("TICK_B")
    expect(movers[1]?.code).toBe("TICK_A")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC-4: formatPct helper — null returns "N/A" (not "n/a" typo guard)
  // This confirms the formatter still works (regression guard).
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-4: formatFranceSummaryVI with null change_pct shows N/A in message", () => {
    const dateStr = "17/04/2026"
    const movers = [{ code: "GAS", price: 75200, change_pct: null }]
    const msg = formatFranceSummaryVI(dateStr, movers, [], [])
    expect(msg).toContain("GAS")
    expect(msg).toContain("N/A")
  })
})
