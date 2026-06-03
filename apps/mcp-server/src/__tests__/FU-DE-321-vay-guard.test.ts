/**
 * FU-DE-321-vay-guard.test.ts — /vay/i label guard for VAS codes 321 and 339
 *
 * Sprint: BCTC-ANALYTICS-LAYER (follow-up)
 * Task: FU-DE-321-VAY-GUARD (FIX, S, apps/mcp-server, medium)
 * Date: 2026-06-03
 *
 * Root cause:
 *   VAS code 321 is NOT always "Vay và nợ thuê tài chính ngắn hạn" across periods/issuers.
 *   FPT 2025Q4: code 321 = "Dự phòng phải trả ngắn hạn" (1,014 tỷ) — NOT a borrowing row.
 *               code 319 = "Vay và nợ thuê tài chính ngắn hạn" (19,169 tỷ) — CORRECT.
 *   Without a /vay/i hint on 321, the aggregator wrote 1,014 tỷ instead of 19,169 tỷ.
 *   Same class as HPG code-311 spurious-match issue (FIX-DE-4).
 *
 * Fix: /vay/i labelHint on code 321 primary (strict — no match → null → 319 fallback fires).
 *      /vay/i labelHint on code 339 for symmetry (same period-flip risk for long_term_debt).
 *
 * DoD test cases:
 *   DV-VAY-1: 321-non-vay + 319-vay present → short_term_debt = 319 value (FPT 2025Q4 scenario)
 *   DV-VAY-2: 321-vay present → short_term_debt = 321 value (FPT 2026Q1 unaffected)
 *   DV-VAY-3: 321-non-vay, no 319 → short_term_debt = null (no spurious pick)
 *   DV-VAY-4: 339-non-vay + 334-vay present → long_term_debt = 334 value (symmetry)
 *   DV-VAY-5: 339-vay present → long_term_debt = 339 value (regression guard)
 *   DV-VAY-6: regression — FIX-DE-1 FPT-pattern still works (321-vay + 339-vay)
 *   DV-VAY-7: regression — FIX-DE-1 VNM-pattern still works (319-vay fallback)
 *   DV-VAY-8: regression — bank path notApplicable intact
 */

import { describe, it, expect } from "bun:test";
import {
  aggregateScalars,
  type AggregatorRow,
} from "../domain/services/financial-reports/bctcScalarAggregator.js";

// ── Shared balance rows (raw VND scale; satisfies balance identity) ───────────

const BALANCE_ROWS: AggregatorRow[] = [
  { code: "280", label: "TỔNG CỘNG TÀI SẢN",  value_current: 100_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
  { code: "300", label: "C. NỢ PHẢI TRẢ",       value_current:  60_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
  { code: "400", label: "D. VỐN CHỦ SỞ HỮU",   value_current:  40_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
];

// ─── DV-VAY-1: FPT 2025Q4 scenario — 321 is NOT vay, 319 IS vay ───────────────

describe("DV-VAY-1 — FPT 2025Q4: code-321 non-vay + code-319 vay → short_term_debt = 319 value", () => {
  it("picks 19,169 tỷ from code-319 label (vay), ignores code-321 non-vay (1,014 tỷ)", () => {
    /**
     * RED (old aggregator without /vay/i hint on 321):
     *   findByCode(rows, "321") → "Dự phòng phải trả ngắn hạn" = 1,014,673,786,632 VND
     *   short_term_debt = 1,014,674M ← WRONG
     *   The 319 fallback never fires because 321 returned non-null.
     *
     * GREEN (new aggregator with /vay/i hint on 321):
     *   findByCode(rows, "321", /vay/i) → label "Dự phòng phải trả" has no "vay" → null
     *   Falls through to 319 fallback: "Vay và nợ thuê tài chính ngắn hạn" matches /vay/i
     *   short_term_debt = 19,169,697,497,955 / 1e6 ≈ 19,169,697M ← CORRECT
     *
     * Evidence: FPT 2025Q4 live bctc_table_rows (report_id=e71f845d-ffa5-48f9-8f09-30ac2cd09c65)
     */
    const rows: AggregatorRow[] = [
      ...BALANCE_ROWS,
      // code 321: NOT a borrowing row in this period — label has no "vay"
      {
        code: "321",
        label: "Dự phòng phải trả ngắn hạn",
        value_current: 1_014_673_786_632,
        statement_section: "balance_sheet",
        is_summary_row: 0,
        unit: "vnd",
      },
      // code 319: the REAL short-term borrowing row — label matches /vay/i
      {
        code: "319",
        label: "Vay và nợ thuê tài chính ngắn hạn",
        value_current: 19_169_697_497_955,
        statement_section: "balance_sheet",
        is_summary_row: 0,
        unit: "vnd",
      },
    ];

    const result = aggregateScalars(rows);
    const agg = result.scalars;

    // Balance identity must hold (no violation)
    expect(result.balanceViolation).toBeNull();

    // CORE ASSERTION: must pick 319 (19,169 tỷ), NOT 321 (1,014 tỷ)
    expect(agg.short_term_debt).not.toBeNull();
    expect(agg.short_term_debt!).toBeCloseTo(19_169_697, -2);

    // Confirm it did NOT pick the non-vay 321 value
    expect(agg.short_term_debt!).not.toBeCloseTo(1_014_674, -2);
  });
});

// ─── DV-VAY-2: FPT 2026Q1 scenario — 321 IS vay → must still win ─────────────

describe("DV-VAY-2 — FPT 2026Q1: code-321 vay present → short_term_debt = 321 value (unaffected)", () => {
  it("picks 14,491 tỷ from code-321 (label contains 'Vay') — no regression", () => {
    /**
     * RED: not applicable — this test proves there is NO regression for the normal
     *      case where code 321 IS a genuine borrowing row.
     *
     * GREEN: /vay/i hint matches "Vay và nợ thuê tài chính ngắn hạn" →
     *   short_term_debt = 14,491,358,043,012 / 1e6 ≈ 14,491,358M ← CORRECT (same as before)
     *
     * Evidence: FPT 2026Q1 live bctc_table_rows (report_id=e8ea3df5)
     */
    const rows: AggregatorRow[] = [
      ...BALANCE_ROWS,
      // code 321: IS a borrowing row in 2026Q1 — label matches /vay/i
      {
        code: "321",
        label: "10. Vay và nợ thuê tài chính ngắn hạn",
        value_current: 14_491_358_043_012,
        statement_section: "general",
        is_summary_row: 0,
        unit: "vnd",
      },
      // code 319 also present but NOT vay (deferred revenue label)
      {
        code: "319",
        label: "8. Doanh thu chờ phân bổ ngắn hạn",
        value_current: 1_095_442_672_376,
        statement_section: "general",
        is_summary_row: 0,
        unit: "vnd",
      },
    ];

    const result = aggregateScalars(rows);
    const agg = result.scalars;

    expect(result.balanceViolation).toBeNull();

    // CORE ASSERTION: 321 is vay → wins; 319 is NOT vay → not picked by fallback
    expect(agg.short_term_debt).not.toBeNull();
    expect(agg.short_term_debt!).toBeCloseTo(14_491_358, -2);
  });
});

// ─── DV-VAY-3: 321 non-vay, no 319 present → short_term_debt = null ──────────

describe("DV-VAY-3 — code-321 non-vay, no code-319 → short_term_debt = null (no spurious pick)", () => {
  it("returns null for short_term_debt when 321 is not-vay and no 319 fallback exists", () => {
    /**
     * Safety test: if 321 is a non-borrowing row and there is no 319 row at all,
     * the aggregator must return null (not spuriously write the non-borrowing value).
     */
    const rows: AggregatorRow[] = [
      ...BALANCE_ROWS,
      {
        code: "321",
        label: "Dự phòng phải trả ngắn hạn",
        value_current: 500_000_000_000,
        statement_section: "balance_sheet",
        is_summary_row: 0,
        unit: "vnd",
      },
    ];

    const result = aggregateScalars(rows);

    expect(result.balanceViolation).toBeNull();
    expect(result.scalars.short_term_debt).toBeNull();
  });
});

// ─── DV-VAY-4: 339 non-vay + 334 vay → long_term_debt = 334 value ────────────

describe("DV-VAY-4 — code-339 non-vay + code-334 vay → long_term_debt = 334 value (symmetry)", () => {
  it("picks 334-vay value when 339 has non-vay label", () => {
    /**
     * Symmetry guard: if code 339 maps to a non-borrowing row in some period
     * (e.g. "Dự phòng phải trả dài hạn"), the /vay/i hint must block it,
     * and the 334 fallback (/vay/i) must fire.
     */
    const rows: AggregatorRow[] = [
      ...BALANCE_ROWS,
      // code 339: NOT a borrowing row — label has no "vay"
      {
        code: "339",
        label: "Dự phòng phải trả dài hạn",
        value_current: 405_858_410_471,
        statement_section: "balance_sheet",
        is_summary_row: 0,
        unit: "vnd",
      },
      // code 334: the real long-term borrowing row — label matches /vay/i
      {
        code: "334",
        label: "Vay dài hạn",
        value_current: 2_500_000_000_000,
        statement_section: "balance_sheet",
        is_summary_row: 0,
        unit: "vnd",
      },
    ];

    const result = aggregateScalars(rows);
    const agg = result.scalars;

    expect(result.balanceViolation).toBeNull();

    // CORE ASSERTION: long_term_debt from code 334 (vay), NOT code 339 (non-vay)
    expect(agg.long_term_debt).not.toBeNull();
    expect(agg.long_term_debt!).toBeCloseTo(2_500_000, -2);

    // Confirm it did NOT pick the non-vay 339 value
    expect(agg.long_term_debt!).not.toBeCloseTo(405_858, -2);
  });
});

// ─── DV-VAY-5: 339 vay present → long_term_debt = 339 value (regression) ─────

describe("DV-VAY-5 — code-339 vay present → long_term_debt = 339 value (no regression)", () => {
  it("picks 339-vay value correctly — /vay/i hint does not break the normal case", () => {
    /**
     * Regression guard: FPT 2026Q1 code 339 = "3. Vay và nợ thuê tài chính dài hạn"
     * must still be picked after the /vay/i hint is added.
     */
    const rows: AggregatorRow[] = [
      ...BALANCE_ROWS,
      {
        code: "339",
        label: "3. Vay và nợ thuê tài chính dài hạn",
        value_current: 1_605_069_048_520,
        statement_section: "general",
        is_summary_row: 0,
        unit: "vnd",
      },
    ];

    const result = aggregateScalars(rows);
    const agg = result.scalars;

    expect(result.balanceViolation).toBeNull();

    // CORE ASSERTION: long_term_debt from code 339 vay
    expect(agg.long_term_debt).not.toBeNull();
    expect(agg.long_term_debt!).toBeCloseTo(1_605_069, -2);
  });
});

// ─── DV-VAY-6: FIX-DE-1 FPT-pattern regression (321-vay + 339-vay) ───────────

describe("DV-VAY-6 — regression: FIX-DE-1 FPT-pattern (321-vay + 339-vay) still works", () => {
  it("FPT 2026Q1 pattern: both 321 and 339 are vay rows → both fields populated correctly", () => {
    /**
     * Full regression of the FIX-DE-1 primary test case.
     * After adding /vay/i hints to both 321 and 339, the normal FPT pattern must
     * still resolve correctly.
     */
    const rows: AggregatorRow[] = [
      ...BALANCE_ROWS,
      {
        code: "321",
        label: "10. Vay và nợ thuê tài chính ngắn hạn",
        value_current: 14_491_358_043_012,
        statement_section: "general",
        is_summary_row: 0,
        unit: "vnd",
      },
      {
        code: "339",
        label: "3. Vay và nợ thuê tài chính dài hạn",
        value_current: 1_605_069_048_520,
        statement_section: "general",
        is_summary_row: 0,
        unit: "vnd",
      },
    ];

    const result = aggregateScalars(rows);

    expect(result.balanceViolation).toBeNull();
    expect(result.scalars.short_term_debt!).toBeCloseTo(14_491_358, -2);
    expect(result.scalars.long_term_debt!).toBeCloseTo(1_605_069, -2);
  });
});

// ─── DV-VAY-7: FIX-DE-1 VNM-pattern regression (319-vay fallback) ────────────

describe("DV-VAY-7 — regression: FIX-DE-1 VNM-pattern (319-vay fallback) still works", () => {
  it("VNM pattern: no 321 row, 319-vay present → short_term_debt populated", () => {
    /**
     * VNM uses code 319 (no code 321). After the /vay/i guard on 321,
     * the 319 fallback must still fire when 321 is absent.
     */
    const rows: AggregatorRow[] = [
      { code: "280", label: "TỔNG CỘNG TÀI SẢN",  value_current: 50_000_000_000_000, statement_section: "general",       is_summary_row: 1, unit: "vnd" },
      { code: "300", label: "Nợ phải trả",          value_current: 15_000_000_000_000, statement_section: "general",       is_summary_row: 1, unit: "vnd" },
      { code: "400", label: "Vốn chủ sở hữu",       value_current: 35_000_000_000_000, statement_section: "general",       is_summary_row: 1, unit: "vnd" },
      {
        code: "319",
        label: "Vay ngắn hạn",
        value_current: 102_362_732_591,
        statement_section: "balance_sheet",
        is_summary_row: 0,
        unit: "vnd",
      },
    ];

    const result = aggregateScalars(rows);

    expect(result.balanceViolation).toBeNull();
    expect(result.scalars.short_term_debt).not.toBeNull();
    expect(result.scalars.short_term_debt!).toBeCloseTo(102_363, -1);
  });
});

// ─── DV-VAY-8: bank path notApplicable intact ─────────────────────────────────

describe("DV-VAY-8 — regression: bank path notApplicable still includes debt fields", () => {
  it("bank corpus → short_term_debt and long_term_debt in notApplicable (no regression)", () => {
    /**
     * Regression guard for FIX-DE-1 bank path: adding /vay/i hints to 321/339 must NOT
     * affect the bank path's notApplicable set.
     */
    const rows: AggregatorRow[] = [
      { code: "I",    label: "Thu nhập lãi thuần",        value_current: 20_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "VIII", label: "Lợi nhuận trước thuế TNDN", value_current:  5_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "IX",   label: "Lợi nhuận sau thuế TNDN",   value_current:  4_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: null,   label: "TỔNG TÀI SẢN",              value_current: 800_000_000_000_000, statement_section: "balance_sheet",  is_summary_row: 1, unit: "vnd" },
      { code: null,   label: "TỔNG NỢ PHẢI TRẢ",          value_current: 720_000_000_000_000, statement_section: "balance_sheet",  is_summary_row: 1, unit: "vnd" },
      { code: null,   label: "VỐN CHỦ SỞ HỮU",            value_current:  80_000_000_000_000, statement_section: "balance_sheet",  is_summary_row: 1, unit: "vnd" },
    ];

    const result = aggregateScalars(rows);

    expect(result.notApplicable).toContain("short_term_debt");
    expect(result.notApplicable).toContain("long_term_debt");
    expect(result.scalars.short_term_debt).toBeNull();
    expect(result.scalars.long_term_debt).toBeNull();
    // Existing bank notApplicable entries must still be present
    expect(result.notApplicable).toContain("gross_profit");
    expect(result.notApplicable).toContain("current_assets");
    expect(result.notApplicable).toContain("gross_margin_pct");
  });
});
