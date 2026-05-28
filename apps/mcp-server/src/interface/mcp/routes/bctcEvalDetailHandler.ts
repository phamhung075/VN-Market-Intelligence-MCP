/**
 * bctcEvalDetailHandler.ts — GET /api/bctc-eval/{report_id}
 *
 * Interface layer. DI: db injected by server.ts handleRequest.
 *
 * Response codes (per §7 brief):
 *   200 — full detail with 6 stage cards
 *   400 — invalid UUID (INVALID_UUID)
 *   404 — report not found in financial_reports (REPORT_NOT_FOUND)
 *   409 — report exists but eval not yet computed (EVAL_NOT_COMPUTED)
 *
 * schema_version: "1"
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { getEvalForReport, getCurrentDetectorVersion } from "../../../infrastructure/db/bctcEvalStore.js";
import { isValidUuid } from "./bctcInspectHandler.js";

interface FinancialReportRow {
  action_code: string;
  period_type: string;
  period_year: number;
  period_quarter: number | null;
}

interface LayoutUnitCountRow {
  cnt: number;
}

export function handleBctcEvalDetail(
  _req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  reportId: string,
): void {
  // 400: invalid UUID
  if (!isValidUuid(reportId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Invalid report_id — must be a UUID",
        code: "INVALID_UUID",
      }),
    );
    return;
  }

  try {
    // Check report exists in financial_reports
    const frRow = db
      .prepare<FinancialReportRow, [string]>(
        `SELECT action_code, period_type, period_year, period_quarter
         FROM financial_reports WHERE id = ?`,
      )
      .get(reportId) as FinancialReportRow | null;

    if (!frRow) {
      // 404: report not found
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: `Report ${reportId} not found`,
          code: "REPORT_NOT_FOUND",
        }),
      );
      return;
    }

    const evalRows = getEvalForReport(db, reportId);

    if (!evalRows) {
      // 409: report exists but eval not computed
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: `Eval not yet computed for report ${reportId}`,
          code: "EVAL_NOT_COMPUTED",
        }),
      );
      return;
    }

    // Determine has_pek
    const pekCount = db
      .prepare<LayoutUnitCountRow, [string]>(
        `SELECT COUNT(*) as cnt FROM bctc_layout_units WHERE report_id = ?`,
      )
      .get(reportId) as LayoutUnitCountRow | null;
    const hasPek = (pekCount?.cnt ?? 0) > 0;

    // Build period label
    const q = frRow.period_quarter ? `Q${frRow.period_quarter}-` : "";
    const period = `${q}${frRow.period_year}`;

    // Compute overall status
    const currentVersion = getCurrentDetectorVersion();
    let overallStatus: "green" | "yellow" | "red" = "green";
    for (const row of evalRows) {
      if (row.status === "red") { overallStatus = "red"; break; }
      if (row.status === "yellow") overallStatus = "yellow";
    }

    const isStale = evalRows.some((r) => r.detector_version !== currentVersion);

    // Parse JSON fields safely
    function safeParse(json: string): unknown {
      try { return JSON.parse(json); } catch { return {}; }
    }

    const stages = evalRows.map((row) => ({
      stage_no: row.stage_no,
      stage_name: row.stage_name,
      status: row.status,
      metrics: safeParse(row.metrics_json),
      gate_failures: safeParse(row.gate_failures_json),
      golden_diff: safeParse(row.golden_diff_json),
      detector_version: row.detector_version,
      computed_at: row.computed_at,
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        schema_version: "1",
        report_id: reportId,
        ticker: frRow.action_code,
        period,
        overall_status: overallStatus,
        has_pek: hasPek,
        stages,
        detector_version: currentVersion,
        is_stale: isStale,
      }),
    );
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
        code: "SERVER_ERROR",
      }),
    );
  }
}
