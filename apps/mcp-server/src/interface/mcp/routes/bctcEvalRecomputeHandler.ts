/**
 * bctcEvalRecomputeHandler.ts — POST /api/bctc-eval/recompute/{report_id}
 *
 * Interface layer. DI: db + thresholds injected by server.ts.
 *
 * Response codes (per §7 brief):
 *   200 — recomputed, returns full detail JSON
 *   400 — invalid UUID (INVALID_UUID)
 *   404 — report not found (REPORT_NOT_FOUND)
 *   503 — extraction window active (EXTRACTION_RUNNING)
 *         market-hours guard: 02:00-08:59 UTC Mon-Fri
 *         Includes Retry-After: 7200 header
 *
 * No body parsing needed — report_id is a path parameter.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { computeBctcEval, type loadBctcEvalThresholds } from "../../../application/usecases/computeBctcEval.js";
import type { BctcEvalThresholds } from "../../../domain/services/bctcEvalDetectors.js";
import { getEvalForReport, getCurrentDetectorVersion } from "../../../infrastructure/db/bctcEvalStore.js";
import { isValidUuid } from "./bctcInspectHandler.js";

// ─── Market-hours guard ───────────────────────────────────────────────────────

/**
 * isExtractionWindow — returns true during 02:00-08:59 UTC Mon-Fri.
 * During this window, active BCTC extraction may be updating the rows
 * that the recompute would evaluate. Return 503 to avoid race.
 */
export function isExtractionWindow(now: Date = new Date()): boolean {
  const utcDay = now.getUTCDay(); // 0=Sun, 1=Mon, ... 5=Fri, 6=Sat
  const utcHour = now.getUTCHours();
  const isWeekday = utcDay >= 1 && utcDay <= 5;
  const isWindow = utcHour >= 2 && utcHour <= 8;
  return isWeekday && isWindow;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleBctcEvalRecompute(
  _req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  reportId: string,
  thresholds: BctcEvalThresholds,
): Promise<void> {
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

  // 503: extraction window active
  if (isExtractionWindow()) {
    res.writeHead(503, {
      "Content-Type": "application/json",
      "Retry-After": "7200",
    });
    res.end(
      JSON.stringify({
        error: "Recompute blocked during extraction window (02:00-08:59 UTC Mon-Fri)",
        code: "EXTRACTION_RUNNING",
      }),
    );
    return;
  }

  try {
    // 404: report not found
    const frRow = db
      .prepare<{ id: string }, [string]>(
        `SELECT id FROM financial_reports WHERE id = ?`,
      )
      .get(reportId) as { id: string } | null;

    if (!frRow) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: `Report ${reportId} not found`,
          code: "REPORT_NOT_FOUND",
        }),
      );
      return;
    }

    // Run stages 4-6 recompute (synchronous — fast, no re-extraction)
    await computeBctcEval(db, reportId, thresholds);

    // Return updated eval rows
    const evalRows = getEvalForReport(db, reportId) ?? [];
    const currentVersion = getCurrentDetectorVersion();

    let overallStatus: "green" | "yellow" | "red" = "green";
    for (const row of evalRows) {
      if (row.status === "red") { overallStatus = "red"; break; }
      if (row.status === "yellow") overallStatus = "yellow";
    }

    function safeParse(json: string): unknown {
      try { return JSON.parse(json); } catch { return {}; }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        schema_version: "1",
        report_id: reportId,
        overall_status: overallStatus,
        stages: evalRows.map((row) => ({
          stage_no: row.stage_no,
          stage_name: row.stage_name,
          status: row.status,
          metrics: safeParse(row.metrics_json),
          gate_failures: safeParse(row.gate_failures_json),
          golden_diff: safeParse(row.golden_diff_json),
          detector_version: row.detector_version,
          computed_at: row.computed_at,
        })),
        detector_version: currentVersion,
        is_stale: false, // just recomputed
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
