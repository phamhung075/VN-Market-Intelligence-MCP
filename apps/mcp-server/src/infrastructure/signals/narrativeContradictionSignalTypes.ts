/**
 * narrativeContradictionSignalTypes.ts — CCATO-MCP-T4-SIGNAL-WRITER
 *
 * Type contracts split out of narrativeContradictionSignalWriter.ts (new
 * file, size-lint <=120L — same split-over-header rationale T1 used for
 * claimToolMapTypes.ts / T2 used for claimToolMapValidator.ts). Re-exported
 * from the writer module so callers importing that path are unaffected.
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.2
 */

import type { OrchStateSignalRow } from "../orchStateStore.js";

/** narrative_contradiction row `.payload` — byte-faithful port of script L427-436. */
export interface NarrativeContradictionPayload {
  agent_id: string;
  claim: string;
  tool: string;
  ticker: string;
  probe_ticker: string;
  returned_value: string;
  cycle: string; // YYYY-MM-DD (UTC)
  gate_version: string;
}

/**
 * One CCATO FAIL finding ready to signal. Deliberately a plain data shape
 * (not importing T1's ClaimCandidate/T3's probe result types) so this
 * module has zero compile-time coupling to landing order — T5
 * (runNarrativeTruthGate.ts, not yet built) maps its own candidate+probe
 * pair onto this shape at the call site.
 */
export interface NarrativeContradictionFinding {
  /** claim-tool-map dimension id, e.g. "technical_indicators" */
  dimension: string;
  /** claim-tool-map tool name, e.g. "get_technical_indicators" */
  tool: string;
  /** claim-side identifier (ClaimCandidate.ticker_or_dim) */
  ticker_or_dim: string;
  /** concrete ticker actually probed (ClaimCandidate.ticker) */
  probe_ticker: string;
  /** the exact sentence that triggered the CCATO scan */
  claim_text: string;
  /** flattened+truncated probe response (verdictClassifier.summarizeVerdict) */
  returned_value: string;
}

/**
 * A narrative_contradiction row. Extends OrchStateSignalRow (the shape
 * appendSignalQueueRow's `row` param requires) with the object-shaped
 * `payload` field the bash engine writes — the base interface only
 * declares `payload_ref: string | null` (a file-reference convention used
 * by improvementSignalWriter.ts's caller, not applicable here).
 * SignalRowSchema is `.passthrough()` so the extra `payload` object key
 * validates cleanly; `payload_ref` is set to null purely to satisfy
 * OrchStateSignalRow's required field.
 */
export interface NarrativeContradictionSignalRow extends OrchStateSignalRow {
  payload: NarrativeContradictionPayload;
  /**
   * AC-6 (FIX-CCATO-NTG-...): content dedup key, `narrative_contradiction:
   * {agent_id}:{tool}:{ticker_or_dim}:{cycle}` — keyed on the FINDING, not the
   * emission, so repeat emissions of one finding collapse instead of appending.
   * The row `id` cannot serve this role: its uuid4 suffix makes every duplicate
   * id-unique BY CONSTRUCTION.
   */
  dedup_key: string;
  /** Set by orchStateStore on a dedup_key collapse; absent on a first emission. */
  occurrences?: number;
  /** ts of the most recent collapsed emission; absent on a first emission. */
  last_seen_ts?: string;
}
