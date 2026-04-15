// src/__tests__/1290-france-summary-job.test.ts
import { describe, it, expect, beforeEach } from "bun:test"
import { Database } from "bun:sqlite"
import { runFranceSummary } from "../scheduler/franceSummaryJob.js"

function makeDb(): Database {
  const db = new Database(":memory:")
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id                 TEXT PRIMARY KEY,
      created_at         TEXT NOT NULL,
      level              TEXT NOT NULL,
      source_url         TEXT,
      source_title       TEXT,
      source_type        TEXT,
      published_at       TEXT,
      sentiment          TEXT,
      impact_score       REAL,
      impact_direction   TEXT,
      confidence         REAL,
      time_horizon       TEXT,
      summary            TEXT,
      reasoning          TEXT,
      affected_countries TEXT,
      affected_domains   TEXT,
      affected_actions   TEXT,
      parent_ids         TEXT,
      tags               TEXT,
      embedding_text     TEXT
    )
  `)
  return db
}

describe("Task 1290 — franceSummaryJob", () => {
  let db: Database

  beforeEach(() => {
    db = makeDb()
  })

  it("returns { sent: false, signalCount: 0 } when DB has no rag_analyses rows", async () => {
    const sends: string[] = []
    const sendFn = async (text: string) => { sends.push(text); return true }

    const result = await runFranceSummary({ db, sendFn })

    expect(result).toEqual({ sent: false, signalCount: 0 })
    expect(sends).toHaveLength(0)
  })

  it("returns { sent: true, signalCount: N } when recent analyses exist", async () => {
    const now = new Date().toISOString()
    // Insert 3 recent rag_analyses rows (within last 8h)
    db.exec(`
      INSERT INTO rag_analyses (id, created_at, level, sentiment, impact_score, summary)
      VALUES
        ('a1', '${now}', 'action', 'bullish', 7.5, 'VCB tăng mạnh sau KQKD tích cực'),
        ('a2', '${now}', 'country', 'bearish', 6.0, 'VN-Index giảm do áp lực bán nước ngoài'),
        ('a3', '${now}', 'domain', 'bullish', 8.0, 'Ngân hàng hưởng lợi từ nới room tín dụng')
    `)

    const sends: string[] = []
    const sendFn = async (text: string) => { sends.push(text); return true }

    const result = await runFranceSummary({ db, sendFn })

    expect(result.sent).toBe(true)
    expect(result.signalCount).toBeGreaterThanOrEqual(1)
    expect(sends).toHaveLength(1)
    expect(sends[0]).toContain("France Summary")
  })

  it("returns { sent: true, signalCount } with correct shape", async () => {
    const result = await runFranceSummary({ db, sendFn: async () => true })
    expect(typeof result.sent).toBe("boolean")
    expect(typeof result.signalCount).toBe("number")
  })

  it("caps signalCount at 3 top signals in the message", async () => {
    const now = new Date().toISOString()
    // Insert 5 rows — top 3 by impact_score should be selected
    db.exec(`
      INSERT INTO rag_analyses (id, created_at, level, sentiment, impact_score, summary)
      VALUES
        ('b1', '${now}', 'action', 'bullish', 9.0, 'Signal A high'),
        ('b2', '${now}', 'action', 'bearish', 8.5, 'Signal B high'),
        ('b3', '${now}', 'action', 'bullish', 8.0, 'Signal C mid'),
        ('b4', '${now}', 'action', 'neutral', 5.0, 'Signal D low'),
        ('b5', '${now}', 'action', 'bearish', 4.0, 'Signal E low')
    `)

    const sends: string[] = []
    const sendFn = async (text: string) => { sends.push(text); return true }

    const result = await runFranceSummary({ db, sendFn })

    expect(result.sent).toBe(true)
    expect(result.signalCount).toBe(5)
    // Message should mention top signals (by impact score)
    expect(sends[0]).toContain("Signal A high")
    expect(sends[0]).toContain("Signal B high")
    expect(sends[0]).toContain("Signal C mid")
    // Low-score signals should NOT appear
    expect(sends[0]).not.toContain("Signal D low")
    expect(sends[0]).not.toContain("Signal E low")
  })

  it("does not throw when sendFn rejects", async () => {
    const now = new Date().toISOString()
    db.exec(`
      INSERT INTO rag_analyses (id, created_at, level, sentiment, impact_score, summary)
      VALUES ('c1', '${now}', 'action', 'bullish', 7.0, 'Test signal')
    `)

    const sendFn = async (_text: string) => { throw new Error("Telegram down") }

    // Should not throw — error is swallowed internally
    const result = await runFranceSummary({ db, sendFn })
    expect(result.sent).toBe(false)
    expect(result.signalCount).toBe(1)
  })
})
