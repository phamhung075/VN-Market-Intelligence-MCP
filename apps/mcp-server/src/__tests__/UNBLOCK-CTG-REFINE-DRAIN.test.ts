/**
 * UNBLOCK-CTG-REFINE-DRAIN.test.ts — Regression: FAILED reports must be included in
 * get_bctc_pending_refine queue so the fleet cron can retry them.
 *
 * Root cause: get_bctc_pending_refine used refine_status IN ('PENDING','PARTIAL') — excluded
 * 'FAILED'. CTG report 49c11ce2 had refine_status='FAILED' (set by in-container refineOneReport()
 * hitting Option-Y no-spawn path). Fleet cron agent saw empty queue → 19 consecutive starved cycles.
 *
 * Fix: extend predicate to refine_status IN ('PENDING','PARTIAL','FAILED').
 *
 * Tests:
 *   RD-1: report with refine_status='FAILED' IS returned by get_bctc_pending_refine
 *   RD-2: report with refine_status='DONE' is NOT returned (already complete)
 *   RD-3: report with refine_status='FAILED' + confirm_status='CONFIRMED' is excluded (CONFIRMED gate)
 *   RD-4: mixed queue — PENDING, PARTIAL, FAILED all included; DONE excluded
 *
 * DDD: interface layer. Dep injection bypasses HTTP (infrastructure).
 * RED-BEFORE-GREEN: RD-1, RD-2, RD-3, RD-4 were failing before the 'FAILED' predicate fix.
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

const REPORT_CTG   = "49c11ce2-0000-0000-0000-000000000001";
const REPORT_VCB   = "bdcfa5e0-0000-0000-0000-000000000002";
const REPORT_DONE  = "d0ne0000-0000-0000-0000-000000000003";
const REPORT_PART  = "0part000-0000-0000-0000-000000000004";

function insertReport(
  db: Database,
  id: string,
  opts: {
    refine_status?: string;
    text_status?: string;
    confirm_status?: string;
    action_code?: string;
  } = {},
): void {
  const {
    refine_status = "PENDING",
    text_status = "COMPLETE",
    confirm_status = "PENDING",
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
             2026, 1, 'Q1', '2026-01-01', '2026-03-31', ?,
             5.0, ?, ?, ?, 'unaudited', 0.5, datetime('now'),
             '{}', '{}', '{}', '{}',
             ?)`,
    [id, action_code, `2026-Q1-${id.substring(0, 6)}`, refine_status, text_status, confirm_status, `/data/pdfs/${id}.pdf`],
  );
}

function parseResult(result: { content: [{ type: string; text: string }] }): unknown {
  return JSON.parse(result.content[0]!.text);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("UNBLOCK-CTG-REFINE-DRAIN — FAILED reports must be included in pending queue", () => {
  let db: Database;

  beforeEach(() => {
    db = openTestDb();
  });

  // ── RD-1: FAILED report IS returned ───────────────────────────────────────

  it("RD-1: report with refine_status='FAILED' is returned by get_bctc_pending_refine", async () => {
    insertReport(db, REPORT_CTG, {
      refine_status: "FAILED",
      text_status: "COMPLETE",
      confirm_status: "PENDING",
      action_code: "CTG",
    });

    const handler = buildGetBctcPendingRefineHandler(db, {
      getPageTextFn: async () => "",
    });

    const result = await handler({});
    const reports = parseResult(result) as Array<Record<string, unknown>>;

    const ids = reports.map((r) => r["id"]);
    expect(ids).toContain(REPORT_CTG);

    const ctgReport = reports.find((r) => r["id"] === REPORT_CTG)!;
    expect(ctgReport["refine_status"]).toBe("FAILED");
    expect(ctgReport["text_status"]).toBe("COMPLETE");
  });

  // ── RD-2: DONE report is NOT returned ─────────────────────────────────────

  it("RD-2: report with refine_status='DONE' is excluded from results", async () => {
    insertReport(db, REPORT_DONE, {
      refine_status: "DONE",
      text_status: "COMPLETE",
      action_code: "DGC",
    });
    insertReport(db, REPORT_CTG, {
      refine_status: "FAILED",
      text_status: "COMPLETE",
      action_code: "CTG",
    });

    const handler = buildGetBctcPendingRefineHandler(db, {
      getPageTextFn: async () => "",
    });

    const result = await handler({});
    const reports = parseResult(result) as Array<Record<string, unknown>>;
    const ids = reports.map((r) => r["id"]);

    expect(ids).not.toContain(REPORT_DONE);
    expect(ids).toContain(REPORT_CTG);
  });

  // ── RD-3: FAILED + CONFIRMED is excluded ─────────────────────────────────

  it("RD-3: report with refine_status='FAILED' AND confirm_status='CONFIRMED' is excluded", async () => {
    insertReport(db, REPORT_CTG, {
      refine_status: "FAILED",
      text_status: "COMPLETE",
      confirm_status: "CONFIRMED",  // should be excluded despite FAILED
      action_code: "CTG",
    });

    const handler = buildGetBctcPendingRefineHandler(db, {
      getPageTextFn: async () => "",
    });

    const result = await handler({});
    const reports = parseResult(result) as Array<Record<string, unknown>>;
    const ids = reports.map((r) => r["id"]);

    expect(ids).not.toContain(REPORT_CTG);
  });

  // ── RD-4: Mixed queue — PENDING + PARTIAL + FAILED included; DONE excluded ─

  it("RD-4: PENDING, PARTIAL, FAILED all included; DONE excluded from mixed queue", async () => {
    insertReport(db, REPORT_CTG,  { refine_status: "FAILED",  text_status: "COMPLETE", action_code: "CTG" });
    insertReport(db, REPORT_VCB,  { refine_status: "PENDING", text_status: "COMPLETE", action_code: "VCB" });
    insertReport(db, REPORT_PART, { refine_status: "PARTIAL", text_status: "COMPLETE", action_code: "VHM" });
    insertReport(db, REPORT_DONE, { refine_status: "DONE",    text_status: "COMPLETE", action_code: "FPT" });

    const handler = buildGetBctcPendingRefineHandler(db, {
      getPageTextFn: async () => "",
    });

    const result = await handler({});
    const reports = parseResult(result) as Array<Record<string, unknown>>;
    const ids = reports.map((r) => r["id"]);

    expect(ids).toContain(REPORT_CTG);   // FAILED — must be present
    expect(ids).toContain(REPORT_VCB);   // PENDING — must be present
    expect(ids).toContain(REPORT_PART);  // PARTIAL — must be present
    expect(ids).not.toContain(REPORT_DONE); // DONE — must be absent

    expect(reports).toHaveLength(3);
  });
});
