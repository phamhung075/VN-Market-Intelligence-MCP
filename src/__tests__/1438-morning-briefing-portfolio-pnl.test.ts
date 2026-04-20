/**
 * Task 1438 — Morning Briefing Portfolio P&L Section
 *
 * Verifies that formatBriefingMessage() renders the DANH MUC block when
 * briefing.portfolioPnl is non-null and has items, and omits the block when
 * portfolioPnl is null/empty or when formatPnlSection returns "".
 */

import { describe, it, expect } from "bun:test";
import { formatBriefingMessage } from "../scheduler/briefings/morningBriefingJob.js";
import { formatPnlSection } from "../domain/services/portfolioPnlCalculator.js";
import type { DailyBriefing } from "../application/usecases/assembleBriefing.js";
import type { PortfolioPnlResult } from "../domain/services/portfolioPnlCalculator.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function baseBriefing(overrides: Partial<DailyBriefing> = {}): DailyBriefing {
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
    portfolioPnl: null,
    generatedAt: "2026-04-18T01:00:00.000Z",
    ...overrides,
  };
}

function pnlWithItems(): PortfolioPnlResult {
  return {
    items: [
      {
        code: "VCB",
        shares: 1000,
        avgPrice: 75_000,
        currentPrice: 85_000,
        pnlAmount: 10_000_000,
        pnlPct: 13.333,
      },
    ],
    totalPnlAmount: 10_000_000,
    totalPnlPct: 13.333,
  };
}

function pnlEmpty(): PortfolioPnlResult {
  return { items: [], totalPnlAmount: 0, totalPnlPct: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// (a) portfolioPnl non-null with items → output contains "DANH MUC" or "DANH MỤC"
// ─────────────────────────────────────────────────────────────────────────────

describe("formatBriefingMessage — portfolio P&L section", () => {
  it("(a) non-null portfolioPnl with items → output contains DANH MUC / DANH MỤC", () => {
    const briefing = baseBriefing({ portfolioPnl: pnlWithItems() });
    const output = formatBriefingMessage(briefing);
    const hasSection =
      output.includes("DANH MUC") || output.includes("DANH MỤC");
    expect(hasSection).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // (b) portfolioPnl null → section absent, no crash
  // ─────────────────────────────────────────────────────────────────────────

  it("(b) portfolioPnl null → section absent, no crash", () => {
    const briefing = baseBriefing({ portfolioPnl: null });
    expect(() => {
      const output = formatBriefingMessage(briefing);
      expect(output.includes("DANH MUC")).toBe(false);
      expect(output.includes("DANH MỤC")).toBe(false);
    }).not.toThrow();
  });

  it("(b) portfolioPnl undefined → section absent, no crash", () => {
    const briefing = baseBriefing();
    delete (briefing as Partial<DailyBriefing>).portfolioPnl;
    expect(() => {
      const output = formatBriefingMessage(briefing);
      expect(output.includes("DANH MUC")).toBe(false);
      expect(output.includes("DANH MỤC")).toBe(false);
    }).not.toThrow();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // (c) formatPnlSection returns "" (empty items) → section absent
  // ─────────────────────────────────────────────────────────────────────────

  it("(c) formatPnlSection returns empty string for empty items → section absent", () => {
    const empty = pnlEmpty();
    // Confirm formatPnlSection itself returns ""
    expect(formatPnlSection(empty)).toBe("");

    const briefing = baseBriefing({ portfolioPnl: empty });
    const output = formatBriefingMessage(briefing);
    expect(output.includes("DANH MUC")).toBe(false);
    expect(output.includes("DANH MỤC")).toBe(false);
  });
});
