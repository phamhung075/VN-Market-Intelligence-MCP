/**
 * BEQ-SECTION-GUARD DV tests — section completeness guard
 *
 * Sprint: BCTC-EXTRACT-QUALITY Phase-2
 * Brief: docs/architecture-briefs/2026-06-02-bctc-extract-quality-rescope.md §3
 *
 * Tests:
 *   BEQ-5: checkSectionCompleteness (pure domain function)
 *   BEQ-6: backfillBctcScalarsTool section guard (balance-sheet-only → SKIPPED+PARTIAL)
 *   BEQ-7: finalizeBctcRefineTool section guard (incomplete → override DONE to PARTIAL)
 *
 * Anti-false-green:
 *   Every test was run BEFORE the implementation file(s) existed to prove RED.
 *   Tests import the production module directly — no mocks.
 *
 * DDD: all production code under test is domain (bctcSectionCompleteness) or
 *      interface (backfillBctcScalarsTool, finalizeBctcRefineTool).
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { checkSectionCompleteness } from "../domain/services/financial-reports/bctcSectionCompleteness.js";
import { buildBackfillBctcScalarsHandler } from "../interface/mcp/tools/financial-reports/backfillBctcScalarsTool.js";
import { buildFinalizeBctcRefineHandler } from "../interface/mcp/tools/financial-reports/finalizeBctcRefineTool.js";
import type { AggregatorRow } from "../domain/services/financial-reports/bctcSectionCompleteness.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function openTestDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  return db;
}

const REPORT_ID = "beq5000-0000-5000-8000-000000000001";

function insertPendingReport(db: Database, id: string = REPORT_ID): void {
  db.run(`
    INSERT INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_quarter, period_type, period_start, period_end, sort_key,
       net_profit, refine_status, audit_status, extraction_confidence, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, 'VNM', 'Vinamilk', 'HOSE', 'other',
            2025, 4, 'Q4', '2025-10-01', '2025-12-31', '2025-Q4',
            5.0, 'PENDING', 'unaudited', 0.5, datetime('now'),
            '{}', '{}', '{}', '{}')
  `, [id]);
}

/** Build balance-sheet-only rows (no income_statement, no cash_flow) */
function balanceSheetOnlyRows(): AggregatorRow[] {
  return [
    { code: "100", label: "A. TÀI SẢN NGẮN HẠN",     value_current: 41_000_000_000_000, statement_section: "balance_sheet",  is_summary_row: 1, unit: "vnd" },
    { code: "280", label: "TỔNG CỘNG TÀI SẢN",        value_current: 88_000_000_000_000, statement_section: "balance_sheet",  is_summary_row: 1, unit: "vnd" },
    { code: "300", label: "C. NỢ PHẢI TRẢ",            value_current: 47_000_000_000_000, statement_section: "balance_sheet",  is_summary_row: 1, unit: "vnd" },
    { code: "400", label: "D. VỐN CHỦ SỞ HỮU",         value_current: 41_000_000_000_000, statement_section: "balance_sheet",  is_summary_row: 1, unit: "vnd" },
  ];
}

/** Build income-statement-only rows (no balance_sheet, no cash_flow) */
function incomeOnlyRows(): AggregatorRow[] {
  return [
    { code: "10", label: "Doanh thu thuần",     value_current: 20_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
    { code: "60", label: "Lợi nhuận sau thuế",  value_current:  2_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
  ];
}

/** Build complete three-section rows */
function threeSectonRows(): AggregatorRow[] {
  return [
    // income_statement
    { code: "10",  label: "Doanh thu thuần",                              value_current: 20_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
    { code: "60",  label: "Lợi nhuận sau thuế",                           value_current:  2_476_789_833_481, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
    // balance_sheet
    { code: "280", label: "TỔNG CỘNG TÀI SẢN",                           value_current: 88_000_000_000_000, statement_section: "balance_sheet",  is_summary_row: 1, unit: "vnd" },
    { code: "300", label: "C. NỢ PHẢI TRẢ",                               value_current: 47_000_000_000_000, statement_section: "balance_sheet",  is_summary_row: 1, unit: "vnd" },
    { code: "400", label: "D. VỐN CHỦ SỞ HỮU",                            value_current: 41_000_000_000_000, statement_section: "balance_sheet",  is_summary_row: 1, unit: "vnd" },
    // cash_flow
    { code: "20",  label: "Lưu chuyển tiền thuần từ hoạt động kinh doanh", value_current: -2_000_000_000_000, statement_section: "cash_flow",      is_summary_row: 1, unit: "vnd" },
  ];
}

// ── BEQ-5: checkSectionCompleteness ──────────────────────────────────────────

describe("BEQ-5 — checkSectionCompleteness domain function", () => {
  it("DV-GUARD-1: balance-sheet-only → isComplete=false, hasBalanceSheet=true, other sections false", () => {
    const result = checkSectionCompleteness(balanceSheetOnlyRows());
    expect(result.hasBalanceSheet).toBe(true);
    expect(result.hasIncomeStatement).toBe(false);
    expect(result.hasCashFlow).toBe(false);
    expect(result.isComplete).toBe(false);
  });

  it("DV-GUARD-2: all three sections present → isComplete=true, all booleans true", () => {
    const result = checkSectionCompleteness(threeSectonRows());
    expect(result.hasBalanceSheet).toBe(true);
    expect(result.hasIncomeStatement).toBe(true);
    expect(result.hasCashFlow).toBe(true);
    expect(result.isComplete).toBe(true);
  });

  it("DV-GUARD-3: income-only rows → isComplete=false, hasIncomeStatement=true, others false", () => {
    const result = checkSectionCompleteness(incomeOnlyRows());
    expect(result.hasBalanceSheet).toBe(false);
    expect(result.hasIncomeStatement).toBe(true);
    expect(result.hasCashFlow).toBe(false);
    expect(result.isComplete).toBe(false);
  });

  it("DV-GUARD-4: empty array → all false", () => {
    const result = checkSectionCompleteness([]);
    expect(result.hasBalanceSheet).toBe(false);
    expect(result.hasIncomeStatement).toBe(false);
    expect(result.hasCashFlow).toBe(false);
    expect(result.isComplete).toBe(false);
  });
});

// ── BEQ-6: backfillBctcScalarsTool section guard ─────────────────────────────

describe("BEQ-6 — backfillBctcScalarsTool section guard", () => {
  let db: Database;

  beforeEach(() => {
    db = openTestDb();
  });

  /** Insert balance-sheet-only rows for a report */
  function insertBalanceSheetOnlyTableRows(reportId: string): void {
    const rows = balanceSheetOnlyRows();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      db.run(`
        INSERT INTO bctc_table_rows
          (report_id, page_number, statement_section, row_order, code, label,
           period_current, value_current, unit, is_summary_row)
        VALUES (?, 1, ?, ?, ?, ?, '2025-Q4', ?, 'vnd', ?)
      `, [reportId, r.statement_section, i, r.code, r.label, r.value_current, r.is_summary_row]);
    }
  }

  /** Insert three-section rows for a report */
  function insertThreeSectionTableRows(reportId: string): void {
    const rows = threeSectonRows();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      db.run(`
        INSERT INTO bctc_table_rows
          (report_id, page_number, statement_section, row_order, code, label,
           period_current, value_current, unit, is_summary_row)
        VALUES (?, 1, ?, ?, ?, ?, '2025-Q4', ?, 'vnd', ?)
      `, [reportId, r.statement_section, i, r.code, r.label, r.value_current, r.is_summary_row]);
    }
  }

  it("DV-BACKFILL-1: balance-sheet-only rows → returns status=SKIPPED, refine_status=PARTIAL (NOT DONE)", async () => {
    insertPendingReport(db);
    insertBalanceSheetOnlyTableRows(REPORT_ID);

    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ dry_run: false, report_id: REPORT_ID });
    const body = JSON.parse(result.content[0].text);

    // The result for this report must be SKIPPED+PARTIAL, NOT DONE
    const reportResult = body.results[0];
    expect(reportResult.status).toBe("SKIPPED");
    expect(reportResult.refine_status).toBe("PARTIAL");
    // Must never be DONE
    expect(reportResult.status).not.toBe("DONE");

    // DB must be updated to PARTIAL (not DONE, not PENDING)
    const dbRow = db.query<{ refine_status: string }, [string]>(
      "SELECT refine_status FROM financial_reports WHERE id = ?",
    ).get(REPORT_ID);
    expect(dbRow?.refine_status).toBe("PARTIAL");
    expect(dbRow?.refine_status).not.toBe("DONE");
  });

  it("DV-BACKFILL-2: zero-update balance-sheet-only rows (no scalars resolve) → still SKIPPED+PARTIAL, not DONE", async () => {
    // VNM-like: rows exist but all have value_current=null → aggregateScalars would resolve nothing
    const id2 = "beq5000-0000-5000-8000-000000000002";
    insertPendingReport(db, id2);
    // Insert rows with null values — section guard fires BEFORE aggregation
    db.run(`
      INSERT INTO bctc_table_rows
        (report_id, page_number, statement_section, row_order, code, label,
         period_current, value_current, unit, is_summary_row)
      VALUES (?, 1, 'balance_sheet', 0, '100', 'TÀI SẢN NGẮN HẠN', '2025-Q4', NULL, 'vnd', 1)
    `, [id2]);

    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ dry_run: false, report_id: id2 });
    const body = JSON.parse(result.content[0].text);

    const reportResult = body.results[0];
    // Section guard must fire: only balance_sheet rows → SKIPPED+PARTIAL
    expect(reportResult.status).toBe("SKIPPED");
    expect(reportResult.refine_status).toBe("PARTIAL");

    const dbRow = db.query<{ refine_status: string }, [string]>(
      "SELECT refine_status FROM financial_reports WHERE id = ?",
    ).get(id2);
    expect(dbRow?.refine_status).toBe("PARTIAL");
  });

  it("DV-BACKFILL-3: complete three-section rows + zero resolved scalars → refine_status=DONE allowed", async () => {
    // Three-section rows with real values — complete section set → DONE
    const id3 = "beq5000-0000-5000-8000-000000000003";
    insertPendingReport(db, id3);
    insertThreeSectionTableRows(id3);

    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ dry_run: false, report_id: id3 });
    const body = JSON.parse(result.content[0].text);

    // Complete section → allowed to proceed to aggregation → DONE
    expect(body.results[0].status).toBe("DONE");

    const dbRow = db.query<{ refine_status: string }, [string]>(
      "SELECT refine_status FROM financial_reports WHERE id = ?",
    ).get(id3);
    expect(dbRow?.refine_status).toBe("DONE");
  });
});

// ── BEQ-7: finalizeBctcRefineTool section guard ───────────────────────────────

describe("BEQ-7 — finalizeBctcRefineTool section guard", () => {
  let db: Database;

  beforeEach(() => {
    db = openTestDb();
  });

  /**
   * Insert a report + one bctc_refined_unit with income-only markdown.
   * The markdown will parse to income_statement rows only (no balance/cash_flow).
   * If the agentic caller supplies report_status='DONE', the server-side guard
   * must override to PARTIAL.
   */
  function insertReportWithIncomeOnlyUnit(reportId: string): void {
    db.run(`
      INSERT INTO financial_reports
        (id, action_code, company_name, exchange, domain,
         period_year, period_quarter, period_type, period_start, period_end, sort_key,
         net_profit, refine_status, audit_status, extraction_confidence, parsed_at,
         balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
      VALUES (?, 'FPT', 'FPT Corp', 'HOSE', 'other',
              2025, 4, 'Q4', '2025-10-01', '2025-12-31', '2025-Q4',
              NULL, 'PENDING', 'unaudited', 0.5, datetime('now'),
              '{}', '{}', '{}', '{}')
    `, [reportId]);

    // income-statement-only markdown (uses parser-recognized Vietnamese section header)
    const incomeOnlyMarkdown = `BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH

| STT | Chỉ tiêu | Mã số | Kỳ này | Kỳ trước | Đơn vị |
|-----|----------|-------|---------|----------|--------|
| 1 | Doanh thu thuần | 10 | 20000000 | 18000000 | triệu_vnd |
| 2 | Lợi nhuận sau thuế | 60 | 2476789 | 2100000 | triệu_vnd |
`;

    db.run(`
      INSERT INTO bctc_refined_units
        (report_id, unit_id, page_numbers_json, markdown, window_status, refined_at)
      VALUES (?, 'unit-1', '[1,2]', ?, 'DONE', datetime('now'))
    `, [reportId, incomeOnlyMarkdown]);
  }

  /**
   * Insert a report + a bctc_refined_unit with complete three-section markdown.
   */
  function insertReportWithCompleteUnit(reportId: string): void {
    db.run(`
      INSERT INTO financial_reports
        (id, action_code, company_name, exchange, domain,
         period_year, period_quarter, period_type, period_start, period_end, sort_key,
         net_profit, refine_status, audit_status, extraction_confidence, parsed_at,
         balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
      VALUES (?, 'ACB', 'ACB Bank', 'HOSE', 'other',
              2025, 4, 'Q4', '2025-10-01', '2025-12-31', '2025-Q4',
              NULL, 'PENDING', 'unaudited', 0.5, datetime('now'),
              '{}', '{}', '{}', '{}')
    `, [reportId]);

    // Use Vietnamese section headers that match the parser's SECTION_HEADERS patterns
    const completeMarkdown = `BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH

| STT | Chỉ tiêu | Mã số | Kỳ này | Kỳ trước | Đơn vị |
|-----|----------|-------|---------|----------|--------|
| 1 | Doanh thu thuần | 10 | 20000000 | 18000000 | triệu_vnd |
| 2 | Lợi nhuận sau thuế | 60 | 2476789 | 2100000 | triệu_vnd |

BẢNG CÂN ĐỐI KẾ TOÁN

| STT | Chỉ tiêu | Mã số | Kỳ này | Kỳ trước | Đơn vị |
|-----|----------|-------|---------|----------|--------|
| 1 | TỔNG CỘNG TÀI SẢN | 280 | 88000000 | 80000000 | triệu_vnd |
| 2 | Vốn chủ sở hữu | 400 | 41000000 | 38000000 | triệu_vnd |

BÁO CÁO LƯU CHUYỂN TIỀN TỆ

| STT | Chỉ tiêu | Mã số | Kỳ này | Kỳ trước | Đơn vị |
|-----|----------|-------|---------|----------|--------|
| 1 | Lưu chuyển tiền từ HĐKD | 20 | -2000000 | 1500000 | triệu_vnd |
`;

    db.run(`
      INSERT INTO bctc_refined_units
        (report_id, unit_id, page_numbers_json, markdown, window_status, refined_at)
      VALUES (?, 'unit-1', '[1,2,3,4]', ?, 'DONE', datetime('now'))
    `, [reportId, completeMarkdown]);
  }

  it("DV-FINALIZE-1: income-only parsed rows → override caller DONE to PARTIAL", async () => {
    const id = "beq7000-0000-7000-8000-000000000001";
    insertReportWithIncomeOnlyUnit(id);

    const handler = buildFinalizeBctcRefineHandler(db);
    // Caller supplies DONE — server must override to PARTIAL (income-only rows)
    const result = await handler({ report_id: id, report_status: "DONE" });
    const body = JSON.parse(result.content[0].text);

    // Tool must succeed (ok=true)
    expect(body.ok).toBe(true);
    // But refine_status in DB must be PARTIAL, not DONE
    const dbRow = db.query<{ refine_status: string }, [string]>(
      "SELECT refine_status FROM financial_reports WHERE id = ?",
    ).get(id);
    expect(dbRow?.refine_status).toBe("PARTIAL");
    expect(dbRow?.refine_status).not.toBe("DONE");
  });

  it("DV-FINALIZE-2: complete three-section parsed rows → allow caller DONE to pass through", async () => {
    const id = "beq7000-0000-7000-8000-000000000002";
    insertReportWithCompleteUnit(id);

    const handler = buildFinalizeBctcRefineHandler(db);
    const result = await handler({ report_id: id, report_status: "DONE" });
    const body = JSON.parse(result.content[0].text);

    expect(body.ok).toBe(true);
    const dbRow = db.query<{ refine_status: string }, [string]>(
      "SELECT refine_status FROM financial_reports WHERE id = ?",
    ).get(id);
    // Complete sections → DONE allowed
    expect(dbRow?.refine_status).toBe("DONE");
  });

  it("DV-FINALIZE-1b: income-only override → response includes effective_status=PARTIAL and beg7_override=true", async () => {
    const id = "beq7000-0000-7000-8000-000000000011";
    insertReportWithIncomeOnlyUnit(id);

    const handler = buildFinalizeBctcRefineHandler(db);
    const result = await handler({ report_id: id, report_status: "DONE" });
    const body = JSON.parse(result.content[0].text);

    // Fix B: response must include effective_status and beg7_override
    expect(body.ok).toBe(true);
    expect(body.effective_status).toBe("PARTIAL");
    expect(body.beg7_override).toBe(true);
    // Legacy fields still present
    expect(typeof body.rows_parsed).toBe("number");
  });

  it("DV-FINALIZE-2b: complete sections → response includes effective_status=DONE and beg7_override=false", async () => {
    const id = "beq7000-0000-7000-8000-000000000012";
    insertReportWithCompleteUnit(id);

    const handler = buildFinalizeBctcRefineHandler(db);
    const result = await handler({ report_id: id, report_status: "DONE" });
    const body = JSON.parse(result.content[0].text);

    expect(body.ok).toBe(true);
    expect(body.effective_status).toBe("DONE");
    // Caller supplied DONE, BEQ-7 did NOT fire → beg7_override must be false
    expect(body.beg7_override).toBe(false);
    expect(typeof body.rows_parsed).toBe("number");
  });

  it("DV-FINALIZE-4: caller supplies PARTIAL → effective_status=PARTIAL, beg7_override=false", async () => {
    const id = "beq7000-0000-7000-8000-000000000013";
    insertReportWithIncomeOnlyUnit(id);

    const handler = buildFinalizeBctcRefineHandler(db);
    // Caller already supplies PARTIAL — BEQ-7 guard does not fire (only fires when caller=DONE)
    const result = await handler({ report_id: id, report_status: "PARTIAL" });
    const body = JSON.parse(result.content[0].text);

    expect(body.ok).toBe(true);
    expect(body.effective_status).toBe("PARTIAL");
    // callerWasDone=false → beg7_override must be false
    expect(body.beg7_override).toBe(false);
  });

  it("DV-FINALIZE-3: empty parsed rows (0 DONE units) → PARTIAL (fail-safe)", async () => {
    const id = "beq7000-0000-7000-8000-000000000003";
    // Report with NO refined units at all — finalRows will be empty
    db.run(`
      INSERT INTO financial_reports
        (id, action_code, company_name, exchange, domain,
         period_year, period_quarter, period_type, period_start, period_end, sort_key,
         net_profit, refine_status, audit_status, extraction_confidence, parsed_at,
         balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
      VALUES (?, 'DIG', 'DIG Corp', 'HOSE', 'other',
              2025, 4, 'Q4', '2025-10-01', '2025-12-31', '2025-Q4',
              NULL, 'PENDING', 'unaudited', 0.5, datetime('now'),
              '{}', '{}', '{}', '{}')
    `, [id]);
    // No bctc_refined_units inserted → 0 DONE units → 0 parsed rows

    const handler = buildFinalizeBctcRefineHandler(db);
    // Caller says DONE, but no rows → fail-safe → PARTIAL
    const result = await handler({ report_id: id, report_status: "DONE" });
    const body = JSON.parse(result.content[0].text);

    expect(body.ok).toBe(true);
    const dbRow = db.query<{ refine_status: string }, [string]>(
      "SELECT refine_status FROM financial_reports WHERE id = ?",
    ).get(id);
    expect(dbRow?.refine_status).toBe("PARTIAL");
    expect(dbRow?.refine_status).not.toBe("DONE");
  });
});
