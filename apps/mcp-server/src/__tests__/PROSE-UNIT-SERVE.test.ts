/**
 * PROSE-UNIT-SERVE — Integration tests for BPE-DEV-2 serving layer
 *
 * Covers the prose-unit serving fix in bctcInspectHandler.ts and
 * the prose_sections extension in bctcFullTools.ts.
 *
 * AC coverage:
 *   TC-2   — prose unit with text: has_pek:true, pek_coverage_gap:false, text_content non-empty
 *   TC-2b  — prose unit with empty text (EC-1): pek_coverage_gap:true, fallback triggered
 *   TC-3   — regression: existing table unit path unchanged
 *   TC-5   — bctcFullTools prose_sections array, 4000-char cap, prose_truncated flag
 *
 * Uses in-memory SQLite + mock HTTP objects — zero production DB access (MZH-2 guard).
 * Self-contained: mocks prose unit rows so the test does not depend on BPE-DEV-1 producer.
 *
 * DDD layer: Interface tests (serving boundary handlers).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";

// Force in-memory DB before any import that might touch getDb()
Bun.env["DB_PATH"] = ":memory:";

import { Database as BunDatabase } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import {
  handleBctcInspectOcr,
} from "../interface/mcp/routes/bctcInspectHandler.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBctcFullTools } from "../interface/mcp/tools/financial-reports/bctcFullTools.js";

// ── MZH-2 production DB guard ────────────────────────────────────────────────
const PRODUCTION_DB_PATTERNS = [/market\.db/, /\/app\/data\//, /apps\/mcp-server\/data\//];
function assertNotProductionDb(path: string): void {
  for (const p of PRODUCTION_DB_PATTERNS) {
    if (p.test(path)) {
      throw new Error(
        `[MZH-2 guard] BLOCKED: attempt to open production DB path "${path}". Tests MUST use :memory:.`,
      );
    }
  }
}
assertNotProductionDb(Bun.env["DB_PATH"] ?? "");

// ── Constants ─────────────────────────────────────────────────────────────────

const PROSE_REPORT_ID = "cccccccc-dddd-eeee-ffff-000000000001";
const TABLE_REPORT_ID = "cccccccc-dddd-eeee-ffff-000000000002";
const PROSE_EMPTY_REPORT_ID = "cccccccc-dddd-eeee-ffff-000000000003";

const PROSE_TEXT = "Chính sách kế toán áp dụng nhất quán với năm trước.";
const LONG_PROSE_TEXT = "A".repeat(5000); // exceeds 4000-char cap → truncated

// ── Helpers ───────────────────────────────────────────────────────────────────

function openTestDb(): Database {
  const db = new BunDatabase(":memory:");
  initFinancialReportsTables(db);
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

function mockOcrReq(reportId: string, page: number): IncomingMessage {
  return {
    url: `/api/bctc-inspect/ocr/${reportId}?page=${page}`,
  } as unknown as IncomingMessage;
}

/** Insert a minimal financial_reports row for the given report ID. */
function insertReport(db: Database, id: string, actionCode: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_quarter, period_type, period_start, period_end,
       sort_key, pdf_path, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, ?, ?, 'HOSE', 'technology', 2026, 1, 'Q1', '2026-01-01', '2026-03-31',
            ?, ?, datetime('now'), ?, ?, ?, ?)
  `).run(
    id,
    actionCode,
    `${actionCode} Corp`,
    `${actionCode}-Q1-2026`,
    `/app/data/pdfs/${actionCode}/${actionCode}_Q1_2026.pdf`,
    "{}",
    "{}",
    "{}",
    "{}",
  );
}

/** Insert a bctc_layout_units row with the given page_type and stitched_markdown. */
function insertLayoutUnit(
  db: Database,
  reportId: string,
  unitId: string,
  pageNumbers: number[],
  pageType: "table" | "prose" | "blank",
  stitchedMarkdown: string,
): void {
  db.prepare(`
    INSERT OR IGNORE INTO bctc_layout_units
      (report_id, unit_id, schema_page, page_numbers_json, page_type, stitched_markdown, row_count, quarantined, extracted_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, datetime('now'))
  `).run(
    reportId,
    unitId,
    pageNumbers[0]!,
    JSON.stringify(pageNumbers),
    pageType,
    stitchedMarkdown,
  );
}

/** Insert a minimal full-featured financial_reports row that satisfies PUB-1..4 gates. */
function insertPublishableReport(db: Database, reportId: string, actionCode: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_quarter, period_type, period_start, period_end,
       sort_key, pdf_path, parsed_at,
       net_revenue, gross_profit, operating_profit, ebitda, profit_before_tax, net_profit,
       eps, diluted_eps,
       total_assets, current_assets, cash, inventory,
       total_liabilities, short_term_debt, long_term_debt, equity_total,
       operating_cf, investing_cf, financing_cf, capex, free_cash_flow,
       audit_status, extraction_confidence, refine_status,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (
      ?, ?, ?, 'HOSE', 'technology', 2026, 1, 'Q1', '2026-01-01', '2026-03-31',
      ?, ?, datetime('now'),
      12000000, 5000000, 3000000, 4000000, 2800000, 2100000,
      2500, 2500,
      50000000, 20000000, 5000000, 1000000,
      30000000, 5000000, 10000000, 20000000,
      3000000, -1000000, -500000, 800000, 2200000,
      'audited', 0.92, 'DONE',
      '{}', '{}', '{}', '{}'
    )
  `).run(reportId, actionCode, `${actionCode} Corp`, `${actionCode}-Q1-2026`, `/app/data/pdfs/${actionCode}/${actionCode}_Q1_2026.pdf`);

  // PUB-2: insert at least one bctc_table_rows row
  db.prepare(`
    INSERT OR IGNORE INTO bctc_table_rows
      (report_id, page_number, row_order, code, label, statement_section,
       period_current, value_current, period_prior, value_prior, unit, is_summary_row)
    VALUES (?, 1, 0, '111', 'Tiền và tương đương tiền', 'balance_sheet',
            '31/03/2026', 5000000, '31/12/2025', 4500000, 'million_vnd', 0)
  `).run(reportId);
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe("BPE-DEV-2 — handleBctcInspectOcr prose serving", () => {
  let db: Database;

  beforeEach(() => {
    db = openTestDb();

    // PROSE_REPORT_ID: prose unit with non-empty stitched_markdown (TC-2)
    insertReport(db, PROSE_REPORT_ID, "FPT");
    insertLayoutUnit(db, PROSE_REPORT_ID, "unit-prose-12", [12], "prose", PROSE_TEXT);

    // TABLE_REPORT_ID: table unit for TC-3 regression check
    insertReport(db, TABLE_REPORT_ID, "VNM");
    insertLayoutUnit(
      db,
      TABLE_REPORT_ID,
      "unit-table-3",
      [3, 4, 5],
      "table",
      "| TÀI SẢN NGẮN HẠN | 100 | 58,102,970 |",
    );

    // PROSE_EMPTY_REPORT_ID: prose unit with empty stitched_markdown (TC-2b EC-1)
    insertReport(db, PROSE_EMPTY_REPORT_ID, "ACB");
    insertLayoutUnit(db, PROSE_EMPTY_REPORT_ID, "unit-prose-empty-7", [7], "prose", "");
    // Seed pdf_extracted_text fallback row for TC-2b
    db.prepare(`
      INSERT OR IGNORE INTO pdf_extracted_text (filename, page_number, text_content, confidence)
      VALUES ('ACB_Q1_2026.pdf', 7, 'LEGACY FALLBACK TEXT FOR ACB PAGE 7', 0.60)
    `).run();
  });

  afterEach(() => {
    db.close();
  });

  // ── TC-2: prose unit with text → served directly ─────────────────────────

  it("TC-2: prose unit with text returns has_pek:true, pek_coverage_gap:false, non-empty text_content", () => {
    const { res, captured } = mockRes();
    handleBctcInspectOcr(mockOcrReq(PROSE_REPORT_ID, 12), res, db, PROSE_REPORT_ID);

    expect(captured.statusCode).toBe(200);
    const data = JSON.parse(captured.body) as Record<string, unknown>;

    expect(data.has_pek).toBe(true);
    // AC-2: prose with text → pek_coverage_gap MUST be absent (not true)
    expect(data.pek_coverage_gap).toBeUndefined();
    expect(typeof data.text_content).toBe("string");
    expect(data.text_content).toContain("Chính sách kế toán");
    expect(data.text_content).toBe(PROSE_TEXT);
    expect(data.unit_id).toBe("unit-prose-12");
    expect(data.quarantined).toBe(false);
  });

  it("TC-2: prose unit page — text_content matches stored stitched_markdown exactly", () => {
    const { res, captured } = mockRes();
    handleBctcInspectOcr(mockOcrReq(PROSE_REPORT_ID, 12), res, db, PROSE_REPORT_ID);

    const data = JSON.parse(captured.body) as Record<string, unknown>;
    expect(data.text_content).toBe(PROSE_TEXT);
  });

  // ── TC-2b: prose unit with empty text → pek_coverage_gap:true → fallback ──

  it("TC-2b: prose unit with empty stitched_markdown returns pek_coverage_gap:true", () => {
    const { res, captured } = mockRes();
    handleBctcInspectOcr(mockOcrReq(PROSE_EMPTY_REPORT_ID, 7), res, db, PROSE_EMPTY_REPORT_ID);

    expect(captured.statusCode).toBe(200);
    const data = JSON.parse(captured.body) as Record<string, unknown>;

    expect(data.has_pek).toBe(true);
    // EC-1: empty prose unit → gap flag must be true
    expect(data.pek_coverage_gap).toBe(true);
  });

  it("TC-2b: empty prose unit falls through to pdf_extracted_text fallback", () => {
    const { res, captured } = mockRes();
    handleBctcInspectOcr(mockOcrReq(PROSE_EMPTY_REPORT_ID, 7), res, db, PROSE_EMPTY_REPORT_ID);

    const data = JSON.parse(captured.body) as Record<string, unknown>;
    // Fallback must serve legacy OCR text when available
    expect(data.text_content).toContain("LEGACY FALLBACK TEXT FOR ACB PAGE 7");
  });

  // ── TC-3: regression — existing table unit path unchanged ─────────────────

  it("TC-3: table unit still served correctly (regression)", () => {
    const { res, captured } = mockRes();
    handleBctcInspectOcr(mockOcrReq(TABLE_REPORT_ID, 3), res, db, TABLE_REPORT_ID);

    expect(captured.statusCode).toBe(200);
    const data = JSON.parse(captured.body) as Record<string, unknown>;

    expect(data.has_pek).toBe(true);
    expect(data.pek_coverage_gap).toBeUndefined();
    expect(data.text_content).toContain("TÀI SẢN NGẮN HẠN");
    expect(data.unit_id).toBe("unit-table-3");
    expect(data.quarantined).toBe(false);
  });

  it("TC-3: page not covered by any unit returns pek_coverage_gap:true (unchanged)", () => {
    const { res, captured } = mockRes();
    // Page 99 is not covered by any unit in TABLE_REPORT_ID
    handleBctcInspectOcr(mockOcrReq(TABLE_REPORT_ID, 99), res, db, TABLE_REPORT_ID);

    const data = JSON.parse(captured.body) as Record<string, unknown>;
    expect(data.has_pek).toBe(true);
    expect(data.pek_coverage_gap).toBe(true);
  });

  // ── EC-5: blank unit excluded — blank page falls through to gap ───────────

  it("EC-5: blank unit page_type excluded from PEK seam — returns pek_coverage_gap:true", () => {
    // Insert a blank unit covering page 20
    const BLANK_REPORT_ID = "cccccccc-dddd-eeee-ffff-000000000004";
    insertReport(db, BLANK_REPORT_ID, "HPG");
    insertLayoutUnit(db, BLANK_REPORT_ID, "unit-blank-20", [20], "blank", "");

    const { res, captured } = mockRes();
    handleBctcInspectOcr(mockOcrReq(BLANK_REPORT_ID, 20), res, db, BLANK_REPORT_ID);

    const data = JSON.parse(captured.body) as Record<string, unknown>;
    // Blank unit must NOT be served — page falls through to gap
    expect(data.has_pek).toBe(true);
    expect(data.pek_coverage_gap).toBe(true);
  });
});

// ── TC-5 helpers ─────────────────────────────────────────────────────────────

type ToolResult = { content: Array<{ type: string; text: string }> };

function getRegisteredToolFn(
  server: McpServer,
  name: string,
): (args: Record<string, unknown>) => Promise<ToolResult> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      callback?: (args: Record<string, unknown>) => Promise<ToolResult>;
      handler?: (args: Record<string, unknown>) => Promise<ToolResult>;
    }>;
  })._registeredTools;
  const tool = tools[name];
  if (!tool) throw new Error(`Tool ${name} not registered`);
  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable found for tool: ${name}`);
  return fn;
}

async function callToolFull(
  server: McpServer,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  return getRegisteredToolFn(server, name)(args);
}

// ── TC-5: bctcFullTools prose_sections ───────────────────────────────────────

describe("BPE-DEV-2 — bctcFullTools prose_sections (AC-3)", () => {
  let db: Database;

  function makeServer(): McpServer {
    const server = new McpServer(
      { name: "test", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    registerBctcFullTools(server, db);
    return server;
  }

  const FULL_REPORT_ID = "ffffffff-0000-1111-2222-333333333333";
  const FULL_REPORT_CODE = "FPT";

  beforeEach(() => {
    db = openTestDb();

    // Insert publishable report
    insertPublishableReport(db, FULL_REPORT_ID, FULL_REPORT_CODE);

    // Insert prose unit with non-empty text (page 12)
    insertLayoutUnit(db, FULL_REPORT_ID, "unit-prose-p12", [12], "prose", PROSE_TEXT);

    // Insert table unit (page 3) — for regression check
    insertLayoutUnit(
      db,
      FULL_REPORT_ID,
      "unit-table-p3",
      [3, 4],
      "table",
      "| VỐN CHỦ SỞ HỮU | 400 | 20,000,000 |",
    );
  });

  afterEach(() => {
    db.close();
  });

  it("TC-5: prose_sections array present in structured_data with non-empty text", async () => {
    const server = makeServer();
    const result = await callToolFull(server, "get_bctc_full", { code: FULL_REPORT_CODE });

    expect(result.content.length).toBeGreaterThanOrEqual(2);

    const structured = JSON.parse(result.content[1]!.text) as {
      structured_data: {
        prose_sections: Array<{
          unit_id: string;
          page_numbers: number[];
          text_content: string;
          prose_truncated: boolean;
        }>;
      };
    };

    expect(Array.isArray(structured.structured_data.prose_sections)).toBe(true);
    expect(structured.structured_data.prose_sections.length).toBe(1);

    const section = structured.structured_data.prose_sections[0]!;
    expect(section.unit_id).toBe("unit-prose-p12");
    expect(section.page_numbers).toEqual([12]);
    expect(section.text_content).toBe(PROSE_TEXT);
    expect(section.prose_truncated).toBe(false);
  });

  it("TC-5: prose_sections is empty array when no prose units (never null)", async () => {
    // Report with only a table unit (no prose)
    const NO_PROSE_ID = "ffffffff-0000-1111-2222-444444444444";
    insertPublishableReport(db, NO_PROSE_ID, "VNM");
    // Only table unit
    insertLayoutUnit(db, NO_PROSE_ID, "unit-table-only", [2], "table", "| CODE | 100 | 999 |");

    const server = makeServer();
    const result = await callToolFull(server, "get_bctc_full", { code: "VNM" });

    expect(result.content.length).toBeGreaterThanOrEqual(2);
    const structured = JSON.parse(result.content[1]!.text) as {
      structured_data: { prose_sections: unknown[] };
    };
    expect(Array.isArray(structured.structured_data.prose_sections)).toBe(true);
    expect(structured.structured_data.prose_sections.length).toBe(0);
  });

  it("TC-5: prose_truncated:true when stitched_markdown > 4000 chars", async () => {
    // Insert a long prose unit (> 4000 chars)
    const LONG_REPORT_ID = "ffffffff-0000-1111-2222-555555555555";
    insertPublishableReport(db, LONG_REPORT_ID, "VCB");
    insertLayoutUnit(db, LONG_REPORT_ID, "unit-long-prose", [15], "prose", LONG_PROSE_TEXT);

    const server = makeServer();
    const result = await callToolFull(server, "get_bctc_full", { code: "VCB" });

    const structured = JSON.parse(result.content[1]!.text) as {
      structured_data: {
        prose_sections: Array<{
          text_content: string;
          prose_truncated: boolean;
        }>;
      };
    };

    expect(structured.structured_data.prose_sections.length).toBe(1);
    const section = structured.structured_data.prose_sections[0]!;
    // Cap at 4000 chars
    expect(section.text_content.length).toBe(4000);
    expect(section.prose_truncated).toBe(true);
  });

  it("TC-5: prose_sections sorted by first page number ascending", async () => {
    // Insert second prose unit on page 8 (earlier than page 12)
    insertLayoutUnit(
      db,
      FULL_REPORT_ID,
      "unit-prose-p8",
      [8],
      "prose",
      "Chú thích tài chính trang 8",
    );

    const server = makeServer();
    const result = await callToolFull(server, "get_bctc_full", { code: FULL_REPORT_CODE });

    const structured = JSON.parse(result.content[1]!.text) as {
      structured_data: {
        prose_sections: Array<{ unit_id: string; page_numbers: number[] }>;
      };
    };

    // page 8 unit should appear before page 12 unit
    expect(structured.structured_data.prose_sections.length).toBe(2);
    expect(structured.structured_data.prose_sections[0]!.unit_id).toBe("unit-prose-p8");
    expect(structured.structured_data.prose_sections[1]!.unit_id).toBe("unit-prose-p12");
  });

  it("TC-5: quarantined prose units excluded from prose_sections", async () => {
    // Mark the prose unit as quarantined
    db.prepare(
      "UPDATE bctc_layout_units SET quarantined = 1 WHERE unit_id = 'unit-prose-p12'",
    ).run();

    const server = makeServer();
    const result = await callToolFull(server, "get_bctc_full", { code: FULL_REPORT_CODE });

    const structured = JSON.parse(result.content[1]!.text) as {
      structured_data: { prose_sections: unknown[] };
    };

    // Quarantined unit must not appear
    expect(structured.structured_data.prose_sections.length).toBe(0);
  });
});
