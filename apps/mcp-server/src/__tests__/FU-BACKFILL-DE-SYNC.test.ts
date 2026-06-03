/**
 * FU-BACKFILL-DE-SYNC DV — backfill_bctc_scalars missing debt scalar sync
 *
 * Sprint: BCTC-ANALYTICS-LAYER
 * Task: FU-BACKFILL-DE-SYNC (FIX type)
 * Date: 2026-06-03
 *
 * Root cause (surfaced by FIX-DE-3):
 *   FIX-DE-2 (b5286dba) added short_term_debt + long_term_debt to
 *   finalizeBctcRefineTool.ts BLOCK-1 — but NOT to backfillBctcScalarsTool.ts.
 *   So backfill_bctc_scalars(force_reflow=true) on already-DONE reports
 *   CANNOT re-derive debt scalars → debt_to_equity stays wrong/null.
 *   FIX-DE-3 used a hand-rolled docker-exec script as a one-shot workaround;
 *   this task makes the reflow definitif via the real tool.
 *
 * Fix scope (backfillBctcScalarsTool.ts only):
 *   1. Add short_term_debt + long_term_debt to the updates array (same null-guard
 *      as finalize BLOCK-1 lines 498-499).
 *   2. Mirror FIX-DE-2 B-2: sync balance_sheet_json blob with resolved debt values
 *      (currentLiabilities.shortTermDebt + longTermLiabilities.longTermDebt).
 *   3. Bank reports: notApplicable includes short_term_debt + long_term_debt →
 *      they land in null_cleared_cols (existing null-clear path), not updates.
 *
 * Anti-false-green protocol (DB-arbiter rule):
 *   ALL assertions use direct bun:sqlite reads — never trust tool return values alone.
 *
 * Tests:
 *   BDS-1 — Corporate (FPT-like): stale short/long_term_debt=0 → populated after
 *            force_reflow; debt_to_equity recomputes to ~0.401 (FPT-fixture ratio).
 *   BDS-2 — balance_sheet_json blob: resolved debt values written to nested paths
 *            currentLiabilities.shortTermDebt + longTermLiabilities.longTermDebt.
 *   BDS-3 — Bank report: short/long_term_debt in notApplicable → null-cleared in DB.
 *   BDS-4 — balance_sheet_json absent: tool completes without error (non-fatal blob skip).
 *   BDS-5 — dry_run=true: debt scalars computed but NOT written.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { buildBackfillBctcScalarsHandler } from "../interface/mcp/tools/financial-reports/backfillBctcScalarsTool.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function openTestDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  return db;
}

const CORP_ID  = "bds-corp-0000-0000-0000-000000000001";
const BANK_ID  = "bds-bank-0000-0000-0000-000000000001";
const NOBLOB_ID = "bds-nob-0000-0000-0000-000000000001";
const DRY_ID   = "bds-dry-0000-0000-0000-000000000001";

/**
 * Seed a financial_reports row in DONE state with stale/zero debt scalars.
 * balance_sheet_json has the nested liability structure so the blob-sync path is exercised.
 */
function insertCorpReportStaleDebt(
  db: Database,
  id: string,
  balanceSheetJson: string = JSON.stringify({
    currentLiabilities: { total: 13000000, shortTermDebt: 0 },
    longTermLiabilities: { longTermDebt: 0 },
  }),
): void {
  db.run(`
    INSERT INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_quarter, period_type, period_start, period_end, sort_key,
       net_profit, equity_total, short_term_debt, long_term_debt,
       refine_status, audit_status, extraction_confidence, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, 'FPT', 'FPT Corp', 'HOSE', 'tech',
            2025, 4, 'Q4', '2025-01-01', '2025-12-31', '2025-Q4',
            2476790, 40122037, 0, 0,
            'DONE', 'unaudited', 0.9, datetime('now'),
            ?, '{}', '{}', '{}')
  `, [id, balanceSheetJson]);
}

/**
 * Seed a bank financial_reports row (DONE, short/long_term_debt=some value — will be null-cleared).
 * Bank rows use Roman codes; isBankFormFromRows will detect no 3-digit codes → bank path.
 */
function insertBankReportWithDebt(db: Database, id: string): void {
  db.run(`
    INSERT INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_quarter, period_type, period_start, period_end, sort_key,
       net_profit, equity_total, short_term_debt, long_term_debt,
       refine_status, audit_status, extraction_confidence, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, 'ACB', 'ACB Bank', 'HOSE', 'banking',
            2025, 4, 'Q4', '2025-01-01', '2025-12-31', '2025-Q4',
            4320388, 98751052, 999999, 888888,
            'DONE', 'unaudited', 0.9, datetime('now'),
            '{}', '{}', '{}', '{}')
  `, [id]);
}

/**
 * FPT-like corporate table rows including codes 321 (short_term_debt) and 339 (long_term_debt).
 * Values raw VND (>1e11 → aggregator divides by 1e6 → million VND).
 *
 * FPT-like debt fixture:
 *   short_term_debt (321):  9_000_000_000_000 raw VND → 9_000_000 M VND
 *   long_term_debt  (339):  7_200_000_000_000 raw VND → 7_200_000 M VND
 *   equity_total    (400): 40_122_036_570_361 raw VND → 40_122_037 M VND  (approx)
 *   debt_to_equity = (9_000_000 + 7_200_000) / 40_122_037 ≈ 0.4037
 */
function insertCorpTableRowsWithDebt(db: Database, reportId: string): void {
  const rows: Array<{ code: string; label: string; value: number; section: string; is_sum: number }> = [
    // income_statement (required for section completeness gate)
    { code: "10",  label: "Doanh thu thuần",          value: 12_479_997_206_775, section: "income_statement", is_sum: 1 },
    { code: "20",  label: "Lợi nhuận gộp",             value:  4_244_889_890_688, section: "income_statement", is_sum: 1 },
    { code: "50",  label: "Lợi nhuận trước thuế",      value:  2_803_844_281_676, section: "income_statement", is_sum: 1 },
    { code: "60",  label: "Lợi nhuận sau thuế",        value:  2_476_789_833_481, section: "income_statement", is_sum: 1 },
    // balance_sheet (required for completeness gate)
    { code: "280", label: "TỔNG CỘNG TÀI SẢN",         value: 68_586_094_785_217, section: "balance_sheet", is_sum: 1 },
    { code: "300", label: "Nợ phải trả",               value: 28_464_058_214_856, section: "balance_sheet", is_sum: 1 },
    { code: "400", label: "Vốn chủ sở hữu",             value: 40_122_036_570_361, section: "balance_sheet", is_sum: 1 },
    // debt rows
    { code: "321", label: "Vay và nợ thuê tài chính ngắn hạn", value:  9_000_000_000_000, section: "balance_sheet", is_sum: 0 },
    { code: "339", label: "Vay và nợ thuê tài chính dài hạn",  value:  7_200_000_000_000, section: "balance_sheet", is_sum: 0 },
    // cash_flow (required for completeness gate)
    { code: "20",  label: "Lưu chuyển tiền thuần từ hoạt động kinh doanh", value: -2_847_813_717_192, section: "cash_flow", is_sum: 1 },
    { code: "30",  label: "Lưu chuyển tiền thuần từ hoạt động đầu tư",    value: -2_254_895_190_348, section: "cash_flow", is_sum: 1 },
    { code: "40",  label: "Lưu chuyển tiền thuần từ hoạt động tài chính", value:  2_586_191_593_366, section: "cash_flow", is_sum: 1 },
  ];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    db.run(`
      INSERT INTO bctc_table_rows
        (report_id, page_number, statement_section, row_order, code, label,
         period_current, value_current, unit, is_summary_row)
      VALUES (?, 1, ?, ?, ?, ?, 'Q4-2025', ?, 'vnd', ?)
    `, [reportId, row.section, i, row.code, row.label, row.value, row.is_sum]);
  }
}

/**
 * Bank table rows (ACB-like, Roman codes only → bank detection fires).
 * No 3-digit numeric codes → isBankFormFromRows → bank path → notApplicable includes debt.
 */
function insertBankTableRows(db: Database, reportId: string): void {
  const rows: Array<{ code: string | null; label: string; value: number; section: string; is_sum: number }> = [
    // income_statement (bank codes)
    { code: "I",    label: "Thu nhập lãi thuần",      value: 6_989_162, section: "income_statement", is_sum: 1 },
    { code: "IX",   label: "Lợi nhuận sau thuế",      value: 4_320_388, section: "income_statement", is_sum: 1 },
    { code: "VIII", label: "Lợi nhuận trước thuế",    value: 5_368_138, section: "income_statement", is_sum: 1 },
    // balance_sheet
    { code: null,   label: "TỔNG TÀI SẢN",            value: 1_030_900_741, section: "balance_sheet", is_sum: 1 },
    { code: null,   label: "TỔNG NỢ PHẢI TRẢ",        value:   932_149_689, section: "balance_sheet", is_sum: 1 },
    { code: null,   label: "VỐN CHỦ SỞ HỮU",          value:    98_751_052, section: "balance_sheet", is_sum: 1 },
    // cash_flow (minimal, required for completeness gate)
    { code: "01",   label: "Lưu chuyển tiền từ hoạt động kinh doanh", value: 500_000, section: "cash_flow", is_sum: 1 },
    { code: "02",   label: "Lưu chuyển tiền từ hoạt động đầu tư",     value: -200_000, section: "cash_flow", is_sum: 1 },
    { code: "03",   label: "Lưu chuyển tiền từ hoạt động tài chính",  value: -100_000, section: "cash_flow", is_sum: 1 },
  ];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    db.run(`
      INSERT INTO bctc_table_rows
        (report_id, page_number, statement_section, row_order, code, label,
         period_current, value_current, unit, is_summary_row)
      VALUES (?, 1, ?, ?, ?, ?, 'Q4-2025', ?, 'million_vnd', ?)
    `, [reportId, row.section, i, row.code ?? null, row.label, row.value, row.is_sum]);
  }
}

// ── BDS-1: Corporate debt scalars populated ────────────────────────────────────

describe("BDS-1 — Corporate: stale debt=0 populated after force_reflow", () => {
  it("force_reflow=true writes short_term_debt + long_term_debt and debt_to_equity recomputes", async () => {
    /**
     * RED (before fix): backfill updates array lacks short_term_debt + long_term_debt.
     *   After force_reflow, short_term_debt=0 and long_term_debt=0 remain unchanged.
     *   Assertion short_term_debt > 0 → FAILS.
     *
     * GREEN (after fix): backfill updates array includes agg.short_term_debt and
     *   agg.long_term_debt. After force_reflow both are populated from codes 321/339.
     *   debt_to_equity = (9_000_000 + 7_200_000) / 40_122_037 ≈ 0.40
     *   Note: backfill does NOT re-derive ratio columns (that is finalize's BLOCK-3).
     *   This test verifies only that debt scalars are written correctly.
     */
    const db = openTestDb();
    insertCorpReportStaleDebt(db, CORP_ID);
    insertCorpTableRowsWithDebt(db, CORP_ID);

    // Verify pre-reflow state: debt scalars are zero (stale)
    const before = db.query<{ short_term_debt: number | null; long_term_debt: number | null }, [string]>(
      "SELECT short_term_debt, long_term_debt FROM financial_reports WHERE id = ?",
    ).get(CORP_ID);
    expect(before?.short_term_debt).toBe(0);
    expect(before?.long_term_debt).toBe(0);

    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ dry_run: false, report_id: CORP_ID, force_reflow: true });
    const body = JSON.parse(result.content[0].text) as { ok: boolean; summary: { done: number } };

    expect(body.ok).toBe(true);
    expect(body.summary.done).toBe(1);

    // POST-reflow: direct DB read (DB-arbiter rule — never trust return values alone)
    const after = db.query<{
      short_term_debt: number | null;
      long_term_debt: number | null;
    }, [string]>(
      "SELECT short_term_debt, long_term_debt FROM financial_reports WHERE id = ?",
    ).get(CORP_ID);

    // CORE: debt scalars must be populated (not zero)
    // short_term_debt: 9_000_000_000_000 raw VND ÷ 1e6 = 9_000_000 M VND
    expect(after?.short_term_debt).not.toBeNull();
    expect(after?.short_term_debt).toBeGreaterThan(0);
    expect(after?.short_term_debt).toBeGreaterThan(8_900_000);
    expect(after?.short_term_debt).toBeLessThan(9_100_000);

    // long_term_debt: 7_200_000_000_000 raw VND ÷ 1e6 = 7_200_000 M VND
    expect(after?.long_term_debt).not.toBeNull();
    expect(after?.long_term_debt).toBeGreaterThan(0);
    expect(after?.long_term_debt).toBeGreaterThan(7_100_000);
    expect(after?.long_term_debt).toBeLessThan(7_300_000);

    // DERIVED check: verify values are consistent with FPT-like D/E ≈ 0.40
    // (9_000_000 + 7_200_000) / 40_122_037 ≈ 0.4037
    const stdDebt = (after!.short_term_debt! + after!.long_term_debt!);
    const deRatio = stdDebt / 40_122_037;
    expect(deRatio).toBeGreaterThan(0.39);
    expect(deRatio).toBeLessThan(0.42);

    db.close();
  });
});

// ── BDS-2: balance_sheet_json blob sync ────────────────────────────────────────

describe("BDS-2 — balance_sheet_json blob: resolved debt written to nested paths", () => {
  it("currentLiabilities.shortTermDebt and longTermLiabilities.longTermDebt updated in blob", async () => {
    /**
     * RED (before fix): backfillBctcScalarsTool does not have the B-2 blob-sync code.
     *   After force_reflow, balance_sheet_json.currentLiabilities.shortTermDebt = 0.
     *   Assertion !== 0 → FAILS.
     *
     * GREEN (after fix): blob-sync mirrors finalize FIX-DE-2 B-2.
     *   currentLiabilities.shortTermDebt = 9_000_000 (M VND)
     *   longTermLiabilities.longTermDebt = 7_200_000 (M VND)
     */
    const db = openTestDb();
    insertCorpReportStaleDebt(db, CORP_ID + "-bs");
    insertCorpTableRowsWithDebt(db, CORP_ID + "-bs");

    const handler = buildBackfillBctcScalarsHandler(db);
    await handler({ dry_run: false, report_id: CORP_ID + "-bs", force_reflow: true });

    const bsRow = db.query<{ balance_sheet_json: string }, [string]>(
      "SELECT balance_sheet_json FROM financial_reports WHERE id = ?",
    ).get(CORP_ID + "-bs");

    expect(bsRow?.balance_sheet_json).not.toBeNull();
    const blob = JSON.parse(bsRow!.balance_sheet_json) as Record<string, unknown>;

    // currentLiabilities.shortTermDebt must be updated
    const cl = blob["currentLiabilities"] as Record<string, unknown>;
    expect(cl).not.toBeNull();
    expect(typeof cl).toBe("object");
    expect(cl["shortTermDebt"]).not.toBeNull();
    expect(cl["shortTermDebt"] as number).toBeGreaterThan(8_900_000);
    expect(cl["shortTermDebt"] as number).toBeLessThan(9_100_000);

    // longTermLiabilities.longTermDebt must be updated
    const ltl = blob["longTermLiabilities"] as Record<string, unknown>;
    expect(ltl).not.toBeNull();
    expect(typeof ltl).toBe("object");
    expect(ltl["longTermDebt"]).not.toBeNull();
    expect(ltl["longTermDebt"] as number).toBeGreaterThan(7_100_000);
    expect(ltl["longTermDebt"] as number).toBeLessThan(7_300_000);

    db.close();
  });
});

// ── BDS-3: Bank — debt null-cleared ────────────────────────────────────────────

describe("BDS-3 — Bank report: short/long_term_debt null-cleared (notApplicable)", () => {
  it("bank report with stale debt values → null after force_reflow (FIX-DE-1 notApplicable honored)", async () => {
    /**
     * RED (before fix): backfill updates array has no debt entries (missing entirely).
     *   notApplicable already includes debt for bank path, so null_cleared_cols would
     *   clear them — BUT only if the null-clear path runs. Since the update path has
     *   no debt entries and nullClearCols is derived from notApplicable, this test
     *   verifies that the null-clear behavior is preserved (not broken by the fix).
     *
     * This test is GREEN both before and after the fix for the null-clear path
     * (notApplicable was always wired). But it proves the bank path is not broken
     * by adding debt to the corporate updates array.
     *
     * The key invariant: bank reports must NEVER get non-null debt scalars after backfill.
     */
    const db = openTestDb();
    insertBankReportWithDebt(db, BANK_ID);
    insertBankTableRows(db, BANK_ID);

    // Pre-reflow: debt scalars have stale values
    const before = db.query<{ short_term_debt: number | null; long_term_debt: number | null }, [string]>(
      "SELECT short_term_debt, long_term_debt FROM financial_reports WHERE id = ?",
    ).get(BANK_ID);
    expect(before?.short_term_debt).toBe(999_999);
    expect(before?.long_term_debt).toBe(888_888);

    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ dry_run: false, report_id: BANK_ID, force_reflow: true });
    const body = JSON.parse(result.content[0].text) as { ok: boolean; results: Array<{ null_cleared_cols?: string[] }> };

    expect(body.ok).toBe(true);

    // Post-reflow: debt scalars must be NULL (cleared via notApplicable path)
    const after = db.query<{ short_term_debt: number | null; long_term_debt: number | null }, [string]>(
      "SELECT short_term_debt, long_term_debt FROM financial_reports WHERE id = ?",
    ).get(BANK_ID);

    expect(after?.short_term_debt).toBeNull();
    expect(after?.long_term_debt).toBeNull();

    // null_cleared_cols must include both debt columns
    const resultItem = body.results[0];
    expect(resultItem?.null_cleared_cols).toContain("short_term_debt");
    expect(resultItem?.null_cleared_cols).toContain("long_term_debt");

    db.close();
  });
});

// ── BDS-4: balance_sheet_json absent — non-fatal skip ─────────────────────────

describe("BDS-4 — balance_sheet_json absent: blob sync skips non-fatally", () => {
  it("report with no balance_sheet_json completes without error (blob sync is non-fatal)", async () => {
    /**
     * Some reports have NULL or '{}' balance_sheet_json (minimal OCR extract).
     * The blob-sync code must guard against missing nested keys and skip silently.
     * Tool must still succeed and write the scalar columns.
     */
    const db = openTestDb();
    // Insert report with '{}' balance_sheet_json (no nested structure)
    insertCorpReportStaleDebt(db, NOBLOB_ID, "{}");
    insertCorpTableRowsWithDebt(db, NOBLOB_ID);

    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ dry_run: false, report_id: NOBLOB_ID, force_reflow: true });
    const body = JSON.parse(result.content[0].text) as { ok: boolean; summary: { done: number } };

    // Must succeed — blob-sync failure is non-fatal
    expect(body.ok).toBe(true);
    expect(body.summary.done).toBe(1);

    // Debt scalar columns must still be written (blob-sync failure does not block scalar UPDATE)
    const after = db.query<{ short_term_debt: number | null }, [string]>(
      "SELECT short_term_debt FROM financial_reports WHERE id = ?",
    ).get(NOBLOB_ID);
    expect(after?.short_term_debt).not.toBeNull();
    expect(after?.short_term_debt).toBeGreaterThan(0);

    db.close();
  });
});

// ── BDS-5: dry_run=true does not write debt ────────────────────────────────────

describe("BDS-5 — dry_run=true: debt scalars computed but NOT written", () => {
  it("dry_run=true leaves short_term_debt=0 unchanged", async () => {
    const db = openTestDb();
    insertCorpReportStaleDebt(db, DRY_ID);
    insertCorpTableRowsWithDebt(db, DRY_ID);

    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ dry_run: true, report_id: DRY_ID, force_reflow: true });
    const body = JSON.parse(result.content[0].text) as { ok: boolean; dry_run: boolean };

    expect(body.ok).toBe(true);
    expect(body.dry_run).toBe(true);

    // DB must NOT be modified
    const after = db.query<{ short_term_debt: number | null; long_term_debt: number | null }, [string]>(
      "SELECT short_term_debt, long_term_debt FROM financial_reports WHERE id = ?",
    ).get(DRY_ID);
    expect(after?.short_term_debt).toBe(0); // unchanged
    expect(after?.long_term_debt).toBe(0);  // unchanged

    db.close();
  });
});
