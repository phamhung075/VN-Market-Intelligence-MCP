Bun.env["DB_PATH"] = ":memory:"
// src/__tests__/1385-evening-summary-news-filler.test.ts
// Task 1385 — TDD RED: Evening summary news filler tests
//
// Tests assert FIXED behavior from task 1386:
//   When newsCount=0, the filler line "Không có tin tức hôm nay" must NOT appear.
//   When newsCount>0, the line "(N tin tức hôm nay)" must appear.
//
// All 4 tests are RED until task 1386 moves lines.push("") inside the if (newsCount > 0) block.

import { describe, it, expect, beforeAll } from "bun:test"
import { Database } from "bun:sqlite"
import { runEveningSummary, resetEveningSummaryGuard } from "../scheduler/briefings/eveningSummaryJob.js"
import type { EveningSummary } from "../application/usecases/assembleEveningSummary.js"
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixture builders
// ─────────────────────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<EveningSummary> = {}): EveningSummary {
  return {
    date: "17/04/2026",
    topStories: [{ title: "Story one", level: "sector", sentiment: "positive", impactScore: 5 }],
    topAlerts: [],
    watchlistMovers: [],
    predictionSignals: [],
    predictionDiag: { stored: 0 },
    taDiag: { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 },
    taSummary: [],
    newsCount: 0,
    generatedAt: "2026-04-17T22:30:00Z",
    foreignFlowMovers: [],
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Minimal in-memory DB with market_messages table so the dedup guard resolves
// alreadySentToday()=false without hitting production DB or dynamic imports.
let testDb: Database

beforeAll(() => {
  testDb = new Database(":memory:")
  initNewsTables(testDb);
  initMarketDataTables(testDb);
  initSystemTables(testDb);
  testDb.exec(`CREATE TABLE IF NOT EXISTS market_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_agent TEXT NOT NULL,
    sent_at TEXT NOT NULL
  )`)
})

async function captureMessage(summary: EveningSummary): Promise<string> {
  resetEveningSummaryGuard()
  let captured = ""
  await runEveningSummary(
    async () => summary,
    async (message: string) => { captured = message },
    testDb,
  )
  return captured
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1385 — Evening summary news filler (RED)", () => {

  // T1: newsCount=0, alerts=2, movers=3
  //   → message must NOT contain "Không có tin tức"
  it("T1: newsCount=0 alerts=2 movers=3 — no 'Không có tin tức' filler", async () => {
    const summary = makeSummary({
      newsCount: 0,
      topAlerts: [
        { severity: "critical", message: "Stop-loss triggered VHM", stocks: ["VHM"] },
        { severity: "warning",  message: "VCB near resistance",     stocks: ["VCB"] },
      ],
      watchlistMovers: [
        { code: "VHM", changePct: 3.5,  price: 55000, exchange: "HOSE" },
        { code: "HPG", changePct: -5.2, price: 22000, exchange: "HOSE" },
        { code: "VCB", changePct: 1.1,  price: 88000, exchange: "HOSE" },
      ],
    })

    const msg = await captureMessage(summary)

    // Bug: current code emits "Không có tin tức hôm nay" when newsCount=0
    // Fixed code: omit the line entirely when newsCount=0
    expect(msg).not.toContain("Không có tin tức")
    expect(msg).not.toContain("Không có tin tức hôm nay")
  })

  // T2: newsCount=5
  //   → message must contain "(5 tin tức hôm nay)"
  it("T2: newsCount=5 — contains '(5 tin tức hôm nay)'", async () => {
    const summary = makeSummary({ newsCount: 5 })

    const msg = await captureMessage(summary)

    expect(msg).toContain("(5 tin tức hôm nay)")
  })

  // T3: newsCount=0, all other sections empty (topStories still non-empty to trigger hasContent)
  //   → message must NOT contain "Không có tin tức"
  it("T3: newsCount=0 all-empty-sections — no 'Không có tin tức' filler", async () => {
    const summary = makeSummary({
      newsCount: 0,
      topAlerts: [],
      watchlistMovers: [],
      predictionSignals: [],
      taSummary: [],
      // topStories has 1 item from makeSummary default so hasContent=true
    })

    const msg = await captureMessage(summary)

    expect(msg).not.toContain("Không có tin tức")
    expect(msg).not.toContain("Không có tin tức hôm nay")
  })

  // T4: newsCount=1
  //   → message must contain "(1 tin tức hôm nay)"
  it("T4: newsCount=1 — contains '(1 tin tức hôm nay)'", async () => {
    const summary = makeSummary({ newsCount: 1 })

    const msg = await captureMessage(summary)

    expect(msg).toContain("(1 tin tức hôm nay)")
  })

})
