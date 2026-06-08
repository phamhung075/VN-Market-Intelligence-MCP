/**
 * PROSE-DEV-1 — DV tests: prose page OCR-text display in BCTC inspect viewer
 *
 * Root cause (Layer C display only — no data loss):
 *   handleBctcInspectOcr queries bctc_layout_units WHERE page_type='table'.
 *   Prose pages are excluded → coverage-gap branch → text_content:"".
 *   pdf_extracted_text has valid OCR text for every page but was never read
 *   in the gap branch.
 *
 * DV-1 (RED→GREEN): prose page with a pdf_extracted_text row returns raw OCR text.
 * DV-2 (regression): table page still returns PEK stitched_markdown, not raw OCR.
 * DV-3 (regression): report with no PEK units still uses pdf_extracted_text fallback.
 *
 * Isolation: in-memory SQLite only. Zero production DB access.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { handleBctcInspectOcr } from "../interface/mcp/routes/bctcInspectHandler.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── production DB guard ───────────────────────────────────────────────────────
Bun.env["DB_PATH"] = ":memory:";

const PROSE_REPORT_ID = "aaaabbbb-1111-2222-3333-ccccddddeeee";
const NO_PEK_REPORT_ID = "11112222-3333-4444-5555-666677778888";

// ── helpers ───────────────────────────────────────────────────────────────────

function openDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

interface CapturedResponse {
  statusCode: number;
  body: string;
}

function mockRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { statusCode: 200, body: "" };
  const res = {
    writeHead(code: number, _headers?: Record<string, string>) {
      captured.statusCode = code;
    },
    end(data?: string) {
      captured.body = data ?? "";
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

function mockReq(reportId: string, page: number): IncomingMessage {
  return {
    url: `/api/bctc-inspect/ocr/${reportId}?page=${page}`,
  } as unknown as IncomingMessage;
}

function insertReport(db: Database, id: string, actionCode: string, pdfPath: string | null): void {
  const emptyJson = "{}";
  db.prepare(`
    INSERT OR REPLACE INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_quarter, period_type, period_start, period_end,
       sort_key, pdf_path, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, ?, ?, 'HOSE', 'banking', 2026, 1, 'Q1',
            '2026-01-01', '2026-03-31', ?, ?, datetime('now'),
            ?, ?, ?, ?)
  `).run(
    id,
    actionCode,
    `${actionCode} Corp`,
    `${actionCode}-Q1-2026`,
    pdfPath,
    emptyJson,
    emptyJson,
    emptyJson,
    emptyJson,
  );
}

/**
 * Seed the scenario for DV-1 and DV-2:
 * - report with PEK units: one 'prose' covering page 1, one 'table' covering page 5
 * - pdf_extracted_text: page 1 = "Prose page one content", page 5 = "Table page content"
 */
function seedProseReport(db: Database): void {
  insertReport(
    db,
    PROSE_REPORT_ID,
    "ACB",
    "/app/data/pdfs/ACB/20260422-ACB-BCTC-Hop-nhat-Quy-1-nam-2026.pdf",
  );

  // bctc_layout_units: prose unit on page 1, table unit on page 5
  db.prepare(`
    INSERT OR IGNORE INTO bctc_layout_units
      (report_id, unit_id, schema_page, page_numbers_json, page_type, stitched_markdown, row_count, quarantined, extracted_at)
    VALUES (?, 'unit-prose-1', 1, '[1]', 'prose', '', 0, 0, datetime('now'))
  `).run(PROSE_REPORT_ID);

  db.prepare(`
    INSERT OR IGNORE INTO bctc_layout_units
      (report_id, unit_id, schema_page, page_numbers_json, page_type, stitched_markdown, row_count, quarantined, extracted_at)
    VALUES (?, 'unit-table-5', 5, '[5]', 'table', '| TÀI SẢN | 100 | 58,102,970 |', 1, 0, datetime('now'))
  `).run(PROSE_REPORT_ID);

  // pdf_extracted_text: raw OCR for both pages
  db.prepare(`
    INSERT OR IGNORE INTO pdf_extracted_text (filename, page_number, text_content, confidence)
    VALUES ('20260422-ACB-BCTC-Hop-nhat-Quy-1-nam-2026.pdf', 1, 'Prose page one content', 0.8)
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO pdf_extracted_text (filename, page_number, text_content, confidence)
    VALUES ('20260422-ACB-BCTC-Hop-nhat-Quy-1-nam-2026.pdf', 5, 'Table page content', 0.9)
  `).run();
}

/**
 * Seed a report with NO PEK units but with raw OCR for DV-3.
 */
function seedNoPekReport(db: Database): void {
  insertReport(db, NO_PEK_REPORT_ID, "VNM", "/app/data/pdfs/VNM/VNM_Q1_2026.pdf");

  db.prepare(`
    INSERT OR IGNORE INTO pdf_extracted_text (filename, page_number, text_content, confidence)
    VALUES ('VNM_Q1_2026.pdf', 1, 'raw ocr for no-pek report', 0.75)
  `).run();
}

// ── test suite ────────────────────────────────────────────────────────────────

describe("PROSE-DEV-1 — prose page OCR-text display", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb();
    seedProseReport(db);
    seedNoPekReport(db);
  });

  afterEach(() => {
    db.close();
  });

  /**
   * DV-1 (RED→GREEN): prose page (page_type='prose' in bctc_layout_units) has a
   * pdf_extracted_text row. Before fix: text_content === "". After fix: text_content
   * equals the raw OCR text; pek_coverage_gap stays true.
   */
  it("DV-1: prose page returns raw OCR text_content from pdf_extracted_text (not empty string)", () => {
    const { res, captured } = mockRes();
    handleBctcInspectOcr(mockReq(PROSE_REPORT_ID, 1), res, db, PROSE_REPORT_ID);

    expect(captured.statusCode).toBe(200);
    const data = JSON.parse(captured.body) as Record<string, unknown>;

    // Core assertion — this was the bug: text_content was "" for prose pages
    expect(data.text_content).toBe("Prose page one content");

    // pek_coverage_gap MUST still be true (signals no PEK-refined table content)
    expect(data.pek_coverage_gap).toBe(true);
    expect(data.has_pek).toBe(true);
  });

  /**
   * DV-1b: confidence comes from the pdf_extracted_text row (not hardcoded 0).
   */
  it("DV-1b: prose page confidence comes from pdf_extracted_text row", () => {
    const { res, captured } = mockRes();
    handleBctcInspectOcr(mockReq(PROSE_REPORT_ID, 1), res, db, PROSE_REPORT_ID);

    const data = JSON.parse(captured.body) as Record<string, unknown>;
    // The seeded row has confidence=0.8
    expect(data.confidence).toBe(0.8);
  });

  /**
   * DV-2 (regression): table page still returns PEK stitched_markdown, not raw OCR.
   * has_pek:true, pek_coverage_gap NOT set, text_content = stitched_markdown.
   */
  it("DV-2: table page still returns PEK stitched_markdown (regression guard)", () => {
    const { res, captured } = mockRes();
    handleBctcInspectOcr(mockReq(PROSE_REPORT_ID, 5), res, db, PROSE_REPORT_ID);

    expect(captured.statusCode).toBe(200);
    const data = JSON.parse(captured.body) as Record<string, unknown>;

    expect(data.has_pek).toBe(true);
    expect(data.pek_coverage_gap).toBeUndefined();
    // Must return PEK stitched_markdown, not raw OCR
    expect(data.text_content).toContain("TÀI SẢN");
    // Must NOT return the raw OCR text (Table page content)
    expect(data.text_content).not.toBe("Table page content");
    expect(data.unit_id).toBe("unit-table-5");
  });

  /**
   * DV-3 (regression): report with no PEK units still returns pdf_extracted_text
   * via the existing has_pek:false fallback path. Unaffected by this fix.
   */
  it("DV-3: no-PEK report still returns raw OCR via fallback (regression guard)", () => {
    const { res, captured } = mockRes();
    handleBctcInspectOcr(mockReq(NO_PEK_REPORT_ID, 1), res, db, NO_PEK_REPORT_ID);

    expect(captured.statusCode).toBe(200);
    const data = JSON.parse(captured.body) as Record<string, unknown>;

    expect(data.has_pek).toBe(false);
    expect(data.pek_coverage_gap).toBeUndefined();
    expect(data.text_content).toBe("raw ocr for no-pek report");
  });

  /**
   * DV-3b: prose page with NO pdf_extracted_text row → text_content stays ""
   * and pek_coverage_gap remains true (graceful degradation).
   */
  it("DV-3b: prose page with no pdf_extracted_text row → text_content empty (graceful)", () => {
    // Page 99: no pdf_extracted_text row seeded — graceful empty
    const { res, captured } = mockRes();
    handleBctcInspectOcr(mockReq(PROSE_REPORT_ID, 99), res, db, PROSE_REPORT_ID);

    expect(captured.statusCode).toBe(200);
    const data = JSON.parse(captured.body) as Record<string, unknown>;

    expect(data.has_pek).toBe(true);
    expect(data.pek_coverage_gap).toBe(true);
    expect(data.text_content).toBe("");
    expect(data.confidence).toBe(0);
  });
});
