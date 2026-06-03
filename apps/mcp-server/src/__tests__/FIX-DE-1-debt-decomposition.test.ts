/**
 * FIX-DE-1 — Unit tests: short_term_debt / long_term_debt fields in ScalarAggregate
 *
 * Sprint: BCTC-ANALYTICS-LAYER (follow-up)
 * Brief: docs/architecture-briefs/2026-06-03-bctc-debt-decomposition-gap.md
 * Task: FIX-DE-1 — Add short_term_debt/long_term_debt to ScalarAggregate + aggregateScalars
 *
 * Anti-false-green:
 *   RED: before FIX-DE-1, ScalarAggregate had no short_term_debt/long_term_debt fields;
 *   aggregateScalars never read VAS codes 321/319/339/334, so both fields were always absent
 *   and finalizeBctcRefineTool never wrote them. DB shows 0 for all DONE reports.
 *
 *   GREEN: after FIX-DE-1, aggregateScalars maps codes 321→short_term_debt and 339→long_term_debt
 *   (with 319/334 fallbacks) and returns correct values for FPT-pattern and VNM-pattern corpora.
 *
 * Scope: aggregator-only (domain layer, pure function, in-memory sqlite rows — no I/O, no HTTP).
 * This task ALONE does NOT change live served D/E — finalizeBctcRefineTool wiring is FIX-DE-2.
 *
 * Verification strategy:
 *   1. FPT-pattern (code 321 + 339): correct summed values returned.
 *   2. VNM-pattern (code 319 with /vay/i label — must map; without /vay/ label — must NOT map).
 *   3. Code 319 with non-/vay/ label ("Phải trả ngắn hạn khác") — must NOT map to short_term_debt.
 *   4. Bank corpus — both fields land in notApplicable (not spuriously populated from balance rows).
 *   5. Empty corpus — both fields null.
 *   6. Regression: all existing BEQ-3 fields unaffected.
 */

import { describe, it, expect } from "bun:test";
import {
  aggregateScalars,
} from "../domain/services/financial-reports/bctcScalarAggregator.js";
import type { AggregatorRow } from "../domain/services/financial-reports/bctcScalarAggregator.js";

// ── Shared constants ──────────────────────────────────────────────────────────

const MILLION = 1_000_000; // raw VND → million VND divisor (aggregator auto-detects)

// Shared balance rows (used across fixtures to satisfy balance identity)
const BALANCE_ROWS: AggregatorRow[] = [
  { code: "280", label: "TỔNG CỘNG TÀI SẢN",   value_current: 100_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
  { code: "300", label: "C. NỢ PHẢI TRẢ",        value_current:  60_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
  { code: "400", label: "D. VỐN CHỦ SỞ HỮU",    value_current:  40_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
];

// ── Fixture: FPT-pattern rows (VAS code 321 + 339, section = "general") ──────

/**
 * Mirrors FPT 2026-Q1 live bctc_table_rows — confirmed by DB evidence in architect brief.
 * Values are raw VND (auto-scaled by aggregator: max > 1e11 → divide by 1e6).
 */
function fptDebtRows(): AggregatorRow[] {
  return [
    ...BALANCE_ROWS,
    // Short-term borrowings: VAS code 321 (current standard)
    { code: "321", label: "10. Vay và nợ thuê tài chính ngắn hạn", value_current: 14_491_358_043_012, statement_section: "general", is_summary_row: 0, unit: "vnd" },
    // Long-term borrowings: VAS code 339 (current standard)
    { code: "339", label: "3. Vay và nợ thuê tài chính dài hạn",   value_current:  1_605_069_048_520, statement_section: "general", is_summary_row: 0, unit: "vnd" },
  ];
}

// ── Fixture: VNM-pattern rows (VAS code 319 with /vay/ label, section = "balance_sheet") ──

/**
 * Mirrors VNM 2025-Q4 live bctc_table_rows — architect brief confirms VNM uses code 319.
 * No code 321 in VNM corpus. Section is "balance_sheet" (VNM layout).
 */
function vnmDebtRows(): AggregatorRow[] {
  return [
    // Balance rows for VNM (must use balance_sheet section for some, general for totals)
    { code: "280", label: "TỔNG CỘNG TÀI SẢN",   value_current: 50_000_000_000_000, statement_section: "general",        is_summary_row: 1, unit: "vnd" },
    { code: "300", label: "Nợ phải trả",           value_current: 15_000_000_000_000, statement_section: "general",        is_summary_row: 1, unit: "vnd" },
    { code: "400", label: "Vốn chủ sở hữu",        value_current: 35_000_000_000_000, statement_section: "general",        is_summary_row: 1, unit: "vnd" },
    // Short-term borrowings: code 319 with "Vay ngắn hạn" label → MUST map
    { code: "319", label: "Vay ngắn hạn",           value_current:    102_362_732_591, statement_section: "balance_sheet",  is_summary_row: 0, unit: "vnd" },
  ];
}

// ── Fixture: code 319 with non-/vay/ label (must NOT map to short_term_debt) ──

/**
 * Issuer where code 319 = "Phải trả ngắn hạn khác" (other short-term payables).
 * The /vay/i labelHint must exclude this row.
 */
function code319NonBorrowingRows(): AggregatorRow[] {
  return [
    ...BALANCE_ROWS,
    // Code 319 is "other payables" on this issuer — label has NO "vay" word
    { code: "319", label: "Phải trả ngắn hạn khác", value_current: 5_000_000_000_000, statement_section: "general", is_summary_row: 0, unit: "vnd" },
  ];
}

// ── Fixture: bank corpus (Mẫu B02-TCTD, hybrid discriminator) ────────────────

/**
 * Minimal bank corpus using Roman-numeral codes (anchor signal for isBankFormFromRows).
 * Banks use B02-TCTD form — VAS codes 321/339 are NOT present.
 * short_term_debt and long_term_debt must land in notApplicable, not be spuriously
 * populated from any 3-digit-balance rows.
 */
function bankRows(): AggregatorRow[] {
  return [
    // Roman-code income rows (anchored Roman presence — bank discriminator trigger)
    { code: "I",    label: "Thu nhập lãi thuần",                    value_current: 20_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
    { code: "VIII", label: "Lợi nhuận trước thuế TNDN",             value_current:  5_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
    { code: "IX",   label: "Lợi nhuận sau thuế TNDN",               value_current:  4_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
    // Bank balance sheet rows (label-based, no 3-digit corporate codes)
    { code: null,   label: "TỔNG TÀI SẢN",                         value_current: 800_000_000_000_000, statement_section: "balance_sheet",   is_summary_row: 1, unit: "vnd" },
    { code: null,   label: "TỔNG NỢ PHẢI TRẢ",                     value_current: 720_000_000_000_000, statement_section: "balance_sheet",   is_summary_row: 1, unit: "vnd" },
    { code: null,   label: "VỐN CHỦ SỞ HỮU",                       value_current:  80_000_000_000_000, statement_section: "balance_sheet",   is_summary_row: 1, unit: "vnd" },
  ];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FIX-DE-1 — debt decomposition in aggregateScalars", () => {

  // ── Test 1: FPT-pattern (code 321 + 339) ─────────────────────────────────

  it("RED→GREEN: FPT-pattern (code 321 + 339) → short_term_debt and long_term_debt populated", () => {
    /**
     * RED scenario (before FIX-DE-1):
     *   ScalarAggregate had no short_term_debt/long_term_debt fields.
     *   aggregateScalars never read codes 321/339 → both always absent/undefined.
     *   Live DB: FPT 2026-Q1 short_term_debt=0, long_term_debt=0.
     *
     * GREEN (after FIX-DE-1):
     *   Code 321 → short_term_debt = 14,491,358,043,012 / 1e6 = 14,491,358.04 million VND
     *   Code 339 → long_term_debt  =  1,605,069,048,520 / 1e6 =  1,605,069.05 million VND
     */
    const rows = fptDebtRows();
    const result = aggregateScalars(rows);

    expect(result.balanceViolation).toBeNull();

    const agg = result.scalars;

    // short_term_debt must be populated from code 321
    expect(agg.short_term_debt).not.toBeNull();
    // Expected: 14,491,358,043,012 / 1e6 ≈ 14,491,358 million VND
    // Use toBeCloseTo with precision -2 (within ±100 million VND)
    expect(agg.short_term_debt!).toBeCloseTo(14_491_358, -2);

    // long_term_debt must be populated from code 339
    expect(agg.long_term_debt).not.toBeNull();
    // Expected: 1,605,069,048,520 / 1e6 ≈ 1,605,069 million VND
    expect(agg.long_term_debt!).toBeCloseTo(1_605_069, -2);
  });

  // ── Test 2: VNM-pattern (code 319 with /vay/ label) ──────────────────────

  it("RED→GREEN: VNM-pattern (code 319 label='Vay ngắn hạn') → short_term_debt populated", () => {
    /**
     * RED scenario (before FIX-DE-1):
     *   No 319 fallback existed. VNM short_term_debt stayed 0 in DB.
     *
     * GREEN (after FIX-DE-1):
     *   Code 319 with label matching /vay/i → short_term_debt = 102,362,732,591 / 1e6 ≈ 102,363 M
     *   No code 339/334 in VNM corpus → long_term_debt = null (honest — VNM has near-zero LTD)
     */
    const rows = vnmDebtRows();
    const result = aggregateScalars(rows);

    expect(result.balanceViolation).toBeNull();

    const agg = result.scalars;

    // short_term_debt must be populated from code 319 (label hint matched)
    expect(agg.short_term_debt).not.toBeNull();
    // Expected: 102,362,732,591 / 1e6 ≈ 102,363 million VND
    expect(agg.short_term_debt!).toBeCloseTo(102_363, -1);

    // long_term_debt: no code 339/334 in VNM corpus → null (honest)
    expect(agg.long_term_debt).toBeNull();
  });

  // ── Test 3: code 319 with non-/vay/ label must NOT map ───────────────────

  it("code 319 with label='Phải trả ngắn hạn khác' (no 'vay') → NOT mapped to short_term_debt", () => {
    /**
     * Critical safety test: code 319 is used by some issuers as "other payables",
     * not short-term borrowings. The /vay/i labelHint MUST exclude this.
     *
     * Before FIX-DE-1: this was not an issue (319 was never looked up at all).
     * After FIX-DE-1: the labelHint prevents the wrong pick.
     *
     * If the label hint fails (strict=false), code 319 with "Phải trả" label would
     * be returned → short_term_debt = 5,000,000 million VND (wrong — it's payables).
     */
    const rows = code319NonBorrowingRows();
    const result = aggregateScalars(rows);

    expect(result.balanceViolation).toBeNull();

    const agg = result.scalars;

    // short_term_debt must be null — code 319 label has no "vay" → not a borrowings row
    expect(agg.short_term_debt).toBeNull();
    // long_term_debt must also be null — no code 339/334 rows in fixture
    expect(agg.long_term_debt).toBeNull();
  });

  // ── Test 4: bank corpus → both fields in notApplicable ───────────────────

  it("bank corpus → short_term_debt and long_term_debt in notApplicable (not spuriously populated)", () => {
    /**
     * Banks use B02-TCTD form, not VAS 321/339.
     * FIX-DE-1 adds both fields to notApplicable for the bank path.
     *
     * Before FIX-DE-1: notApplicable was ["gross_profit","current_assets","gross_margin_pct"].
     * After FIX-DE-1: also includes "short_term_debt" and "long_term_debt".
     *
     * This ensures finalizeBctcRefineTool clears stale OCR-parse values on re-finalize
     * for bank reports (banks have no VAS 321/339 rows → clearing is correct).
     */
    const rows = bankRows();
    const result = aggregateScalars(rows);

    // Both fields must be in notApplicable
    expect(result.notApplicable).toContain("short_term_debt");
    expect(result.notApplicable).toContain("long_term_debt");

    // The scalars themselves must also be null (no VAS 321/339 rows in bank corpus)
    expect(result.scalars.short_term_debt).toBeNull();
    expect(result.scalars.long_term_debt).toBeNull();

    // Existing bank notApplicable entries must still be present (regression guard)
    expect(result.notApplicable).toContain("gross_profit");
    expect(result.notApplicable).toContain("current_assets");
    expect(result.notApplicable).toContain("gross_margin_pct");
  });

  // ── Test 5: corporate path → notApplicable does NOT include debt fields ──

  it("corporate corpus → short_term_debt and long_term_debt NOT in notApplicable", () => {
    /**
     * Corporate reports have VAS 321/339 — they must NOT be in notApplicable.
     * Only the bank path adds them.
     */
    const rows = fptDebtRows();
    const result = aggregateScalars(rows);

    expect(result.notApplicable).not.toContain("short_term_debt");
    expect(result.notApplicable).not.toContain("long_term_debt");
    expect(result.notApplicable).toHaveLength(0);
  });

  // ── Test 6: empty corpus → both null ──────────────────────────────────────

  it("empty corpus → short_term_debt and long_term_debt are null (not forced-zero)", () => {
    const result = aggregateScalars([]);

    expect(result.scalars.short_term_debt).toBeNull();
    expect(result.scalars.long_term_debt).toBeNull();
    expect(result.balanceViolation).toBeNull();
    expect(result.notApplicable).toHaveLength(0);
  });

  // ── Test 7: regression — BEQ-3 fields unaffected ─────────────────────────

  it("regression: all BEQ-3 fields (22 total) still correct after FIX-DE-1 changes", () => {
    /**
     * Full 22-field audit: BEQ-3's original 20 fields + FIX-DE-1's 2 new fields.
     * Guards against accidental breakage of any existing scalar during the edit.
     */
    const rows = fptDebtRows();
    // Add income/cash-flow rows to exercise all 22 fields
    const fullRows: AggregatorRow[] = [
      ...rows,
      { code: "10",  label: "Doanh thu thuần",                                  value_current: 12_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "20",  label: "Lợi nhuận gộp",                                   value_current:  4_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "30",  label: "Lợi nhuận thuần từ hoạt động kinh doanh",         value_current:  2_500_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "50",  label: "Tổng lợi nhuận kế toán trước thuế",               value_current:  2_600_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "60",  label: "Lợi nhuận sau thuế thu nhập doanh nghiệp",        value_current:  2_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "100", label: "A. TÀI SẢN NGẮN HẠN",                            value_current: 40_000_000_000_000, statement_section: "general",           is_summary_row: 1, unit: "vnd" },
      { code: "110", label: "I. Tiền và các khoản tương đương tiền",           value_current:  8_000_000_000_000, statement_section: "general",           is_summary_row: 1, unit: "vnd" },
      { code: "02",  label: "Khấu hao tài sản cố định",                        value_current:    400_000_000_000, statement_section: "cash_flow",          is_summary_row: 0, unit: "vnd" },
      { code: "20",  label: "Lưu chuyển tiền thuần từ hoạt động kinh doanh",  value_current: -2_500_000_000_000, statement_section: "cash_flow",          is_summary_row: 1, unit: "vnd" },
      { code: "21",  label: "Tiền chi mua sắm tài sản cố định",                value_current:   -500_000_000_000, statement_section: "cash_flow",          is_summary_row: 0, unit: "vnd" },
      { code: "30",  label: "Lưu chuyển tiền thuần từ hoạt động đầu tư",      value_current: -2_000_000_000_000, statement_section: "cash_flow",          is_summary_row: 1, unit: "vnd" },
      { code: "40",  label: "Lưu chuyển tiền thuần từ hoạt động tài chính",   value_current:  2_500_000_000_000, statement_section: "cash_flow",          is_summary_row: 1, unit: "vnd" },
    ];

    const result = aggregateScalars(fullRows);
    expect(result.balanceViolation).toBeNull();
    const agg = result.scalars;

    // All 22 fields present (non-null where expected)
    // Original 10:
    expect(agg.net_revenue).not.toBeNull();
    expect(agg.gross_profit).not.toBeNull();
    expect(agg.profit_before_tax).not.toBeNull();
    expect(agg.net_profit).not.toBeNull();
    expect(agg.total_assets).not.toBeNull();
    expect(agg.current_assets).not.toBeNull();
    expect(agg.total_liabilities).not.toBeNull();
    expect(agg.equity_total).not.toBeNull();
    expect(agg.gross_margin_pct).not.toBeNull();
    expect(agg.net_margin_pct).not.toBeNull();
    // BEQ-3 NEW 10:
    expect(agg.operating_profit).not.toBeNull();
    expect(agg.ebitda).not.toBeNull();
    expect(agg.cash).not.toBeNull();
    expect(agg.eps).toBeNull(); // always null (no VAS code)
    expect(agg.diluted_eps).toBeNull(); // always null (no VAS code)
    expect(agg.operating_cf).not.toBeNull();
    expect(agg.investing_cf).not.toBeNull();
    expect(agg.financing_cf).not.toBeNull();
    expect(agg.capex).not.toBeNull();
    expect(agg.free_cash_flow).not.toBeNull();
    // FIX-DE-1 NEW 2:
    expect(agg.short_term_debt).not.toBeNull(); // from code 321
    expect(agg.long_term_debt).not.toBeNull();  // from code 339
  });

});
