/**
 * Task 264 — Reputation Scorer Tests
 *
 * Tests for reputationScorer.ts:
 * - 30-day EWMA reputation score (0-100)
 * - Crisis penalty: CRITICAL=-20, HIGH=-10, MEDIUM=-5
 * - Recovery: +2/day with no crisis
 * - Risk levels: >=70 safe, 50-69 watch, 30-49 warning, <30 danger
 */

import { describe, it, expect } from "bun:test";
import {
  applycrisispenalty,
  applyRecovery,
  computeEwmaScore,
  classifyRiskLevel,
  type ReputationScore,
  type RiskLevel,
} from "../domain/services/reputationScorer.js";

describe("Task 264 — Reputation Scorer", () => {
  // ── applycrisispenalty ────────────────────────────────────────────────────

  it("applies CRITICAL penalty of -20", () => {
    const score = applycrisispenalty(80, "critical");
    expect(score).toBe(60);
  });

  it("applies HIGH penalty of -10", () => {
    const score = applycrisispenalty(80, "high");
    expect(score).toBe(70);
  });

  it("applies MEDIUM penalty of -5", () => {
    const score = applycrisispenalty(80, "medium");
    expect(score).toBe(75);
  });

  it("applies LOW penalty of 0 (no change)", () => {
    const score = applycrisispenalty(80, "low");
    expect(score).toBe(80);
  });

  it("clamps score to minimum 0 after penalty", () => {
    const score = applycrisispenalty(5, "critical");
    expect(score).toBe(0);
  });

  it("clamps score to maximum 100", () => {
    const score = applycrisispenalty(110, "low");
    expect(score).toBe(100);
  });

  // ── applyRecovery ─────────────────────────────────────────────────────────

  it("adds +2 per recovery day", () => {
    const score = applyRecovery(60, 1);
    expect(score).toBe(62);
  });

  it("adds +2 per day for multiple days", () => {
    const score = applyRecovery(60, 5);
    expect(score).toBe(70);
  });

  it("clamps recovery at 100", () => {
    const score = applyRecovery(99, 5);
    expect(score).toBe(100);
  });

  it("returns same score for 0 recovery days", () => {
    const score = applyRecovery(70, 0);
    expect(score).toBe(70);
  });

  // ── computeEwmaScore ──────────────────────────────────────────────────────

  it("returns initial score when no history", () => {
    const result = computeEwmaScore(75, []);
    expect(result).toBe(75);
  });

  it("applies EWMA smoothing over history (alpha=2/31)", () => {
    // EWMA: new = alpha * current + (1-alpha) * previous
    // With single history entry at 80, current=60, alpha≈0.0645
    const result = computeEwmaScore(60, [80]);
    // Expected: 0.0645*60 + 0.9355*80 ≈ 78.71 → round to check range
    expect(result).toBeGreaterThan(75);
    expect(result).toBeLessThan(82);
  });

  // ── classifyRiskLevel ─────────────────────────────────────────────────────

  it("classifies score >=70 as 'safe'", () => {
    expect(classifyRiskLevel(70)).toBe("safe");
    expect(classifyRiskLevel(100)).toBe("safe");
  });

  it("classifies score 50-69 as 'watch'", () => {
    expect(classifyRiskLevel(50)).toBe("watch");
    expect(classifyRiskLevel(69)).toBe("watch");
  });

  it("classifies score 30-49 as 'warning'", () => {
    expect(classifyRiskLevel(30)).toBe("warning");
    expect(classifyRiskLevel(49)).toBe("warning");
  });

  it("classifies score <30 as 'danger'", () => {
    expect(classifyRiskLevel(29)).toBe("danger");
    expect(classifyRiskLevel(0)).toBe("danger");
  });
});
