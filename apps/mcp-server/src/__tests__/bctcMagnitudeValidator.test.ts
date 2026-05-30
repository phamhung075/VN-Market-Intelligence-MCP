/**
 * Unit tests — bctcMagnitudeValidator (DT-2 + DT-3 detectors)
 *
 * Sprint BCTC-TRUST-RED (TR1-DEV-2)
 *
 * Tests cover:
 *   - DT-2 income statement: gross_profit >= net_revenue BLOCK
 *   - DT-2 balance sheet: forced-zero BLOCK
 *   - DT-2 clean data: no violations
 *   - DT-3 prior-period revenue contradiction: ≥3 distinct values >20% BLOCK
 *   - DT-3 current-period revenue contradiction: ≥2 distinct values >20% BLOCK
 *   - DT-3 stable revenue: no violations
 *   - Domain purity: no infrastructure/interface imports
 */

import { describe, it, expect } from "bun:test";
import {
  detectMagnitudeViolations,
  detectCrossStatementRevenue,
  type MagnitudeRow,
} from "../domain/services/financial-reports/bctcMagnitudeValidator";

// ── Helper: build a minimal MagnitudeRow ────────────────────────────────────

function incomeRow(label: string, value_current: number | null, value_prior: number | null = null): MagnitudeRow {
  return {
    statement_section: "income_statement",
    is_summary_row: 1,
    label,
    value_current,
    value_prior,
  };
}

function balanceRow(label: string, value_current: number | null): MagnitudeRow {
  return {
    statement_section: "balance_sheet",
    is_summary_row: 1,
    label,
    value_current,
    value_prior: null,
  };
}

function revenueRow(value_current: number | null, value_prior: number | null = null): MagnitudeRow {
  return {
    statement_section: "income_statement",
    is_summary_row: 1,
    label: "Doanh thu thuần",
    value_current,
    value_prior,
  };
}

// ── DT-2: detectMagnitudeViolations ─────────────────────────────────────────

describe("detectMagnitudeViolations — DT-2 income statement", () => {
  // AC-TR1-2-1
  it("BLOCK when gross_profit == net_revenue (100% margin)", () => {
    const rows: MagnitudeRow[] = [
      incomeRow("Doanh thu thuần", 100000),
      incomeRow("Lợi nhuận gộp", 100000),
    ];
    const violations = detectMagnitudeViolations(rows);
    const blocks = violations.filter((v) => v.severity === "BLOCK");
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.some((v) => v.code === "MAGNITUDE_GROSS_EQ_NET")).toBe(true);
  });

  it("BLOCK when gross_profit > net_revenue", () => {
    const rows: MagnitudeRow[] = [
      incomeRow("Doanh thu thuần", 100000),
      incomeRow("Lợi nhuận gộp", 110000),
    ];
    const violations = detectMagnitudeViolations(rows);
    expect(violations.some((v) => v.code === "MAGNITUDE_GROSS_EQ_NET")).toBe(true);
  });

  // AC-TR1-2-2
  it("no BLOCK for realistic 30% gross margin", () => {
    const rows: MagnitudeRow[] = [
      incomeRow("Doanh thu thuần", 100000),
      incomeRow("Lợi nhuận gộp", 30000),
    ];
    const violations = detectMagnitudeViolations(rows);
    const blocks = violations.filter((v) => v.severity === "BLOCK");
    expect(blocks.length).toBe(0);
  });

  it("handles English labels (net revenue + gross profit)", () => {
    const rows: MagnitudeRow[] = [
      incomeRow("Net Revenue", 100000),
      incomeRow("Gross Profit", 100000),
    ];
    const violations = detectMagnitudeViolations(rows);
    expect(violations.some((v) => v.code === "MAGNITUDE_GROSS_EQ_NET")).toBe(true);
  });

  it("emits WARN when income rows exist but labels ambiguous (no matching rows)", () => {
    const rows: MagnitudeRow[] = [
      incomeRow("SomeOtherLabel", 100000),
    ];
    const violations = detectMagnitudeViolations(rows);
    // Income section present but both labels missing — WARN
    expect(violations.some((v) => v.code === "MAGNITUDE_LABEL_AMBIGUOUS" && v.severity === "WARN")).toBe(true);
  });

  it("returns no violations when no income rows present", () => {
    const violations = detectMagnitudeViolations([]);
    expect(violations.filter((v) => v.severity === "BLOCK")).toEqual([]);
  });
});

describe("detectMagnitudeViolations — DT-2 balance sheet forced-zero", () => {
  // AC-TR1-2-3
  it("BLOCK when total_liabilities=0, equity=0, total_assets>0", () => {
    const rows: MagnitudeRow[] = [
      balanceRow("Tổng tài sản", 500000),
      balanceRow("Tổng nợ phải trả", 0),
      balanceRow("Vốn chủ sở hữu", 0),
    ];
    const violations = detectMagnitudeViolations(rows);
    const blocks = violations.filter((v) => v.severity === "BLOCK");
    expect(blocks.some((v) => v.code === "BALANCE_FORCED_ZERO")).toBe(true);
  });

  // AC-TR1-2-4
  it("no BLOCK for realistic balance sheet (200k liabilities + 300k equity = 500k assets)", () => {
    const rows: MagnitudeRow[] = [
      balanceRow("Tổng tài sản", 500000),
      balanceRow("Tổng nợ phải trả", 200000),
      balanceRow("Vốn chủ sở hữu", 300000),
    ];
    const violations = detectMagnitudeViolations(rows);
    const blocks = violations.filter((v) => v.severity === "BLOCK");
    expect(blocks.filter((v) => v.code === "BALANCE_FORCED_ZERO")).toHaveLength(0);
  });

  it("no BLOCK when total_assets is also 0 (no data case)", () => {
    const rows: MagnitudeRow[] = [
      balanceRow("Tổng tài sản", 0),
      balanceRow("Tổng nợ phải trả", 0),
      balanceRow("Vốn chủ sở hữu", 0),
    ];
    const violations = detectMagnitudeViolations(rows);
    expect(violations.some((v) => v.code === "BALANCE_FORCED_ZERO")).toBe(false);
  });
});

// ── DT-3: detectCrossStatementRevenue ────────────────────────────────────────

describe("detectCrossStatementRevenue — DT-3", () => {
  // AC-TR1-2-6 / AC-TR1-2-5 (REQ)
  it("BLOCK on ≥3 distinct prior values with >20% divergence", () => {
    const rows: MagnitudeRow[] = [
      revenueRow(null, 16058000),
      revenueRow(null, 11481000), // 29% vs 16058000
      revenueRow(null, 20225000),
    ];
    const violations = detectCrossStatementRevenue(rows);
    expect(violations.some((v) => v.code === "CROSS_STMT_REVENUE_CONTRADICTION")).toBe(true);
    expect(violations[0]?.severity).toBe("BLOCK");
  });

  // AC-TR1-2-7 / AC-TR1-2-6 (REQ)
  it("no BLOCK when two prior values differ by <5%", () => {
    const rows: MagnitudeRow[] = [
      revenueRow(null, 16058000),
      revenueRow(null, 16058000), // same value
    ];
    const violations = detectCrossStatementRevenue(rows);
    expect(violations).toEqual([]);
  });

  it("no BLOCK when only 2 prior values with <5% divergence", () => {
    const rows: MagnitudeRow[] = [
      revenueRow(null, 16058000),
      revenueRow(null, 16500000), // ~2.7% divergence
    ];
    const violations = detectCrossStatementRevenue(rows);
    expect(violations).toEqual([]);
  });

  it("BLOCK on ≥2 distinct current values with >20% divergence", () => {
    const rows: MagnitudeRow[] = [
      revenueRow(20225000, null),
      revenueRow(11481000, null), // 43% divergence
    ];
    const violations = detectCrossStatementRevenue(rows);
    expect(violations.some((v) => v.code === "CROSS_STMT_REVENUE_CONTRADICTION")).toBe(true);
  });

  it("no BLOCK when <3 distinct prior values (even if divergent)", () => {
    // Only 2 distinct prior → DT-3 prior check needs ≥3
    const rows: MagnitudeRow[] = [
      revenueRow(null, 16058000),
      revenueRow(null, 1000000), // large divergence but only 2 distinct
    ];
    const violations = detectCrossStatementRevenue(rows);
    // Prior check: 2 distinct (< 3 threshold) → no prior BLOCK
    // Current check: both null → no current BLOCK
    expect(violations.filter((v) => v.severity === "BLOCK")).toEqual([]);
  });

  it("returns empty for rows with no revenue label", () => {
    const rows: MagnitudeRow[] = [
      incomeRow("Lợi nhuận gộp", 100000, 90000),
    ];
    const violations = detectCrossStatementRevenue(rows);
    expect(violations).toEqual([]);
  });

  it("returns empty for empty rows array", () => {
    const violations = detectCrossStatementRevenue([]);
    expect(violations).toEqual([]);
  });
});

// ── Domain purity check (static) ─────────────────────────────────────────────

// Domain purity is verified by grep in CI:
// grep -E "^import.*from.*(infrastructure|interface)" bctcMagnitudeValidator.ts | wc -l == 0
// This test serves as a documentation reminder only.
describe("domain purity", () => {
  it("detectMagnitudeViolations and detectCrossStatementRevenue are pure functions (no I/O)", () => {
    // Calling with empty array should not throw, not access DB, not make HTTP calls
    expect(() => detectMagnitudeViolations([])).not.toThrow();
    expect(() => detectCrossStatementRevenue([])).not.toThrow();
  });
});
