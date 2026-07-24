/**
 * Tests for isStale — FACTORY-FRONTEND-split-orchestration.
 * Mirrors the original inline predicate that lived in dashboard.orchestration.tsx's
 * loader: `age = now - new Date(tsField).getTime(); isStale = age > STALE_THRESHOLD_MS`.
 */
import { describe, it, expect } from "vitest";
import { isStale, STALE_THRESHOLD_MS } from "./staleness";

describe("STALE_THRESHOLD_MS", () => {
  it("is exactly 2 hours in milliseconds", () => {
    expect(STALE_THRESHOLD_MS).toBe(2 * 60 * 60 * 1000);
  });
});

describe("isStale", () => {
  const NOW = new Date("2026-07-24T12:00:00.000Z").getTime();

  it("undefined tsField → false (never touches the threshold branch)", () => {
    expect(isStale(undefined, NOW)).toBe(false);
  });

  it("null tsField → false", () => {
    expect(isStale(null, NOW)).toBe(false);
  });

  it("empty-string tsField → false", () => {
    expect(isStale("", NOW)).toBe(false);
  });

  it("timestamp 1 minute old → not stale", () => {
    const ts = new Date(NOW - 60 * 1000).toISOString();
    expect(isStale(ts, NOW)).toBe(false);
  });

  it("timestamp exactly at the threshold → not stale (strict >)", () => {
    const ts = new Date(NOW - STALE_THRESHOLD_MS).toISOString();
    expect(isStale(ts, NOW)).toBe(false);
  });

  it("timestamp 1ms past the threshold → stale", () => {
    const ts = new Date(NOW - STALE_THRESHOLD_MS - 1).toISOString();
    expect(isStale(ts, NOW)).toBe(true);
  });

  it("timestamp 3 hours old → stale", () => {
    const ts = new Date(NOW - 3 * 60 * 60 * 1000).toISOString();
    expect(isStale(ts, NOW)).toBe(true);
  });

  it("defaults `now` to Date.now() when omitted (does not throw)", () => {
    expect(() => isStale(new Date().toISOString())).not.toThrow();
  });
});
