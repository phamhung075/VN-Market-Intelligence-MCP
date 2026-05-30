/**
 * bctcRefineHandler.ts — FR-12 On-Demand Refine Endpoint
 *
 * Sprint BCTC-AGENTIC-REFINE
 * DDD layer: interface
 *
 * POST /api/refine-bctc/{report_id}
 *
 * On-demand path: triggers refineOneReport() directly (same pipeline as cron).
 * Responds immediately with 202 Accepted and runs the job in the background.
 *
 * @module interface/mcp/routes/bctcRefineHandler
 */

import { logger } from "../../../infrastructure/logger.js";
import { refineOneReport } from "../../../scheduler/financial-reports/bctcRefineJob.js";

/**
 * Handle POST /api/refine-bctc/{report_id}
 *
 * Returns 202 Accepted immediately. The refine job runs async in the background.
 * Returns 400 if report_id is missing or invalid.
 */
export async function handleBctcRefineOnDemand(
  reportId: string | undefined,
): Promise<Response> {
  if (!reportId || reportId.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: "report_id is required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const id = reportId.trim();

  logger.info("[bctcRefineHandler] on-demand refine triggered", { reportId: id });

  // Fire-and-forget: response immediately, job runs in background
  void refineOneReport(id).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[bctcRefineHandler] on-demand refine error", { reportId: id, error: msg });
  });

  return new Response(
    JSON.stringify({
      status: "accepted",
      report_id: id,
      message: "Refine job queued. Check refine_status on financial_reports for progress.",
    }),
    {
      status: 202,
      headers: { "Content-Type": "application/json" },
    },
  );
}
