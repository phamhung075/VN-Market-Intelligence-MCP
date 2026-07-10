Bun.env["DB_PATH"] = ":memory:";
/**
 * FIX-BCTC-D2-ENSURE-SHELL-ROW
 *
 * Proves `ensureFinancialReportShellRow` is a correct idempotent upsert on
 * (action_code, sort_key):
 *   - no existing row                 → INSERT shell row (pending_extraction,
 *     empty JSON columns, pdf_path set).
 *   - existing row, pdf_path IS NULL  → UPDATE pdf_path only, id preserved.
 *   - existing row, pdf_path NOT NULL → no-op — never clobbers a real pdf_path.
 *
 * See: docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md §D2.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { ensureFinancialReportShellRow } from "../application/usecases/bctc/ensureFinancialReportShellRow.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

interface ShellRow {
  id: string;
  pdf_path: string | null;
  validation_status: string;
  period_year: number;
  period_quarter: number;
  period_type: string;
  sort_key: string;
  balance_sheet_json: string;
  income_stmt_json: string;
  cash_flow_json: string;
  ratios_json: string;
  extraction_confidence: number;
}

function readRow(actionCode: string, sortKey: string): ShellRow | null {
  return getDb()
    .prepare(
      `SELECT id, pdf_path, validation_status, period_year, period_quarter,
              period_type, sort_key, balance_sheet_json, income_stmt_json,
              cash_flow_json, ratios_json, extraction_confidence
       FROM financial_reports WHERE action_code = ? AND sort_key = ?`,
    )
    .get(actionCode, sortKey) as ShellRow | null;
}

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

beforeEach(() => {
  getDb().prepare("DELETE FROM financial_reports WHERE action_code LIKE 'D2SHELL%'").run();
});

describe("ensureFinancialReportShellRow (FIX-BCTC-D2-ENSURE-SHELL-ROW)", () => {
  it("no existing row → inserts a shell row with pdf_path set and validation_status='pending_extraction'", async () => {
    const result = await ensureFinancialReportShellRow({
      actionCode: "D2SHELL1",
      year: 2025,
      quarter: "Q4",
      pdfPath: "/app/data/pdfs/D2SHELL1_2025_Q4.pdf",
    });

    expect(result.id).toBeTruthy();
    expect(result.sortKey).toBe("2025-Q4");

    const row = readRow("D2SHELL1", "2025-Q4");
    expect(row).not.toBeNull();
    expect(row!.id).toBe(result.id);
    expect(row!.pdf_path).toBe("/app/data/pdfs/D2SHELL1_2025_Q4.pdf");
    expect(row!.validation_status).toBe("pending_extraction");
    // FIX-BCTC-D2-ENSURE-SHELL-ROW round-1 QA regression: extraction_confidence
    // MUST be bound to 0 (measured zero confidence) — never left to the
    // schema's silent DEFAULT 1.0 (bctc-schema.ts:750), which would render a
    // zero-data shell row as a confidently-fabricated-looking "100%" read.
    expect(row!.extraction_confidence).toBe(0);
    expect(row!.period_year).toBe(2025);
    expect(row!.period_quarter).toBe(4);
    expect(row!.period_type).toBe("Q4");
    expect(row!.balance_sheet_json).toBe("{}");
    expect(row!.income_stmt_json).toBe("{}");
    expect(row!.cash_flow_json).toBe("{}");
    expect(row!.ratios_json).toBe("{}");
  });

  it("create then no-op re-call (identical pdfPath) preserves pdf_path and id", async () => {
    const first = await ensureFinancialReportShellRow({
      actionCode: "D2SHELL2",
      year: 2025,
      quarter: "Q3",
      pdfPath: "/app/data/pdfs/D2SHELL2_2025_Q3.pdf",
    });

    const second = await ensureFinancialReportShellRow({
      actionCode: "D2SHELL2",
      year: 2025,
      quarter: "Q3",
      pdfPath: "/app/data/pdfs/D2SHELL2_2025_Q3.pdf",
    });

    expect(second.id).toBe(first.id);

    const row = readRow("D2SHELL2", "2025-Q3");
    expect(row!.id).toBe(first.id);
    expect(row!.pdf_path).toBe("/app/data/pdfs/D2SHELL2_2025_Q3.pdf");

    // Exactly one row for this (action_code, sort_key) — no duplicate insert.
    const countRow = getDb()
      .prepare(
        "SELECT COUNT(*) AS cnt FROM financial_reports WHERE action_code = ? AND sort_key = ?",
      )
      .get("D2SHELL2", "2025-Q3") as { cnt: number };
    expect(countRow.cnt).toBe(1);
  });

  it("re-call with a different pdfPath when existing pdf_path IS NULL updates it (id preserved)", async () => {
    // Simulate a pre-existing legacy-pipeline row with pdf_path never set
    // (mirrors the GVR/MBB/D2D bug D1/D2 close — a row exists but pdf_path
    // was never flushed back to SQLite).
    const db = getDb();
    const preExistingId = "d2shell3-preexisting-0000-0000-000000000000";
    db.prepare(`
      INSERT INTO financial_reports (
        id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type, period_start, period_end, sort_key,
        pdf_path, parsed_at, validation_status,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json
      ) VALUES (
        ?, 'D2SHELL3', 'Test Corp', 'HOSE', 'other',
        2025, 2, 'Q2', '2025-04-01', '2025-06-30', '2025-Q2',
        NULL, datetime('now'), 'passed',
        '{}', '{}', '{}', '{}'
      )
    `).run(preExistingId);

    const result = await ensureFinancialReportShellRow({
      actionCode: "D2SHELL3",
      year: 2025,
      quarter: "Q2",
      pdfPath: "/app/data/pdfs/D2SHELL3_2025_Q2.pdf",
    });

    // id reused — never re-minted for an existing row.
    expect(result.id).toBe(preExistingId);

    const row = readRow("D2SHELL3", "2025-Q2");
    expect(row!.id).toBe(preExistingId);
    expect(row!.pdf_path).toBe("/app/data/pdfs/D2SHELL3_2025_Q2.pdf");
    // validation_status untouched — DO UPDATE SET only touches pdf_path.
    expect(row!.validation_status).toBe("passed");
  });

  it("re-call when existing pdf_path is NOT NULL does NOT clobber it", async () => {
    const first = await ensureFinancialReportShellRow({
      actionCode: "D2SHELL4",
      year: 2025,
      quarter: "Q1",
      pdfPath: "/app/data/pdfs/D2SHELL4_2025_Q1_ORIGINAL.pdf",
    });

    // A second call with a DIFFERENT pdfPath must be ignored — the WHERE
    // financial_reports.pdf_path IS NULL guard blocks the update.
    const second = await ensureFinancialReportShellRow({
      actionCode: "D2SHELL4",
      year: 2025,
      quarter: "Q1",
      pdfPath: "/app/data/pdfs/D2SHELL4_2025_Q1_DIFFERENT.pdf",
    });

    expect(second.id).toBe(first.id);

    const row = readRow("D2SHELL4", "2025-Q1");
    expect(row!.pdf_path).toBe("/app/data/pdfs/D2SHELL4_2025_Q1_ORIGINAL.pdf");
  });

  it("a genuinely different sort_key for the same action_code gets its own row/id", async () => {
    const q1 = await ensureFinancialReportShellRow({
      actionCode: "D2SHELL5",
      year: 2025,
      quarter: "Q1",
      pdfPath: "/app/data/pdfs/D2SHELL5_2025_Q1.pdf",
    });
    const q2 = await ensureFinancialReportShellRow({
      actionCode: "D2SHELL5",
      year: 2025,
      quarter: "Q2",
      pdfPath: "/app/data/pdfs/D2SHELL5_2025_Q2.pdf",
    });

    expect(q1.id).not.toBe(q2.id);

    const row1 = readRow("D2SHELL5", "2025-Q1");
    const row2 = readRow("D2SHELL5", "2025-Q2");
    expect(row1!.pdf_path).toBe("/app/data/pdfs/D2SHELL5_2025_Q1.pdf");
    expect(row2!.pdf_path).toBe("/app/data/pdfs/D2SHELL5_2025_Q2.pdf");
  });

  it("accepts an explicitly injected db handle distinct from the getDb() singleton", async () => {
    const { Database } = await import("bun:sqlite");
    const injectedDb = new Database(":memory:");
    await initDatabase(injectedDb);

    const result = await ensureFinancialReportShellRow({
      db: injectedDb,
      actionCode: "D2SHELLINJ",
      year: 2026,
      quarter: "Q1",
      pdfPath: "/app/data/pdfs/D2SHELLINJ_2026_Q1.pdf",
    });

    const injectedRow = injectedDb
      .prepare("SELECT id, pdf_path FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get("D2SHELLINJ", "2026-Q1") as { id: string; pdf_path: string } | null;
    expect(injectedRow).not.toBeNull();
    expect(injectedRow!.id).toBe(result.id);
    expect(injectedRow!.pdf_path).toBe("/app/data/pdfs/D2SHELLINJ_2026_Q1.pdf");

    // The getDb() singleton must NOT have received this row — proves the
    // write went to the injected db, not the module-level singleton.
    const singletonRow = readRow("D2SHELLINJ", "2026-Q1");
    expect(singletonRow).toBeNull();

    injectedDb.close();
  });
});
