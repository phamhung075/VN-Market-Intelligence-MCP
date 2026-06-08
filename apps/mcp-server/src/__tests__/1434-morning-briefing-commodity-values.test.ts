Bun.env["DB_PATH"] = ":memory:"
// src/__tests__/1434-morning-briefing-commodity-values.test.ts
// Task 1434 — TDD RED: commodity section shows per-commodity values (not count-only)
//
// Tests assert FIXED behavior from task 1435:
//   T1: commodity with name+value → line contains name and formatted value
//   T2: >5 commodities → only first 5 shown
//   T3: empty list → commodity section omitted
//   T4: count-only string "N chỉ số hàng hóa" NOT present in output
//
// All tests are RED until task 1435 fixes formatBriefingMessage + exports
// formatCommoditiesSection.

import { describe, it, expect } from "bun:test"
import { formatBriefingMessage, formatCommoditiesSection } from "../scheduler/briefings/morningBriefingJob.js"
import type { DailyBriefing } from "../application/usecases/assembleBriefing.js"

// ─────────────────────────────────────────────────────────────────────────────
// Fixture builder
// ─────────────────────────────────────────────────────────────────────────────

function makeBriefing(overrides: Partial<DailyBriefing>): DailyBriefing {
  return {
    date: "2026-04-18",
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
    generatedAt: "2026-04-18T01:00:00.000Z",
    ...overrides,
  } as DailyBriefing
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1434 — morning briefing commodity values (RED -> GREEN in 1435)", () => {

  // ─────────────────────────────────────────────────────────────────────────
  // T1: single commodity with name+value → line contains both indicator name and value
  // ─────────────────────────────────────────────────────────────────────────
  it("T1: commodity with name+value — line shows indicator name and formatted value", () => {
    const briefing = makeBriefing({
      trackedCommodities: [
        { indicator: "Dầu Brent", value: 82.5, unit: "USD/barrel", dataPoints: 10 },
      ],
    })

    const msg = formatBriefingMessage(briefing)

    // Must show the commodity name
    expect(msg).toContain("Dầu Brent")
    // Must show the value (82.5 formatted somehow)
    expect(msg).toContain("82.5")
    // Must show the unit
    expect(msg).toContain("USD/barrel")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // T2: >5 commodities → only first 5 shown
  // ─────────────────────────────────────────────────────────────────────────
  it("T2: more than 5 commodities — only first 5 rendered", () => {
    const briefing = makeBriefing({
      trackedCommodities: [
        { indicator: "Dầu Brent",  value: 82.5,  unit: "USD/barrel", dataPoints: 5 },
        { indicator: "Vàng",       value: 2350.0, unit: "USD/oz",     dataPoints: 5 },
        { indicator: "Đồng",       value: 4.25,   unit: "USD/lb",     dataPoints: 5 },
        { indicator: "Thép HRC",   value: 510.0,  unit: "USD/ton",    dataPoints: 5 },
        { indicator: "Khí TN",     value: 2.8,    unit: "USD/MMBtu",  dataPoints: 5 },
        { indicator: "Cao su",     value: 1.6,    unit: "USD/kg",     dataPoints: 5 },  // 6th — must NOT appear
      ],
    })

    const msg = formatBriefingMessage(briefing)

    // First 5 must appear
    expect(msg).toContain("Dầu Brent")
    expect(msg).toContain("Vàng")
    expect(msg).toContain("Đồng")
    expect(msg).toContain("Thép HRC")
    expect(msg).toContain("Khí TN")
    // 6th must NOT appear
    expect(msg).not.toContain("Cao su")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // T3: empty trackedCommodities → commodity section omitted entirely
  // ─────────────────────────────────────────────────────────────────────────
  it("T3: empty trackedCommodities — commodity section absent", () => {
    const briefing = makeBriefing({
      trackedCommodities: [],
    })

    const msg = formatBriefingMessage(briefing)

    // No commodity header should appear
    expect(msg).not.toContain("hàng hóa")
    expect(msg).not.toContain("📦")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // T4: count-only string must NOT appear — "N chỉ số hàng hóa đang theo dõi"
  // ─────────────────────────────────────────────────────────────────────────
  it("T4: count-only string absent — per-commodity lines shown instead", () => {
    const briefing = makeBriefing({
      trackedCommodities: [
        { indicator: "Dầu Brent", value: 82.5,  unit: "USD/barrel", dataPoints: 10 },
        { indicator: "Vàng",      value: 2350.0, unit: "USD/oz",     dataPoints: 10 },
      ],
    })

    const msg = formatBriefingMessage(briefing)

    // The old count-only pattern must NOT appear
    expect(msg).not.toContain("chỉ số hàng hóa đang theo dõi")
    // Per-commodity names must appear instead
    expect(msg).toContain("Dầu Brent")
    expect(msg).toContain("Vàng")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // T5: previousValue present and lower → ↑ arrow shown
  // ─────────────────────────────────────────────────────────────────────────
  it("T5: commodity with previousValue lower than value — shows ↑ arrow", () => {
    const lines = formatCommoditiesSection([
      { indicator: "brent_crude_usd", value: 102.36, unit: "$/bbl", dataPoints: 5, previousValue: 98.0 },
    ])
    const line = lines.find((l) => l.includes("brent_crude_usd"))!
    expect(line).toContain("↑")
    expect(line).not.toContain("↓")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // T6: previousValue present and higher → ↓ arrow shown
  // ─────────────────────────────────────────────────────────────────────────
  it("T6: commodity with previousValue higher than value — shows ↓ arrow", () => {
    const lines = formatCommoditiesSection([
      { indicator: "gold_usd_oz", value: 1900.0, unit: "$/oz", dataPoints: 3, previousValue: 2000.0 },
    ])
    const line = lines.find((l) => l.includes("gold_usd_oz"))!
    expect(line).toContain("↓")
    expect(line).not.toContain("↑")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // T7: previousValue absent → no arrow shown
  // ─────────────────────────────────────────────────────────────────────────
  it("T7: commodity without previousValue — no arrow shown", () => {
    const lines = formatCommoditiesSection([
      { indicator: "wti_crude_usd", value: 78.5, unit: "$/bbl", dataPoints: 2 },
    ])
    const line = lines.find((l) => l.includes("wti_crude_usd"))!
    expect(line).not.toContain("↑")
    expect(line).not.toContain("↓")
  })

})
