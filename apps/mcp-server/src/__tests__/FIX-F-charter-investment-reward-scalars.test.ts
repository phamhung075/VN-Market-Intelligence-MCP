/**
 * FIX-F — Unit tests: charter_capital / investment_property / reward_fund fields
 *
 * Sprint: RAPID-DATA-LAYER
 * Task: FIX-F — Add 3 new BCTC scalar fields to ScalarAggregate pipeline
 *
 * VAS code mapping chosen from corpus audit 2026-06-04:
 *   charter_capital:      code 411 + /vốn góp|vốn cổ phần|vốn điều lệ|contributed capital/i hint
 *   investment_property:  code 230 + /bất động sản đầu tư/i hint
 *   reward_fund:          code 322 primary (VNM/DHG/FPT-Q4), 323 fallback (FPT-2026Q1), 320 fallback (HPG)
 *                         ALL with /khen thưởng|phúc lợi/i hint — mandatory period-flip guard
 *
 * BANK-FORM GUARD (non-negotiable):
 *   Banks (Mẫu B02-TCTD) use Roman codes for these concepts.
 *   The three fields MUST be null/in-notApplicable for bank-form reports.
 *
 * Test plan:
 *   (a) Corporate form — all 3 scalars extracted with correct VAS codes
 *   (b) BANK form — all 3 null AND in notApplicable (the critical guard test)
 *   (c) Sparse/missing code — null, no crash
 *   (d) reward_fund period-flip guard — code 322/320 with non-/khen thưởng|phúc lợi/ label → null
 *   (e) reward_fund fallback chain — 323 (FPT 2026Q1 layout)
 *   (f) charter_capital label hint — code 411 without matching label → null
 *   (g) Regression — all FIX-DE-1 fields unaffected (short_term_debt / long_term_debt still correct)
 */

import { describe, it, expect } from "bun:test";
import {
  aggregateScalars,
} from "../domain/services/financial-reports/bctcScalarAggregator.js";
import type { AggregatorRow } from "../domain/services/financial-reports/bctcScalarAggregator.js";

// ── Shared balance rows (satisfies balance identity) ──────────────────────────

const BALANCE_ROWS: AggregatorRow[] = [
  { code: "280", label: "TỔNG CỘNG TÀI SẢN", value_current: 100_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
  { code: "300", label: "C. NỢ PHẢI TRẢ",     value_current:  60_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
  { code: "400", label: "D. VỐN CHỦ SỞ HỮU",  value_current:  40_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
];

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Corporate fixture with FPT 2026Q1 layout:
 *   charter_capital:     code 411, section=general, label "1. Vốn góp của chủ sở hữu"
 *   investment_property: code 230, section=balance_sheet, label "Bất động sản đầu tư" (VNM pattern)
 *   reward_fund:         code 322, section=balance_sheet, label "Quỹ khen thưởng phúc lợi" (primary path)
 */
function corporateFullRows(): AggregatorRow[] {
  return [
    ...BALANCE_ROWS,
    // charter_capital: code 411, section general (FPT 2026Q1 layout)
    { code: "411",  label: "1. Vốn góp của chủ sở hữu", value_current: 17_035_071_210_000, statement_section: "general",        is_summary_row: 1, unit: "vnd" },
    // sub-line 411a must NOT be picked (is_summary_row=0, label not matching summary)
    { code: "411a", label: "- Cổ phiếu phổ thông có quyền biểu quyết", value_current: 17_035_071_210_000, statement_section: "general", is_summary_row: 0, unit: "vnd" },
    // investment_property: code 230, balance_sheet (HPG/VNM pattern)
    { code: "230",  label: "Bất động sản đầu tư", value_current: 51_780_183_216, statement_section: "balance_sheet", is_summary_row: 0, unit: "vnd" },
    // reward_fund: code 322, balance_sheet (VNM/DHG pattern)
    { code: "322",  label: "Quỹ khen thưởng phúc lợi", value_current: 953_046_624_309, statement_section: "balance_sheet", is_summary_row: 0, unit: "vnd" },
  ];
}

/**
 * Bank fixture (Mẫu B02-TCTD) — Roman codes, no 3-digit corporate codes.
 * The bank discriminator fires → all 3 new fields must be null AND in notApplicable.
 * Bank charters/investment-property/reward-fund use different Roman codes (III.1, XI, etc.)
 * NOT mapped here — they are structurally absent from the VAS 411/230/322 lookup.
 */
function bankRows(): AggregatorRow[] {
  return [
    { code: "I",    label: "Thu nhập lãi thuần",        value_current: 20_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
    { code: "VIII", label: "Lợi nhuận trước thuế TNDN", value_current:  5_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
    { code: "IX",   label: "Lợi nhuận sau thuế TNDN",   value_current:  4_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
    { code: null,   label: "TỔNG TÀI SẢN",             value_current: 800_000_000_000_000, statement_section: "balance_sheet",   is_summary_row: 1, unit: "vnd" },
    { code: null,   label: "TỔNG NỢ PHẢI TRẢ",         value_current: 720_000_000_000_000, statement_section: "balance_sheet",   is_summary_row: 1, unit: "vnd" },
    { code: null,   label: "VỐN CHỦ SỞ HỮU",           value_current:  80_000_000_000_000, statement_section: "balance_sheet",   is_summary_row: 1, unit: "vnd" },
    // Simulate bank charter capital at Roman code (must NOT map to charter_capital)
    { code: "VIII.1.a", label: "Vốn điều lệ",          value_current: 51_366_566_000_000, statement_section: "balance_sheet",   is_summary_row: 0, unit: "vnd" },
  ];
}

/**
 * reward_fund period-flip guard: code 322 has a non-reward label ("Dự phòng phải trả").
 * The /khen thưởng|phúc lợi/i hint MUST block this pick → reward_fund = null.
 */
function rewardFundPeriodFlipRows(): AggregatorRow[] {
  return [
    ...BALANCE_ROWS,
    // code 322 = "Dự phòng phải trả ngắn hạn" (FPT 2026Q1 pattern — NOT reward fund)
    { code: "322", label: "11. Dự phòng phải trả ngắn hạn", value_current: 568_429_169_238, statement_section: "balance_sheet", is_summary_row: 0, unit: "vnd" },
    // code 320 = "Phải trả ngắn hạn khác" (FPT 2026Q1 pattern — NOT reward fund)
    { code: "320", label: "9. Phải trả ngắn hạn khác", value_current: 586_509_033_785, statement_section: "balance_sheet", is_summary_row: 0, unit: "vnd" },
  ];
}

/**
 * reward_fund fallback chain: code 322 is NOT reward (period-flip), code 323 IS reward.
 * Mirrors FPT 2026Q1 actual corpus.
 */
function rewardFundCode323Rows(): AggregatorRow[] {
  return [
    ...BALANCE_ROWS,
    // code 322 = "Dự phòng phải trả ngắn hạn" (NOT reward fund — hint blocks)
    { code: "322", label: "11. Dự phòng phải trả ngắn hạn", value_current: 568_429_169_238, statement_section: "balance_sheet", is_summary_row: 0, unit: "vnd" },
    // code 323 = "Quỹ khen thưởng, phúc lợi" (FPT 2026Q1 — falls back here)
    { code: "323", label: "12. Quỹ khen thưởng, phúc lợi", value_current: 1_576_181_989_047, statement_section: "balance_sheet", is_summary_row: 0, unit: "vnd" },
  ];
}

/**
 * reward_fund HPG fallback: code 320 = "Quỹ khen thưởng phúc lợi" (HPG pattern).
 * code 322 here is long_term_debt (HPG: code 322 = "Vay và nợ thuê tài chính dài hạn").
 */
function rewardFundCode320HpgRows(): AggregatorRow[] {
  return [
    ...BALANCE_ROWS,
    // code 322 = "Vay và nợ thuê tài chính dài hạn" (HPG long_term_debt, label has "vay")
    { code: "322", label: "Vay và nợ thuê tài chính dài hạn", value_current: 878_837_816_792, statement_section: "balance_sheet", is_summary_row: 0, unit: "vnd" },
    // code 320 = "Quỹ khen thưởng phúc lợi" (HPG actual reward fund)
    { code: "320", label: "Quỹ khen thưởng phúc lợi", value_current: 400_000_000_000, statement_section: "balance_sheet", is_summary_row: 0, unit: "vnd" },
  ];
}

/**
 * charter_capital label hint guard: code 411 exists but label does NOT contain
 * /vốn góp|vốn cổ phần|vốn điều lệ|contributed capital/. Must NOT map.
 */
function charterCapitalNoHintRows(): AggregatorRow[] {
  return [
    ...BALANCE_ROWS,
    // code 411 with an unrelated label — hint should block this
    { code: "411", label: "Quỹ khác thuộc vốn chủ sở hữu", value_current: 91_013_628_887, statement_section: "general", is_summary_row: 0, unit: "vnd" },
  ];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FIX-F — charter_capital / investment_property / reward_fund in aggregateScalars", () => {

  // ── Test (a): corporate form — all 3 scalars extracted ────────────────────

  it("(a) corporate form: all 3 new scalars extracted with correct VAS codes", () => {
    const rows = corporateFullRows();
    const result = aggregateScalars(rows);

    expect(result.balanceViolation).toBeNull();

    const agg = result.scalars;

    // charter_capital: code 411 label "Vốn góp của chủ sở hữu" → 17,035,071,210,000 / 1e6 ≈ 17,035,071 M
    expect(agg.charter_capital).not.toBeNull();
    expect(agg.charter_capital!).toBeCloseTo(17_035_071, -2);

    // investment_property: code 230 label "Bất động sản đầu tư" → 51,780,183,216 / 1e6 ≈ 51,780 M
    expect(agg.investment_property).not.toBeNull();
    expect(agg.investment_property!).toBeCloseTo(51_780, -1);

    // reward_fund: code 322 label "Quỹ khen thưởng phúc lợi" → 953,046,624,309 / 1e6 ≈ 953,047 M
    expect(agg.reward_fund).not.toBeNull();
    expect(agg.reward_fund!).toBeCloseTo(953_047, -2);
  });

  // ── Test (b): BANK form — all 3 null AND in notApplicable ─────────────────

  it("(b) BANK form: all 3 new scalars null AND in notApplicable (the critical guard test)", () => {
    /**
     * This is the most critical test. Banks use Mẫu B02-TCTD with Roman codes.
     * Blindly reading VAS 411/230/322 on a bank report produces garbage or null.
     * The bank-form discriminator (isBankFormFromRows) fires because there are
     * NO 3-digit numeric corporate codes (100/280/300/400) in the bank row set.
     *
     * Expected behavior:
     *   - charter_capital   = null  (VAS 411 not in bank corpus)
     *   - investment_property = null (VAS 230 not in bank corpus)
     *   - reward_fund       = null  (VAS 322/323/320 not in bank corpus)
     *   - notApplicable includes all three (finalize will SET NULL to clear stale values)
     *
     * Note: bank row has code "VIII.1.a" with label "Vốn điều lệ" — this is a Roman
     * sub-code, NOT VAS 411. The extractor must NOT map it to charter_capital.
     */
    const rows = bankRows();
    const result = aggregateScalars(rows);

    // Bank guard fires — not applicable
    expect(result.notApplicable).toContain("charter_capital");
    expect(result.notApplicable).toContain("investment_property");
    expect(result.notApplicable).toContain("reward_fund");

    // Scalars must be null (no matching VAS codes in bank corpus)
    expect(result.scalars.charter_capital).toBeNull();
    expect(result.scalars.investment_property).toBeNull();
    expect(result.scalars.reward_fund).toBeNull();

    // Pre-existing bank notApplicable entries must still be present (regression guard)
    expect(result.notApplicable).toContain("gross_profit");
    expect(result.notApplicable).toContain("current_assets");
    expect(result.notApplicable).toContain("gross_margin_pct");
    expect(result.notApplicable).toContain("short_term_debt");
    expect(result.notApplicable).toContain("long_term_debt");
  });

  // ── Test (c): sparse/missing code → null, no crash ────────────────────────

  it("(c) sparse corpus — no 411/230/322 codes → all 3 null, no crash", () => {
    const result = aggregateScalars(BALANCE_ROWS);

    expect(result.balanceViolation).toBeNull();
    expect(result.scalars.charter_capital).toBeNull();
    expect(result.scalars.investment_property).toBeNull();
    expect(result.scalars.reward_fund).toBeNull();
  });

  it("(c) empty corpus → all 3 null, no crash", () => {
    const result = aggregateScalars([]);

    expect(result.scalars.charter_capital).toBeNull();
    expect(result.scalars.investment_property).toBeNull();
    expect(result.scalars.reward_fund).toBeNull();
    expect(result.balanceViolation).toBeNull();
  });

  // ── Test (d): reward_fund period-flip guard ────────────────────────────────

  it("(d) reward_fund period-flip guard: code 322='Dự phòng phải trả' + code 320='Phải trả khác' → null", () => {
    /**
     * Mirrors FPT 2026Q1 where code 322 maps to "Dự phòng phải trả ngắn hạn"
     * and code 320 maps to "Phải trả ngắn hạn khác". Neither matches /khen thưởng|phúc lợi/.
     * reward_fund must be null — the hint prevents the wrong pick.
     *
     * This test guards against the same class of period-flip bugs documented for
     * short_term_debt (FU-DE-321-VAY-GUARD) applied to reward_fund.
     */
    const rows = rewardFundPeriodFlipRows();
    const result = aggregateScalars(rows);

    expect(result.balanceViolation).toBeNull();
    expect(result.scalars.reward_fund).toBeNull();
  });

  // ── Test (e): reward_fund code 323 fallback (FPT 2026Q1 layout) ───────────

  it("(e) reward_fund fallback chain: code 322 non-reward → code 323 reward → extracted", () => {
    /**
     * FPT 2026Q1 actual corpus: code 322="Dự phòng phải trả" (hint blocks it),
     * code 323="Quỹ khen thưởng, phúc lợi" (hint matches) → falls back to 323.
     */
    const rows = rewardFundCode323Rows();
    const result = aggregateScalars(rows);

    expect(result.balanceViolation).toBeNull();
    expect(result.scalars.reward_fund).not.toBeNull();
    // code 323 value: 1,576,181,989,047 / 1e6 ≈ 1,576,182 M
    expect(result.scalars.reward_fund!).toBeCloseTo(1_576_182, -2);
  });

  it("(e) reward_fund code 320 fallback (HPG layout): code 322='Vay dài hạn' + code 320='Quỹ khen thưởng' → extracted from 320", () => {
    /**
     * HPG layout: code 322 maps to "Vay và nợ thuê tài chính dài hạn" (long_term_debt,
     * label has "vay" NOT /khen thưởng|phúc lợi/) → hint blocks for reward_fund lookup.
     * code 320="Quỹ khen thưởng phúc lợi" → hint matches → reward_fund populated.
     */
    const rows = rewardFundCode320HpgRows();
    const result = aggregateScalars(rows);

    expect(result.balanceViolation).toBeNull();
    expect(result.scalars.reward_fund).not.toBeNull();
    // code 320 value: 400,000,000,000 / 1e6 = 400,000 M
    expect(result.scalars.reward_fund!).toBeCloseTo(400_000, -2);
  });

  // ── Test (f): charter_capital label hint guard ────────────────────────────

  it("(f) charter_capital label hint guard: code 411 with non-matching label → null", () => {
    /**
     * If code 411 exists but its label does NOT contain /vốn góp|vốn cổ phần|vốn điều lệ/,
     * it must not be picked. This prevents sub-items or misclassified rows from
     * being reported as charter capital.
     */
    const rows = charterCapitalNoHintRows();
    const result = aggregateScalars(rows);

    expect(result.balanceViolation).toBeNull();
    expect(result.scalars.charter_capital).toBeNull();
  });

  // ── Test (g): regression — FIX-DE-1 fields unaffected ────────────────────

  it("(g) regression: short_term_debt and long_term_debt still correct after FIX-F changes", () => {
    /**
     * FPT-pattern: code 321 → short_term_debt, code 339 → long_term_debt.
     * The new FIX-F fields share the equity section — must not disturb debt extraction.
     */
    const rows: AggregatorRow[] = [
      ...BALANCE_ROWS,
      // Debt rows (FIX-DE-1)
      { code: "321", label: "10. Vay và nợ thuê tài chính ngắn hạn", value_current: 14_491_358_043_012, statement_section: "general", is_summary_row: 0, unit: "vnd" },
      { code: "339", label: "3. Vay và nợ thuê tài chính dài hạn",   value_current:  1_605_069_048_520, statement_section: "general", is_summary_row: 0, unit: "vnd" },
      // New FIX-F fields
      { code: "411", label: "1. Vốn góp của chủ sở hữu",            value_current: 17_035_071_210_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
      { code: "230", label: "Bất động sản đầu tư",                   value_current:    51_780_183_216,  statement_section: "balance_sheet", is_summary_row: 0, unit: "vnd" },
      { code: "322", label: "Quỹ khen thưởng phúc lợi",             value_current:   953_046_624_309,  statement_section: "balance_sheet", is_summary_row: 0, unit: "vnd" },
    ];

    const result = aggregateScalars(rows);
    expect(result.balanceViolation).toBeNull();

    const agg = result.scalars;

    // FIX-DE-1 fields must still be populated
    expect(agg.short_term_debt).not.toBeNull();
    expect(agg.short_term_debt!).toBeCloseTo(14_491_358, -2);
    expect(agg.long_term_debt).not.toBeNull();
    expect(agg.long_term_debt!).toBeCloseTo(1_605_069, -2);

    // FIX-F fields must also be populated
    expect(agg.charter_capital).not.toBeNull();
    expect(agg.investment_property).not.toBeNull();
    expect(agg.reward_fund).not.toBeNull();

    // Corporate path — none of the new fields in notApplicable
    expect(result.notApplicable).not.toContain("charter_capital");
    expect(result.notApplicable).not.toContain("investment_property");
    expect(result.notApplicable).not.toContain("reward_fund");
  });

});
