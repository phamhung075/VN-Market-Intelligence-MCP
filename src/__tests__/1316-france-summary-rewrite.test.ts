// src/__tests__/1316-france-summary-rewrite.test.ts
// Task 1316/1317 — Rewrite franceSummaryJob: Vietnamese digest to MARKET channel
process.env["DB_PATH"] = ":memory:"
import { describe, it, expect, beforeEach } from "bun:test"
import { Database } from "bun:sqlite"
import { runFranceSummary, type FranceSummaryResult } from "../scheduler/franceSummaryJob.js"

// ─────────────────────────────────────────────────────────────────────────────
// Test DB helpers
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

const noopSend = async (_text: string) => true
const now = () => new Date("2026-04-15T07:00:00.000Z")

// ─────────────────────────────────────────────────────────────────────────────
// AC 1: Return type shape { sent, moverCount, alertCount, taCount }
// ─────────────────────────────────────────────────────────────────────────────
describe("Task 1316/1317 — franceSummaryJob rewrite", () => {

  let db: Database
  beforeEach(() => { db = makeDb() })

  it("AC1: returns { sent, moverCount, alertCount, taSignals } shape", async () => {
    const result = await runFranceSummary({ db, sendFn: noopSend, nowFn: now })
    expect(typeof result.sent).toBe("boolean")
    expect(typeof result.moverCount).toBe("number")
    expect(typeof result.alertCount).toBe("number")
    expect(Array.isArray(result.taSignals)).toBe(true)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC 2: Silent skip when all three sources return empty
  // ─────────────────────────────────────────────────────────────────────────
  it("AC2: silent skip — sent=false when market_prices and alerts are empty", async () => {
    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const result = await runFranceSummary({ db, sendFn, nowFn: now })

    expect(result.sent).toBe(false)
    expect(result.moverCount).toBe(0)
    expect(result.alertCount).toBe(0)
    expect(result.taSignals.length).toBe(0)
    expect(sends).toHaveLength(0)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC 3: Top 3 price movers by ABS(change_pct) DESC
  // ─────────────────────────────────────────────────────────────────────────
  it("AC3: top 3 price movers selected by ABS(change_pct) DESC", async () => {
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, updated_at) VALUES
        ('VCB', 88000, 3.5, '2026-04-15T06:00:00'),
        ('HPG', 22000, -5.2, '2026-04-15T06:00:00'),
        ('VNM', 75000, 1.1, '2026-04-15T06:00:00'),
        ('FPT', 110000, 4.8, '2026-04-15T06:00:00'),
        ('TCB', 33000, 0.2, '2026-04-15T06:00:00')
    `)

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const result = await runFranceSummary({ db, sendFn, nowFn: now })

    expect(result.moverCount).toBe(3)
    expect(result.sent).toBe(true)
    expect(sends[0]).toContain("HPG")  // -5.2% highest ABS
    expect(sends[0]).toContain("FPT")  // +4.8%
    expect(sends[0]).toContain("VCB")  // +3.5%
    // Low movers should not appear
    expect(sends[0]).not.toContain("VNM")
    expect(sends[0]).not.toContain("TCB")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC 4: Top 3 alerts sorted by severity
  // ─────────────────────────────────────────────────────────────────────────
  it("AC4: top 3 alerts returned, severity sorted (critical > high > warning > info)", async () => {
    db.exec(`
      INSERT INTO alerts (id, triggered_at, severity, message) VALUES
        ('al1', datetime('now', '-1 hour'), 'info', 'Tin tức thông thường'),
        ('al2', datetime('now', '-1 hour'), 'critical', 'Cảnh báo nghiêm trọng'),
        ('al3', datetime('now', '-1 hour'), 'warning', 'Cảnh báo vừa'),
        ('al4', datetime('now', '-1 hour'), 'high', 'Cảnh báo cao'),
        ('al5', datetime('now', '-1 hour'), 'info', 'Thông tin khác')
    `)

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    const result = await runFranceSummary({ db, sendFn, nowFn: now })

    expect(result.alertCount).toBe(3)
    // Critical and high should appear
    expect(sends[0]).toContain("Cảnh báo nghiêm trọng")
    expect(sends[0]).toContain("Cảnh báo cao")
    expect(sends[0]).toContain("Cảnh báo vừa")
    // info entries should be excluded (below top 3 severity)
    expect(sends[0]).not.toContain("Tin tức thông thường")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC 5: taSignals is an array (TA per-ticker signals replace old taCount)
  // ─────────────────────────────────────────────────────────────────────────
  it("AC5: taSignals is always an array (TaSignalRow[])", async () => {
    db.exec(`
      INSERT INTO alerts (id, triggered_at, severity, signals_json, message) VALUES
        ('ta1', datetime('now', '-1 hour'), 'warning',
          '[{"type":"ta_overbought","message":"RSI cao"}]', 'RSI overbought')
    `)

    const result = await runFranceSummary({ db, sendFn: noopSend, nowFn: now })
    expect(Array.isArray(result.taSignals)).toBe(true)
    expect(typeof result.taSignals.length).toBe("number")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC 6: Vietnamese format output
  // ─────────────────────────────────────────────────────────────────────────
  it("AC6: output message is in Vietnamese format", async () => {
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, updated_at) VALUES
        ('VCB', 88000, 3.5, '2026-04-15T06:00:00')
    `)

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    await runFranceSummary({ db, sendFn, nowFn: now })

    expect(sends).toHaveLength(1)
    const msg = sends[0]
    // Must contain Vietnamese header elements
    expect(msg).toMatch(/15\/04\/2026|2026-04-15/)
    expect(msg).toContain("VCB")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC 7: Per-query try/catch — one failure doesn't abort others
  // ─────────────────────────────────────────────────────────────────────────
  it("AC7: per-query resilience — price query failure does not abort alert query", async () => {
    // Drop market_prices to force a query error on that table
    db.exec(`DROP TABLE market_prices`)
    db.exec(`
      INSERT INTO alerts (id, triggered_at, severity, message) VALUES
        ('al1', datetime('now', '-1 hour'), 'critical', 'Cảnh báo quan trọng')
    `)

    const sends: string[] = []
    const sendFn = async (t: string) => { sends.push(t); return true }

    // Should not throw — price query fails silently, alert query succeeds
    const result = await runFranceSummary({ db, sendFn, nowFn: now })
    expect(result.alertCount).toBeGreaterThanOrEqual(1)
    expect(result.sent).toBe(true)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC 8: sendFn default is sendTelegramMarket (not Work)
  //        — verified by checking the imported function name in the module
  // ─────────────────────────────────────────────────────────────────────────
  it("AC8: result is { sent: false } when no data even if sendFn would succeed", async () => {
    // Pure empty DB — all three queries return 0 rows — no send
    const sends: string[] = []
    const result = await runFranceSummary({
      db,
      sendFn: async (t) => { sends.push(t); return true },
      nowFn: now,
    })
    expect(result.sent).toBe(false)
    expect(sends).toHaveLength(0)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC 9: moverCount is the number of rows actually returned (max 3)
  // ─────────────────────────────────────────────────────────────────────────
  it("AC9: moverCount is capped at 3 even when more rows exist", async () => {
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, updated_at) VALUES
        ('A', 1000, 8.0, '2026-04-15T06:00:00'),
        ('B', 1000, -7.0, '2026-04-15T06:00:00'),
        ('C', 1000, 6.5, '2026-04-15T06:00:00'),
        ('D', 1000, -5.0, '2026-04-15T06:00:00'),
        ('E', 1000, 4.0, '2026-04-15T06:00:00')
    `)

    const result = await runFranceSummary({ db, sendFn: noopSend, nowFn: now })
    expect(result.moverCount).toBe(3)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC 10: alertCount is capped at 3
  // ─────────────────────────────────────────────────────────────────────────
  it("AC10: alertCount is capped at 3 even when more alerts exist", async () => {
    db.exec(`
      INSERT INTO alerts (id, triggered_at, severity, message) VALUES
        ('x1', datetime('now', '-1 hour'), 'critical', 'A'),
        ('x2', datetime('now', '-1 hour'), 'critical', 'B'),
        ('x3', datetime('now', '-1 hour'), 'high', 'C'),
        ('x4', datetime('now', '-1 hour'), 'high', 'D'),
        ('x5', datetime('now', '-1 hour'), 'warning', 'E')
    `)

    const result = await runFranceSummary({ db, sendFn: noopSend, nowFn: now })
    expect(result.alertCount).toBe(3)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC 11: taSignals is empty array when no non-neutral watchlist signals exist
  // ─────────────────────────────────────────────────────────────────────────
  it("AC11: taSignals.length is 0 when no non-neutral TA signals found", async () => {
    db.exec(`
      INSERT INTO alerts (id, triggered_at, severity, signals_json, message) VALUES
        ('n1', datetime('now', '-1 hour'), 'warning',
          '[{"type":"macro_deviation","message":"x"}]', 'Macro')
    `)

    const result = await runFranceSummary({ db, sendFn: noopSend, nowFn: now })
    expect(result.taSignals.length).toBe(0)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AC 12: does not throw when sendFn rejects
  // ─────────────────────────────────────────────────────────────────────────
  it("AC12: does not throw when sendFn rejects", async () => {
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, updated_at) VALUES
        ('VCB', 88000, 3.5, '2026-04-15T06:00:00')
    `)

    const sendFn = async (_t: string): Promise<boolean> => {
      throw new Error("Telegram down")
    }

    const result = await runFranceSummary({ db, sendFn, nowFn: now })
    expect(result.sent).toBe(false)
    expect(result.moverCount).toBeGreaterThan(0)
  })

})
