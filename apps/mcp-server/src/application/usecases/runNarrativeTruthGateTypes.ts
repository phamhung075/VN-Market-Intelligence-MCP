/**
 * runNarrativeTruthGateTypes.ts — CCATO-MCP-T5-USECASE
 *
 * Types split out of runNarrativeTruthGate.ts (new file, size-lint <=120L —
 * same split-over-header precedent T1/T2/T4 established this sprint: prefer
 * a split to <=120L/file over a justification header for a brand-new file,
 * not a header on an already-cohesive 120L+ file). Re-exported from
 * runNarrativeTruthGate.ts so callers importing that module path see the
 * full public surface with zero extra import.
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.1-3.2
 */

import type { VerdictClass } from "../../domain/services/narrativeTruthGate/verdictClassifier.js";

/** Tool contract input — call_tool(server="vn-market", tool="narrative_truth_gate", arguments=...) (brief §3.1). */
export interface RunNarrativeTruthGateInput {
  post_body: string;
  agent_id: string;
  /** Optional pre-fetched working-memory cache: { "<TICKER>": { "<dimension_id>": <non-null value> } }. */
  cache?: Record<string, Record<string, unknown>>;
}

export type GateVerdict = "PASS" | "FAIL" | "CONFIG_ERROR";

/** Per-candidate outcome — byte-faithful to scripts/narrative-truth-gate.sh L330-347's `result` field. */
export type GateFindingResult = "FAIL" | "PASS" | "WARN";

/** One scanned candidate's re-probe outcome — byte-faithful to the bash engine's `entry` dict (script L326-336). */
export interface GateFinding {
  dimension: string;
  tool: string;
  ticker_or_dim: string;
  probe_ticker: string;
  claim_text: string;
  matched_negation: string;
  source: "cache" | "live";
  classification: VerdictClass;
  result: GateFindingResult;
  returned_summary: string;
}

/**
 * Aggregate gate result. The interface layer (CCATO-MCP-T6, not yet landed)
 * formats this into the `GATE_VERDICT:` + `[FAIL]`/`[PASS]`/`[WARN]` text
 * report (brief §3.1) — this type carries every field that formatting needs.
 */
export interface GateResult {
  verdict: GateVerdict;
  findings: GateFinding[];
  /** Present only when verdict === "CONFIG_ERROR" — safe to surface verbatim. */
  config_error_reason?: string;
}
