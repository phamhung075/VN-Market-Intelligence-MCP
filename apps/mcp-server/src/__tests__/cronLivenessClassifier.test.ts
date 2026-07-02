/**
 * cronLivenessClassifier.test.ts — TASK-DASH-CRON-1
 *
 * Pure domain unit tests: all 5 branches of the FR-1.6 classification ladder +
 * exact boundary values (AC-5, AC-6, AC-8, AC-9, AC-10, AC-11).
 */

import { describe, it, expect } from "bun:test";
import { classifyCronLiveness } from "../domain/cron/cronLivenessClassifier.js";

const CADENCE_MS = 86_400_000; // 1 day
const THRESHOLD = 1.5;
const NOW = 1_800_000_000_000; // fixed epoch ms

describe("classifyCronLiveness — FR-1.6 ladder", () => {
  it("NEVER_FIRED — lastFireMs === null (AC-6, AC-26)", () => {
    expect(classifyCronLiveness(NOW, null, CADENCE_MS, THRESHOLD)).toBe("NEVER_FIRED");
  });

  it("NEVER_FIRED — regardless of cadence/threshold values", () => {
    expect(classifyCronLiveness(NOW, null, 60_000, 1.0)).toBe("NEVER_FIRED");
  });

  it("ON_TIME — ageMs === 0 (just fired)", () => {
    expect(classifyCronLiveness(NOW, NOW, CADENCE_MS, THRESHOLD)).toBe("ON_TIME");
  });

  it("ON_TIME — ageMs exactly equals cadenceMs (inclusive boundary, AC-8)", () => {
    const lastFireMs = NOW - CADENCE_MS;
    expect(classifyCronLiveness(NOW, lastFireMs, CADENCE_MS, THRESHOLD)).toBe("ON_TIME");
  });

  it("LATE — ageMs = cadenceMs + 1ms (just past ON_TIME boundary)", () => {
    const lastFireMs = NOW - (CADENCE_MS + 1);
    expect(classifyCronLiveness(NOW, lastFireMs, CADENCE_MS, THRESHOLD)).toBe("LATE");
  });

  it("LATE — ageMs exactly equals cadenceMs × thresholdMultiplier (inclusive boundary, AC-10)", () => {
    const thresholdMs = CADENCE_MS * THRESHOLD;
    const lastFireMs = NOW - thresholdMs;
    expect(classifyCronLiveness(NOW, lastFireMs, CADENCE_MS, THRESHOLD)).toBe("LATE");
  });

  it("MISSED — ageMs = cadenceMs × thresholdMultiplier + 1ms (just past LATE boundary, AC-9)", () => {
    const thresholdMs = CADENCE_MS * THRESHOLD;
    const lastFireMs = NOW - (thresholdMs + 1);
    expect(classifyCronLiveness(NOW, lastFireMs, CADENCE_MS, THRESHOLD)).toBe("MISSED");
  });

  it("MISSED — ageMs exactly equals cadenceMs × 3 (inclusive boundary, AC-11)", () => {
    const lastFireMs = NOW - CADENCE_MS * 3;
    expect(classifyCronLiveness(NOW, lastFireMs, CADENCE_MS, THRESHOLD)).toBe("MISSED");
  });

  it("STALE — ageMs = cadenceMs × 3 + 1ms (just past MISSED boundary, AC-9/AC-11)", () => {
    const lastFireMs = NOW - (CADENCE_MS * 3 + 1);
    expect(classifyCronLiveness(NOW, lastFireMs, CADENCE_MS, THRESHOLD)).toBe("STALE");
  });

  it("STALE — very old lastFireMs (30 days)", () => {
    const lastFireMs = NOW - 30 * CADENCE_MS;
    expect(classifyCronLiveness(NOW, lastFireMs, CADENCE_MS, THRESHOLD)).toBe("STALE");
  });

  it("AC-9 PARITY invariant — age > cadenceMs × thresholdMultiplier is NEVER ON_TIME/LATE", () => {
    const thresholdMs = CADENCE_MS * THRESHOLD;
    for (const extraMs of [1, 1_000, CADENCE_MS, CADENCE_MS * 10]) {
      const lastFireMs = NOW - (thresholdMs + extraMs);
      const status = classifyCronLiveness(NOW, lastFireMs, CADENCE_MS, THRESHOLD);
      expect(["MISSED", "STALE"]).toContain(status);
    }
  });

  it("only 5 valid status values are ever returned (AC-5)", () => {
    const VALID = new Set(["ON_TIME", "LATE", "MISSED", "STALE", "NEVER_FIRED"]);
    const samples = [null, NOW, NOW - 1, NOW - CADENCE_MS, NOW - CADENCE_MS * 100];
    for (const lastFireMs of samples) {
      const status = classifyCronLiveness(NOW, lastFireMs, CADENCE_MS, THRESHOLD);
      expect(VALID.has(status)).toBe(true);
    }
  });
});
