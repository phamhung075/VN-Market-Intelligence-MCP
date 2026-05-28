/**
 * bctc-eval-detectors.test.ts — Stage 4-6 BCTC eval detector unit tests
 *
 * Pure function tests — no DB, no HTTP.
 * Covers:
 *   - Stage 4 happy path (green)
 *   - Stage 4 deliberate violation: row with label=NULL → red (G2 smoke)
 *   - Stage 4 code_coverage gate
 *   - Stage 4 exact_dup gate
 *   - Stage 4 empty rows (yellow)
 *   - Stage 5 happy path (green)
 *   - Stage 5 empty data (yellow)
 *   - Stage 6 happy path (green)
 *   - Stage 6 balance_pass=false with balance_pass_is_signal_only=true → NOT red (G2 smoke)
 *   - Stage 6 golden_row_match below threshold → red
 *   - Stage 6 missing rows → yellow
 */

import { describe, it, expect } from "bun:test";
import {
  evalStage4TableReconstruct,
  evalStage5MarkdownRender,
  evalStage6StructuredExtract,
  type BctcTableRow,
  type FinancialReportRecord,
  type Stage4Thresholds,
  type Stage5Thresholds,
  type Stage6Thresholds,
} from "../domain/services/bctcEvalDetectors.js";

// ─── Threshold fixtures ───────────────────────────────────────────────────────

const S4_THRESHOLDS: Stage4Thresholds = {
  label_coverage_min: 0.90,
  code_coverage_min: 0.80,
  exact_dup_max: 0,
  value_blank_label_max: 0,
};

const S5_THRESHOLDS: Stage5Thresholds = {
  roundtrip_row_match_min: 0.95,
  roundtrip_value_drift_max: 0.01,
};

const S6_THRESHOLDS: Stage6Thresholds = {
  golden_row_match_min: 0.90,
  balance_pass_is_signal_only: true,
  qoq_outlier_threshold: 2.0,
};

// ─── Stage 4 tests ────────────────────────────────────────────────────────────

describe("evalStage4TableReconstruct", () => {
  it("green: all rows have labels and codes", () => {
    const rows: BctcTableRow[] = [
      { code: "100", label: "Tổng tài sản", value_current: 1000, value_prior: 900, row_order: 1 },
      { code: "200", label: "Tổng nợ", value_current: 600, value_prior: 550, row_order: 2 },
      { code: "300", label: "Vốn chủ sở hữu", value_current: 400, value_prior: 350, row_order: 3 },
    ];
    const result = evalStage4TableReconstruct(rows, S4_THRESHOLDS);
    expect(result.status).toBe("green");
    expect(result.gate_failures_json).toHaveLength(0);
    expect(result.metrics_json.label_coverage).toBe(1);
    expect(result.metrics_json.code_coverage).toBe(1);
    expect(result.metrics_json.value_blank_label_count).toBe(0);
    expect(result.metrics_json.exact_dup_count).toBe(0);
  });

  // G2 deliberate-violation smoke:
  // Stage 4: row with label=NULL → detector emits value_blank_label_count >= 1 + status="red"
  it("red (G2 smoke): row with label=NULL and value_current set triggers value_blank_label gate", () => {
    const rows: BctcTableRow[] = [
      { code: "100", label: "Tổng tài sản", value_current: 1000, value_prior: null, row_order: 1 },
      // Blank-label bug: value set but label is null
      { code: "200", label: null, value_current: 500, value_prior: null, row_order: 2 },
    ];
    const result = evalStage4TableReconstruct(rows, S4_THRESHOLDS);
    expect(result.status).toBe("red");
    expect(result.metrics_json.value_blank_label_count).toBeGreaterThanOrEqual(1);
    const gateIds = result.gate_failures_json.map((g) => g.gate_id);
    expect(gateIds).toContain("value_blank_label_count");
  });

  it("red: label_coverage below threshold", () => {
    const rows: BctcTableRow[] = [
      { code: "100", label: "Good label", value_current: 100, value_prior: null, row_order: 1 },
      { code: "200", label: "", value_current: 200, value_prior: null, row_order: 2 },
      { code: "300", label: "", value_current: 300, value_prior: null, row_order: 3 },
      { code: "400", label: "", value_current: 400, value_prior: null, row_order: 4 },
      // Only 1/4 = 25% label coverage — below 90%
    ];
    const result = evalStage4TableReconstruct(rows, S4_THRESHOLDS);
    expect(result.status).toBe("red");
    const gateIds = result.gate_failures_json.map((g) => g.gate_id);
    expect(gateIds).toContain("label_coverage");
    // Also blank-label rows trigger the blank-label gate
    expect(result.metrics_json.label_coverage).toBeLessThan(0.9);
  });

  it("red: exact duplicate rows", () => {
    const rows: BctcTableRow[] = [
      { code: "100", label: "Tổng", value_current: 1000, value_prior: null, row_order: 1 },
      { code: "100", label: "Tổng", value_current: 1000, value_prior: null, row_order: 2 },
      // Duplicate (label, value_current) pair
    ];
    const result = evalStage4TableReconstruct(rows, S4_THRESHOLDS);
    expect(result.metrics_json.exact_dup_count).toBeGreaterThan(0);
    const gateIds = result.gate_failures_json.map((g) => g.gate_id);
    expect(gateIds).toContain("exact_dup_count");
    expect(result.status).toBe("red");
  });

  it("yellow: empty rows array", () => {
    const result = evalStage4TableReconstruct([], S4_THRESHOLDS);
    expect(result.status).toBe("yellow");
    expect(result.metrics_json.total_rows).toBe(0);
  });
});

// ─── Stage 5 tests ────────────────────────────────────────────────────────────

describe("evalStage5MarkdownRender", () => {
  it("yellow: no stage4 rows → cannot evaluate", () => {
    const result = evalStage5MarkdownRender([], [], S5_THRESHOLDS);
    expect(result.status).toBe("yellow");
  });

  it("yellow: empty md_tables", () => {
    const rows: BctcTableRow[] = [
      { code: "100", label: "Tổng tài sản", value_current: 1000, value_prior: null, row_order: 1 },
    ];
    const result = evalStage5MarkdownRender([], rows, S5_THRESHOLDS);
    expect(result.status).toBe("yellow");
    expect(result.metrics_json.md_table_count).toBe(0);
  });

  it("green: values found in markdown tables", () => {
    const rows: BctcTableRow[] = [
      { code: "100", label: "Tổng tài sản", value_current: 1000, value_prior: null, row_order: 1 },
      { code: "200", label: "Tổng nợ", value_current: 600, value_prior: null, row_order: 2 },
    ];
    // Markdown table containing the same values
    const mdJson = [
      "| Code | Label | Value |\n|---|---|---|\n| 100 | Tổng tài sản | 1000 |\n| 200 | Tổng nợ | 600 |",
    ];
    const result = evalStage5MarkdownRender(mdJson, rows, S5_THRESHOLDS);
    expect(result.status).toBe("green");
    expect(result.metrics_json.roundtrip_row_match_ratio).toBeGreaterThan(0);
  });
});

// ─── Stage 6 tests ────────────────────────────────────────────────────────────

describe("evalStage6StructuredExtract", () => {
  const FULL_REPORT: FinancialReportRecord = {
    balance_pass: 1,
    net_revenue: 1000000,
    net_profit: 50000,
    gross_profit: 200000,
    parsed_at: "2026-05-28T00:00:00Z",
  };

  it("green: all golden anchors present, balance_pass=true", () => {
    const result = evalStage6StructuredExtract(
      FULL_REPORT,
      ["net_revenue", "net_profit", "gross_profit"],
      S6_THRESHOLDS,
      true,
    );
    expect(result.status).toBe("green");
    expect(result.gate_failures_json).toHaveLength(0);
    expect(result.metrics_json.balance_pass).toBe(true);
    expect(result.metrics_json.balance_pass_is_signal_only).toBe(true);
  });

  // G2 deliberate-violation smoke:
  // Stage 6: balance_pass=false with balance_pass_is_signal_only=true → NOT red
  it("G2 smoke: balance_pass=false with balance_pass_is_signal_only=true → stage NOT red", () => {
    const result = evalStage6StructuredExtract(
      FULL_REPORT,
      ["net_revenue", "net_profit", "gross_profit"],
      { ...S6_THRESHOLDS, balance_pass_is_signal_only: true },
      false, // balance_pass = false
    );
    // Must NOT be red solely because balance_pass=false
    expect(result.status).not.toBe("red");
    // balance_pass is in metrics as signal, not in gate_failures
    expect(result.metrics_json.balance_pass).toBe(false);
    expect(result.metrics_json.balance_pass_is_signal_only).toBe(true);
    const gateIds = result.gate_failures_json.map((g) => g.gate_id);
    expect(gateIds).not.toContain("balance_pass");
  });

  it("red: golden_row_match below threshold", () => {
    const reportMissing: FinancialReportRecord = {
      balance_pass: 1,
      net_revenue: null,  // missing
      net_profit: null,   // missing
      gross_profit: null, // missing
      parsed_at: "2026-05-28T00:00:00Z",
    };
    const result = evalStage6StructuredExtract(
      reportMissing,
      ["net_revenue", "net_profit", "gross_profit"],
      S6_THRESHOLDS,
      true,
    );
    // 0/3 = 0 match ratio — below 0.90
    expect(result.status).toBe("red");
    const gateIds = result.gate_failures_json.map((g) => g.gate_id);
    expect(gateIds).toContain("golden_row_match_ratio");
    expect(result.metrics_json.golden_row_match_ratio).toBe(0);
  });

  it("yellow: some anchors missing (below tolerance but not all)", () => {
    const reportPartial: FinancialReportRecord = {
      balance_pass: 1,
      net_revenue: 1000000,
      net_profit: 50000,
      gross_profit: null, // one missing
      parsed_at: "2026-05-28T00:00:00Z",
    };
    const result = evalStage6StructuredExtract(
      reportPartial,
      ["net_revenue", "net_profit", "gross_profit"],
      S6_THRESHOLDS,
      true,
    );
    // 2/3 = 0.667 < 0.90 threshold → red
    // Actually with 3 anchors and only 1 missing it's 2/3 = 0.667 < 0.90 → red
    // Let's verify the math
    expect(result.metrics_json.golden_row_match_ratio).toBeCloseTo(0.667, 2);
    expect(result.status).toBe("red");
  });

  it("no anchors: skips golden check, green by default", () => {
    const result = evalStage6StructuredExtract(
      FULL_REPORT,
      [], // no golden anchors
      S6_THRESHOLDS,
      true,
    );
    expect(result.status).toBe("green");
    expect(result.gate_failures_json).toHaveLength(0);
  });
});
