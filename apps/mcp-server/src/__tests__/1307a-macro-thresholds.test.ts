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

// ── AC-2: 50 VND absolute deviation — below %-floor so capped at elevated ────
// FIX-MACRO-FX-SIGMA-PHANTOM-EXTREME: 50 VND on 26334 base = 0.19% < 0.5% floor.
// Guard 2 (%-floor) fires AFTER Guard 1 (VND abs dev); result is "elevated" not "extreme".
// Old expectation ("extreme") was pre-FX-%-floor; updated to "elevated".
describe("1307a AC-2 — 50 VND deviation: below %-floor, capped at elevated", () => {
  it("usdVndRate: 50 VND below mean (0.19%) → elevated (below 0.5% FX floor)", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26284,   // 50 VND below 26334; absPercentMove = 0.19%
      mean: 26334,
      stdDev: 0.76,
      sampleCount: 30,
    });
    // 50 VND passes Guard 1 (absDeviation >= 50), but %-floor (Guard 2) fires:
    // 50/26334 = 0.19% < 0.5% → extreme→elevated
    expect(result.level).toBe("elevated");
    // σ number is preserved (transparency)
    expect(result.zScore).toBeDefined();
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

  it("below mean at < 0.5% on FX → 'thấp hơn TB' (elevated), not 'cực thấp'", () => {
    // FIX-MACRO-FX-SIGMA-PHANTOM-EXTREME: 60 VND / 26333 = 0.23% — below 0.5% %-floor.
    // Guard 2 caps extreme→elevated; direction still "below" → "thấp hơn TB".
    // Previously expected "cực thấp" (extreme); now correctly "thấp hơn TB" (elevated).
    const r = classifyDeviation({ name: "usdVndRate", current: 26273, mean: 26333, stdDev: 12, sampleCount: 30 });
    expect(r.direction).toBe("below");
    expect(r.level).toBe("elevated");
    expect(r.summary).toContain("thấp hơn TB");
    expect(r.summary).not.toContain("cực thấp");
  });
});

// ── FX-SIGMA-PHANTOM-EXTREME: %-floor boundary tests ─────────────────────────
// Verifies that classifyDeviation() requires BOTH σ-test AND %-move floor
// before escalating FX slow-movers (usdVndRate, usdVndOfficial) to high/extreme.

describe("FX-SIGMA-PHANTOM-EXTREME — %-floor boundary: just-under 0.5%", () => {
  // Base: mean=26269.17, stdDev=12.47 (pathologically tight window)
  // Reproduces the live 2026-06-19 false-CRITICAL: 66 VND = 0.25%
  it("USD/VND +66 VND (0.25% = 5.28σ) → elevated (not extreme/high)", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26335,   // +65.83 VND above mean; absPercentMove ≈ 0.25%
      mean: 26269.17,
      stdDev: 12.47,
      sampleCount: 30,
    });
    // σ-test alone: 5.28σ → would be "extreme" pre-fix
    // %-floor: 65.83/26269.17 = 0.25% < 0.5% → capped at "elevated"
    expect(result.level).toBe("elevated");
    expect(result.level).not.toBe("extreme");
    expect(result.level).not.toBe("high");
    // zScore is still the real value (transparency preserved)
    expect(Math.abs(result.zScore)).toBeGreaterThan(3);
  });

  it("USD/VND +100 VND (0.38%) → elevated (still below 0.5% floor)", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26369,   // +100 VND; absPercentMove ≈ 0.38%
      mean: 26269,
      stdDev: 12.47,
      sampleCount: 30,
    });
    expect(result.level).toBe("elevated");
  });

  it("usdVndOfficial: 0.25% drift → elevated (FX %-floor generic, not USD/VND-only)", () => {
    const result = classifyDeviation({
      name: "usdVndOfficial",
      current: 26335,
      mean: 26269,
      stdDev: 12.47,
      sampleCount: 30,
    });
    expect(result.level).toBe("elevated");
    expect(result.level).not.toBe("extreme");
  });
});

describe("FX-SIGMA-PHANTOM-EXTREME — %-floor boundary: just-over 0.5%", () => {
  it("USD/VND +135 VND (0.51%) with high σ → extreme (genuine macro event)", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26404,   // +135 VND; 135/26269 ≈ 0.514% > 0.5%
      mean: 26269,
      stdDev: 12.47,
      sampleCount: 30,
    });
    // σ-test: 135/12.47 ≈ 10.8σ → extreme
    // %-floor: 0.514% > 0.5% → floor passes, extreme fires
    expect(result.level).toBe("extreme");
  });

  it("USD/VND 0.6% move → extreme (clear genuine event)", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26427,   // +158 VND; 158/26269 ≈ 0.60%
      mean: 26269,
      stdDev: 12.47,
      sampleCount: 30,
    });
    expect(result.level).toBe("extreme");
  });
});

describe("FX-SIGMA-PHANTOM-EXTREME — non-FX indicators bypass %-floor", () => {
  it("brentCrudeUSD: 3.5% single-day move → extreme via σ-gate (no %-floor applied)", () => {
    // Non-FX indicators are not in FX_SLOW_MOVER_INDICATORS set; σ-gate fires alone.
    const result = classifyDeviation({
      name: "brentCrudeUSD",
      current: 87.5,    // +2.8 above mean 84.7; stdDev≈0.76 → very high σ
      mean: 84.7,
      stdDev: 0.76,
      sampleCount: 30,
    });
    // No %-floor guard → extreme from σ-test alone
    expect(result.level).toBe("extreme");
  });

  it("goldUSDPerOz: high-σ move → extreme (non-FX, no %-floor)", () => {
    const result = classifyDeviation({
      name: "goldUSDPerOz",
      current: 3550,    // +65 above mean 3485; stdDev≈12 → 5.4σ
      mean: 3485,
      stdDev: 12,
      sampleCount: 30,
    });
    expect(result.level).toBe("extreme");
  });

  it("refinancingRatePct: not in FX set → σ-gate only, no %-floor", () => {
    // Interest rates use percentage-point basis; %-of-% floor is not meaningful.
    const result = classifyDeviation({
      name: "refinancingRatePct",
      current: 4.6,     // +0.1pp above 4.5%; σ depends on stdDev
      mean: 4.5,
      stdDev: 0.02,
      sampleCount: 30,
    });
    // 0.1/0.02 = 5σ → extreme (no FX %-floor guard)
    expect(result.level).toBe("extreme");
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
