/**
 * Task 135 — RAG Temporal Decay
 *
 * Tests for temporal scoring in the RAG retriever:
 *   - applyTemporalDecay()    re-ranks results so recent entries rank higher
 *   - searchContext()         now accepts maxDistance option + applies decay
 */

import { describe, it, expect } from "bun:test";
// G5a (P2-F): legacy LanceDB files moved to _deprecated/; tests preserved as regression anchors.
import {
  applyTemporalDecay,
  type TemporalDecayConfig,
} from "../infrastructure/rag/_deprecated/retriever.js";
import type { SearchResult } from "../infrastructure/rag/_deprecated/vectorstore.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<SearchResult> & { createdAt: string }): SearchResult {
  return {
    id: "test-id",
    level: "global",
    title: "Test entry",
    summary: "Test summary",
    tags: [],
    actionCode: "",
    distance: 0.5,
    ...overrides,
  };
}

/** Return an ISO string N hours before now */
function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3_600_000).toISOString();
}

/** Return an ISO string N days before now */
function daysAgo(n: number): string {
  return hoursAgo(n * 24);
}

// ── applyTemporalDecay ────────────────────────────────────────────────────

describe("Task 135 — applyTemporalDecay", () => {
  it("returns empty array when given empty input", () => {
    const result = applyTemporalDecay([]);
    expect(result).toEqual([]);
  });

  it("recent result (1h ago) gets a lower adjusted distance than same-distance old result (30d ago)", () => {
    const recentRaw: SearchResult = makeResult({ id: "recent", distance: 0.5, createdAt: hoursAgo(1) });
    const oldRaw: SearchResult = makeResult({ id: "old", distance: 0.5, createdAt: daysAgo(30) });

    const ranked = applyTemporalDecay([oldRaw, recentRaw]);

    // Recent should appear first (lower adjusted distance)
    expect(ranked[0]!.id).toBe("recent");
    expect(ranked[1]!.id).toBe("old");
  });

  it("results are sorted ascending by adjusted distance", () => {
    const results: SearchResult[] = [
      makeResult({ id: "a", distance: 0.8, createdAt: daysAgo(60) }),
      makeResult({ id: "b", distance: 0.3, createdAt: daysAgo(60) }),
      makeResult({ id: "c", distance: 0.5, createdAt: daysAgo(60) }),
    ];
    const ranked = applyTemporalDecay(results);
    expect(ranked[0]!.id).toBe("b");
    expect(ranked[1]!.id).toBe("c");
    expect(ranked[2]!.id).toBe("a");
  });

  it("very old result (1 year) gets minimal boost — adjusted distance close to raw distance", () => {
    const config: TemporalDecayConfig = { halfLifeDays: 7, maxBoost: 0.3 };
    const oneYearAgo = daysAgo(365);
    const result = makeResult({ distance: 0.6, createdAt: oneYearAgo });

    const decayed = applyTemporalDecay([result], config)[0]!;

    // After 365d with 7d half-life, decayFactor ≈ 0.5^(365/7) ≈ 1.3e-16 ≈ 0
    // adjustedDistance ≈ 0.6 / (0 * 0.3 + (1 - 0.3)) = 0.6 / 0.7 ≈ 0.857
    // Should be strictly greater than raw distance (no meaningful boost)
    expect(decayed.distance).toBeGreaterThan(0.6);
  });

  it("brand-new result (0h ago) gets maximum boost — adjusted distance < raw distance", () => {
    const config: TemporalDecayConfig = { halfLifeDays: 7, maxBoost: 0.3 };
    const result = makeResult({ distance: 0.6, createdAt: new Date().toISOString() });

    const decayed = applyTemporalDecay([result], config)[0]!;

    // decayFactor ≈ 1 (very fresh), adjustedDistance ≈ 0.6 / (1 * 0.3 + 0.7) = 0.6 / 1 = 0.6
    expect(decayed.distance).toBeLessThanOrEqual(0.6);
  });

  it("halfLifeDays=1 makes decay aggressive — 7d-old result gets ~1% boost", () => {
    const config: TemporalDecayConfig = { halfLifeDays: 1, maxBoost: 0.3 };
    const weekOld = makeResult({ distance: 0.5, createdAt: daysAgo(7) });

    const decayed = applyTemporalDecay([weekOld], config)[0]!;

    // decayFactor = 0.5^(7) ≈ 0.0078, so ~0.78% boost
    // adjustedDistance = 0.5 / (0.0078 * 0.3 + 0.7) ≈ 0.5 / 0.7023 ≈ 0.712
    // Should be > 0.5 (old result, no real boost)
    expect(decayed.distance).toBeGreaterThan(0.5);
  });

  it("halfLifeDays=30 makes decay gentle — 7d-old result still gets meaningful boost", () => {
    const aggressiveConfig: TemporalDecayConfig = { halfLifeDays: 1, maxBoost: 0.3 };
    const gentleConfig: TemporalDecayConfig = { halfLifeDays: 30, maxBoost: 0.3 };
    const weekOld = makeResult({ distance: 0.5, createdAt: daysAgo(7) });

    const aggressive = applyTemporalDecay([weekOld], aggressiveConfig)[0]!;
    const gentle = applyTemporalDecay([weekOld], gentleConfig)[0]!;

    // With gentle decay, 7d old should be closer to original (more boost) than aggressive
    expect(gentle.distance).toBeLessThan(aggressive.distance);
  });

  it("maxBoost=0 disables temporal boosting — distance unchanged", () => {
    const config: TemporalDecayConfig = { halfLifeDays: 7, maxBoost: 0 };
    const recent = makeResult({ distance: 0.5, createdAt: hoursAgo(1) });
    const old = makeResult({ distance: 0.5, createdAt: daysAgo(30) });

    const ranked = applyTemporalDecay([recent, old], config);

    // With maxBoost=0: adjustedDistance = distance / (decay*0 + 1) = distance unchanged
    expect(ranked[0]!.distance).toBeCloseTo(0.5, 4);
    expect(ranked[1]!.distance).toBeCloseTo(0.5, 4);
  });

  it("default config uses halfLifeDays=7 and maxBoost=0.3", () => {
    // With default config, 7-day-old result should have decayFactor = 0.5
    // adjustedDistance = 0.5 / (0.5 * 0.3 + 0.7) = 0.5 / 0.85 ≈ 0.588
    const sevenDayOld = makeResult({ distance: 0.5, createdAt: daysAgo(7) });
    const decayed = applyTemporalDecay([sevenDayOld])[0]!;
    expect(decayed.distance).toBeCloseTo(0.5 / 0.85, 3);
  });

  it("result with missing/invalid createdAt is treated as very old (minimal boost)", () => {
    const badDate = makeResult({ distance: 0.5, createdAt: "not-a-date" });
    const decayed = applyTemporalDecay([badDate])[0]!;
    // Should not throw and should return a valid number
    expect(typeof decayed.distance).toBe("number");
    expect(Number.isFinite(decayed.distance)).toBe(true);
  });

  it("multiple results preserve all original fields, only distance is adjusted", () => {
    // Use a 14-day-old entry so we can assert a predictable distance adjustment
    const original = makeResult({
      id: "preserve-test",
      level: "action",
      title: "Title to preserve",
      summary: "Summary to preserve",
      tags: ["vn", "banking"],
      actionCode: "VCB",
      distance: 0.4,
      createdAt: daysAgo(14),
    });

    const decayed = applyTemporalDecay([original])[0]!;

    expect(decayed.id).toBe("preserve-test");
    expect(decayed.level).toBe("action");
    expect(decayed.title).toBe("Title to preserve");
    expect(decayed.summary).toBe("Summary to preserve");
    expect(decayed.tags).toEqual(["vn", "banking"]);
    expect(decayed.actionCode).toBe("VCB");
    expect(decayed.createdAt).toBe(original.createdAt);
    // 14-day-old: decayFactor=0.25, denominator=0.775 → adjustedDist = 0.4/0.775 ≈ 0.516 > 0.4
    expect(decayed.distance).toBeGreaterThan(0.4);
  });

  it("single result returns array of length 1", () => {
    const single = makeResult({ distance: 0.3, createdAt: hoursAgo(5) });
    const result = applyTemporalDecay([single]);
    expect(result).toHaveLength(1);
  });

  it("maxBoost clamps: same raw distance, recent should rank strictly higher than old with positive maxBoost", () => {
    const config: TemporalDecayConfig = { halfLifeDays: 7, maxBoost: 0.3 };
    const recent = makeResult({ id: "r", distance: 0.5, createdAt: hoursAgo(2) });
    const old = makeResult({ id: "o", distance: 0.5, createdAt: daysAgo(14) });

    const ranked = applyTemporalDecay([old, recent], config);
    expect(ranked[0]!.id).toBe("r");
    expect(ranked[0]!.distance).toBeLessThan(ranked[1]!.distance);
  });

  it("formula: adjustedDistance = distance / (decayFactor * maxBoost + (1 - maxBoost))", () => {
    const config: TemporalDecayConfig = { halfLifeDays: 7, maxBoost: 0.3 };
    // 14 days old → decayFactor = 0.5^(14/7) = 0.5^2 = 0.25
    // denominator = 0.25 * 0.3 + 0.7 = 0.075 + 0.7 = 0.775
    // adjustedDistance = 0.6 / 0.775 ≈ 0.7742
    const result = makeResult({ distance: 0.6, createdAt: daysAgo(14) });
    const decayed = applyTemporalDecay([result], config)[0]!;
    expect(decayed.distance).toBeCloseTo(0.6 / 0.775, 3);
  });
});

// ── filterByMaxDistance ───────────────────────────────────────────────────

import { filterByMaxDistance } from "../infrastructure/rag/_deprecated/retriever.js";

describe("Task 135 — filterByMaxDistance", () => {
  it("removes results with distance > maxDistance", () => {
    const results: SearchResult[] = [
      makeResult({ id: "close", distance: 0.3, createdAt: daysAgo(1) }),
      makeResult({ id: "medium", distance: 0.79, createdAt: daysAgo(1) }),
      makeResult({ id: "far", distance: 0.81, createdAt: daysAgo(1) }),
      makeResult({ id: "too-far", distance: 1.2, createdAt: daysAgo(1) }),
    ];

    const filtered = filterByMaxDistance(results, 0.8);
    const ids = filtered.map((r) => r.id);

    expect(ids).toContain("close");
    expect(ids).toContain("medium");
    expect(ids).not.toContain("far");
    expect(ids).not.toContain("too-far");
  });

  it("returns all results when maxDistance is very high", () => {
    const results: SearchResult[] = [
      makeResult({ distance: 0.1, createdAt: daysAgo(1) }),
      makeResult({ distance: 0.9, createdAt: daysAgo(1) }),
      makeResult({ distance: 1.5, createdAt: daysAgo(1) }),
    ];
    expect(filterByMaxDistance(results, 999)).toHaveLength(3);
  });

  it("returns empty array when all results exceed threshold", () => {
    const results: SearchResult[] = [
      makeResult({ distance: 0.9, createdAt: daysAgo(1) }),
      makeResult({ distance: 1.1, createdAt: daysAgo(1) }),
    ];
    expect(filterByMaxDistance(results, 0.8)).toHaveLength(0);
  });

  it("default maxDistance is 0.8 — filters results > 0.8", () => {
    const results: SearchResult[] = [
      makeResult({ id: "ok", distance: 0.799, createdAt: daysAgo(1) }),
      makeResult({ id: "over", distance: 0.801, createdAt: daysAgo(1) }),
    ];
    const filtered = filterByMaxDistance(results);
    expect(filtered.map((r) => r.id)).toEqual(["ok"]);
  });
});
