/**
 * Task 1552 — isVnIndexFresh wired into formatEveningSummaryLines
 * 2 assertions: fresh → no suffix, stale → "(cũ)" suffix
 */

import { describe, it, expect } from "bun:test";
import { formatEveningSummaryLines } from "../scheduler/briefings/eveningSummaryJob.js";
import type { EveningSummary } from "../application/usecases/assembleEveningSummary.js";

function makeEveningSummary(fetchedAtMs: number): EveningSummary {
  return {
    date: "2026-04-21",
    vnIndex: {
      close: 1250.5,
      change: 5.3,
      changePct: 0.43,
      fetchedAt: new Date(fetchedAtMs).toISOString(),
    },
    topAlerts: [],
    topStories: [],
    watchlistMovers: [],
    predictionSignals: [],
    newsCount: 0,
  } as unknown as EveningSummary;
}

describe("formatEveningSummaryLines — VN-Index freshness suffix", () => {
  it("fresh fetchedAt (1h ago) → VN-Index line has no (cũ) suffix", () => {
    const summary = makeEveningSummary(Date.now() - 1 * 3600 * 1000);
    const lines = formatEveningSummaryLines(summary);
    const vnLine = lines.find((l) => l.startsWith("VN-Index:"));
    expect(vnLine).toBeDefined();
    expect(vnLine).not.toContain("(cũ)");
  });

  it("stale fetchedAt (26h ago) → VN-Index line contains (cũ)", () => {
    const summary = makeEveningSummary(Date.now() - 26 * 3600 * 1000);
    const lines = formatEveningSummaryLines(summary);
    const vnLine = lines.find((l) => l.startsWith("VN-Index:"));
    expect(vnLine).toBeDefined();
    expect(vnLine).toContain("(cũ)");
  });
});
