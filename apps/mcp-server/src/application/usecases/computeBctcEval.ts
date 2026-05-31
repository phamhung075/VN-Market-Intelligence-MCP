/**
 * computeBctcEval.ts — Orchestrator use case
 *
 * DDD: application layer.
 * Reads report data from DB → calls domain detectors → upserts to bctcEvalStore.
 *
 * Called from:
 *   - bctcEvalRecomputeHandler (on-demand recompute)
 *   - bctcEvalBackfillRunner (one-shot backfill)
 *   - bctcEvalRecomputeJob (nightly cron)
 *
 * Thresholds: loaded from docs/data/bctc-eval-thresholds.json at startup,
 * passed as parameter. Never hardcoded here.
 */

import type { Database } from "bun:sqlite";
import {
  evalStage4TableReconstruct,
  evalStage5MarkdownRender,
  evalStage6StructuredExtract,
  type BctcTableRow,
  type BctcMdTablesRecord,
  type FinancialReportRecord,
  type BctcEvalThresholds,
} from "../../domain/services/bctcEvalDetectors.js";
import {
  upsertEvalRow,
  stageName,
} from "../../infrastructure/db/bctcEvalStore.js";
import type { EvalStageResult } from "../../domain/services/bctcEvalDetectors.js";
import { isBankFormFromDb } from "../../domain/services/financial-reports/bctcFormType.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComputeEvalResult {
  report_id: string;
  stages_written: number;
  overall_status: "green" | "yellow" | "red";
  stage_statuses: Record<number, "green" | "yellow" | "red">;
}

// ─── DB row shapes (infrastructure read) ─────────────────────────────────────

interface BctcTableRowDb {
  code: string | null;
  label: string | null;
  value_current: number | null;
  value_prior: number | null;
  row_order: number;
}

interface BctcMdTablesDb {
  md_tables_json: string;
  table_count: number;
  page_count: number;
}

interface FinancialReportDb {
  balance_pass: number | null;
  net_revenue: number | null;
  net_profit: number | null;
  gross_profit: number | null;
  total_assets: number | null;
  parsed_at: string;
  /** Domain stored by parseBctcReport (e.g. "banking", "technology", "real_estate"). */
  domain: string | null;
}

interface BalanceCheckDb {
  balance_pass: number;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * computeBctcEval — run stages 4-6 detectors for a report and persist results.
 *
 * Stages 1-3 are pushed by pdf-extractor via bctcEvalPushStageHandler.
 * Stages 4-6 are computed here from already-stored DB data.
 *
 * Safety: ZERO mutation of financial_reports, bctc_layout_units, bctc_page_zones.
 * Only writes to bctc_eval_results.
 */
export async function computeBctcEval(
  db: Database,
  reportId: string,
  thresholds: BctcEvalThresholds,
): Promise<ComputeEvalResult> {
  // ── Stage 4: TABLE_RECONSTRUCT ─────────────────────────────────────────────
  const tableRows = db
    .prepare<BctcTableRowDb, [string]>(
      `SELECT code, label, value_current, value_prior, row_order
       FROM bctc_table_rows
       WHERE report_id = ?
       ORDER BY row_order ASC`,
    )
    .all(reportId) as BctcTableRow[];

  const stage4Result = evalStage4TableReconstruct(
    tableRows,
    thresholds["4_TABLE_RECONSTRUCT"],
  );

  upsertEvalRow(db, {
    report_id: reportId,
    stage_no: 4,
    stage_name: stageName(4),
    status: stage4Result.status,
    metrics_json: stage4Result.metrics_json,
    gate_failures_json: stage4Result.gate_failures_json,
    golden_diff_json: stage4Result.golden_diff_json,
  });

  // ── Stage 5: MARKDOWN_RENDER ───────────────────────────────────────────────
  const mdRow = db
    .prepare<BctcMdTablesDb, [string]>(
      `SELECT md_tables_json, table_count, page_count
       FROM bctc_md_tables
       WHERE report_id = ?`,
    )
    .get(reportId) as BctcMdTablesRecord | null;

  let mdJson: unknown = [];
  if (mdRow?.md_tables_json) {
    try {
      mdJson = JSON.parse(mdRow.md_tables_json);
    } catch {
      mdJson = [];
    }
  }

  const stage5Result = evalStage5MarkdownRender(
    mdJson,
    tableRows,
    thresholds["5_MARKDOWN_RENDER"],
  );

  upsertEvalRow(db, {
    report_id: reportId,
    stage_no: 5,
    stage_name: stageName(5),
    status: stage5Result.status,
    metrics_json: stage5Result.metrics_json,
    gate_failures_json: stage5Result.gate_failures_json,
    golden_diff_json: stage5Result.golden_diff_json,
  });

  // ── Stage 6: STRUCTURED_EXTRACT ────────────────────────────────────────────
  const frRow = db
    .prepare<FinancialReportDb, [string]>(
      `SELECT net_revenue, gross_profit, net_profit, total_assets, parsed_at, domain
       FROM financial_reports
       WHERE id = ?`,
    )
    .get(reportId) as (FinancialReportRecord & { domain: string | null; total_assets: number | null }) | null;

  // Read balance_pass from bctc_balance_checks (signal-only, not a gate)
  const balRow = db
    .prepare<BalanceCheckDb, [string]>(
      `SELECT balance_pass FROM bctc_balance_checks WHERE report_id = ?`,
    )
    .get(reportId) as BalanceCheckDb | null;

  const balancePassBool = balRow !== null ? balRow.balance_pass === 1 : null;

  const reportRecord: FinancialReportRecord = frRow ?? {
    balance_pass: null,
    net_revenue: null,
    net_profit: null,
    gross_profit: null,
    parsed_at: new Date().toISOString(),
  };

  // Golden anchors: fields we expect to be populated for a complete extract.
  //
  // BANK-DEV-2: structural signal from bctc_table_rows replaces domain-string check.
  // domain="other" for ALL 12 live tickers — domain cannot discriminate banks.
  //
  // PRIMARY: isBankFormFromDb — structural 3-digit-code absence signal.
  // BELT-AND-SUSPENDERS: scalar heuristic fallback (gross_profit null + net_revenue
  // present + total_assets > 1T VND) for cases where rows are absent at eval time
  // (e.g. eval called before finalize_bctc_refine completes).
  //
  // Corporate (not bank): gross_profit remains in goldenAnchors — unchanged requirement.
  const isBankDomain = isBankFormFromDb(db, reportId) ||
    // Fallback: structural query has no rows yet; scalar signals indicate bank
    (frRow?.gross_profit === null &&
     frRow?.net_revenue !== null &&
     frRow?.total_assets !== null &&
     (frRow.total_assets as number) > 1e9);
  // Note: total_assets > 1T VND (1e9 million VND) distinguishes banks (ACB=1,030B;
  // VCB>>1T) from small corporates where gross_profit=null might be extraction gap.
  const goldenAnchors = isBankDomain
    ? ["net_revenue", "net_profit"]
    : ["net_revenue", "net_profit", "gross_profit"];

  const stage6Result = evalStage6StructuredExtract(
    reportRecord,
    goldenAnchors,
    thresholds["6_STRUCTURED_EXTRACT"],
    balancePassBool,
  );

  upsertEvalRow(db, {
    report_id: reportId,
    stage_no: 6,
    stage_name: stageName(6),
    status: stage6Result.status,
    metrics_json: stage6Result.metrics_json,
    gate_failures_json: stage6Result.gate_failures_json,
    golden_diff_json: stage6Result.golden_diff_json,
  });

  // ── Compute overall status ─────────────────────────────────────────────────
  const stageResults: Record<number, EvalStageResult> = {
    4: stage4Result,
    5: stage5Result,
    6: stage6Result,
  };

  const stageStatuses = Object.fromEntries(
    Object.entries(stageResults).map(([k, v]) => [Number(k), v.status]),
  ) as Record<number, "green" | "yellow" | "red">;

  let overallStatus: "green" | "yellow" | "red" = "green";
  for (const s of Object.values(stageStatuses)) {
    if (s === "red") { overallStatus = "red"; break; }
    if (s === "yellow") overallStatus = "yellow";
  }

  return {
    report_id: reportId,
    stages_written: 3,
    overall_status: overallStatus,
    stage_statuses: stageStatuses,
  };
}

// ─── Threshold loader ─────────────────────────────────────────────────────────

/**
 * loadBctcEvalThresholds — reads docs/data/bctc-eval-thresholds.json.
 * Called once at server startup; result is passed to handlers as DI.
 * Throws on read failure (fail-loud per protocol).
 */
export function loadBctcEvalThresholds(projectRoot: string): BctcEvalThresholds {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolve } = require("node:path") as typeof import("node:path");
  const thresholdsPath = resolve(
    projectRoot,
    "docs/data/bctc-eval-thresholds.json",
  );
  const raw = readFileSync(thresholdsPath, "utf-8");
  const parsed = JSON.parse(raw) as {
    stages: BctcEvalThresholds;
    detector_version: string;
  };
  return parsed.stages;
}
