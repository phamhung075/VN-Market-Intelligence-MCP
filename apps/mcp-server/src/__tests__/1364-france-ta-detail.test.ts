Bun.env["DB_PATH"] = ":memory:"
// src/__tests__/1364-france-ta-detail.test.ts
// Task 1364 — TDD: France morning briefing TA signal detail
// Tests are RED until task 1365 implements the new interface.
//
// Key design:
//   - formatFranceSummaryVI now takes taSignals: TaSignalRow[] (not taCount: number)
//   - runFranceSummary accepts computeTaFn via FranceSummaryOptions (injectable for TDD)
//   - FranceSummaryResult.taSignals is TaSignalRow[] (not taCount: number)
//
// TS-note: TaSignalRow, computeTaFn, and taSignals field do not yet exist on the
// exported types (added in task 1365). Until then we use type assertions so this
// file compiles cleanly while the runtime assertions remain RED.

import { describe, it, expect, beforeEach } from "bun:test"
import { Database } from "bun:sqlite"
import {
  formatFranceSummaryVI,
  runFranceSummary,
} from "../scheduler/briefings/franceSummaryJob.js"
import type { FranceSummaryOptions, FranceSummaryResult } from "../scheduler/briefings/franceSummaryJob.js"

// ─────────────────────────────────────────────────────────────────────────────
// TaSignalRow — forward declaration of the type that task 1365 will export.
// Mirrors the interface in TECH_125.md exactly.
// ─────────────────────────────────────────────────────────────────────────────

/** Subset of TaSignal — only fields needed for France briefing display. */
interface TaSignalRow {
  code: string
  rsi14: number | null
  rsiStatus: "overbought" | "oversold" | "neutral"
  priceVsMa20: "above" | "below" | "neutral"
  ma20: number | null
}

/** Extended options — adds computeTaFn injection (task 1365 will add to FranceSummaryOptions). */
interface FranceSummaryOptions1365 extends FranceSummaryOptions {
  computeTaFn?: (code: string, db: Database) => TaSignalRow | null
}

/** Extended result — adds taSignals array (task 1365 replaces taCount with this). */
interface FranceSummaryResult1365 extends Omit<FranceSummaryResult, "taCount"> {
  taSignals: TaSignalRow[]
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helper — creates all tables needed by franceSummaryJob
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
    ,
    exchange TEXT NOT NULL DEFAULT 'HOSE')
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
      foreign_net_vol REAL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
    )
  `)
  return db
}

const noopSend = async (_text: string) => true
const now = () => new Date("2026-04-17T07:00:00.000Z")

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: formatFranceSummaryVI with overbought signal → message includes
//       ticker code "VHM" and Vietnamese label "qua mua"
// ─────────────────────────────────────────────────────────────────────────────
describe("Task 1364 — France TA detail tests", () => {

  let db: Database
  beforeEach(() => { db = makeDb() })

  it("AC-1: formatFranceSummaryVI with overbought taSignal renders VHM and 'qua mua'", () => {
    const taSignals: TaSignalRow[] = [
      {
        code: "VHM",
        rsi14: 78.2,
        rsiStatus: "overbought",
        priceVsMa20: "above",
        ma20: null,
      },
    ]

    // New signature: formatFranceSummaryVI(dateStr, movers, alerts, taSignals: TaSignalRow[])
    // Cast 4th arg as any until task 1365 updates the TS signature
    const msg = formatFranceSummaryVI("17/04/2026", [], [], taSignals as unknown as number)

    expect(msg).toContain("VHM")
    expect(msg).toContain("quá mua")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC-2: formatFranceSummaryVI with empty taSignals → "Khong co tin hieu ky thuat"
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-2: formatFranceSummaryVI with empty taSignals renders no TA section (section omitted)", () => {
    const msg = formatFranceSummaryVI("17/04/2026", [], [], [] as unknown as number)

    expect(msg).not.toContain("Khong co tin hieu ky thuat")
    expect(msg).not.toContain("Tín hiệu kỹ thuật")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC-3: runFranceSummary with injected computeTaFn returning overbought
  //       → sent message contains ticker code and a TA status label
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-3: runFranceSummary with injected overbought computeTaFn sends message with VHM and TA label", async () => {
    // Seed watchlist and a mover so the job doesn't silent-skip
    db.exec(`INSERT INTO watchlist (code) VALUES ('VHM')`)
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, updated_at)
      VALUES ('VHM', 55000, 3.5, '2026-04-17T06:00:00')
    `)
    db.exec(`
      INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at) VALUES
        ('VHM', 53100, 1000000, '2026-04-16T08:00:00'),
        ('VHM', 55000, 1000000, '2026-04-17T08:00:00')
    `)
    db.exec(`
      INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES ('VHM', '2026-04-17', 53100, 56000, 52500, 55000, 1000000, '2026-04-17T16:00:00')
    `)

    // Inject computeTaFn: returns overbought signal for any code
    const computeTaFn = (code: string, _db: Database): TaSignalRow => ({
      code,
      rsi14: 78.2,
      rsiStatus: "overbought",
      priceVsMa20: "above",
      ma20: 52000,
    })

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const opts: FranceSummaryOptions1365 = { db, sendFn, nowFn: now, computeTaFn }
    const result = await runFranceSummary(opts as FranceSummaryOptions)

    expect(result.sent).toBe(true)
    expect(sends).toHaveLength(1)
    const msg = sends[0]
    if (msg === undefined) throw new Error("No message sent")
    expect(msg).toContain("VHM")
    // Must contain at least one TA status label
    const hasLabel =
      msg.includes("quá mua") ||
      msg.includes("quá bán") ||
      msg.includes("trên MA20") ||
      msg.includes("dưới MA20")
    expect(hasLabel).toBe(true)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC-4: runFranceSummary with computeTaFn returning null (< 8 rows)
  //       → no crash, result.sent === true, message contains fallback text
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-4: runFranceSummary with computeTaFn returning null handles gracefully", async () => {
    // Seed a mover so the job doesn't silent-skip
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, updated_at)
      VALUES ('HPG', 22000, -5.2, '2026-04-17T06:00:00')
    `)
    db.exec(`INSERT INTO watchlist (code) VALUES ('HPG')`)
    db.exec(`
      INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at) VALUES
        ('HPG', 23200, 1000000, '2026-04-16T08:00:00'),
        ('HPG', 22000, 1000000, '2026-04-17T08:00:00')
    `)
    db.exec(`
      INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES ('HPG', '2026-04-17', 23200, 23500, 21500, 22000, 1000000, '2026-04-17T16:00:00')
    `)

    // computeTaFn returns null — simulates < 8 daily_ohlcv rows
    const computeTaFn = (_code: string, _db: Database): TaSignalRow | null => null

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    let threw = false
    let result: FranceSummaryResult
    const opts: FranceSummaryOptions1365 = { db, sendFn, nowFn: now, computeTaFn }
    try {
      result = await runFranceSummary(opts as FranceSummaryOptions)
    } catch {
      threw = true
      // Provide a default to satisfy TS — test will fail via threw === true check
      result = { sent: false, moverCount: 0, alertCount: 0, alerts: [], taSignals: [], vnIndex: null, globalSnapshot: null }
    }

    expect(threw).toBe(false)
    expect(result!.sent).toBe(true)
    expect(sends).toHaveLength(1)
    const msg = sends[0]
    if (msg === undefined) throw new Error("No message sent")
    expect(msg).not.toContain("Khong co tin hieu ky thuat")
    // TA section omitted when computeTaFn returns null for all tickers
    expect(msg).not.toContain("Tín hiệu kỹ thuật")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC-4b: FranceSummaryResult.taSignals is an array of TaSignalRow objects
  //        (not a count). Verifies the shape of the return value.
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-4b: FranceSummaryResult.taSignals is TaSignalRow[] (not a number)", async () => {
    db.exec(`INSERT INTO watchlist (code) VALUES ('VCB')`)
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, updated_at)
      VALUES ('VCB', 88000, 3.5, '2026-04-17T06:00:00')
    `)
    db.exec(`
      INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at) VALUES
        ('VCB', 85000, 1000000, '2026-04-16T08:00:00'),
        ('VCB', 88000, 1000000, '2026-04-17T08:00:00')
    `)
    db.exec(`
      INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES ('VCB', '2026-04-17', 85000, 89000, 84000, 88000, 1000000, '2026-04-17T16:00:00')
    `)

    const taRow: TaSignalRow = {
      code: "VCB",
      rsi14: 72.0,
      rsiStatus: "overbought",
      priceVsMa20: "above",
      ma20: 85000,
    }
    const computeTaFn = (code: string, _db: Database): TaSignalRow => ({ ...taRow, code })

    const opts: FranceSummaryOptions1365 = { db, sendFn: noopSend, nowFn: now, computeTaFn }
    const result = await runFranceSummary(opts as FranceSummaryOptions) as unknown as FranceSummaryResult1365

    // taSignals must be an array (not a number)
    expect(Array.isArray(result.taSignals)).toBe(true)
    // Must contain the VCB row since it's non-neutral
    expect(result.taSignals.length).toBeGreaterThan(0)
    expect(result.taSignals[0]?.code).toBe("VCB")
  })

})
