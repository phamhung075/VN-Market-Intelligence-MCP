// apps/mcp-server/src/__tests__/1804d-B-computeConfidenceBoost.test.ts
import { describe, it, expect } from "bun:test";
import { computeConfidenceBoost } from "../domain/services/confidenceBoost.js";

describe("Task 1804d-B — computeConfidenceBoost()", () => {
  // ── No-boost zone: |sigma| < 1.5 ──────────────────────────────────────
  it("returns baseConfidence unchanged when sigma is 0", () => {
    expect(computeConfidenceBoost(0, 0)).toBe(0);
    expect(computeConfidenceBoost(0, 0.5)).toBe(0.5);
  });

  it("returns baseConfidence unchanged when |sigma| < 1.5", () => {
    expect(computeConfidenceBoost(1.0, 0.6)).toBe(0.6);
    expect(computeConfidenceBoost(-1.4, 0.7)).toBe(0.7);
  });

  it("returns baseConfidence unchanged when |sigma| is exactly 0", () => {
    expect(computeConfidenceBoost(0, 0.8)).toBe(0.8);
  });

  // ── +0.05 tier: 1.5 ≤ |sigma| < 2.0 ──────────────────────────────────
  it("boosts by 0.05 when |sigma| is exactly 1.5", () => {
    expect(computeConfidenceBoost(1.5, 0.6)).toBeCloseTo(0.65, 10);
  });

  it("boosts by 0.05 when sigma is 1.9", () => {
    expect(computeConfidenceBoost(1.9, 0.5)).toBeCloseTo(0.55, 10);
  });

  it("boosts by 0.05 for negative sigma -1.7", () => {
    expect(computeConfidenceBoost(-1.7, 0.4)).toBeCloseTo(0.45, 10);
  });

  // ── +0.10 tier: 2.0 ≤ |sigma| < 3.0 ──────────────────────────────────
  it("boosts by 0.10 when |sigma| is exactly 2.0", () => {
    expect(computeConfidenceBoost(2.0, 0.5)).toBeCloseTo(0.60, 10);
  });

  it("boosts by 0.10 when sigma is 2.9", () => {
    expect(computeConfidenceBoost(2.9, 0.3)).toBeCloseTo(0.40, 10);
  });

  it("boosts by 0.10 for negative sigma -2.5", () => {
    expect(computeConfidenceBoost(-2.5, 0.6)).toBeCloseTo(0.70, 10);
  });

  // ── +0.20 tier: |sigma| ≥ 3.0 ─────────────────────────────────────────
  it("boosts by 0.20 when |sigma| is exactly 3.0", () => {
    expect(computeConfidenceBoost(3.0, 0.5)).toBeCloseTo(0.70, 10);
  });

  it("boosts by 0.20 when sigma is 5.0", () => {
    expect(computeConfidenceBoost(5.0, 0.6)).toBeCloseTo(0.80, 10);
  });

  it("boosts by 0.20 for negative sigma -4.0", () => {
    expect(computeConfidenceBoost(-4.0, 0.7)).toBeCloseTo(0.90, 10);
  });

  // ── Clamping ───────────────────────────────────────────────────────────
  it("clamps result to 1.0 when boost would exceed 1", () => {
    expect(computeConfidenceBoost(3.0, 0.95)).toBe(1.0);
    expect(computeConfidenceBoost(5.0, 1.0)).toBe(1.0);
  });

  it("clamps result to 0.0 — never returns negative (defensive)", () => {
    expect(computeConfidenceBoost(0, 0)).toBe(0);
  });

  // ── Boundary: exactly 1.5, 2.0, 3.0 ──────────────────────────────────
  it("uses closed lower bound at 1.5 (not open)", () => {
    const below = computeConfidenceBoost(1.4999, 0.5);
    const at = computeConfidenceBoost(1.5, 0.5);
    expect(below).toBeCloseTo(0.5, 10);
    expect(at).toBeCloseTo(0.55, 10);
  });

  it("uses closed lower bound at 2.0", () => {
    const below = computeConfidenceBoost(1.9999, 0.5);
    const at = computeConfidenceBoost(2.0, 0.5);
    expect(below).toBeCloseTo(0.55, 10);
    expect(at).toBeCloseTo(0.60, 10);
  });

  it("uses closed lower bound at 3.0", () => {
    const below = computeConfidenceBoost(2.9999, 0.5);
    const at = computeConfidenceBoost(3.0, 0.5);
    expect(below).toBeCloseTo(0.60, 10);
    expect(at).toBeCloseTo(0.70, 10);
  });
});
