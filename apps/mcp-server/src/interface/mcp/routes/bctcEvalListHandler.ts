/**
 * bctcEvalListHandler.ts — GET /api/bctc-eval
 *
 * Interface layer. DI: db injected by server.ts handleRequest.
 *
 * Returns list of all reports with per-stage summary, sorted trust-ascending
 * (red first, yellow second, green last).
 *
 * Response schema_version: "1"
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  listEvalSummaries,
  getCurrentDetectorVersion,
} from "../../../infrastructure/db/bctcEvalStore.js";

export function handleBctcEvalList(
  _req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): void {
  try {
    const summaries = listEvalSummaries(db);
    const detectorVersion = getCurrentDetectorVersion();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        schema_version: "1",
        generated_at: new Date().toISOString(),
        reports: summaries.map((s) => ({
          report_id: s.report_id,
          ticker: s.ticker,
          period: s.period,
          overall_status: s.overall_status,
          stage_statuses: s.stage_statuses,
          detector_version: s.detector_version,
          computed_at: s.computed_at,
          is_stale: s.is_stale,
        })),
        sort: "trust_ascending",
        thresholds_version: detectorVersion,
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
