/**
 * bctcEvalStore.ts — Infrastructure DB store for bctc_eval_results
 *
 * DDD: infrastructure layer. DB access only — no domain logic.
 *
 * Upsert pattern: INSERT OR REPLACE (full row replacement on recompute).
 * No soft-delete. No history table.
 *
 * Current detector version read from DETECTOR_VERSION constant below.
 * Staleness: a row is stale when its detector_version != getCurrentDetectorVersion().
 */

import type { Database } from "bun:sqlite";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Bump this when thresholds file or detector logic changes (§6 brief). */
export const DETECTOR_VERSION = "v1";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EvalRow {
  report_id: string;
  stage_no: number;
  stage_name: string;
  status: "green" | "yellow" | "red";
  metrics_json: string;      // serialized JSON
  gate_failures_json: string; // serialized JSON
  golden_diff_json: string;  // serialized JSON
  detector_version: string;
  computed_at: string;
}

export interface EvalRowInput {
  report_id: string;
  stage_no: number;
  stage_name: string;
  status: "green" | "yellow" | "red";
  metrics_json: Record<string, unknown>;
  gate_failures_json: unknown[];
  golden_diff_json: Record<string, unknown>;
}

export interface EvalSummaryRow {
  report_id: string;
  ticker: string;
  period: string;
  overall_status: "green" | "yellow" | "red";
  stage_statuses: Record<string, "green" | "yellow" | "red">;
  detector_version: string;
  computed_at: string;
  is_stale: boolean;
}

// ─── Stage name lookup ────────────────────────────────────────────────────────

const STAGE_NAMES: Record<number, string> = {
  1: "RASTERIZE",
  2: "LAYOUT_DETECT",
  3: "OCR",
  4: "TABLE_RECONSTRUCT",
  5: "MARKDOWN_RENDER",
  6: "STRUCTURED_EXTRACT",
};

export function stageName(stageNo: number): string {
  return STAGE_NAMES[stageNo] ?? `STAGE_${stageNo}`;
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * upsertEvalRow — Insert or replace a single stage eval row.
 * Full row replacement: no partial update, no audit history.
 */
export function upsertEvalRow(db: Database, input: EvalRowInput): void {
  db.prepare(
    `INSERT OR REPLACE INTO bctc_eval_results
       (report_id, stage_no, stage_name, status,
        metrics_json, gate_failures_json, golden_diff_json,
        detector_version, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    input.report_id,
    input.stage_no,
    input.stage_name,
    input.status,
    JSON.stringify(input.metrics_json),
    JSON.stringify(input.gate_failures_json),
    JSON.stringify(input.golden_diff_json),
    DETECTOR_VERSION,
  );
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * getEvalForReport — fetch all 6 stage rows for a given report_id.
 * Returns null when no rows exist (eval not yet computed).
 */
export function getEvalForReport(
  db: Database,
  reportId: string,
): EvalRow[] | null {
  const rows = db
    .prepare<EvalRow, [string]>(
      `SELECT report_id, stage_no, stage_name, status,
              metrics_json, gate_failures_json, golden_diff_json,
              detector_version, computed_at
       FROM bctc_eval_results
       WHERE report_id = ?
       ORDER BY stage_no ASC`,
    )
    .all(reportId);

  return rows.length > 0 ? rows : null;
}

/**
 * listEvalSummaries — aggregate per-report summaries, sorted trust-ascending
 * (red first, yellow second, green last).
 *
 * Joins with financial_reports to get ticker + period label.
 */
export function listEvalSummaries(db: Database): EvalSummaryRow[] {
  interface RawRow {
    report_id: string;
    action_code: string;
    period_type: string;
    period_year: number;
    period_quarter: number | null;
    stage_no: number;
    stage_name: string;
    status: string;
    detector_version: string;
    computed_at: string;
  }

  const rawRows = db
    .prepare<RawRow, []>(
      `SELECT
         ber.report_id,
         fr.action_code,
         fr.period_type,
         fr.period_year,
         fr.period_quarter,
         ber.stage_no,
         ber.stage_name,
         ber.status,
         ber.detector_version,
         ber.computed_at
       FROM bctc_eval_results ber
       LEFT JOIN financial_reports fr ON fr.id = ber.report_id
       ORDER BY ber.report_id, ber.stage_no ASC`,
    )
    .all();

  // Group by report_id
  const grouped = new Map<string, RawRow[]>();
  for (const row of rawRows) {
    const group = grouped.get(row.report_id) ?? [];
    group.push(row);
    grouped.set(row.report_id, group);
  }

  const summaries: EvalSummaryRow[] = [];
  for (const [reportId, stageRows] of grouped) {
    if (stageRows.length === 0) continue;
    const first = stageRows[0]!;
    const ticker = first.action_code ?? "UNKNOWN";
    const q = first.period_quarter ? `Q${first.period_quarter}-` : "";
    const period = `${q}${first.period_year}`;

    const stageStatuses: Record<string, "green" | "yellow" | "red"> = {};
    let overallStatus: "green" | "yellow" | "red" = "green";

    for (const row of stageRows) {
      const key = `${row.stage_no}_${row.stage_name}`;
      const s = row.status as "green" | "yellow" | "red";
      stageStatuses[key] = s;

      // worst wins: red > yellow > green
      if (s === "red") overallStatus = "red";
      else if (s === "yellow" && overallStatus !== "red") overallStatus = "yellow";
    }

    const isStale = stageRows.some(
      (r) => r.detector_version !== DETECTOR_VERSION,
    );
    const lastRow = stageRows[stageRows.length - 1];
    const computedAt = lastRow?.computed_at ?? new Date().toISOString();

    summaries.push({
      report_id: reportId,
      ticker,
      period,
      overall_status: overallStatus,
      stage_statuses: stageStatuses,
      detector_version: first.detector_version,
      computed_at: computedAt,
      is_stale: isStale,
    });
  }

  // Sort trust-ascending: red first, yellow second, green last
  const order = { red: 0, yellow: 1, green: 2 };
  summaries.sort((a, b) => order[a.overall_status] - order[b.overall_status]);

  return summaries;
}

/**
 * getStaleReportIds — report_ids where any stage row has an older detector_version.
 * Used by the nightly recompute cron.
 */
export function getStaleReportIds(db: Database): string[] {
  const rows = db
    .prepare<{ report_id: string }, [string]>(
      `SELECT DISTINCT report_id
       FROM bctc_eval_results
       WHERE detector_version != ?`,
    )
    .all(DETECTOR_VERSION);

  return rows.map((r) => r.report_id);
}

/**
 * getCurrentDetectorVersion — returns the deployed DETECTOR_VERSION constant.
 * Used by list endpoint to compute is_stale per row.
 */
export function getCurrentDetectorVersion(): string {
  return DETECTOR_VERSION;
}
