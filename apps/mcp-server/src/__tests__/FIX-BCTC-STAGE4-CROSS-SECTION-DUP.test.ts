/**
 * FIX-BCTC-STAGE4-CROSS-SECTION-DUP.test.ts
 *
 * RED→GREEN tests for the Stage-4 cross-section duplicate reclassification fix.
 *
 * Problem (SPIKE_3012 verdict):
 *   Code 421b "LNST chưa phân phối kỳ này" appears in BOTH income_statement and
 *   balance_sheet sections of HPG Q4-2025 parent-company standalone report. The
 *   previous gate treated this as a hard-RED because it detected (label, value_current)
 *   duplicate across ALL rows regardless of statement_section. Cross-section dups are
 *   semantically valid for VN parent-company (báo cáo riêng) reports.
 *
 * Fix contract:
 *   - Same-section duplicates (label + value_current + same statement_section) → RED (unchanged)
 *   - Cross-section duplicates (label + value_current, different statement_section) → YELLOW warning
 *   - Codes 140/141 same-section dup case (different codes, same label+value, same section) → RED
 *   - If rows have no statement_section field (null/undefined), default to treating all as same
 *     section (fallback: conservative same-section classification → RED if dup).
 *
 * Tests:
 *   CS-1: cross-section dup (421b in BS + IS) → yellow (not red)
 *   CS-2: same-section dup → still red (regression guard)
 *   CS-3: codes 140/141 same-section dup → still red (SPIKE_3012 genuine dup)
 *   CS-4: cross-section dup + same-section dup together → red (same-section dup dominates)
 *   CS-5: cross-section dup only, multiple pairs → yellow with correct cross_section_dup_count
 *   CS-6: no statement_section field (null) → fallback: treated as same section → red
 */

import { describe, it, expect } from "bun:test";
import {
  evalStage4TableReconstruct,
  type BctcTableRow,
  type Stage4Thresholds,
} from "../domain/services/bctcEvalDetectors.js";

const S4_THRESHOLDS: Stage4Thresholds = {
  label_coverage_min: 0.90,
  code_coverage_min: 0.80,
  exact_dup_max: 0,
  value_blank_label_max: 0,
};

// ─── CS-1: cross-section dup (HPG 421b pattern) → YELLOW ──────────────────────

describe("FIX-BCTC-STAGE4-CROSS-SECTION-DUP", () => {
  it("CS-1: 421b cross-section dup (IS + BS) → yellow, not red", () => {
    const rows: BctcTableRow[] = [
      // Balance sheet rows
      {
        code: "300",
        label: "Tổng nợ phải trả",
        value_current: 4239852000000,
        value_prior: null,
        row_order: 1,
        statement_section: "balance_sheet",
      },
      {
        code: "421b",
        label: "LNST chưa phân phối kỳ này",
        value_current: 5597856806673,
        value_prior: null,
        row_order: 2,
        statement_section: "balance_sheet",
      },
      // Income statement rows (421b legitimately appears here too)
      {
        code: "300",
        label: "Tổng chi phí",
        value_current: 800000000,
        value_prior: null,
        row_order: 3,
        statement_section: "income_statement",
      },
      {
        code: "421b",
        label: "LNST chưa phân phối kỳ này",
        value_current: 5597856806673,
        value_prior: null,
        row_order: 4,
        statement_section: "income_statement",
      },
    ];
    const result = evalStage4TableReconstruct(rows, S4_THRESHOLDS);
    // Cross-section dup must NOT be red
    expect(result.status).toBe("yellow");
    // cross_section_dup_count must be reported in metrics
    expect(result.metrics_json.cross_section_dup_count).toBe(1);
    // exact_dup_count (same-section) must be 0
    expect(result.metrics_json.exact_dup_count).toBe(0);
    // No gate failure for exact_dup_count
    const gateIds = result.gate_failures_json.map((g) => g.gate_id);
    expect(gateIds).not.toContain("exact_dup_count");
  });

  // ─── CS-2: same-section dup → RED (regression guard) ──────────────────────

  it("CS-2: same-section dup → still red (regression: no regression on genuine dups)", () => {
    const rows: BctcTableRow[] = [
      {
        code: "100",
        label: "Tổng tài sản",
        value_current: 1000,
        value_prior: null,
        row_order: 1,
        statement_section: "balance_sheet",
      },
      {
        code: "100",
        label: "Tổng tài sản",
        value_current: 1000,
        value_prior: null,
        row_order: 2,
        statement_section: "balance_sheet", // same section → RED
      },
    ];
    const result = evalStage4TableReconstruct(rows, S4_THRESHOLDS);
    expect(result.status).toBe("red");
    expect(result.metrics_json.exact_dup_count).toBeGreaterThan(0);
    const gateIds = result.gate_failures_json.map((g) => g.gate_id);
    expect(gateIds).toContain("exact_dup_count");
  });

  // ─── CS-3: codes 140/141 same-section dup → RED (SPIKE_3012 genuine dup) ───

  it("CS-3: codes 140 + 141 same label+value same section (Hàng tồn kho) → red", () => {
    const rows: BctcTableRow[] = [
      {
        code: "140",
        label: "Hàng tồn kho",
        value_current: 1986588655,
        value_prior: null,
        row_order: 1,
        statement_section: "balance_sheet",
      },
      {
        code: "141",
        label: "Hàng tồn kho",
        value_current: 1986588655,
        value_prior: null,
        row_order: 2,
        statement_section: "balance_sheet", // same section → RED (genuine dup)
      },
      {
        code: "200",
        label: "Tổng nợ",
        value_current: 500000,
        value_prior: null,
        row_order: 3,
        statement_section: "balance_sheet",
      },
    ];
    const result = evalStage4TableReconstruct(rows, S4_THRESHOLDS);
    expect(result.status).toBe("red");
    expect(result.metrics_json.exact_dup_count).toBeGreaterThan(0);
    const gateIds = result.gate_failures_json.map((g) => g.gate_id);
    expect(gateIds).toContain("exact_dup_count");
  });

  // ─── CS-4: cross-section dup + same-section dup → RED (same-section dominates) ─

  it("CS-4: cross-section dup AND same-section dup → red (same-section dup dominates)", () => {
    const rows: BctcTableRow[] = [
      // Cross-section dup (valid → would be yellow alone)
      {
        code: "421b",
        label: "LNST chưa phân phối kỳ này",
        value_current: 5597856806673,
        value_prior: null,
        row_order: 1,
        statement_section: "balance_sheet",
      },
      {
        code: "421b",
        label: "LNST chưa phân phối kỳ này",
        value_current: 5597856806673,
        value_prior: null,
        row_order: 2,
        statement_section: "income_statement",
      },
      // Same-section genuine dup (→ RED)
      {
        code: "100",
        label: "Tổng tài sản",
        value_current: 98670778000000,
        value_prior: null,
        row_order: 3,
        statement_section: "balance_sheet",
      },
      {
        code: "100",
        label: "Tổng tài sản",
        value_current: 98670778000000,
        value_prior: null,
        row_order: 4,
        statement_section: "balance_sheet",
      },
    ];
    const result = evalStage4TableReconstruct(rows, S4_THRESHOLDS);
    expect(result.status).toBe("red");
    expect(result.metrics_json.exact_dup_count).toBeGreaterThan(0);
    expect(result.metrics_json.cross_section_dup_count).toBe(1);
    const gateIds = result.gate_failures_json.map((g) => g.gate_id);
    expect(gateIds).toContain("exact_dup_count");
  });

  // ─── CS-5: multiple cross-section dups only → yellow with correct count ──────

  it("CS-5: multiple cross-section dups → yellow, cross_section_dup_count = N", () => {
    const rows: BctcTableRow[] = [
      {
        code: "421b",
        label: "LNST chưa phân phối kỳ này",
        value_current: 5597856806673,
        value_prior: null,
        row_order: 1,
        statement_section: "balance_sheet",
      },
      {
        code: "421b",
        label: "LNST chưa phân phối kỳ này",
        value_current: 5597856806673,
        value_prior: null,
        row_order: 2,
        statement_section: "income_statement",
      },
      // Second cross-section dup pair
      {
        code: "500",
        label: "Lợi nhuận trước thuế",
        value_current: 7000000000000,
        value_prior: null,
        row_order: 3,
        statement_section: "balance_sheet",
      },
      {
        code: "500",
        label: "Lợi nhuận trước thuế",
        value_current: 7000000000000,
        value_prior: null,
        row_order: 4,
        statement_section: "income_statement",
      },
      // Normal non-dup row
      {
        code: "100",
        label: "Tổng tài sản",
        value_current: 98670778000000,
        value_prior: null,
        row_order: 5,
        statement_section: "balance_sheet",
      },
    ];
    const result = evalStage4TableReconstruct(rows, S4_THRESHOLDS);
    expect(result.status).toBe("yellow");
    expect(result.metrics_json.cross_section_dup_count).toBe(2);
    expect(result.metrics_json.exact_dup_count).toBe(0);
  });

  // ─── CS-6: no statement_section (null) → conservative: same section → red ───

  it("CS-6: rows with null statement_section → treated as same section → red on dup", () => {
    const rows: BctcTableRow[] = [
      {
        code: "421b",
        label: "LNST chưa phân phối kỳ này",
        value_current: 5597856806673,
        value_prior: null,
        row_order: 1,
        statement_section: null, // no section info → conservative
      },
      {
        code: "421b",
        label: "LNST chưa phân phối kỳ này",
        value_current: 5597856806673,
        value_prior: null,
        row_order: 2,
        statement_section: null, // no section info → conservative
      },
    ];
    const result = evalStage4TableReconstruct(rows, S4_THRESHOLDS);
    // Without section info we can't confirm cross-section validity → treat as same-section → RED
    expect(result.status).toBe("red");
    expect(result.metrics_json.exact_dup_count).toBeGreaterThan(0);
  });
});
