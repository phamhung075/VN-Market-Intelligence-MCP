/**
 * FU-6d-scalar-correctness.test.ts — Anti-False-Green DV Gate
 *
 * Sprint: FU-TRUST-REFRESH | Task: FU-6d (generalized aggregator fix)
 * Date: 2026-05-31
 *
 * FIXTURE REALISM NOTE:
 *   All ACB fixtures in this file mirror the ACTUAL ACB row shapes observed in
 *   production (bctc_table_rows fea19bae-2b7a-4954-b3e0-e09d7bfc7390):
 *   - Roman numeral codes (I, VIII, IX) appear on BOTH balance-sheet asset rows AND
 *     income-statement rows (the real collision that caused the live bugs).
 *   - "NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" (code B, value=null) appears before
 *     "VỐN CHỦ SỞ HỮU" (code VIII) in row_order (the real null-header collision).
 *   - The prior idealized fixtures in FU-6c used sanitized rows that did NOT reproduce
 *     these collisions, which is why the same bug class kept escaping to QA.
 *
 * WHAT THIS TESTS (3 blocks — must be RED before fix, GREEN after):
 *
 *   BLOCK-A (DV-FU6D-1) — null-valued section header wins before real equity row:
 *     "NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" (code B, value_current=null) appears in
 *     row_order before "VỐN CHỦ SỞ HỮU" (code VIII, value=98,751,052).
 *     The P_BANK_EQUITY_EXCLUDE regex does NOT reject it (lacks "TỔNG" prefix).
 *     Fix: findByLabelExcluding must skip candidates with value_current=null, and
 *     prefer non-null value rows. Applied globally to all label-based resolution,
 *     both bank and corporate paths.
 *
 *   BLOCK-B (DV-FU6D-2) — Roman code VIII/IX collision on bank path:
 *     Code "VIII" appears on both balance-sheet asset "Chứng khoán đầu tư"
 *     (147,029,433M) and income-statement "Lợi nhuận trước thuế" (5,368,138M).
 *     Code "IX" appears on both "Góp vốn, đầu tư dài hạn" (74,311M) and
 *     "Lợi nhuận sau thuế" (4,320,388M).
 *     Without labelHint, findByCode picks the first row by row_order (balance sheet
 *     asset wins because it has lower row_order than income items in ACB layout).
 *     Fix: add labelHint to ALL bank-path Roman numeral codes that collide across
 *     balance-sheet and income-statement sections (I already done in FU-6c, VIII and
 *     IX added here). Enumerate all reused codes in the bank code list exhaustively.
 *
 *   BLOCK-C (DV-FU6D-3) — enforceBalanceIdentity fails open on null equity:
 *     When equity_total resolves to null (BLOCK-A scenario), the function returns
 *     null (no violation). The caller sees no violation, does not log, and the stale
 *     wrong equity persists silently.
 *     Fix: return a descriptive violation string when any of {total_assets,
 *     total_liabilities, equity_total} is null — "REQUIRED SCALARS UNRESOLVED".
 *     Legitimately-absent fields (bank gross_profit, bank current_assets) must NOT
 *     trigger this — they are not in the required set for the balance identity.
 *
 *   NEGATIVE TEST (DV-FU6D-4) — legitimately-absent bank fields do NOT trigger violation:
 *     For a bank report, gross_profit and current_assets are structurally absent.
 *     These nulls must NOT produce a required-scalar violation. Only
 *     {total_assets, total_liabilities, equity_total} are required.
 *
 * RED-BEFORE-GREEN PROTOCOL:
 *   Each test documents what the OLD code returns (wrong) and what the FIX returns (correct).
 *   Tests DV-FU6D-1, DV-FU6D-2, DV-FU6D-3 are RED against the current aggregator
 *   (pre-FU-6d). They turn GREEN after the generalized fix.
 *
 * CROSS-REFERENCE with existing FU-5/FU-5b/FU-6c tests:
 *   DV-FU5-*, DV-FU5b-*, DV-FU6-{1..5} must remain GREEN after FU-6d changes.
 */

import { describe, it, expect } from "bun:test";
import {
  aggregateScalars,
  type AggregatorRow,
} from "../domain/services/financial-reports/bctcScalarAggregator.js";

// ─── SHARED ACB REALISTIC ROW BUILDER ────────────────────────────────────────
//
// Real ACB Mẫu B02-TCTD row shapes:
//   - All rows land in statement_section="general" (ACB has no dedicated subsections)
//   - Roman numeral codes (I, II, ..., IX, X, XI, XII, XIII) appear on both
//     balance-sheet asset section headers AND income-statement line items.
//   - "NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" (code B) is a section header with value=null
//     that appears BEFORE the pure equity row in the actual ACB BCTC PDF layout.
//   - Values are in million VND scale (max < 1e11) for ACB.
//
// The column from QA report (fea19bae-2b7a-4954-b3e0-e09d7bfc7390):
//   total_assets=1,030,900,741  total_liabilities=932,149,689  equity=98,751,052
//   net_revenue=6,989,162  PBT=5,368,138  net_profit=4,320,388

function makeRow(
  code: string | null,
  label: string,
  value_current: number | null,
  is_summary_row = 0,
  statement_section = "general",
): AggregatorRow {
  return { code, label, value_current, is_summary_row, statement_section, unit: "billion_vnd" };
}

// ─── DV-FU6D-1: BLOCK-A — null-valued section header before real equity row ──

describe("DV-FU6D-1 — BLOCK-A: null-valued section header must not win equity pick (realistic ACB fixture)", () => {
  it("[RED→GREEN] equity_total resolves to 98,751,052 (not null) when 'NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU' (code B, value=null) appears before 'VỐN CHỦ SỞ HỮU' (code VIII, value=98,751,052)", () => {
    /**
     * REALISTIC ACB ROW COLLISION (from QA report):
     *
     * Row layout in bctc_table_rows (in row_order):
     *   code=B,    label="NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU",  value_current=null   ← section header
     *   code=VIII, label="VỐN CHỦ SỞ HỮU",                  value_current=98,751,052
     *
     * P_BANK_EQUITY = /vốn chủ sở hữu/i  → matches BOTH rows.
     * P_BANK_EQUITY_EXCLUDE = /tổng nợ phải trả|nguồn vốn/i → does NOT match "NỢ PHẢI TRẢ..."
     *   (missing "TỔNG" prefix). So the section-header row "NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU"
     *   passes the exclude filter and appears first → candidates[0] with value=null → equity=null.
     *
     * OLD code result: equity_total = null (null-valued header wins by row_order)
     * FIX result:      equity_total = 98,751,052 (null-valued candidates skipped; non-null wins)
     *
     * GENERALIZATION: The fix applies to ALL findByLabelExcluding calls — null-valued
     * candidates are NEVER a valid pick anywhere. Non-null is always preferred over null.
     */

    // Realistic ACB rows — Roman code "VIII" on BOTH balance-sheet AND income rows
    // (this is what BLOCK-B will fix; here we only exercise the equity null-skip)
    //
    // CRITICAL FIXTURE REALISM: QA report confirms both the null section header AND
    // the real equity row have is_summary_row=0 in live ACB data. This means the
    // is_summary_row tiebreaker DOES NOT help — candidates[0] (row order) determines
    // the winner. The null-valued header at lower row_order wins → equity=null.
    const rows: AggregatorRow[] = [
      // Balance-sheet asset section header — code I (also income collision, but handled by labelHint)
      makeRow("I",    "Tiền mặt, vàng bạc, đá quý",                              8_157_465,     0),
      // Balance-sheet rows
      makeRow(null,   "TỔNG TÀI SẢN",                                             1_030_900_741, 1),
      makeRow(null,   "TỔNG NỢ PHẢI TRẢ",                                           932_149_689, 1),
      // ↓ BLOCK-A COLLISION: section header "NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" with value=null
      //   appears BEFORE the real equity row in row_order; BOTH have is_summary_row=0
      //   (QA confirmed: "neither is is_summary_row=1 so candidates[0] wins by row_order")
      makeRow("B",    "NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU",                          null,          0),  // ← value=null, section header, is_summary_row=0
      // ↓ REAL equity row — appears AFTER the null section header, also is_summary_row=0
      makeRow("VIII", "VỐN CHỦ SỞ HỮU",                                             98_751_052, 0),  // ← is_summary_row=0 (same as null header)
      // Income-statement rows (same "general" section, using same Roman codes)
      makeRow("I",    "Thu nhập lãi và các khoản thu nhập tương tự",               6_989_162, 1),  // net_revenue
      makeRow("VIII", "Lợi nhuận trước thuế",                                       5_368_138, 1),  // profit_before_tax (correct)
      makeRow("IX",   "Lợi nhuận sau thuế thu nhập doanh nghiệp",                  4_320_388, 1),  // net_profit (correct)
    ];

    const result = aggregateScalars(rows);
    const agg = result.scalars;

    // BLOCK-A CORE ASSERTION: equity_total must resolve to 98,751,052 (non-null)
    // OLD behavior: equity_total = null (null section header won by row_order)
    expect(agg.equity_total).not.toBeNull();
    expect(agg.equity_total).toBe(98_751_052);

    // Confirm total_assets and liabilities correct
    expect(agg.total_assets).toBe(1_030_900_741);
    expect(agg.total_liabilities).toBe(932_149_689);

    // When equity is correctly resolved, balance identity must hold
    // 932,149,689 + 98,751,052 = 1,030,900,741 → 0% deviation → no violation
    expect(result.balanceViolation).toBeNull();
  });

  it("[GREEN stable] findByLabel also skips null-valued candidates on corporate paths", () => {
    /**
     * Generalizing beyond bank path: findByLabel must also skip null-valued candidates.
     * Scenario: a corporate report where a sub-section header matches the label pattern
     * but has value=null. The real total-liabilities row appears after it.
     *
     * This proves the null-skip is applied globally (corporate paths too), not just
     * bank equity.
     */
    const rows: AggregatorRow[] = [
      // Sub-section header: label matches "tổng tài sản" but value=null (section header)
      makeRow("200", "TỔNG CỘNG TÀI SẢN", null, 0, "general"),
      // Real total_assets row with value
      makeRow("280", "TỔNG CỘNG TÀI SẢN (280 = 100 + 200)", 68_586_095, 1, "general"),
      makeRow("300", "Nợ phải trả",  28_464_058, 1, "general"),
      makeRow("400", "Vốn chủ sở hữu", 40_122_037, 1, "general"),
      makeRow("10",  "Doanh thu thuần", 12_479_997, 1, "income_statement"),
      makeRow("20",  "Lợi nhuận gộp",    4_244_890, 1, "income_statement"),
      makeRow("50",  "Lợi nhuận trước thuế", 2_803_844, 1, "income_statement"),
      makeRow("60",  "Lợi nhuận sau thuế",   2_476_790, 1, "income_statement"),
    ];

    const result = aggregateScalars(rows);
    expect(result.scalars.total_assets).toBe(68_586_095);  // non-null row wins
    expect(result.balanceViolation).toBeNull();
  });
});

// ─── DV-FU6D-2: BLOCK-B — Roman code VIII/IX collision on bank path ──────────

describe("DV-FU6D-2 — BLOCK-B: bank path code VIII/IX must use labelHint to pick income rows (realistic ACB collision)", () => {
  it("[RED→GREEN] profit_before_tax resolves to 5,368,138 (not 147,029,433 from balance-sheet code VIII)", () => {
    /**
     * REALISTIC ACB ROW COLLISION (from QA report):
     *
     * Code "VIII" appears on TWO rows in the same "general" section:
     *   row A: code=VIII, label="Chứng khoán đầu tư",              value=147,029,433  (balance-sheet asset)
     *   row B: code=VIII, label="Lợi nhuận trước thuế",             value=5,368,138   (income-statement item)
     *
     * In ACB's actual BCTC PDF layout, the balance-sheet section appears first (lower row_order),
     * so row A is candidates[0] for findByCode(rows, "VIII"). Without a labelHint, the aggregator
     * picks row A → profit_before_tax = 147,029,433M (WRONG, is a balance-sheet asset).
     *
     * FIX (generalize from FU-6c code-I pattern):
     *   findByCode(rows, "VIII", P_BANK_PBT_HINT) where P_BANK_PBT_HINT = /lợi nhuận trước thuế/i
     *   → hinted candidates = [row B only] → picks row B → profit_before_tax = 5,368,138M (CORRECT)
     *
     * OLD result: profit_before_tax = 147,029,433 (wrong — balance-sheet asset row)
     * FIX result: profit_before_tax = 5,368,138   (correct — income-statement item)
     */
    const rows: AggregatorRow[] = [
      // ← These rows appear first in row_order (balance-sheet section)
      makeRow("I",    "Tiền mặt, vàng bạc, đá quý",                              8_157_465,     1),
      makeRow("VIII", "Chứng khoán đầu tư",                                     147_029_433,     1),  // ← code VIII collision: balance-sheet asset
      makeRow("IX",   "Góp vốn, đầu tư dài hạn",                                    74_311,     1),  // ← code IX collision: balance-sheet asset
      // Balance sheet totals
      makeRow(null,   "TỔNG TÀI SẢN",                                           1_030_900_741,   1),
      makeRow(null,   "TỔNG NỢ PHẢI TRẢ",                                         932_149_689,   1),
      makeRow("B",    "NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU",                         null,            0),  // null section header
      makeRow("VIII", "VỐN CHỦ SỞ HỮU",                                           98_751_052,   1),  // ← code VIII collision again: equity (picked last by row_order)
      // ← Income-statement rows appear later in row_order
      makeRow("I",    "Thu nhập lãi và các khoản thu nhập tương tự",              6_989_162,   1),  // income code I
      makeRow("VIII", "Lợi nhuận trước thuế",                                     5_368_138,   1),  // income code VIII (PBT) ← CORRECT pick
      makeRow("IX",   "Lợi nhuận sau thuế thu nhập doanh nghiệp",                4_320_388,   1),  // income code IX (net profit) ← CORRECT pick
    ];

    const result = aggregateScalars(rows);
    const agg = result.scalars;

    // BLOCK-B CORE ASSERTION (profit_before_tax):
    // OLD: findByCode(rows, "VIII") → "Chứng khoán đầu tư" = 147,029,433 (WRONG)
    // FIX: findByCode(rows, "VIII", P_BANK_PBT_HINT) → "Lợi nhuận trước thuế" = 5,368,138 (CORRECT)
    expect(agg.profit_before_tax).not.toBeNull();
    expect(agg.profit_before_tax).toBe(5_368_138);
    expect(agg.profit_before_tax).not.toBe(147_029_433);

    // net_revenue must be the income row via code I + labelHint (already fixed in FU-6c)
    expect(agg.net_revenue).toBe(6_989_162);
  });

  it("[RED→GREEN] net_profit resolves to 4,320,388 (not 74,311 from balance-sheet code IX)", () => {
    /**
     * REALISTIC ACB ROW COLLISION (from QA report):
     *
     * Code "IX" appears on TWO rows in the same "general" section:
     *   row A: code=IX, label="Góp vốn, đầu tư dài hạn",              value=74,311   (balance-sheet asset)
     *   row B: code=IX, label="Lợi nhuận sau thuế TNDN",              value=4,320,388 (income-statement)
     *
     * Without labelHint for code "IX", candidates[0] = row A → net_profit = 74,311M (WRONG).
     *
     * FIX: findByCode(rows, "IX", P_BANK_NET_PROFIT_HINT) where
     *   P_BANK_NET_PROFIT_HINT = /lợi nhuận sau thuế/i
     *
     * OLD result: net_profit = 74,311   (wrong — balance-sheet asset row)
     * FIX result: net_profit = 4,320,388 (correct — income-statement item)
     */
    const rows: AggregatorRow[] = [
      makeRow("I",    "Tiền mặt, vàng bạc, đá quý",                              8_157_465,   1),
      makeRow("VIII", "Chứng khoán đầu tư",                                     147_029_433,   1),  // code VIII balance sheet
      makeRow("IX",   "Góp vốn, đầu tư dài hạn",                                    74_311,   1),  // ← code IX balance-sheet asset (WRONG pick without hint)
      makeRow(null,   "TỔNG TÀI SẢN",                                           1_030_900_741, 1),
      makeRow(null,   "TỔNG NỢ PHẢI TRẢ",                                         932_149_689, 1),
      makeRow("B",    "NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU",                         null,          0),
      makeRow("VIII", "VỐN CHỦ SỞ HỮU",                                           98_751_052,  1),
      makeRow("I",    "Thu nhập lãi và các khoản thu nhập tương tự",              6_989_162,   1),
      makeRow("VIII", "Lợi nhuận trước thuế",                                     5_368_138,   1),
      makeRow("IX",   "Lợi nhuận sau thuế thu nhập doanh nghiệp",                4_320_388,   1),  // ← CORRECT code IX income row
    ];

    const result = aggregateScalars(rows);
    const agg = result.scalars;

    // BLOCK-B CORE ASSERTION (net_profit):
    // OLD: findByCode(rows, "IX") → "Góp vốn, đầu tư dài hạn" = 74,311 (WRONG)
    // FIX: findByCode(rows, "IX", P_BANK_NET_PROFIT_HINT) → "Lợi nhuận sau thuế..." = 4,320,388 (CORRECT)
    expect(agg.net_profit).not.toBeNull();
    expect(agg.net_profit).toBe(4_320_388);
    expect(agg.net_profit).not.toBe(74_311);
  });

  it("[RED→GREEN] full ACB fixture: all three income scalars correct simultaneously", () => {
    /**
     * Combined test: both BLOCK-A and BLOCK-B fixes active.
     * All three wrong picks must be corrected simultaneously:
     *   net_revenue: 6,989,162 (not 8,157,465)
     *   profit_before_tax: 5,368,138 (not 147,029,433)
     *   net_profit: 4,320,388 (not 74,311)
     *   equity_total: 98,751,052 (not null — BLOCK-A fix)
     *
     * This is the full realistic ACB fixture that mirrors the live BCTC rows.
     * Expected post-fix: balance identity 932,149,689 + 98,751,052 = 1,030,900,741 → 0% → PASS.
     */
    // REALISTIC ACB is_summary_row values:
    //   - Section-header rows (null value): is_summary_row=0
    //   - Real equity row (non-null): is_summary_row=0 (BLOCK-A: neither is summary, candidates[0] wins)
    //   - Total rows (TỔNG TÀI SẢN, TỔNG NỢ PHẢI TRẢ): is_summary_row=1
    //   - Income statement rows: is_summary_row=1
    //   - Balance sheet asset rows (Roman code collision): is_summary_row=0 or 1 (both tested)
    const rows: AggregatorRow[] = [
      // Balance-sheet asset rows (appear first — Roman codes also used here)
      makeRow("I",    "Tiền mặt, vàng bạc, đá quý",                              8_157_465,     0),  // is_summary_row=0
      makeRow("VIII", "Chứng khoán đầu tư",                                     147_029_433,     0),  // is_summary_row=0
      makeRow("IX",   "Góp vốn, đầu tư dài hạn",                                    74_311,     0),  // is_summary_row=0
      // Balance sheet totals
      makeRow(null,   "TỔNG TÀI SẢN",                                           1_030_900_741,   1),
      makeRow(null,   "TỔNG NỢ PHẢI TRẢ",                                         932_149_689,   1),
      makeRow("B",    "NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU",                         null,            0),  // null section header, is_summary_row=0 (BLOCK-A collision)
      makeRow("VIII", "VỐN CHỦ SỞ HỮU",                                           98_751_052,   0),  // is_summary_row=0 — same as null header; candidates[0] determines winner
      // Income statement rows (appear later — same Roman codes, is_summary_row=1)
      makeRow("I",    "Thu nhập lãi và các khoản thu nhập tương tự",              6_989_162,   1),
      makeRow("VIII", "Lợi nhuận trước thuế",                                     5_368_138,   1),
      makeRow("IX",   "Lợi nhuận sau thuế thu nhập doanh nghiệp",                4_320_388,   1),
    ];

    const result = aggregateScalars(rows);
    const agg = result.scalars;

    // All five key scalars must match live ACB expected values
    expect(agg.net_revenue).toBe(6_989_162);            // income code I + labelHint
    expect(agg.profit_before_tax).toBe(5_368_138);      // income code VIII + labelHint (FU-6d)
    expect(agg.net_profit).toBe(4_320_388);             // income code IX + labelHint (FU-6d)
    expect(agg.total_assets).toBe(1_030_900_741);
    expect(agg.total_liabilities).toBe(932_149_689);
    expect(agg.equity_total).toBe(98_751_052);          // BLOCK-A fix: null header skipped

    // No balance violation (0% deviation)
    expect(result.balanceViolation).toBeNull();

    // gross_profit is null for banks (no concept) — must NOT produce violation
    expect(agg.gross_profit).toBeNull();
    // gross_margin_pct also null (derived from null gross_profit)
    expect(agg.gross_margin_pct).toBeNull();
  });
});

// ─── DV-FU6D-3: BLOCK-C — enforceBalanceIdentity fails loud on null equity ──

describe("DV-FU6D-3 — BLOCK-C: enforceBalanceIdentity must return violation string when required scalar is null", () => {
  it("[RED→GREEN] null equity_total returns REQUIRED SCALARS UNRESOLVED violation (not null)", () => {
    /**
     * BLOCK-C scenario: equity_total resolves to null (e.g. when BLOCK-A fix is NOT yet
     * applied and the null section header wins the equity pick).
     *
     * Simulated here by constructing rows where NO valid equity row exists (so
     * findByLabelExcluding returns null for equity, producing equity_total=null
     * in the aggregate).
     *
     * OLD enforceBalanceIdentity behavior (line 294):
     *   if (total_assets === null || total_liabilities === null || equity_total === null)
     *     return null; ← FAIL-OPEN: null equity silently passes
     *
     * FIX behavior:
     *   if ({total_assets, total_liabilities, equity_total}.any === null)
     *     return "REQUIRED SCALARS UNRESOLVED: equity_total — balance identity cannot be verified"
     *
     * This makes the caller (finalizeBctcRefineTool line 410) log error + skip UPDATE,
     * leaving the stale value VISIBLE in logs rather than silently ignoring the failure.
     *
     * OLD result: balanceViolation = null  ← WRONG (fail-open, no log, stale persists silently)
     * FIX result: balanceViolation = "REQUIRED SCALARS UNRESOLVED: equity_total — ..." ← CORRECT
     */

    // Construct rows with NO valid equity row → equity_total resolves to null
    // Use a bank fixture where P_BANK_EQUITY matches only null-valued rows
    const rows: AggregatorRow[] = [
      makeRow(null,   "TỔNG TÀI SẢN",   1_030_900_741, 1),
      makeRow(null,   "TỔNG NỢ PHẢI TRẢ", 932_149_689, 1),
      // Only equity-matching rows have value=null → no valid equity pick
      makeRow("B",    "NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU", null, 0),
      makeRow("VIII", "VỐN CHỦ SỞ HỮU", null, 0),  // null equity row — no non-null alternative
      makeRow("I",    "Thu nhập lãi thuần", 6_989_162, 1),
    ];

    const result = aggregateScalars(rows);
    const agg = result.scalars;

    // Verify equity_total is indeed null (the setup creates the null-equity condition)
    expect(agg.equity_total).toBeNull();

    // BLOCK-C CORE ASSERTION:
    // OLD: balanceViolation = null (fail-open)
    // FIX: balanceViolation = non-null string identifying the missing required scalar
    expect(result.balanceViolation).not.toBeNull();
    expect(result.balanceViolation).toContain("REQUIRED SCALARS UNRESOLVED");
    expect(result.balanceViolation).toContain("equity_total");
    expect(result.balanceViolation).toContain("balance identity cannot be verified");
  });

  it("[RED→GREEN] null total_assets returns REQUIRED SCALARS UNRESOLVED violation", () => {
    /**
     * Same BLOCK-C logic applied to total_assets being null.
     * If total_assets cannot be resolved, balance identity cannot be verified.
     * Must fail loud.
     */
    const rows: AggregatorRow[] = [
      // No total_assets row at all
      makeRow("300", "Nợ phải trả",    28_464_058, 1, "general"),
      makeRow("400", "Vốn chủ sở hữu", 40_122_037, 1, "general"),
      makeRow("10",  "Doanh thu thuần", 12_479_997, 1, "income_statement"),
    ];

    const result = aggregateScalars(rows);

    expect(result.scalars.total_assets).toBeNull();
    expect(result.balanceViolation).not.toBeNull();
    expect(result.balanceViolation).toContain("REQUIRED SCALARS UNRESOLVED");
    expect(result.balanceViolation).toContain("total_assets");
  });

  it("[RED→GREEN] null total_liabilities returns REQUIRED SCALARS UNRESOLVED violation", () => {
    const rows: AggregatorRow[] = [
      makeRow(null,  "TỔNG TÀI SẢN",   1_030_900_741, 1),
      // No liabilities row
      makeRow("VIII", "VỐN CHỦ SỞ HỮU", 98_751_052, 1),
      makeRow("I",    "Thu nhập lãi thuần", 6_989_162, 1),
    ];

    const result = aggregateScalars(rows);

    expect(result.scalars.total_liabilities).toBeNull();
    expect(result.balanceViolation).not.toBeNull();
    expect(result.balanceViolation).toContain("REQUIRED SCALARS UNRESOLVED");
    expect(result.balanceViolation).toContain("total_liabilities");
  });

  it("[RED→GREEN] multiple nulls listed when balance sheet is partially present", () => {
    /**
     * When more than one required scalar is null AND at least one is non-null (balance
     * sheet partially present), all missing are listed in the violation string.
     * This aids debugging — one message reveals all gaps, not just the first.
     *
     * Semantics: ALL three null = balance sheet structurally absent → no violation (skip).
     * AT LEAST ONE non-null + others null = resolution failure → REQUIRED SCALARS UNRESOLVED.
     *
     * This test uses total_assets present (non-null) but liabilities AND equity absent.
     * This is the "partial balance sheet" scenario (e.g., only the asset total extracted,
     * liabilities and equity section failed to parse).
     */
    const rows: AggregatorRow[] = [
      makeRow("280", "TỔNG CỘNG TÀI SẢN", 68_586_095, 1, "general"),  // ← total_assets present
      // total_liabilities and equity_total absent → resolution failure for both
      makeRow("10", "Doanh thu thuần", 12_479_997, 1, "income_statement"),
    ];

    const result = aggregateScalars(rows);

    expect(result.scalars.total_assets).not.toBeNull();      // present
    expect(result.scalars.total_liabilities).toBeNull();     // absent
    expect(result.scalars.equity_total).toBeNull();          // absent

    // Balance sheet partially present → REQUIRED SCALARS UNRESOLVED for the missing ones
    expect(result.balanceViolation).not.toBeNull();
    expect(result.balanceViolation).toContain("REQUIRED SCALARS UNRESOLVED");
    expect(result.balanceViolation).toContain("total_liabilities");
    expect(result.balanceViolation).toContain("equity_total");
    // total_assets is non-null → should NOT appear in the missing list
    expect(result.balanceViolation).not.toContain("total_assets");
  });

  it("[GREEN stable] income-only report with all three balance scalars absent → no violation (structural absence)", () => {
    /**
     * ANTI-FALSE-TRIGGER: An income-statement-only report (no balance sheet rows)
     * legitimately has total_assets=null AND total_liabilities=null AND equity_total=null.
     * This is NOT a resolution failure — the balance sheet is simply absent.
     * The enforceBalanceIdentity check must be skipped (return null, no violation).
     *
     * This is the DV-FU5-3 scenario — preserved here to confirm the refined BLOCK-C
     * semantics (all-three-null = structural absence ≠ resolution failure).
     */
    const rows: AggregatorRow[] = [
      makeRow("10", "Doanh thu thuần", 12_479_997, 1, "income_statement"),
      makeRow("20", "Lợi nhuận gộp",    4_244_890, 1, "income_statement"),
      makeRow("50", "Lợi nhuận trước thuế", 2_803_844, 1, "income_statement"),
      makeRow("60", "Lợi nhuận sau thuế",   2_476_790, 1, "income_statement"),
      // No balance sheet rows at all → all three balance scalars null
    ];

    const result = aggregateScalars(rows);

    expect(result.scalars.total_assets).toBeNull();
    expect(result.scalars.total_liabilities).toBeNull();
    expect(result.scalars.equity_total).toBeNull();

    // ALL three absent = balance sheet structurally absent → no violation
    expect(result.balanceViolation).toBeNull();
  });
});

// ─── DV-FU6D-4: NEGATIVE TEST — legitimately-absent bank fields do NOT trigger ─

describe("DV-FU6D-4 — NEGATIVE: legitimately-absent bank fields must NOT trigger required-scalar violation", () => {
  it("[GREEN stable] bank gross_profit=null and current_assets=null do NOT cause violation when balance triad is complete", () => {
    /**
     * CRITICAL ANTI-FALSE-TRIGGER TEST:
     *   Banks (Mẫu B02-TCTD) have NO gross profit concept (no COGS subtraction).
     *   Banks also have no current_assets line item (different balance sheet structure).
     *   These are structurally absent — not resolution failures.
     *
     *   If the BLOCK-C fix is over-broad and treats ALL null scalars as violations,
     *   it would break every bank report. This test proves it does NOT.
     *
     * Required set for balance identity: {total_assets, total_liabilities, equity_total}
     * NOT required:                      {gross_profit, current_assets, gross_margin_pct}
     *
     * A complete bank report with all three required scalars resolved, but gross_profit
     * and current_assets null, must produce balanceViolation=null (no violation).
     */
    const rows: AggregatorRow[] = [
      // Complete balance sheet triad
      makeRow(null,   "TỔNG TÀI SẢN",   1_030_900_741, 1),
      makeRow(null,   "TỔNG NỢ PHẢI TRẢ", 932_149_689, 1),
      makeRow("VIII", "VỐN CHỦ SỞ HỮU",   98_751_052, 1),
      // Income items (no gross_profit, no current_assets — structurally absent for banks)
      makeRow("I",    "Thu nhập lãi và các khoản thu nhập tương tự", 6_989_162, 1),
      makeRow("VIII", "Lợi nhuận trước thuế",                         5_368_138, 1),
      makeRow("IX",   "Lợi nhuận sau thuế TNDN",                      4_320_388, 1),
    ];

    const result = aggregateScalars(rows);
    const agg = result.scalars;

    // Confirm the legitimately-absent fields are null
    expect(agg.gross_profit).toBeNull();      // structurally absent for banks
    expect(agg.current_assets).toBeNull();    // structurally absent for banks
    expect(agg.gross_margin_pct).toBeNull();  // derived from null gross_profit

    // The required balance triad is complete → NO violation
    expect(agg.total_assets).toBe(1_030_900_741);
    expect(agg.total_liabilities).toBe(932_149_689);
    expect(agg.equity_total).toBe(98_751_052);

    // CORE ASSERTION: no violation despite gross_profit/current_assets being null
    expect(result.balanceViolation).toBeNull();

    // Income scalars correct too
    expect(agg.net_revenue).toBe(6_989_162);
    expect(agg.profit_before_tax).toBe(5_368_138);
    expect(agg.net_profit).toBe(4_320_388);
  });

  it("[GREEN stable] corporate report with null current_assets does NOT trigger violation when triad complete", () => {
    /**
     * Corporate holding companies sometimes omit current_assets as a separate line item.
     * This must NOT trigger the required-scalar violation.
     */
    const rows: AggregatorRow[] = [
      makeRow("10",  "Doanh thu thuần",        12_479_997, 1, "income_statement"),
      makeRow("20",  "Lợi nhuận gộp",           4_244_890, 1, "income_statement"),
      makeRow("50",  "Lợi nhuận trước thuế",    2_803_844, 1, "income_statement"),
      makeRow("60",  "Lợi nhuận sau thuế",      2_476_790, 1, "income_statement"),
      makeRow("280", "TỔNG CỘNG TÀI SẢN",      68_586_095, 1, "general"),
      // No current_assets row (code "100" absent)
      makeRow("300", "Nợ phải trả",             28_464_058, 1, "general"),
      makeRow("400", "Vốn chủ sở hữu",          40_122_037, 1, "general"),
    ];

    const result = aggregateScalars(rows);

    expect(result.scalars.current_assets).toBeNull();    // absent — not a violation
    expect(result.scalars.total_assets).toBe(68_586_095);
    expect(result.scalars.total_liabilities).toBe(28_464_058);
    expect(result.scalars.equity_total).toBe(40_122_037);
    expect(result.balanceViolation).toBeNull();  // balance holds, current_assets absence is fine
  });
});
