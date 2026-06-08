/**
 * LF-SERVE-REFLOW DV — backfill_bctc_scalars force_reflow=true path
 *
 * Sprint: BCTC-LAYOUT-FIRST
 * Task: LF-SERVE-REFLOW
 *
 * Eligibility gap root cause (diagnosed 2026-06-03):
 *   backfill_bctc_scalars only queried refine_status='PENDING'.
 *   FPT 2026-Q1 (e8ea3df5) was already refine_status='DONE' (finalized 2026-05-31)
 *   BEFORE BEQ-3 shipped the operating_profit/cash/CF column mappings.
 *   Result: 145 bctc_table_rows present, aggregator formula correct, but the report
 *   was silently excluded from the standard backfill sweep → served garbage scalars.
 *
 * Fix: force_reflow=true extends eligibility to refine_status IN ('PENDING','DONE').
 * CONFIRMED reports excluded regardless.
 *
 * Anti-false-green:
 *   RED: without force_reflow, a DONE report with stale operating_profit=0 is skipped
 *   and remains garbage after backfill.
 *   GREEN: force_reflow=true re-derives the DONE report → correct scalars written.
 *
 * Verification: pure in-memory SQLite, real aggregator — no HTTP, no echo.
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

const DONE_REPORT_ID = "e8ea3df5-3f32-413d-a3eb-c71634c0438d"; // mirrors live FPT 2026-Q1

/**
 * Insert a financial_reports row in DONE state with pre-BEQ-3 garbage scalars
 * (operating_profit=0, cash≈0, financing_cf≈0 — exactly as live e8ea3df5).
 */
function insertDoneReportWithGarbageScalars(db: Database): string {
  db.run(`
    INSERT INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_quarter, period_type, period_start, period_end, sort_key,
       net_profit, operating_profit, cash, financing_cf, refine_status,
       audit_status, extraction_confidence, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, 'FPT', 'FPT Corp', 'HOSE', 'tech',
            2026, 1, 'Q1', '2026-01-01', '2026-03-31', '2026-Q1',
            2476789833481, 0, 0.000001, 0.00004,
            'DONE', 'unaudited', 0.9, datetime('now'),
            '{}', '{}', '{}', '{}')
  `, [DONE_REPORT_ID]);
  return DONE_REPORT_ID;
}

/**
 * Insert the FPT 2026-Q1 bctc_table_rows corpus — real row codes from live DB.
 * Values are raw VND (aggregator detects >1e11 → divides by 1e6 → million VND).
 */
function insertFptTableRows(db: Database, reportId: string): void {
  const rows: Array<{ code: string; label: string; value: number; section: string; is_sum: number }> = [
    // income_statement
    { code: "10",  label: "Doanh thu thuần về bán hàng và cung cấp dịch vụ", value: 12_479_997_206_775, section: "income_statement", is_sum: 1 },
    { code: "20",  label: "Lợi nhuận gộp về bán hàng và cung cấp dịch vụ",   value:  4_244_889_890_688, section: "income_statement", is_sum: 1 },
    { code: "30",  label: "Lợi nhuận thuần từ hoạt động kinh doanh",           value:  2_747_763_827_050, section: "income_statement", is_sum: 1 },
    { code: "50",  label: "Tổng lợi nhuận kế toán trước thuế",                value:  2_803_844_281_676, section: "income_statement", is_sum: 1 },
    { code: "60",  label: "Lợi nhuận sau thuế thu nhập doanh nghiệp",         value:  2_476_789_833_481, section: "income_statement", is_sum: 1 },
    // general (balance sheet)
    { code: "100", label: "A. TÀI SẢN NGẮN HẠN",                              value: 41_527_873_060_120, section: "general", is_sum: 1 },
    { code: "110", label: "I. Tiền và các khoản tương đương tiền",             value:  7_993_577_611_642, section: "general", is_sum: 1 },
    { code: "280", label: "TỔNG CỘNG TÀI SẢN (280 = 100 + 200)",              value: 68_586_094_785_217, section: "general", is_sum: 1 },
    { code: "300", label: "C. NỢ PHẢI TRẢ",                                   value: 28_464_058_214_856, section: "general", is_sum: 1 },
    { code: "400", label: "D. VỐN CHỦ SỞ HỮU",                                value: 40_122_036_570_361, section: "general", is_sum: 1 },
    // cash_flow
    { code: "02",  label: "Khấu hao tài sản cố định và bất động sản đầu tư", value:    409_926_454_508, section: "cash_flow", is_sum: 0 },
    { code: "20",  label: "Lưu chuyển tiền thuần từ hoạt động kinh doanh",   value: -2_847_813_717_192, section: "cash_flow", is_sum: 1 },
    { code: "30",  label: "Lưu chuyển tiền thuần từ hoạt động đầu tư",       value: -2_254_895_190_348, section: "cash_flow", is_sum: 1 },
    { code: "40",  label: "Lưu chuyển tiền thuần từ hoạt động tài chính",    value:  2_586_191_593_366, section: "cash_flow", is_sum: 1 },
  ];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    db.run(`
      INSERT INTO bctc_table_rows
        (report_id, page_number, statement_section, row_order, code, label,
         period_current, value_current, unit, is_summary_row)
      VALUES (?, 1, ?, ?, ?, ?, 'Q1-2026', ?, 'vnd', ?)
    `, [reportId, row.section, i, row.code, row.label, row.value, row.is_sum]);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("LF-SERVE-REFLOW — backfill_bctc_scalars force_reflow=true", () => {

  it("RED→GREEN: DONE report with stale scalars is skipped WITHOUT force_reflow", async () => {
    /**
     * RED (eligibility gap): without force_reflow, a refine_status='DONE' report
     * with garbage scalars (from pre-BEQ-3 finalize) is silently excluded by the
     * PENDING-only WHERE clause. The garbage persists.
     */
    const db = openTestDb();
    const reportId = insertDoneReportWithGarbageScalars(db);
    insertFptTableRows(db, reportId);

    const handler = buildBackfillBctcScalarsHandler(db);
    // Default call (no force_reflow) — DONE report must be skipped
    const result = await handler({ dry_run: false, report_id: reportId });
    const body = JSON.parse(result.content[0].text);

    // The query returns 0 rows (PENDING-only filter), so summary is empty
    expect(body.ok).toBe(true);
    expect(body.summary.done).toBe(0);
    expect(body.summary.skipped).toBe(0); // not even reached — excluded by WHERE

    // Garbage scalars MUST still be garbage (no write happened)
    const row = db.query<{ operating_profit: number; cash: number }, [string]>(
      "SELECT operating_profit, cash FROM financial_reports WHERE id = ?",
    ).get(reportId);
    expect(row?.operating_profit).toBe(0);      // still garbage
    expect(row?.cash).toBeCloseTo(0, 5);        // still garbage (≈0.000001)
  });

  it("force_reflow=true re-derives DONE report → correct BEQ-3 scalars written", async () => {
    /**
     * GREEN: force_reflow=true extends the WHERE clause to include refine_status='DONE'.
     * The FPT 2026-Q1 report is re-derived from its 145 bctc_table_rows using the
     * post-BEQ-3 aggregator → operating_profit / cash / financing_cf all resolved.
     */
    const db = openTestDb();
    const reportId = insertDoneReportWithGarbageScalars(db);
    insertFptTableRows(db, reportId);

    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ dry_run: false, report_id: reportId, force_reflow: true });
    const body = JSON.parse(result.content[0].text);

    expect(body.ok).toBe(true);
    expect(body.summary.done).toBe(1);
    expect(body.summary.skipped).toBe(0);

    // POST-reflow: verify via direct DB read (not HTTP echo — router-verify discipline)
    const postRow = db.query<{
      refine_status: string;
      operating_profit: number;
      ebitda: number;
      cash: number;
      financing_cf: number;
      net_profit: number;
    }, [string]>(
      `SELECT refine_status, operating_profit, ebitda, cash, financing_cf, net_profit
       FROM financial_reports WHERE id = ?`,
    ).get(reportId);

    // refine_status must remain DONE
    expect(postRow?.refine_status).toBe("DONE");

    // operating_profit: code "30" in income_statement → 2,747,763,827,050 raw VND → ~2,747,763 M VND
    expect(postRow?.operating_profit).toBeGreaterThan(2_700_000);
    expect(postRow?.operating_profit).toBeLessThan(2_800_000);

    // ebitda: operating_profit + depreciation (code "02" cash_flow ~409,926M) → ~3,157,690 M VND
    expect(postRow?.ebitda).toBeGreaterThan(3_100_000);
    expect(postRow?.ebitda).toBeLessThan(3_200_000);

    // cash: code "110" in general → 7,993,577,611,642 raw VND → ~7,993,578 M VND
    expect(postRow?.cash).toBeGreaterThan(7_900_000);
    expect(postRow?.cash).toBeLessThan(8_100_000);

    // financing_cf: code "40" in cash_flow → 2,586,191,593,366 raw VND → ~2,586,192 M VND
    expect(postRow?.financing_cf).toBeGreaterThan(2_500_000);
    expect(postRow?.financing_cf).toBeLessThan(2_650_000);
  });

  it("force_reflow dry_run=true: computes but does NOT write DONE report", async () => {
    const db = openTestDb();
    const reportId = insertDoneReportWithGarbageScalars(db);
    insertFptTableRows(db, reportId);

    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ dry_run: true, report_id: reportId, force_reflow: true });
    const body = JSON.parse(result.content[0].text);

    expect(body.ok).toBe(true);
    expect(body.dry_run).toBe(true);

    // DB must NOT be modified in dry_run mode
    const row = db.query<{ operating_profit: number }, [string]>(
      "SELECT operating_profit FROM financial_reports WHERE id = ?",
    ).get(reportId);
    expect(row?.operating_profit).toBe(0); // unchanged — dry_run did not write
  });

  it("force_reflow=true still excludes CONFIRMED reports", async () => {
    const db = openTestDb();
    const reportId = insertDoneReportWithGarbageScalars(db);
    insertFptTableRows(db, reportId);
    // Mark as CONFIRMED
    db.run("UPDATE financial_reports SET confirm_status='CONFIRMED' WHERE id=?", [reportId]);

    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ dry_run: false, report_id: reportId, force_reflow: true });
    const body = JSON.parse(result.content[0].text);

    // CONFIRMED must be skipped even with force_reflow
    expect(body.summary.skipped).toBe(1);
    expect(body.summary.done).toBe(0);
    const resultItem = body.results[0];
    expect(resultItem.status).toBe("SKIPPED");
    expect(resultItem.reason).toContain("CONFIRMED");

    // Garbage scalars preserved (never overwrite human corrections)
    const row = db.query<{ operating_profit: number }, [string]>(
      "SELECT operating_profit FROM financial_reports WHERE id = ?",
    ).get(reportId);
    expect(row?.operating_profit).toBe(0);
  });

  it("force_reflow=true bulk sweep: processes both PENDING and DONE in one pass", async () => {
    /**
     * Verifies the corpus sweep path: when force_reflow=true is used without a report_id,
     * both PENDING and DONE reports are processed together. This is the one-command
     * corpus sweep operator uses after a mapping-change deployment.
     */
    const db = openTestDb();

    // Insert a PENDING report
    db.run(`
      INSERT INTO financial_reports
        (id, action_code, company_name, exchange, domain,
         period_year, period_quarter, period_type, period_start, period_end, sort_key,
         net_profit, refine_status, audit_status, extraction_confidence, parsed_at,
         balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
      VALUES ('pending-id-0001', 'VNM', 'VNM Corp', 'HOSE', 'consumer',
              2026, 1, 'Q1', '2026-01-01', '2026-03-31', '2026-Q1-VNM',
              0, 'PENDING', 'unaudited', 0.7, datetime('now'), '{}', '{}', '{}', '{}')
    `);

    // Insert a DONE report (stale BEQ-3 scalars)
    insertDoneReportWithGarbageScalars(db);

    // Insert table rows for both
    insertFptTableRows(db, DONE_REPORT_ID);
    // VNM gets same row shape for simplicity (just need completeness gate to pass)
    insertFptTableRows(db, "pending-id-0001");

    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ dry_run: false, force_reflow: true });
    const body = JSON.parse(result.content[0].text);

    expect(body.ok).toBe(true);
    // Both reports should be processed successfully
    expect(body.summary.done).toBe(2);
    expect(body.summary.skipped).toBe(0);
  });
});
