/**
 * fix-fetch-verystale-label.test.ts
 *
 * Unit tests for FIX-FETCH-VERYSTALE-LABEL — sourceStatusLabel() helper.
 * Verifies that the status text shown in SourceFreshnessTable is consistent
 * with sourceStatusColor() thresholds and correctly distinguishes "stale"
 * (2–12h) from "very stale" (>12h).
 *
 * Sprint: FIX-FETCH-VERYSTALE-LABEL (carry-forward F-3 / FETCH-OPS-PAGE-TRUTH)
 */

import { describe, it, expect } from "vitest";
import { sourceStatusLabel } from "~/domain/market";
import type { FetchSourceStatus } from "~/domain/market";

function src(
  overrides: Partial<FetchSourceStatus> & { ageMs: number; status: FetchSourceStatus["status"] },
): FetchSourceStatus {
  return {
    id: "test-source",
    lastArticleAt: "",
    count24h: 0,
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// Suite 1 — no-data status → "no data"
// --------------------------------------------------------------------------

describe("sourceStatusLabel — no-data", () => {
  it("returns 'no data' when status is no-data", () => {
    expect(sourceStatusLabel(src({ status: "no-data", ageMs: 0 }))).toBe("no data");
  });

  it("returns 'no data' regardless of ageMs when status is no-data", () => {
    expect(sourceStatusLabel(src({ status: "no-data", ageMs: 999 * 3600000 }))).toBe("no data");
  });
});

// --------------------------------------------------------------------------
// Suite 2 — fresh status → "fresh"
// --------------------------------------------------------------------------

describe("sourceStatusLabel — fresh", () => {
  it("returns 'fresh' when status is fresh", () => {
    expect(sourceStatusLabel(src({ status: "fresh", ageMs: 60000 }))).toBe("fresh");
  });

  it("returns 'fresh' even when ageMs is above 2h if status field is fresh", () => {
    // sourceStatusColor: status=fresh → "green" regardless of ageMs
    expect(sourceStatusLabel(src({ status: "fresh", ageMs: 3 * 3600000 }))).toBe("fresh");
  });
});

// --------------------------------------------------------------------------
// Suite 3 — stale, ageMs 2–12h → "stale"
// Note: sourceStatusColor uses <= TWO_HOURS for green, <= TWELVE_HOURS for amber.
// So exactly 2h is still green, and amber starts at 2h+1ms.
// --------------------------------------------------------------------------

describe("sourceStatusLabel — stale (amber range >2h..12h)", () => {
  it("returns 'stale' for ageMs just above 2h (amber starts at 2h+1ms)", () => {
    expect(sourceStatusLabel(src({ status: "stale", ageMs: 2 * 3600000 + 1 }))).toBe("stale");
  });

  it("returns 'stale' for ageMs in mid amber range (5h)", () => {
    expect(sourceStatusLabel(src({ status: "stale", ageMs: 5 * 3600000 }))).toBe("stale");
  });

  it("returns 'stale' for ageMs exactly at 12h boundary", () => {
    expect(sourceStatusLabel(src({ status: "stale", ageMs: 12 * 3600000 }))).toBe("stale");
  });
});

// --------------------------------------------------------------------------
// Suite 4 — stale, ageMs > 12h → "very stale"
// --------------------------------------------------------------------------

describe("sourceStatusLabel — very stale (red range >12h)", () => {
  it("returns 'very stale' for ageMs just above 12h", () => {
    expect(sourceStatusLabel(src({ status: "stale", ageMs: 12 * 3600000 + 1 }))).toBe("very stale");
  });

  it("returns 'very stale' for ageMs at 13h", () => {
    expect(sourceStatusLabel(src({ status: "stale", ageMs: 13 * 3600000 }))).toBe("very stale");
  });

  it("returns 'very stale' for ageMs at 24h (full day stale)", () => {
    expect(sourceStatusLabel(src({ status: "stale", ageMs: 24 * 3600000 }))).toBe("very stale");
  });

  it("returns 'very stale' for ageMs at 72h (multi-day stale)", () => {
    expect(sourceStatusLabel(src({ status: "stale", ageMs: 72 * 3600000 }))).toBe("very stale");
  });
});

// --------------------------------------------------------------------------
// Suite 5 — label distinct from src.status (regression guard)
// --------------------------------------------------------------------------

describe("sourceStatusLabel — distinct from src.status for very-stale case", () => {
  it("is NOT the same as src.status when source is very stale (stale vs very stale)", () => {
    const source = src({ status: "stale", ageMs: 20 * 3600000 });
    // src.status is "stale" but label should be "very stale"
    expect(sourceStatusLabel(source)).not.toBe(source.status);
    expect(sourceStatusLabel(source)).toBe("very stale");
  });

  it("matches src.status for fresh/stale amber (no change for those cases)", () => {
    const freshSrc = src({ status: "fresh", ageMs: 100 });
    expect(sourceStatusLabel(freshSrc)).toBe("fresh");

    const staleAmber = src({ status: "stale", ageMs: 6 * 3600000 });
    expect(sourceStatusLabel(staleAmber)).toBe("stale");
  });
});
