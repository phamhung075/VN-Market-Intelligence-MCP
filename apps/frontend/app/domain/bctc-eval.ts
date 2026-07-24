/**
 * Domain types for BCTC per-PDF extraction evaluation scorecard.
 * Matches the JSON contract in §4 of the BCTC-EVAL-SUBSTRATE brief.
 * schema_version: "1"
 */

export type EvalStatus = "green" | "yellow" | "red";

export interface GateFailure {
  gate_id: string;
  threshold: string;
  actual: string;
  provenance: string;
}

export interface EvalStage {
  stage_no: number;
  stage_name: string;
  status: EvalStatus;
  metrics: Record<string, unknown>;
  gate_failures: GateFailure[];
  golden_diff: Record<string, unknown>;
  detector_version: string;
  computed_at: string;
}

/**
 * Live contract (verified against mcp-server GET /api/bctc-eval, 2026-07-24):
 * a report only carries keys for stages that have actually been computed —
 * e.g. a report whose pipeline started at stage 4 has ONLY "4_..".."6_.." keys.
 * All 6 keys are therefore OPTIONAL, not guaranteed. Consumers must treat a
 * missing key as "stage not yet run", never assume presence.
 */
export interface StageStatuses {
  "1_RASTERIZE"?: EvalStatus;
  "2_LAYOUT_DETECT"?: EvalStatus;
  "3_OCR"?: EvalStatus;
  "4_TABLE_RECONSTRUCT"?: EvalStatus;
  "5_MARKDOWN_RENDER"?: EvalStatus;
  "6_STRUCTURED_EXTRACT"?: EvalStatus;
}

export interface EvalReportSummary {
  report_id: string;
  ticker: string;
  period: string;
  overall_status: EvalStatus;
  stage_statuses: StageStatuses;
  detector_version: string;
  computed_at: string;
  is_stale: boolean;
}

export interface EvalListResponse {
  schema_version: string;
  generated_at: string;
  reports: EvalReportSummary[];
  sort: string;
  thresholds_version: string;
}

export interface EvalDetailResponse {
  schema_version: string;
  report_id: string;
  ticker: string;
  period: string;
  overall_status: EvalStatus;
  has_pek: boolean;
  stages: EvalStage[];
  detector_version: string;
  is_stale: boolean;
}

export interface ThresholdsResponse {
  schema_version: string;
  detector_version: string;
  thresholds: Record<string, unknown>;
}
