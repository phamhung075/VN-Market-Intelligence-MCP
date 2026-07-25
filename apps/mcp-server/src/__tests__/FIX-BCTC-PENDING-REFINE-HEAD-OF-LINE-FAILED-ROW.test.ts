/**
 * FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW.test.ts
 *
 * Regression: get_bctc_pending_refine returned FAILED reports with ZERO remaining
 * (unprocessed) windows, permanently head-of-line-blocking the queue (ORDER BY
 * parsed_at ASC). POW_2026_Q1 (report_id 78b06684-dca5-45e7-8dfd-b173df3d3d02)
 * finalized FAILED with done_ct=0 / failed_ct=28 across all 28 windows — zero
 * remaining work — yet stayed at result[0] across four days and four+ fleet-cron
 * slot fires. Both refine slots pick result[0] unconditionally, so every fire
 * re-picked POW, found an empty remaining-window set, exited, and telemetry read
 * as a successful no-op. Four genuinely-PENDING reports (DPM_2025_Q4, REE_2025_Q4,
 * DPM_2026_Q1, VPB_2026_Q1) were starved behind it.
 *
 * PO-ratified fix (option b): exclude FAILED rows with zero unprocessed windows;
 * KEEP serving FAILED rows that still have remaining work (a transiently-failed
 * report with real remaining windows must stay retryable — excluding FAILED
 * wholesale would silently drop data, per PO adjudication).
 *
 * Mirrors the existing PARTIAL "all-terminal" exclusion pattern (Fix A /
 * FIX-REFINE-QUEUE-TERMINAL-FAILED-UNIT-HEADPOISON in FIX-REFINE-PENDING-SCHEMA.test.ts)
 * — same predicate, extended to also match refine_status='FAILED'.
 *
 * Tests:
 *   HOL-1: FAILED report with ALL units window_status IN ('DONE','FAILED') (zero
 *          remaining) is excluded — the POW scenario (AC-1).
 *   HOL-2: FAILED report with a remaining (non-terminal) window IS still returned
 *          — the negative test PO explicitly called out; over-exclusion is the
 *          rejected failure mode (AC-2).
 *   HOL-3: FAILED report with zero bctc_refined_units rows (units never pushed)
 *          stays eligible — same zero-unit guard as the PARTIAL case.
 *   HOL-4: mixed queue — a head-of-line FAILED-zero-remaining report does NOT
 *          shadow a genuinely-PENDING report; result[0] is the PENDING report
 *          (AC-3, ordering).
 *
 * DDD: interface layer. Dep injection bypasses HTTP (infrastructure).
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

function insertReport(
  db: Database,
  id: string,
  opts: {
    refine_status?: string;
    text_status?: string;
    confirm_status?: string;
    action_code?: string;
    parsed_at?: string;
  } = {},
): void {
  const {
    refine_status = "PENDING",
    text_status = "COMPLETE",
    confirm_status = "PENDING",
    action_code = `TST_${id.substring(0, 4).toUpperCase()}`,
    parsed_at = "2026-01-01 00:00:00",
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
             5.0, ?, ?, ?, 'unaudited', 0.5, ?,
             '{}', '{}', '{}', '{}',
             ?)`,
    [id, action_code, `2026-Q1-${id.substring(0, 6)}`, refine_status, text_status, confirm_status, parsed_at, `/data/pdfs/${id}.pdf`],
  );
}

function insertUnit(db: Database, reportId: string, unitId: string, windowStatus: string): void {
  db.run(
    `INSERT INTO bctc_refined_units (report_id, unit_id, page_numbers_json, markdown, window_status, refined_at)
     VALUES (?, ?, '[1]', 'md', ?, datetime('now'))`,
    [reportId, unitId, windowStatus],
  );
}

function parseResult(result: { content: [{ type: string; text: string }] }): unknown {
  return JSON.parse(result.content[0]!.text);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW — FAILED reports with zero remaining windows are excluded", () => {
  let db: Database;

  beforeEach(() => {
    db = openTestDb();
  });

  // ── HOL-1: POW scenario — FAILED, all windows terminal, zero remaining ────

  it("HOL-1: FAILED report with ALL units window_status IN ('DONE','FAILED') is excluded (POW scenario, AC-1)", async () => {
    const REPORT_POW = "78b06684-dca5-45e7-8dfd-b173df3d3d02";
    insertReport(db, REPORT_POW, {
      refine_status: "FAILED",
      text_status: "COMPLETE",
      action_code: "POW",
    });
    // done_ct=0, failed_ct=28 — simulate a small representative slice (3 FAILED).
    insertUnit(db, REPORT_POW, "unit-1", "FAILED");
    insertUnit(db, REPORT_POW, "unit-2", "FAILED");
    insertUnit(db, REPORT_POW, "unit-3", "FAILED");

    const handler = buildGetBctcPendingRefineHandler(db, { getPageTextFn: async () => "" });
    const result = await handler({ limit: 10 });
    const reports = parseResult(result) as Array<Record<string, unknown>>;
    const ids = reports.map((r) => r["id"]);

    expect(ids).not.toContain(REPORT_POW);
  });

  // ── HOL-2: negative test — FAILED with remaining work stays in queue ──────

  it("HOL-2: FAILED report with a remaining (non-terminal) window IS still returned (negative test, AC-2)", async () => {
    const REPORT_RETRYABLE = "11111111-0000-0000-0000-000000000001";
    insertReport(db, REPORT_RETRYABLE, {
      refine_status: "FAILED",
      text_status: "COMPLETE",
      action_code: "RTY",
    });
    insertUnit(db, REPORT_RETRYABLE, "unit-1", "FAILED");
    insertUnit(db, REPORT_RETRYABLE, "unit-2", "PENDING"); // remaining work

    const handler = buildGetBctcPendingRefineHandler(db, { getPageTextFn: async () => "" });
    const result = await handler({ limit: 10 });
    const reports = parseResult(result) as Array<Record<string, unknown>>;
    const ids = reports.map((r) => r["id"]);

    expect(ids).toContain(REPORT_RETRYABLE);
    const report = reports.find((r) => r["id"] === REPORT_RETRYABLE)!;
    expect(report["refine_status"]).toBe("FAILED");
  });

  // ── HOL-3: zero-unit FAILED report stays eligible ──────────────────────────

  it("HOL-3: FAILED report with zero bctc_refined_units rows stays eligible (units not pushed yet)", async () => {
    const REPORT_ZERO_UNITS = "22222222-0000-0000-0000-000000000002";
    insertReport(db, REPORT_ZERO_UNITS, {
      refine_status: "FAILED",
      text_status: "COMPLETE",
      action_code: "ZRO",
    });
    // No bctc_refined_units inserted.

    const handler = buildGetBctcPendingRefineHandler(db, { getPageTextFn: async () => "" });
    const result = await handler({ limit: 10 });
    const reports = parseResult(result) as Array<Record<string, unknown>>;
    const ids = reports.map((r) => r["id"]);

    expect(ids).toContain(REPORT_ZERO_UNITS);
  });

  // ── HOL-4: head-of-line — exhausted FAILED no longer shadows PENDING ──────

  it("HOL-4: exhausted FAILED report does not head-of-line-block a genuinely-PENDING report (AC-3, ordering)", async () => {
    const REPORT_POW = "78b06684-dca5-45e7-8dfd-b173df3d3d02";
    insertReport(db, REPORT_POW, {
      refine_status: "FAILED",
      text_status: "COMPLETE",
      action_code: "POW",
      parsed_at: "2026-01-01 00:00:00", // earliest — would sort first pre-fix
    });
    insertUnit(db, REPORT_POW, "unit-1", "FAILED");
    insertUnit(db, REPORT_POW, "unit-2", "FAILED");

    const REPORT_DPM = "33333333-0000-0000-0000-000000000003";
    insertReport(db, REPORT_DPM, {
      refine_status: "PENDING",
      text_status: "COMPLETE",
      action_code: "DPM",
      parsed_at: "2026-01-02 00:00:00",
    });

    const handler = buildGetBctcPendingRefineHandler(db, { getPageTextFn: async () => "" });
    const result = await handler({ limit: 5 });
    const reports = parseResult(result) as Array<Record<string, unknown>>;
    const ids = reports.map((r) => r["id"]);

    expect(ids).not.toContain(REPORT_POW);
    expect(reports[0]?.["id"]).toBe(REPORT_DPM);
    expect(reports[0]?.["refine_status"]).toBe("PENDING");
  });
});
