/**
 * TASK 1436 — TDD RED: Morning Briefing VN-Index point change
 *
 * All assertions MUST FAIL before Task 1437 adds:
 *   - change?: number to VnIndexSnapshot in assembleBriefing.ts
 *   - computation of change = Math.round(price - previousPrice) in Step 2
 *   - updated VN-Index line in formatBriefingMessage to render "(+12 / +0.94%)" style
 *
 * AC-a: VnIndexSnapshot with positive change → morning line contains "+12"
 * AC-b: VnIndexSnapshot with negative change → morning line contains "-8"
 * AC-c: Format matches "(+12 / +0.94%)" pattern (point change then pct)
 * AC-d: VnIndexSnapshot without change (undefined) → graceful fallback, no crash
 */

import { describe, it, expect } from "bun:test"
import { formatBriefingMessage } from "../scheduler/morningBriefingJob.js"
import type { DailyBriefing, VnIndexSnapshot } from "../application/usecases/assembleBriefing.js"

// ─────────────────────────────────────────────────────────────────────────────
// Fixture builder
// ─────────────────────────────────────────────────────────────────────────────

function makeBriefing(vnIndex?: VnIndexSnapshot): DailyBriefing {
  return {
    date: "2026-04-18",
    ...(vnIndex !== undefined ? { vnIndex } : {}),
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
  } as DailyBriefing
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-a: positive change → line contains "+12"
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-a: positive change → morning line contains '+12'", () => {
  it("formats positive point change with + sign", () => {
    const briefing = makeBriefing({
      price: 1285,
      changePct: 0.94,
      change: 12,
    } as VnIndexSnapshot)

    const msg = formatBriefingMessage(briefing)

    expect(msg).toContain("+12")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-b: negative change → line contains "-8"
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-b: negative change → morning line contains '-8'", () => {
  it("formats negative point change without double sign", () => {
    const briefing = makeBriefing({
      price: 1258,
      changePct: -0.63,
      change: -8,
    } as VnIndexSnapshot)

    const msg = formatBriefingMessage(briefing)

    expect(msg).toContain("-8")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-c: format matches "(+12 / +0.94%)" pattern
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-c: format matches '(+12 / +0.94%)' pattern", () => {
  it("morning VN-Index line contains combined point and pct in parentheses", () => {
    const briefing = makeBriefing({
      price: 1285,
      changePct: 0.94,
      change: 12,
    } as VnIndexSnapshot)

    const msg = formatBriefingMessage(briefing)

    // Must contain the point/pct block in the exact evening-style format
    expect(msg).toContain("(+12 / +0.94%)")
  })

  it("negative day: format is '(-8 / -0.63%)'", () => {
    const briefing = makeBriefing({
      price: 1258,
      changePct: -0.63,
      change: -8,
    } as VnIndexSnapshot)

    const msg = formatBriefingMessage(briefing)

    expect(msg).toContain("(-8 / -0.63%)")
  })

  it("full VN-Index line present and well-formed", () => {
    const briefing = makeBriefing({
      price: 1285,
      changePct: 0.94,
      change: 12,
    } as VnIndexSnapshot)

    const msg = formatBriefingMessage(briefing)

    // Line must start with VN-Index label, include the price, and include the block
    expect(msg).toMatch(/VN-Index:.*\(\+12 \/ \+0\.94%\)/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-d: change = undefined → graceful fallback, no crash
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-d: change undefined → graceful fallback, no crash", () => {
  it("does not throw when change is absent", () => {
    // VnIndexSnapshot without change field (legacy shape before task 1437)
    const briefing = makeBriefing({
      price: 1285,
      changePct: 0.94,
      // change intentionally omitted
    } as VnIndexSnapshot)

    expect(() => formatBriefingMessage(briefing)).not.toThrow()
  })

  it("when change is absent, line still contains VN-Index price and changePct", () => {
    const briefing = makeBriefing({
      price: 1285,
      changePct: 0.94,
    } as VnIndexSnapshot)

    const msg = formatBriefingMessage(briefing)

    expect(msg).toContain("VN-Index:")
    expect(msg).toContain("0.94%")
  })

  it("no VN-Index line when vnIndex is absent entirely", () => {
    const briefing = makeBriefing(undefined)

    const msg = formatBriefingMessage(briefing)

    expect(msg).not.toContain("VN-Index:")
  })
})
