/**
 * FIX-BCTC-NONBANK-OPERATING-PROFIT-EBITDA-SCALAR-ZERO-HPG DV tests
 *
 * RAW-verified root cause (live gateway get_bctc_full, HPG 2026-Q1,
 * report_id=553fd194-024f-4266-bb64-891a73b221e4, refine_status=PARTIAL):
 *   operating_profit=0, ebitda=0, operating_cf=0 while profit_before_tax=
 *   10,762,183,839,545 and net_profit=9,055,918,200,023 are correctly populated.
 *   The corpus's 282 bctc_table_rows are 233 "general" / 33 "income_statement"
 *   (footnote/segment rows only — no primary P&L codes) / 16 "balance_sheet" /
 *   ZERO "cash_flow". The markdown-refine window never matched a SECTION_HEADERS
 *   pattern (refinedMarkdownParser.ts) for the primary 3-statement table, so BOTH
 *   the income statement AND the cash-flow statement rows landed in the SAME
 *   "general" bucket — and several VAS codes (20/30/40) are independently reused
 *   by both statements, so a bare code lookup collides.
 *
 * Three compounding defects (all fixed here):
 *   1. bctcScalarAggregator.ts: section-filtered lookups (income_statement/
 *      cash_flow only) never fall back to "general", so operating_profit/
 *      ebitda/operating_cf/investing_cf/financing_cf all resolve to null even
 *      though the real values ARE present in the row set.
 *   2. bctcSectionCompleteness.ts: hasCashFlow required a row explicitly tagged
 *      "cash_flow" — never true for this window shape — so the completeness
 *      gate permanently blocks aggregateScalars from ever running for this report
 *      (refine_status stuck at PARTIAL).
 *   3. backfillBctcScalarsTool.ts: force_reflow's eligibility WHERE clause only
 *      covered refine_status IN ('PENDING','DONE') — PARTIAL reports (exactly
 *      what defect #2 produces) were PERMANENTLY excluded from every reflow
 *      attempt, even after a mapping/gate fix that would let them pass on retry.
 *
 * Anti-false-green: fixture rows below are the REAL live HPG 2026-Q1 values
 * (RAW-verified via docker exec bun:sqlite against the live named-volume DB,
 * 2026-08-12), not invented numbers — this reproduces the exact live defect.
 *
 * AC-5 regression: a SECOND, unrelated non-bank ticker with the identical
 * "everything landed in general" malformation proves the fix is not HPG-specific.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  aggregateScalars,
} from "../domain/services/financial-reports/bctcScalarAggregator.js";
import type { AggregatorRow } from "../domain/services/financial-reports/bctcScalarAggregator.js";
import { checkSectionCompleteness } from "../domain/services/financial-reports/bctcSectionCompleteness.js";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { buildBackfillBctcScalarsHandler } from "../interface/mcp/tools/financial-reports/backfillBctcScalarsTool.js";

// ── Fixture builders ─────────────────────────────────────────────────────────

/**
 * hpgShapedGeneralOnlyRows — mirrors the live HPG 2026-Q1 bctc_table_rows shape:
 * primary income-statement AND cash-flow-statement rows both tagged "general"
 * (the section-header detector never fired for this window), with genuinely
 * duplicated VAS codes (20/30/40) between the two statements. Values are the
 * REAL live figures (RAW-verified, 2026-08-12).
 */
function hpgShapedGeneralOnlyRows(): AggregatorRow[] {
  return [
    // income-statement block (tagged "general" — the defect)
    { code: "10", label: "Doanh thu thuan",                        value_current: 52_900_847_302_653,  statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "20", label: "Loi nhuan gop",                           value_current:  8_365_068_607_995,  statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "30", label: "Loi nhuan thuc",                          value_current: 10_704_033_503_572,  statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "50", label: "Loi nhuan truoc thue",                    value_current: 10_762_183_839_545,  statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "60", label: "Loi nhuan sau thue",                      value_current:  9_055_918_200_023,  statement_section: "general", is_summary_row: 0, unit: "vnd" },
    // cash-flow block (ALSO tagged "general" — same window, immediately follows
    // the income-statement block; codes 20/30/40 collide with rows above)
    { code: "02", label: "Khau hao va phan bo",                     value_current:  2_854_213_903_270,  statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "20", label: "Luu chuyen tien tu hoat dong kinh doanh",  value_current:  6_816_755_450_021,  statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "21", label: "Chi mua tai san co dinh",                 value_current: -5_489_839_982_929,  statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "30", label: "Luu chuyen tien tu hoat dong dau tu",     value_current: -2_921_294_017_214,  statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "40", label: "Luu chuyen tu hoat dong tai chinh",       value_current:   -767_794_471_020,  statement_section: "general", is_summary_row: 0, unit: "vnd" }, // OCR drops "tiền" from this label — must still resolve via broad last-resort
    // balance sheet (tagged "general" — the existing legacy convention)
    { code: "100", label: "Tai san ngan han",                       value_current: 11_455_231_038_505,  statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "110", label: "Tien va cac khoan tuong duong tien",     value_current:  3_614_809_922_085,  statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "280", label: "TONG CONG TAI SAN",                      value_current: 259_327_500_205_228, statement_section: "general", is_summary_row: 1, unit: "vnd" },
    { code: "300", label: "NO PHAI TRA",                            value_current: 119_545_707_998_756, statement_section: "general", is_summary_row: 1, unit: "vnd" },
    { code: "400", label: "VON CHU SO HUU",                         value_current: 139_781_792_206_472, statement_section: "general", is_summary_row: 1, unit: "vnd" },
    // genuine income_statement-tagged footnote row (mirrors live HPG: 33 rows
    // tagged income_statement, all footnote/segment breakdowns — no primary
    // P&L code among them — this is why hasIncomeStatement was ALREADY true
    // live even though the corrupt-zero defect fired; only hasCashFlow was false)
    { code: null, label: "Ban hang",                                value_current: 52_748_189_096_949,  statement_section: "income_statement", is_summary_row: 0, unit: "vnd" },
  ];
}

/**
 * secondTickerGeneralOnlyRows — AC-5: a SECOND, unrelated non-bank ticker with
 * the identical "everything general" malformation, synthetic values (not a real
 * company's filing) — proves the fix generalizes beyond HPG's specific numbers.
 */
function secondTickerGeneralOnlyRows(): AggregatorRow[] {
  return [
    { code: "10", label: "Doanh thu thuan",                        value_current: 9_000_000_000_000, statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "20", label: "Loi nhuan gop",                           value_current: 1_800_000_000_000, statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "30", label: "Loi nhuan thuan tu HDKD",                 value_current:   900_000_000_000, statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "50", label: "Loi nhuan truoc thue",                    value_current:   950_000_000_000, statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "60", label: "Loi nhuan sau thue",                      value_current:   760_000_000_000, statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "02", label: "Khau hao va phan bo",                     value_current:   150_000_000_000, statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "20", label: "Luu chuyen tien tu hoat dong kinh doanh",  value_current:   500_000_000_000, statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "30", label: "Luu chuyen tien tu hoat dong dau tu",     value_current:  -300_000_000_000, statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "40", label: "Luu chuyen tien tu hoat dong tai chinh",  value_current:  -100_000_000_000, statement_section: "general", is_summary_row: 0, unit: "vnd" },
    { code: "280", label: "TONG CONG TAI SAN",                      value_current: 20_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
    { code: "300", label: "NO PHAI TRA",                            value_current: 12_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
    { code: "400", label: "VON CHU SO HUU",                         value_current:  8_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
    { code: null,  label: "Ghi chu doanh thu",                      value_current:  9_000_000_000_000, statement_section: "income_statement", is_summary_row: 0, unit: "vnd" },
  ];
}

// ── AC-1/AC-2: aggregateScalars general-bucket fallback ─────────────────────

describe("FIX-BCTC-NONBANK-OPERATING-PROFIT-EBITDA-SCALAR-ZERO-HPG — aggregator general-bucket fallback", () => {
  it("RED→GREEN: HPG-shaped 'everything general' rows resolve operating_profit/ebitda/CF fields (were null/corrupt-zero before this fix)", () => {
    const result = aggregateScalars(hpgShapedGeneralOnlyRows());
    expect(result.balanceViolation).toBeNull();
    const agg = result.scalars;

    // AC-1: operating_profit must be non-zero and consistent with the served P&L
    // (bracketed by gross_profit=8,365,068 M VND and profit_before_tax=10,762,183 M VND —
    // all scalars here are already in million VND, per aggregateScalars's unit convention)
    expect(agg.operating_profit).not.toBeNull();
    expect(agg.operating_profit).toBeGreaterThan(0);
    expect(agg.operating_profit!).toBeGreaterThan(10_000_000); // > 10,000,000 M VND (~10,000 tỷ)
    expect(agg.operating_profit!).toBeLessThan(agg.profit_before_tax!); // < profit_before_tax

    // AC-2: EBITDA and operating_cf must no longer be hard 0
    expect(agg.ebitda).not.toBeNull();
    expect(agg.ebitda).toBeGreaterThan(agg.operating_profit!); // EBITDA > EBIT (D&A adds back)
    expect(agg.operating_cf).not.toBeNull();
    expect(agg.operating_cf).not.toBe(0);
    expect(agg.operating_cf).toBeGreaterThan(0); // HPG's real operating CF is positive this quarter

    // investing_cf / financing_cf / capex must also resolve (not corrupt-zero, not null)
    expect(agg.investing_cf).not.toBeNull();
    expect(agg.investing_cf).toBeLessThan(0);
    expect(agg.financing_cf).not.toBeNull();
    expect(agg.financing_cf).toBeLessThan(0);
    expect(agg.capex).not.toBeNull();
    expect(agg.capex).toBeLessThan(0);

    // Untouched original scalars must remain correct (regression guard)
    expect(agg.net_revenue).not.toBeNull();
    expect(agg.profit_before_tax).not.toBeNull();
    expect(agg.net_profit).not.toBeNull();
  });

  it("collision proof: operating_profit (income-statement code 30, positive) is never confused with investing_cf (cash-flow code 30, negative)", () => {
    const result = aggregateScalars(hpgShapedGeneralOnlyRows());
    expect(result.scalars.operating_profit).toBeGreaterThan(0);
    expect(result.scalars.investing_cf).toBeLessThan(0);
    // The two candidates for code "30" in the fixture are ~10.7T (positive) and
    // ~-2.9T (negative) — confirms the label-based exclude/include disambiguation
    // picked the correct candidate for each field, not just "whichever came first".
    expect(result.scalars.operating_profit).not.toBeCloseTo(result.scalars.investing_cf!, -6);
  });

  it("regression: correctly-tagged reports (properly sectioned) are unaffected by the general-bucket fallback — fallback branch never fires", () => {
    // Properly-tagged rows: no "general"-bucket collision possible, primary
    // section-filtered lookups already succeed — the new fallback code must
    // never override an already-correct resolution.
    const rows: AggregatorRow[] = [
      { code: "10", label: "Doanh thu thuần",                              value_current: 20_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "20", label: "Lợi nhuận gộp",                                value_current:  4_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "30", label: "Lợi nhuận thuần từ hoạt động kinh doanh",      value_current:  2_500_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "60", label: "Lợi nhuận sau thuế",                           value_current:  2_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "280", label: "TỔNG CỘNG TÀI SẢN",                          value_current: 30_000_000_000_000, statement_section: "general",           is_summary_row: 1, unit: "vnd" },
      { code: "300", label: "NỢ PHẢI TRẢ",                                 value_current: 18_000_000_000_000, statement_section: "general",           is_summary_row: 1, unit: "vnd" },
      { code: "400", label: "VỐN CHỦ SỞ HỮU",                              value_current: 12_000_000_000_000, statement_section: "general",           is_summary_row: 1, unit: "vnd" },
      { code: "20", label: "Lưu chuyển tiền thuần từ hoạt động kinh doanh", value_current:  1_200_000_000_000, statement_section: "cash_flow",         is_summary_row: 1, unit: "vnd" },
    ];
    const result = aggregateScalars(rows);
    expect(result.scalars.operating_profit).toBe(2_500_000); // 2.5T raw VND / 1e6 = 2,500,000M
    expect(result.scalars.operating_cf).toBe(1_200_000); // from the properly-tagged cash_flow row, not general
  });
});

// ── AC-4: plausibility guard (inverse case — a genuine ZERO that must be rejected) ──

describe("FIX-BCTC-NONBANK-OPERATING-PROFIT-EBITDA-SCALAR-ZERO-HPG — AC-4 plausibility guard", () => {
  it("net_profit > gross_profit AND operating_profit resolves to a literal 0 → rejected to null (not served as a real value)", () => {
    const rows: AggregatorRow[] = [
      { code: "10", label: "Doanh thu thuần",                    value_current: 1_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "20", label: "Lợi nhuận gộp",                      value_current:   100_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      // Genuinely present, correctly-sectioned, but a corrupt-zero source value —
      // no general-bucket fallback can ever recover this (it's already the
      // primary-section match).
      { code: "30", label: "Lợi nhuận thuần từ hoạt động kinh doanh", value_current: 0, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "60", label: "Lợi nhuận sau thuế",                 value_current:   150_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" }, // net_profit(150B) > gross_profit(100B)
      { code: "280", label: "TỔNG CỘNG TÀI SẢN",                value_current: 5_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
      { code: "300", label: "NỢ PHẢI TRẢ",                       value_current: 3_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
      { code: "400", label: "VỐN CHỦ SỞ HỮU",                    value_current: 2_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
    ];
    const result = aggregateScalars(rows);
    expect(result.scalars.net_profit).toBeGreaterThan(result.scalars.gross_profit!);
    // The guard converts the corrupt zero to null — an honest gap, not a fabricated number.
    expect(result.scalars.operating_profit).toBeNull();
  });

  it("negative control: net_profit <= gross_profit AND operating_profit==0 → guard does NOT fire (0 preserved as a plausible value)", () => {
    const rows: AggregatorRow[] = [
      { code: "10", label: "Doanh thu thuần",                    value_current: 1_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "20", label: "Lợi nhuận gộp",                      value_current:   300_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "30", label: "Lợi nhuận thuần từ hoạt động kinh doanh", value_current: 0, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "60", label: "Lợi nhuận sau thuế",                 value_current:   100_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" }, // net_profit(100B) < gross_profit(300B) — plausible
      { code: "280", label: "TỔNG CỘNG TÀI SẢN",                value_current: 5_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
      { code: "300", label: "NỢ PHẢI TRẢ",                       value_current: 3_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
      { code: "400", label: "VỐN CHỦ SỞ HỮU",                    value_current: 2_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
    ];
    const result = aggregateScalars(rows);
    expect(result.scalars.net_profit).toBeLessThan(result.scalars.gross_profit!);
    expect(result.scalars.operating_profit).toBe(0); // preserved — guard precondition not met
  });
});

// ── AC-5: regression on a second non-bank ticker (proves the fix is not HPG-specific) ──

describe("FIX-BCTC-NONBANK-OPERATING-PROFIT-EBITDA-SCALAR-ZERO-HPG — AC-5 second-ticker regression", () => {
  it("a second, unrelated non-bank ticker with the same 'everything general' shape also resolves correctly", () => {
    const result = aggregateScalars(secondTickerGeneralOnlyRows());
    expect(result.balanceViolation).toBeNull();
    expect(result.scalars.operating_profit).toBe(900_000); // 900B raw VND / 1e6 = 900,000M
    expect(result.scalars.ebitda).toBe(1_050_000); // 900,000 + 150,000 (D&A)
    expect(result.scalars.operating_cf).toBe(500_000);
    expect(result.scalars.investing_cf).toBe(-300_000);
    expect(result.scalars.financing_cf).toBe(-100_000);
  });

  it("checkSectionCompleteness: second ticker's 'everything general' shape also now completes (hasCashFlow no longer permanently false)", () => {
    const result = checkSectionCompleteness(secondTickerGeneralOnlyRows());
    expect(result.hasCashFlow).toBe(true);
    expect(result.isComplete).toBe(true);
  });
});

// ── AC-3 dependency / end-to-end reflow: checkSectionCompleteness + backfill eligibility ──

describe("FIX-BCTC-NONBANK-OPERATING-PROFIT-EBITDA-SCALAR-ZERO-HPG — checkSectionCompleteness general-bucket cash-flow signal", () => {
  it("HPG-shaped 'everything general' rows → hasCashFlow=true, isComplete=true (was permanently false before this fix)", () => {
    const result = checkSectionCompleteness(hpgShapedGeneralOnlyRows());
    expect(result.hasBalanceSheet).toBe(true);
    expect(result.hasIncomeStatement).toBe(true);
    expect(result.hasCashFlow).toBe(true);
    expect(result.isComplete).toBe(true);
  });

  it("negative control: genuinely CF-absent 'general' rows → hasCashFlow stays false (extension does not over-claim completeness)", () => {
    const rows: AggregatorRow[] = [
      { code: "100", label: "A. TÀI SẢN NGẮN HẠN", value_current: 41_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
      { code: "280", label: "TỔNG CỘNG TÀI SẢN",    value_current: 88_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
      { code: "300", label: "C. NỢ PHẢI TRẢ",        value_current: 47_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
      { code: "400", label: "D. VỐN CHỦ SỞ HỮU",     value_current: 41_000_000_000_000, statement_section: "general", is_summary_row: 1, unit: "vnd" },
      { code: "10",  label: "Doanh thu thuần",       value_current: 20_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
    ];
    const result = checkSectionCompleteness(rows);
    expect(result.hasBalanceSheet).toBe(true);
    expect(result.hasIncomeStatement).toBe(true);
    expect(result.hasCashFlow).toBe(false);
    expect(result.isComplete).toBe(false);
  });
});

// ── End-to-end reflow: PARTIAL report becomes eligible + resolves correctly ──

function openTestDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  return db;
}

const HPG_LIKE_REPORT_ID = "553fd194-024f-4266-bb64-891a73b221e5"; // mirrors live HPG report_id (last hex digit changed to avoid literal DB collision)

function insertPartialReportWithCorruptZeroScalars(db: Database): string {
  db.run(`
    INSERT INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_quarter, period_type, period_start, period_end, sort_key,
       net_revenue, gross_profit, operating_profit, ebitda, profit_before_tax, net_profit, operating_cf,
       refine_status, confirm_status, audit_status, extraction_confidence, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, 'HPGX', 'HPG-like Corp', 'HOSE', 'other',
            2026, 1, 'Q1', '2026-01-01', '2026-03-31', '2026-Q1',
            52900847.302653, 8365068.607995, 0, 0, 10762183.839545, 9055918.200023, 0,
            'PARTIAL', 'PENDING', 'unaudited', 0.8, datetime('now'),
            '{}', '{}', '{}', '{}')
  `, [HPG_LIKE_REPORT_ID]);
  return HPG_LIKE_REPORT_ID;
}

function insertHpgShapedTableRows(db: Database, reportId: string): void {
  const rows = hpgShapedGeneralOnlyRows();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    db.run(`
      INSERT INTO bctc_table_rows
        (report_id, page_number, statement_section, row_order, code, label,
         period_current, value_current, unit, is_summary_row)
      VALUES (?, 1, ?, ?, ?, ?, '2026-Q1', ?, 'vnd', ?)
    `, [reportId, r.statement_section, i, r.code, r.label, r.value_current, r.is_summary_row]);
  }
}

describe("FIX-BCTC-NONBANK-OPERATING-PROFIT-EBITDA-SCALAR-ZERO-HPG — end-to-end reflow (backfill_bctc_scalars)", () => {
  it("regression: PARTIAL report stays excluded WITHOUT force_reflow (unchanged default behavior)", async () => {
    const db = openTestDb();
    const reportId = insertPartialReportWithCorruptZeroScalars(db);
    insertHpgShapedTableRows(db, reportId);

    const handler = buildBackfillBctcScalarsHandler(db);
    // Without force_reflow, PARTIAL is (and always was) excluded — unchanged behavior.
    const result = await handler({ dry_run: false, report_id: reportId });
    const body = JSON.parse(result.content[0].text);
    expect(body.summary.done).toBe(0);
    expect(body.summary.skipped).toBe(0); // excluded by WHERE clause before reaching any per-row logic
    const row = db.query<{ operating_profit: number; refine_status: string }, [string]>(
      "SELECT operating_profit, refine_status FROM financial_reports WHERE id = ?",
    ).get(reportId);
    expect(row?.operating_profit).toBe(0); // still corrupt — untouched
    expect(row?.refine_status).toBe("PARTIAL");
  });

  it("GREEN: force_reflow=true now includes PARTIAL reports — completeness gate passes → aggregation runs → correct scalars written, refine_status=DONE", async () => {
    const db = openTestDb();
    const reportId = insertPartialReportWithCorruptZeroScalars(db);
    insertHpgShapedTableRows(db, reportId);

    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ dry_run: false, report_id: reportId, force_reflow: true });
    const body = JSON.parse(result.content[0].text);

    expect(body.ok).toBe(true);
    expect(body.summary.done).toBe(1);
    expect(body.summary.skipped).toBe(0);

    const postRow = db.query<{
      refine_status: string;
      operating_profit: number;
      ebitda: number;
      operating_cf: number;
    }, [string]>(
      "SELECT refine_status, operating_profit, ebitda, operating_cf FROM financial_reports WHERE id = ?",
    ).get(reportId);

    // AC-1 / AC-3 dependency: refine_status must transition PARTIAL → DONE
    expect(postRow?.refine_status).toBe("DONE");
    // AC-1: operating_profit non-zero, consistent with the served P&L
    expect(postRow?.operating_profit).toBeGreaterThan(0);
    // AC-2: EBITDA / operating_cf no longer hard 0
    expect(postRow?.ebitda).toBeGreaterThan(0);
    expect(postRow?.operating_cf).not.toBe(0);
  });
});
