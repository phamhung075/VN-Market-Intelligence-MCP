Bun.env["DB_PATH"] = ":memory:"
// src/__tests__/1387-morning-briefing-filler.test.ts
// Task 1387 — TDD RED: morning briefing filler text removal tests
//
// Tests assert FIXED behavior from task 1388:
//   T1: vnIndex=null → message does NOT contain "chưa có dữ liệu"
//   T2: watchlistSummary=[] → message does NOT contain "Chưa có dữ liệu giá"
//   T3: watchlist entry with price=null → that entry absent from message
//   T4: all data present → VN-Index and watchlist sections both present
//
// T1+T2+T3 are RED until task 1388 fixes formatBriefingMessage.
// T4 may already pass (documents expected green behavior).

import { describe, it, expect } from "bun:test"
import { formatBriefingMessage } from "../scheduler/briefings/morningBriefingJob.js"
import type { DailyBriefing } from "../application/usecases/assembleBriefing.js"
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixture builder
// ─────────────────────────────────────────────────────────────────────────────

function makeBriefing(overrides: Partial<DailyBriefing>): DailyBriefing {
  return {
    date: "2026-04-17",
    topStories: [],
    alerts: [],
    watchlistSummary: [],
    newReports: [],
    macroSnapshot: [],
    sensitiveWarnings: [],
    trackedCommodities: [],
    unresolvedAlerts: [],
    topConviction: null,
    predictionSignals: [],
    generatedAt: "2026-04-17T01:00:00.000Z",
    ...overrides,
  } as DailyBriefing
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1387 — morning briefing filler removal (RED)", () => {

  // ─────────────────────────────────────────────────────────────────────────
  // T1: vnIndex=null, movers present
  //   → VN-Index section must be omitted entirely — no filler "chưa có dữ liệu"
  // ─────────────────────────────────────────────────────────────────────────
  it("T1: vnIndex=null with movers — VN-Index section absent, no filler text", () => {
    const briefing = makeBriefing({
      // vnIndex intentionally absent (undefined = null case)
      watchlistSummary: [
        { code: "VCB", domain: "banking", price: 88000, changePct: 1.1 },
        { code: "VHM", domain: "real_estate", price: 55000, changePct: 3.5 },
        { code: "HPG", domain: "steel", price: 22000, changePct: -5.2 },
      ],
    })

    const msg = formatBriefingMessage(briefing)

    // Must NOT emit filler text for missing VN-Index
    expect(msg).not.toContain("chưa có dữ liệu")
    expect(msg).not.toContain("VN-Index: chưa")
    // Watchlist section still present
    expect(msg).toContain("VCB")
    expect(msg).toContain("VHM")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // T2: watchlistSummary=[], vnIndex present
  //   → Watchlist section must be omitted entirely — no filler "Chưa có dữ liệu giá"
  // ─────────────────────────────────────────────────────────────────────────
  it("T2: watchlistSummary=[] with vnIndex — watchlist section absent, no filler text", () => {
    const briefing = makeBriefing({
      vnIndex: { price: 1250.5, changePct: 0.45 },
      watchlistSummary: [],
    })

    const msg = formatBriefingMessage(briefing)

    // Must NOT emit filler text for empty watchlist
    expect(msg).not.toContain("Chưa có dữ liệu giá")
    expect(msg).not.toContain("Chưa có")
    // VN-Index section still present
    expect(msg).toContain("VN-Index")
    expect(msg).toContain("1.251")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // T3: watchlist entry with price=null → that entry must be absent from message
  //   Other entries with valid prices must still appear
  // ─────────────────────────────────────────────────────────────────────────
  it("T3: watchlist entry with price=null — null-price entry absent, others present", () => {
    const briefing = makeBriefing({
      vnIndex: { price: 1250.5, changePct: 0.45 },
      watchlistSummary: [
        { code: "VCB", domain: "banking", price: 88000, changePct: 1.1 },
        { code: "HPG", domain: "steel" },                  // price=undefined (null/falsy)
        { code: "VHM", domain: "real_estate", price: 55000, changePct: 3.5 },
      ],
    })

    const msg = formatBriefingMessage(briefing)

    // HPG entry (null price) must NOT appear at all
    expect(msg).not.toContain("HPG")
    // HPG must not appear with N/A placeholder either
    expect(msg).not.toContain("N/A")
    // Entries with valid prices must still be present
    expect(msg).toContain("VCB")
    expect(msg).toContain("VHM")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // T4: all data present — both VN-Index and watchlist sections present
  //   This test documents expected green behavior (may already pass).
  // ─────────────────────────────────────────────────────────────────────────
  it("T4: all data present — VN-Index and watchlist sections both present", () => {
    const briefing = makeBriefing({
      vnIndex: { price: 1250.5, changePct: 0.45 },
      watchlistSummary: [
        { code: "VCB", domain: "banking", price: 88000, changePct: 1.1 },
        { code: "VHM", domain: "real_estate", price: 55000, changePct: 3.5 },
      ],
    })

    const msg = formatBriefingMessage(briefing)

    // VN-Index section present with real data
    expect(msg).toContain("VN-Index")
    expect(msg).toContain("1.251")
    // Watchlist section present
    expect(msg).toContain("VCB")
    expect(msg).toContain("88,000")
    expect(msg).toContain("VHM")
    expect(msg).toContain("55,000")
    // No filler text anywhere
    expect(msg).not.toContain("chưa có dữ liệu")
    expect(msg).not.toContain("Chưa có dữ liệu giá")
    expect(msg).not.toContain("N/A")
  })

})
