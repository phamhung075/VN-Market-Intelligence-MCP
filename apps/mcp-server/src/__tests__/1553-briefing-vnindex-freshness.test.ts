/**
 * Task 1553 — VN-Index "(cũ)" staleness label in morning + france formatters
 *
 * 4 assertions:
 *   1. morning fresh  → no "(cũ)" suffix
 *   2. morning stale  → has "(cũ)" suffix
 *   3. france fresh   → no "(cũ)" suffix
 *   4. france stale   → has "(cũ)" suffix
 */

import { describe, it, expect } from "bun:test";
import { formatBriefingMessage } from "../scheduler/briefings/morningBriefingJob.js";
import { formatFranceSummaryVI } from "../scheduler/briefings/franceSummaryJob.js";
import type { DailyBriefing } from "../application/usecases/assembleBriefing.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

const FRESH_FETCHED_AT = new Date(Date.now() - 1 * 3600 * 1000).toISOString(); // 1h ago
const STALE_FETCHED_AT = new Date(Date.now() - 26 * 3600 * 1000).toISOString(); // 26h ago

function makeMinimalBriefing(fetchedAt: string): DailyBriefing {
  return {
    date: "2026-04-20",
    vnIndex: { price: 1285, changePct: 0.5, change: 6, fetchedAt },
    topStories: [],
    alerts: [],
    watchlistSummary: [],
    newReports: [],
    insiderRows: [],
    insiderRecent: [],
    foreignFlowRows: [],
    evidenceScoreRows: [],
    taSignals: [],
    commodities: [],
    globalSnapshot: null,
    bctcDeadlines: [],
    portfolioPnl: null,
  } as unknown as DailyBriefing;
}

// ─── morning ──────────────────────────────────────────────────────────────────

describe("morningBriefingJob — VN-Index freshness label", () => {
  it("fresh fetchedAt → no (cũ) in VN-Index line", () => {
    const msg = formatBriefingMessage(makeMinimalBriefing(FRESH_FETCHED_AT));
    expect(msg).toContain("VN-Index");
    expect(msg).not.toContain("(cũ)");
  });

  it("stale fetchedAt (26h ago) → (cũ) appended to VN-Index line", () => {
    const msg = formatBriefingMessage(makeMinimalBriefing(STALE_FETCHED_AT));
    expect(msg).toContain("VN-Index");
    expect(msg).toContain("(cũ)");
  });
});

// ─── france ───────────────────────────────────────────────────────────────────

describe("franceSummaryJob — VN-Index freshness label", () => {
  it("fresh fetchedAt → no (cũ) in france VN-Index block", () => {
    const msg = formatFranceSummaryVI(
      "Chủ Nhật, 20/04/2026",
      [],   // movers
      [],   // alerts
      [],   // taSignals
      null, // portfolioPnl
      { close: 1285, change: 6, changePct: 0.5, fetchedAt: FRESH_FETCHED_AT },
    );
    expect(msg).toContain("VN-Index");
    expect(msg).not.toContain("(cũ)");
  });

  it("stale fetchedAt (26h ago) → (cũ) appended in france VN-Index block", () => {
    const msg = formatFranceSummaryVI(
      "Chủ Nhật, 20/04/2026",
      [],   // movers
      [],   // alerts
      [],   // taSignals
      null, // portfolioPnl
      { close: 1285, change: 6, changePct: 0.5, fetchedAt: STALE_FETCHED_AT },
    );
    expect(msg).toContain("VN-Index");
    expect(msg).toContain("(cũ)");
  });
});
