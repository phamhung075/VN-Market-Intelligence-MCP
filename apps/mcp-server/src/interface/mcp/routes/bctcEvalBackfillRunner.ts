/**
 * bctcEvalBackfillRunner.ts — One-shot CLI backfill script
 *
 * Usage (from container):
 *   docker exec <mcp-server-container> bun run src/interface/mcp/routes/bctcEvalBackfillRunner.ts
 *
 * What it does:
 *   1. Queries all financial_reports (ordered by parsed_at ASC)
 *   2. For each report_id, runs computeBctcEval (stages 4-6 only)
 *   3. Logs per-report: BACKFILL: {ticker} {period} — stages 1-6 written, status={overall_status}
 *
 * Safety constraints (per brief §10):
 *   - Writes ONLY to bctc_eval_results
 *   - ZERO mutation of financial_reports, bctc_layout_units, bctc_page_zones
 *   - FPT sentinel has_pek: true MUST survive (no mutation of layout_units)
 *   - Existing extractions NOT re-run — detectors read stored DB rows only
 *
 * Stages 1-3: emitted as "yellow" (no data in mcp-server — pushed by pdf-extractor).
 *   Backfill writes placeholder yellow rows for stages 1-3 to signal "not yet evaluated
 *   by pdf-extractor" rather than leaving rows absent (which would cause 409 responses).
 */

import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import { computeBctcEval, loadBctcEvalThresholds } from "../../../application/usecases/computeBctcEval.js";
import { upsertEvalRow, stageName } from "../../../infrastructure/db/bctcEvalStore.js";
import { initFinancialReportsTables } from "../../../infrastructure/db/schema-financial-reports.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportRow {
  id: string;
  action_code: string;
  period_type: string;
  period_year: number;
  period_quarter: number | null;
}

// ─── Main backfill ────────────────────────────────────────────────────────────

async function runBackfill(): Promise<void> {
  const projectRoot = resolve(process.cwd());
  const dbPath = resolve(projectRoot, "data/market.db");

  console.log(`[bctc-eval-backfill] DB: ${dbPath}`);
  console.log(`[bctc-eval-backfill] Project root: ${projectRoot}`);

  const db = new Database(dbPath, { create: false });
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");

  // Ensure bctc_eval_results table exists
  initFinancialReportsTables(db);

  // Load thresholds SSOT
  const thresholds = loadBctcEvalThresholds(projectRoot);

  // Query all financial_reports ordered by parsed_at ASC
  const reports = db
    .prepare<ReportRow, []>(
      `SELECT id, action_code, period_type, period_year, period_quarter
       FROM financial_reports
       WHERE action_code NOT LIKE '%example%'
         AND action_code NOT LIKE '%error%'
         AND action_code NOT LIKE '%missing%'
       ORDER BY parsed_at ASC`,
    )
    .all();

  console.log(`[bctc-eval-backfill] Found ${reports.length} reports to backfill`);

  let success = 0;
  let failed = 0;

  for (const report of reports) {
    const q = report.period_quarter ? `Q${report.period_quarter}-` : "";
    const period = `${q}${report.period_year}`;
    const label = `${report.action_code} ${period}`;

    try {
      // Write placeholder rows for stages 1-3 (pdf-extractor side, not available here)
      // Status: "yellow" = cannot evaluate (no pdf-extractor data in mcp-server DB)
      for (const stageNo of [1, 2, 3]) {
        upsertEvalRow(db, {
          report_id: report.id,
          stage_no: stageNo,
          stage_name: stageName(stageNo),
          status: "yellow",
          metrics_json: {
            note: "Backfill placeholder — awaiting pdf-extractor push",
            backfill: true,
          },
          gate_failures_json: [],
          golden_diff_json: {},
        });
      }

      // Run stages 4-6 from stored DB data
      const result = await computeBctcEval(db, report.id, thresholds);

      console.log(
        `[bctc-eval-backfill] BACKFILL: ${label} — stages 1-6 written, status=${result.overall_status}`,
      );
      success++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[bctc-eval-backfill] FAILED: ${label} — ${msg}`);
      failed++;
    }
  }

  console.log(
    `[bctc-eval-backfill] Done. success=${success}, failed=${failed}, total=${reports.length}`,
  );

  db.close();
}

// ─── Entry point ──────────────────────────────────────────────────────────────

runBackfill().catch((err) => {
  console.error("[bctc-eval-backfill] Fatal:", err);
  process.exit(1);
});
