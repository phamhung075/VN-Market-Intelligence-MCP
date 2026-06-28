/**
 * FE-AHUB-W3-FinancialsZone.test.ts
 *
 * Unit tests for FinancialsZone pure helpers.
 * Component render tests are omitted — useFetcher requires a full Remix
 * context that is not available in jsdom without a Router wrapper; the
 * pure-function layer (findFinancialsRow) is the critical testable unit.
 *
 * Sprint: FRONTEND-ANALYSIS-HUB-CONSOLIDATION
 * Task:   FE-AHUB-W3-FINANCIALS-ZONE
 *
 * Test suites:
 *   1. findFinancialsRow — returns matching row by code (exact match)
 *   2. findFinancialsRow — returns null when code not found
 *   3. findFinancialsRow — returns null for empty rows array
 *   4. findFinancialsRow — case sensitivity (codes are uppercase, no fold)
 *   5. findFinancialsRow — returns first match when multiple same code
 *   6. findFinancialsRow — eps=0 row survives filter (not falsy-filtered)
 *   7. findFinancialsRow — all-null optional fields preserved
 */
import { describe, it, expect } from "vitest";
import { findFinancialsRow } from "../components/analysis/FinancialsZone";
import type { FinancialsRow } from "../routes/dashboard.financials";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<FinancialsRow> & { code: string }): FinancialsRow {
  return {
    period: "2025Q4",
    yearReport: 2025,
    quarter: 4,
    revenueBn: 100,
    revenueYoy: 12.5,
    netProfitBn: 20,
    netProfitYoy: 8.0,
    eps: 1500,
    pe: 12.3,
    pb: 1.8,
    roe: 18.5,
    roa: 3.2,
    debtToEquity: 0.9,
    netProfitMargin: 20.0,
    ...overrides,
  };
}

const FIXTURE_ROWS: FinancialsRow[] = [
  makeRow({ code: "FPT", revenueBn: 5200, pe: 18.5, roe: 22.3 }),
  makeRow({ code: "VCB", revenueBn: 42000, pe: 14.2, roe: 19.8 }),
  makeRow({ code: "HPG", revenueBn: 31000, pe: 7.1, roe: 12.4 }),
  makeRow({ code: "VNM", revenueBn: 15000, pe: 11.8, roe: 28.5 }),
];

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("findFinancialsRow", () => {
  it("returns the row matching code exactly", () => {
    const result = findFinancialsRow(FIXTURE_ROWS, "FPT");
    expect(result).not.toBeNull();
    expect(result!.code).toBe("FPT");
    expect(result!.pe).toBe(18.5);
  });

  it("returns null when code is not in the rows array", () => {
    const result = findFinancialsRow(FIXTURE_ROWS, "MWG");
    expect(result).toBeNull();
  });

  it("returns null for an empty rows array", () => {
    const result = findFinancialsRow([], "FPT");
    expect(result).toBeNull();
  });

  it("is case-sensitive — lowercase does not match uppercase code", () => {
    // Codes in the dataset are always uppercase; no fold expected.
    const result = findFinancialsRow(FIXTURE_ROWS, "fpt");
    expect(result).toBeNull();
  });

  it("returns the first matching row when duplicates exist (dataset invariant)", () => {
    const duplicated: FinancialsRow[] = [
      makeRow({ code: "VCB", pe: 14.2 }),
      makeRow({ code: "VCB", pe: 99.9 }),
    ];
    const result = findFinancialsRow(duplicated, "VCB");
    expect(result).not.toBeNull();
    expect(result!.pe).toBe(14.2); // first match wins
  });

  it("preserves a row where eps=0 (legitimate zero — not filtered)", () => {
    const rows: FinancialsRow[] = [makeRow({ code: "VIX", eps: 0 })];
    const result = findFinancialsRow(rows, "VIX");
    expect(result).not.toBeNull();
    expect(result!.eps).toBe(0);
  });

  it("preserves a row where all optional numeric fields are null", () => {
    const rows: FinancialsRow[] = [
      makeRow({
        code: "NEW",
        revenueBn: null,
        revenueYoy: null,
        netProfitBn: null,
        netProfitYoy: null,
        eps: null,
        pe: null,
        pb: null,
        roe: null,
        roa: null,
        debtToEquity: null,
        netProfitMargin: null,
      }),
    ];
    const result = findFinancialsRow(rows, "NEW");
    expect(result).not.toBeNull();
    expect(result!.pe).toBeNull();
    expect(result!.roe).toBeNull();
  });
});
