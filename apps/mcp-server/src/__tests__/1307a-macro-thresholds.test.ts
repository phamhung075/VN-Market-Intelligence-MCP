Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1307a — Macro alert thresholds: cooldown bypass + briefing direction label
 *
 * AC-1: alreadySentToday query must match ANY row for the indicator today
 *       (with OR without notified_telegram=1) — prevents level-drift re-fires.
 * AC-2: 50 VND absolute deviation on usdVndRate → extreme (economically significant).
 * AC-3: 2.8 VND deviation → not high/extreme (false-positive guard still active).
 * AC-4: classifyDeviation direction labels correct above AND below mean.
 * AC-5: morningBriefingJob formatBriefingMessage renders macroSnapshot direction
 *       from dev.summary (not hardcoded "cao hơn TB").
 */

import { describe, it, expect } from "bun:test";
import { classifyDeviation } from "../domain/services/macroThresholds";
import { formatBriefingMessage } from "../scheduler/briefings/morningBriefingJob";

// ── AC-1: alreadySentToday query contract ─────────────────────────────────────
// The SQL at intelligenceCycleJob.ts:630 must NOT include "AND notified_telegram = 1".
// We verify the intent by checking the source text of the query.
describe("1307a AC-1 — cooldown bypass: alreadySentToday query has no notified_telegram filter", () => {
  it("intelligenceCycleJob source: alreadySentToday query omits notified_telegram constraint", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      import.meta.dir,
      "../scheduler/news-analysis/intelligenceCycleJob.ts"
    );
    const src = fs.readFileSync(filePath, "utf8");

    // Find the alreadySentToday block
    const idx = src.indexOf("alreadySentToday");
    expect(idx).toBeGreaterThan(0);

    // Extract the query string (next 300 chars from first occurrence)
    const snippet = src.slice(idx, idx + 300);

    // Must NOT contain notified_telegram constraint
    expect(snippet).not.toContain("notified_telegram");
  });
});

// ── AC-2: 50 VND absolute deviation → extreme ────────────────────────────────
describe("1307a AC-2 — 50 VND deviation triggers extreme", () => {
  it("usdVndRate: 50 VND below mean → extreme (economically significant)", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26284,   // 50 VND below 26334
      mean: 26334,
      stdDev: 0.76,
      sampleCount: 30,
    });
    expect(result.level).toBe("extreme");
  });
});

// ── AC-3: 2.8 VND false-positive guard still active ──────────────────────────
describe("1307a AC-3 — 2.8 VND deviation stays below high/extreme", () => {
  it("usdVndRate: 2.8 VND deviation → not high or extreme", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26331.2,  // 2.8 VND below 26334
      mean: 26334,
      stdDev: 0.76,
      sampleCount: 30,
    });
    expect(result.level).not.toBe("extreme");
    expect(result.level).not.toBe("high");
  });
});

// ── AC-4: direction labels above AND below mean ───────────────────────────────
describe("1307a AC-4 — direction-aware Vietnamese labels", () => {
  it("elevated above → summary contains 'cao hơn TB'", () => {
    const r = classifyDeviation({ name: "usdVndRate", current: 26351, mean: 26333, stdDev: 12, sampleCount: 30 });
    expect(r.direction).toBe("above");
    expect(r.summary).toContain("cao hơn TB");
  });

  it("elevated below → summary contains 'thấp hơn TB'", () => {
    const r = classifyDeviation({ name: "usdVndRate", current: 26315, mean: 26333, stdDev: 12, sampleCount: 30 });
    expect(r.direction).toBe("below");
    expect(r.summary).toContain("thấp hơn TB");
  });

  it("extreme below → summary contains 'cực thấp' not 'cực cao'", () => {
    // 26273 = 60 VND below mean 26333 — above 50 VND guard, so extreme fires
    // Task 1270: guard raised 10→50 VND; test updated to use deviation >= 50 VND
    const r = classifyDeviation({ name: "usdVndRate", current: 26273, mean: 26333, stdDev: 12, sampleCount: 30 });
    expect(r.direction).toBe("below");
    expect(r.summary).toContain("cực thấp");
    expect(r.summary).not.toContain("cực cao");
  });
});

// ── AC-5: morningBriefingJob renders direction from dev.summary ───────────────
describe("1307a AC-5 — formatBriefingMessage renders macro direction correctly", () => {
  it("below-mean macro indicator shows 'thấp' in briefing output (not 'cao hơn TB')", () => {
    // Simulate a briefing with a macro snapshot where Brent is -1.65σ below mean
    const briefing = {
      date: "2026-04-24",
      vnIndex: null,
      watchlistSummary: [],
      topStories: [],
      alerts: [],
      newReports: [],
      unresolvedAlerts: [],
      topConviction: null,
      sensitiveWarnings: [],
      macroSnapshot: [
        {
          name: "brentCrudeUSD",
          value: 74.5,
          unit: "USD",
          // This status comes from classifyDeviation — below mean, so should say "thấp hơn TB"
          status: "Dầu Brent: 74.5 — thấp hơn TB (-1.65σ dưới TB 79.1)",
        },
      ],
      trackedCommodities: [],
      globalSnapshot: null,
      insiderRecent: [],
      foreignFlowSummary: [],
      evidenceTopScores: [],
      taSummary: [],
      upcomingDeadlines: [],
      portfolioPnl: null,
      predictionSignals: [],
      generatedAt: new Date().toISOString(),
    } as unknown as Parameters<typeof formatBriefingMessage>[0];

    const output = formatBriefingMessage(briefing);

    // Must render the actual status string (which already has correct direction)
    expect(output).toContain("thấp hơn TB");
    expect(output).not.toMatch(/cao hơn TB.*Brent/);
  });

  it("above-mean macro indicator shows 'cao hơn TB' in briefing output", () => {
    const briefing = {
      date: "2026-04-24",
      vnIndex: null,
      watchlistSummary: [],
      topStories: [],
      alerts: [],
      newReports: [],
      unresolvedAlerts: [],
      topConviction: null,
      sensitiveWarnings: [],
      macroSnapshot: [
        {
          name: "brentCrudeUSD",
          value: 95.0,
          unit: "USD",
          status: "Dầu Brent: 95.0 — cao hơn TB (+2.1σ trên TB 82.3)",
        },
      ],
      trackedCommodities: [],
      globalSnapshot: null,
      insiderRecent: [],
      foreignFlowSummary: [],
      evidenceTopScores: [],
      taSummary: [],
      upcomingDeadlines: [],
      portfolioPnl: null,
      predictionSignals: [],
      generatedAt: new Date().toISOString(),
    } as unknown as Parameters<typeof formatBriefingMessage>[0];

    const output = formatBriefingMessage(briefing);
    expect(output).toContain("cao hơn TB");
  });
});
