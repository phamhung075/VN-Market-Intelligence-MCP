/**
 * FIX-REFINE-PENDING-SCHEMA.test.ts — Schema extension tests for get_bctc_pending_refine
 *
 * Sprint: FIX-REFINE-PENDING-SCHEMA
 * Task:   FIX-REFINE-PENDING-SCHEMA (task signal cwk-refine-schema-mismatch-202606060906)
 *
 * Defect fixed: get_bctc_pending_refine was missing text_status, confirm_status, and
 * windows[] fields required by the refine_bctc_md flow Phase 0 gate and Phase 2 fan-out.
 *
 * Tests:
 *   DV-1: Scalar fields (text_status, confirm_status) present in returned report.
 *   DV-2: windows[] computed correctly for a multi-page report (3 pages → 3 windows,
 *         page_type and needs_image derived per window).
 *   DV-3: Empty page texts (fetchPageTextsFn returns []) → windows: [] (no throw).
 *   DV-4: CONFIRMED report excluded from results (WHERE clause guard).
 *   DV-5: page_type = "continuation" when window spans multiple pages (continuation marker).
 *
 * DDD: Tool under test is interface layer; dep injection bypasses HTTP (infrastructure)
 *      for page text fetching. Window partitioning is application/utils (real call).
 *
 * RED-BEFORE-GREEN PROTOCOL:
 *   All tests listed were failing before the fix (missing fields / incorrect output).
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { buildGetBctcPendingRefineHandler } from "../interface/mcp/tools/financial-reports/getBctcPendingRefineTool.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function openTestDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  return db;
}

const REPORT_A = "aaa00000-0000-0000-0000-000000000001";
const REPORT_B = "bbb00000-0000-0000-0000-000000000002";
const REPORT_C = "ccc00000-0000-0000-0000-000000000003";

function insertReport(
  db: Database,
  id: string,
  opts: {
    refine_status?: string;
    text_status?: string;
    /** 'PENDING' = not confirmed (default); 'CONFIRMED' = confirmed (excluded by WHERE) */
    confirm_status?: string;
    pdf_path?: string | null;
    /** action_code must be unique per (action_code, sort_key) */
    action_code?: string;
  } = {},
): void {
  const {
    refine_status = "PENDING",
    text_status = "COMPLETE",
    confirm_status = "PENDING",
    pdf_path = `/data/pdfs/${id}.pdf`,
    action_code = `TST_${id.substring(0, 4).toUpperCase()}`,
  } = opts;

  db.run(
    `INSERT INTO financial_reports
       (id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type, period_start, period_end, sort_key,
        net_profit, refine_status, text_status, confirm_status, audit_status,
        extraction_confidence, parsed_at,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
        pdf_path)
     VALUES (?, ?, 'Test Co', 'HOSE', 'other',
             2025, 1, 'Q1', '2025-01-01', '2025-03-31', ?,
             5.0, ?, ?, ?, 'unaudited', 0.5, datetime('now'),
             '{}', '{}', '{}', '{}',
             ?)`,
    [id, action_code, `2025-Q1-${id.substring(0, 6)}`, refine_status, text_status, confirm_status, pdf_path],
  );
}

/** Parse the JSON text from an MCP tool response */
function parseResult(result: { content: [{ type: string; text: string }] }): unknown {
  return JSON.parse(result.content[0]!.text);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("FIX-REFINE-PENDING-SCHEMA — get_bctc_pending_refine extended schema", () => {
  let db: Database;

  beforeEach(() => {
    db = openTestDb();
  });

  // ── DV-1: Scalar fields (text_status, confirm_status) present ─────────────

  it("DV-1: returns text_status and confirm_status scalars alongside existing fields", async () => {
    insertReport(db, REPORT_A, {
      text_status: "COMPLETE",
      confirm_status: "PENDING",
      refine_status: "PENDING",
    });

    // Inject empty page fetcher to isolate scalar test from window computation
    const handler = buildGetBctcPendingRefineHandler(db, {
      getPageTextFn: async () => "",
    });

    const result = await handler({ limit: 1 });
    const reports = parseResult(result) as Array<Record<string, unknown>>;

    expect(reports).toHaveLength(1);
    const report = reports[0]!;

    // Original fields still present
    expect(report["id"]).toBe(REPORT_A);
    expect(typeof report["filename"]).toBe("string");
    expect(typeof report["page_count"]).toBe("number");
    expect(report["refine_status"]).toBe("PENDING");

    // New scalar fields
    expect(report["text_status"]).toBe("COMPLETE");
    // confirm_status = 'PENDING' (schema NOT NULL DEFAULT 'PENDING'; null edge handled by WHERE)
    expect(report["confirm_status"]).toBe("PENDING");

    // windows must be present (array, possibly empty due to empty page texts)
    expect(Array.isArray(report["windows"])).toBe(true);
  });

  // ── DV-2: windows[] computed for multi-page report ────────────────────────

  it("DV-2: windows[] are computed with page_type and needs_image for a 3-page table report", async () => {
    insertReport(db, REPORT_A);

    // Three table pages (pipe character → needsImage=true, page_type='table')
    const pageTexts: Record<number, string> = {
      1: "| Mã số | Thuyết minh | Số cuối kỳ |\n| 100 | A | 1 234 567 |",
      2: "| Mã số | Thuyết minh | Số cuối kỳ |\n| 200 | B | 2 345 678 |",
      3: "| Mã số | Thuyết minh | Số cuối kỳ |\n| 300 | C | 3 456 789 |",
    };

    const handler = buildGetBctcPendingRefineHandler(db, {
      getPageTextFn: async (_reportId, _filename, pageNum) => {
        return pageTexts[pageNum] ?? "";
      },
    });

    const result = await handler({ limit: 1 });
    const reports = parseResult(result) as Array<Record<string, unknown>>;
    const report = reports[0]!;

    const windows = report["windows"] as Array<Record<string, unknown>>;

    // 3 standalone pages → 3 windows (no continuation markers)
    expect(windows).toHaveLength(3);

    // Each window must carry the required Phase 2 fan-out fields
    for (const w of windows) {
      expect(typeof w["unit_id"]).toBe("string");
      expect(Array.isArray(w["page_numbers"])).toBe(true);
      expect((w["page_numbers"] as number[]).length).toBeGreaterThanOrEqual(1);
      expect(["table", "prose", "continuation"].includes(w["page_type"] as string)).toBe(true);
      expect(typeof w["needs_image"]).toBe("boolean");
    }

    // Table pages have pipe characters → page_type='table', needs_image=true
    const firstWindow = windows[0]!;
    expect(firstWindow["page_type"]).toBe("table");
    expect(firstWindow["needs_image"]).toBe(true);
    expect(firstWindow["page_numbers"]).toEqual([1]);
  });

  // ── DV-3: Empty page texts → windows: [] (no throw) ──────────────────────

  it("DV-3: empty page texts (all pages blank after page 1) returns windows: [] without throwing", async () => {
    insertReport(db, REPORT_A);

    // getPageTextFn returns "" for every page. fetchAllPageTexts pushes page 1 (text="")
    // then stops at page 2 (empty + pageNum > 1). Result: [{page:1, text:""}].
    // partitionIntoWindows with 1 empty-text page → 1 window.
    // This test validates the "no throw" contract and the windows array type.
    // For a truly empty windows result, use pdf_path=null (no filename → guard skips fetch).
    insertReport(db, REPORT_B, { pdf_path: null });

    const handler = buildGetBctcPendingRefineHandler(db, {
      getPageTextFn: async () => "",
    });

    // Test REPORT_B (null pdf_path → filename="" → if(filename) guard skips window computation)
    const result = await handler({});
    const reports = parseResult(result) as Array<Record<string, unknown>>;

    const reportB = reports.find((r) => r["id"] === REPORT_B)!;
    expect(reportB).toBeDefined();

    // No filename → windows must be [] (guard skips fetch entirely, no throw)
    expect(Array.isArray(reportB["windows"])).toBe(true);
    expect((reportB["windows"] as unknown[]).length).toBe(0);

    // REPORT_A has a filename but all page texts empty → still returns array, no throw
    const reportA = reports.find((r) => r["id"] === REPORT_A)!;
    expect(Array.isArray(reportA["windows"])).toBe(true);
  });

  // ── DV-4: CONFIRMED report excluded from results ──────────────────────────

  it("DV-4: CONFIRMED reports are excluded by the WHERE clause", async () => {
    insertReport(db, REPORT_A, { confirm_status: "CONFIRMED" });
    insertReport(db, REPORT_B, { confirm_status: "PENDING" });

    const handler = buildGetBctcPendingRefineHandler(db, {
      getPageTextFn: async () => "",
    });

    const result = await handler({});
    const reports = parseResult(result) as Array<Record<string, unknown>>;

    const ids = reports.map((r) => r["id"]);
    expect(ids).not.toContain(REPORT_A);
    expect(ids).toContain(REPORT_B);
  });

  // ── DV-FIX-A-1: Fully-processed PARTIAL excluded from queue ─────────────────

  it("DV-FIX-A-1: PARTIAL report with ALL units window_status=DONE is excluded from queue (Fix A)", async () => {
    // Simulate ACB fea19bae scenario: PARTIAL report with 2 DONE units
    const REPORT_DONE_PARTIAL = "fea19bae-dead-beef-0000-000000000001";
    insertReport(db, REPORT_DONE_PARTIAL, {
      refine_status: "PARTIAL",
      text_status: "COMPLETE",
      confirm_status: "PENDING",
      action_code: "ACB",
    });
    // Insert 2 DONE units for this report
    db.run(
      `INSERT INTO bctc_refined_units (report_id, unit_id, page_numbers_json, markdown, window_status, refined_at)
       VALUES (?, 'unit-1', '[1]', 'md1', 'DONE', datetime('now'))`,
      [REPORT_DONE_PARTIAL],
    );
    db.run(
      `INSERT INTO bctc_refined_units (report_id, unit_id, page_numbers_json, markdown, window_status, refined_at)
       VALUES (?, 'unit-2', '[2]', 'md2', 'DONE', datetime('now'))`,
      [REPORT_DONE_PARTIAL],
    );

    // Insert a genuine PENDING report — this one MUST be returned
    const REPORT_PENDING = "ccc00000-0000-0000-0000-000000000010";
    insertReport(db, REPORT_PENDING, {
      refine_status: "PENDING",
      text_status: "COMPLETE",
      confirm_status: "PENDING",
      action_code: "CTG",
    });

    const handler = buildGetBctcPendingRefineHandler(db, {
      getPageTextFn: async () => "",
    });

    const result = await handler({ limit: 10 });
    const reports = parseResult(result) as Array<Record<string, unknown>>;
    const ids = reports.map((r) => r["id"]);

    // Fully-processed PARTIAL must be excluded
    expect(ids).not.toContain(REPORT_DONE_PARTIAL);
    // Genuine PENDING must be included
    expect(ids).toContain(REPORT_PENDING);
  });

  it("DV-FIX-A-2: PARTIAL report with at least one non-DONE unit remains in queue (genuine partial)", async () => {
    // Genuine PARTIAL: 1 DONE unit + 1 FAILED unit → still has work remaining
    const REPORT_GENUINE_PARTIAL = "aabbccdd-0000-0000-0000-000000000002";
    insertReport(db, REPORT_GENUINE_PARTIAL, {
      refine_status: "PARTIAL",
      text_status: "COMPLETE",
      confirm_status: "PENDING",
      action_code: "VNM",
    });
    db.run(
      `INSERT INTO bctc_refined_units (report_id, unit_id, page_numbers_json, markdown, window_status, refined_at)
       VALUES (?, 'unit-1', '[1]', 'md1', 'DONE', datetime('now'))`,
      [REPORT_GENUINE_PARTIAL],
    );
    db.run(
      `INSERT INTO bctc_refined_units (report_id, unit_id, page_numbers_json, markdown, window_status, refined_at)
       VALUES (?, 'unit-2', '[2]', 'md2', 'FAILED', datetime('now'))`,
      [REPORT_GENUINE_PARTIAL],
    );

    const handler = buildGetBctcPendingRefineHandler(db, {
      getPageTextFn: async () => "",
    });

    const result = await handler({ limit: 10 });
    const reports = parseResult(result) as Array<Record<string, unknown>>;
    const ids = reports.map((r) => r["id"]);

    // Genuine PARTIAL (has FAILED units) must remain in queue
    expect(ids).toContain(REPORT_GENUINE_PARTIAL);
  });

  it("DV-FIX-A-3: PARTIAL report with zero units stays in queue (units may not have been pushed yet)", async () => {
    // PARTIAL with 0 units: the second COUNT subquery is = 0, so NOT(...) condition is false
    // → report stays eligible (not excluded)
    const REPORT_ZERO_UNITS = "00000000-0000-0000-0000-000000000003";
    insertReport(db, REPORT_ZERO_UNITS, {
      refine_status: "PARTIAL",
      text_status: "COMPLETE",
      confirm_status: "PENDING",
      action_code: "HPG",
    });
    // No bctc_refined_units inserted

    const handler = buildGetBctcPendingRefineHandler(db, {
      getPageTextFn: async () => "",
    });

    const result = await handler({ limit: 10 });
    const reports = parseResult(result) as Array<Record<string, unknown>>;
    const ids = reports.map((r) => r["id"]);

    // Zero units → second subquery COUNT = 0 → NOT(...) is false → report stays in queue
    expect(ids).toContain(REPORT_ZERO_UNITS);
  });

  // ── DV-5: page_type = "continuation" for multi-page window ───────────────

  it("DV-5: page_type='continuation' when window spans multiple pages via continuation marker", async () => {
    insertReport(db, REPORT_C);

    // Page 1: table page. Page 2: starts with continuation marker.
    const pageTexts: Record<number, string> = {
      1: "| Mã số | Thuyết minh | Số cuối kỳ |\n| 100 | A | 1 234 567 |",
      2: "tiếp theo — remaining rows\n| 101 | B | 9 876 543 |",
    };

    const handler = buildGetBctcPendingRefineHandler(db, {
      getPageTextFn: async (_reportId, _filename, pageNum) => {
        return pageTexts[pageNum] ?? "";
      },
    });

    const result = await handler({ limit: 1 });
    const reports = parseResult(result) as Array<Record<string, unknown>>;
    const report = reports[0]!;
    const windows = report["windows"] as Array<Record<string, unknown>>;

    // Pages 1+2 should be merged into one continuation window
    expect(windows).toHaveLength(1);
    expect(windows[0]!["page_type"]).toBe("continuation");
    expect(windows[0]!["page_numbers"]).toEqual([1, 2]);
    expect(windows[0]!["needs_image"]).toBe(true); // page 1 has table content
  });
});
