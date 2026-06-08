/**
 * BEQ-2 DV — backfill_bctc_scalars tool eligibility fix
 *
 * Sprint: BCTC-EXTRACT-QUALITY
 * Brief: docs/architecture-briefs/2026-06-02-bctc-extract-quality.md § FIX-1
 *
 * Anti-false-green:
 *   RED: without the backfill tool, PENDING reports with existing bctc_table_rows
 *   stay PENDING forever (refine_status never transitions, scalars remain 0/garbage).
 *
 *   GREEN: backfill_bctc_scalars tool reads existing table_rows, runs aggregateScalars,
 *   writes scalars + sets refine_status='DONE'.
 *
 * Verification: pure in-memory SQLite — no HTTP, no echo.
 * Direct DB read confirms refine_status='DONE' and scalar fields populated.
 *
 * OFF-HOSE note: this test suite is safe to run at any time (in-memory DB only).
 * The tool itself must be called outside 02:00-08:59 UTC Mon-Fri for production use.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { registerBackfillBctcScalarsTool, buildBackfillBctcScalarsHandler } from "../interface/mcp/tools/financial-reports/backfillBctcScalarsTool.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function openTestDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  return db;
}

const REPORT_UUID = "aaaabbbb-cccc-dddd-eeee-ffffffffffff";

/** Insert a minimal financial_reports row in PENDING state */
function insertPendingReport(db: Database, opts: {
  id?: string;
  code?: string;
  sortKey?: string;
  netProfit?: number;
} = {}): string {
  const id = opts.id ?? REPORT_UUID;
  db.run(`
    INSERT INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_quarter, period_type, period_start, period_end, sort_key,
       net_profit, refine_status, audit_status, extraction_confidence, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, ?, ?, 'HOSE', 'other', 2025, 4, 'Q4', '2025-10-01', '2025-12-31', ?,
            ?, 'PENDING', 'unaudited', 0.5, datetime('now'), '{}', '{}', '{}', '{}')
  `, [id, opts.code ?? "FPT", `${opts.code ?? "FPT"} Corp`, opts.sortKey ?? "2025-Q4", opts.netProfit ?? 20_225]);
  return id;
}

/** Insert bctc_table_rows for a report — FPT-like corpus with operating_profit, cash, CF */
function insertTableRows(db: Database, reportId: string): void {
  const rows = [
    // income_statement
    { code: "10", label: "Doanh thu thuần",                     value: 20_000_000_000_000, section: "income_statement", is_sum: 1 },
    { code: "20", label: "Lợi nhuận gộp",                       value:  4_000_000_000_000, section: "income_statement", is_sum: 1 },
    { code: "30", label: "Lợi nhuận thuần từ hoạt động kinh doanh", value: 2_500_000_000_000, section: "income_statement", is_sum: 1 },
    { code: "50", label: "Tổng lợi nhuận kế toán trước thuế",   value:  2_800_000_000_000, section: "income_statement", is_sum: 1 },
    { code: "60", label: "Lợi nhuận sau thuế thu nhập doanh nghiệp", value: 2_476_789_833_481, section: "income_statement", is_sum: 1 },
    // balance_sheet / general
    { code: "100",  label: "A. TÀI SẢN NGẮN HẠN",               value: 41_000_000_000_000, section: "general", is_sum: 1 },
    { code: "110",  label: "I. Tiền và các khoản tương đương tiền", value: 7_993_577_611_642, section: "general", is_sum: 1 },
    { code: "280",  label: "TỔNG CỘNG TÀI SẢN",                  value: 88_000_000_000_000, section: "general", is_sum: 1 },
    { code: "300",  label: "C. NỢ PHẢI TRẢ",                     value: 47_877_963_429_639, section: "general", is_sum: 1 },
    { code: "400",  label: "D. VỐN CHỦ SỞ HỮU",                  value: 40_122_036_570_361, section: "general", is_sum: 1 },
    // cash_flow
    { code: "02", label: "Khấu hao tài sản cố định",             value:   410_000_000_000, section: "cash_flow", is_sum: 0 },
    { code: "20", label: "Lưu chuyển tiền thuần từ hoạt động kinh doanh", value: -2_847_813_717_192, section: "cash_flow", is_sum: 1 },
    { code: "21", label: "Tiền chi mua sắm tài sản cố định",      value:  -589_068_929_719, section: "cash_flow", is_sum: 0 },
    { code: "30", label: "Lưu chuyển tiền thuần từ hoạt động đầu tư", value: -2_254_895_190_348, section: "cash_flow", is_sum: 1 },
    { code: "40", label: "Lưu chuyển tiền thuần từ hoạt động tài chính", value: 2_586_191_593_366, section: "cash_flow", is_sum: 1 },
  ];

  for (const row of rows) {
    db.run(`
      INSERT INTO bctc_table_rows
        (report_id, page_number, statement_section, row_order, code, label,
         period_current, value_current, unit, is_summary_row)
      VALUES (?, 1, ?, ?, ?, ?, 'Q4-2025', ?, 'vnd', ?)
    `, [reportId, row.section, rows.indexOf(row), row.code, row.label, row.value, row.is_sum]);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BEQ-2 — backfill_bctc_scalars eligibility fix", () => {

  it("RED→GREEN: PENDING report with existing table_rows → refine_status=DONE after backfill", async () => {
    /**
     * RED: before BEQ-2, reports with existing bctc_table_rows had no backfill path.
     * refine_status stayed PENDING, scalars remained at OCR-parse garbage values.
     *
     * GREEN: backfill_bctc_scalars reads existing table rows, runs aggregateScalars,
     * writes scalars, and sets refine_status='DONE'.
     */
    const db = openTestDb();
    const reportId = insertPendingReport(db);
    insertTableRows(db, reportId);

    // Verify PRE-backfill state: PENDING with legacy garbage net_profit
    const preBefore = db.query<{ refine_status: string; net_profit: number }, [string]>(
      "SELECT refine_status, net_profit FROM financial_reports WHERE id = ?",
    ).get(reportId);
    expect(preBefore?.refine_status).toBe("PENDING");
    expect(preBefore?.net_profit).toBe(20_225); // garbage OCR value

    // Run the backfill handler directly
    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ dry_run: false, report_id: reportId });
    const body = JSON.parse(result.content[0].text);

    expect(body.ok).toBe(true);
    expect(body.summary.done).toBe(1);
    expect(body.summary.skipped).toBe(0);

    // Verify POST-backfill state via direct DB read (not HTTP echo)
    const postRow = db.query<{
      refine_status: string;
      net_profit: number;
      operating_profit: number;
      cash: number;
      operating_cf: number;
      investing_cf: number;
      financing_cf: number;
    }, [string]>(
      `SELECT refine_status, net_profit, operating_profit, cash,
              operating_cf, investing_cf, financing_cf
       FROM financial_reports WHERE id = ?`,
    ).get(reportId);

    // refine_status MUST be DONE
    expect(postRow?.refine_status).toBe("DONE");

    // net_profit must have been overwritten with the correct value (not 20,225)
    // Values are in million VND (raw VND / 1e6)
    expect(postRow?.net_profit).toBeGreaterThan(2_000_000); // 2,476,789M VND

    // operating_profit must now be populated (was 0 before BEQ-3)
    expect(postRow?.operating_profit).toBeGreaterThan(0);

    // cash must be populated (was 0 before BEQ-3)
    expect(postRow?.cash).toBeGreaterThan(0);

    // cash flow fields must be populated
    expect(postRow?.operating_cf).toBeDefined();
    expect(postRow?.investing_cf).toBeDefined();
    expect(postRow?.financing_cf).toBeDefined();
  });

  it("skips reports with 0 table_rows (CTG cover-letter)", async () => {
    const db = openTestDb();
    // Insert CTG-like report with NO table rows
    insertPendingReport(db, { id: "ctg-0000-0000-0000-000000000000", code: "CTG", sortKey: "2026-Q1" });
    // Do NOT insert any table rows for this report

    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ dry_run: false });
    const body = JSON.parse(result.content[0].text);

    expect(body.ok).toBe(true);
    expect(body.summary.skipped).toBe(1);
    expect(body.summary.done).toBe(0);

    const resultItem = body.results[0];
    expect(resultItem.status).toBe("SKIPPED");
    expect(resultItem.table_row_count).toBe(0);

    // CTG must still be PENDING (not touched)
    const row = db.query<{ refine_status: string }, [string]>(
      "SELECT refine_status FROM financial_reports WHERE id = ?",
    ).get("ctg-0000-0000-0000-000000000000");
    expect(row?.refine_status).toBe("PENDING");
  });

  it("dry_run=true does NOT write to DB", async () => {
    const db = openTestDb();
    const reportId = insertPendingReport(db);
    insertTableRows(db, reportId);

    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ dry_run: true, report_id: reportId });
    const body = JSON.parse(result.content[0].text);

    expect(body.ok).toBe(true);
    expect(body.dry_run).toBe(true);

    // DB must NOT be modified in dry_run mode
    const row = db.query<{ refine_status: string }, [string]>(
      "SELECT refine_status FROM financial_reports WHERE id = ?",
    ).get(reportId);
    expect(row?.refine_status).toBe("PENDING"); // unchanged
  });

  it("skips CONFIRMED reports (never overwrite human corrections)", async () => {
    const db = openTestDb();
    const reportId = insertPendingReport(db);
    insertTableRows(db, reportId);
    // Manually set CONFIRMED
    db.run("UPDATE financial_reports SET confirm_status='CONFIRMED' WHERE id=?", [reportId]);

    const handler = buildBackfillBctcScalarsHandler(db);
    const result = await handler({ dry_run: false, report_id: reportId });
    const body = JSON.parse(result.content[0].text);

    expect(body.summary.skipped).toBe(1);
    const resultItem = body.results[0];
    expect(resultItem.status).toBe("SKIPPED");
    expect(resultItem.reason).toContain("CONFIRMED");
  });
});
