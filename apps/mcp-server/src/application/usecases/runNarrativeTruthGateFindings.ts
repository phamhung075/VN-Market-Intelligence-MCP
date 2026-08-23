/**
 * runNarrativeTruthGateFindings.ts — CCATO-MCP-T5-USECASE
 *
 * Per-candidate helpers split out of runNarrativeTruthGate.ts (size-lint
 * <=120L, same split-over-header precedent as runNarrativeTruthGateTypes.ts
 * — see that file's header). Application-layer (calls T1 domain functions
 * only — classifyVerdict/summarizeVerdict — zero fs/network I/O of its own).
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.1-3.2
 */

import { classifyVerdict, summarizeVerdict } from "../../domain/services/narrativeTruthGate/verdictClassifier.js";
import type { ClaimCandidate } from "../../domain/services/narrativeTruthGate/claimToolMapTypes.js";
import type { ProbeResult } from "../../infrastructure/probes/narrativeTruthProbeAdapters.js";
import type { NarrativeContradictionFinding } from "../../infrastructure/signals/narrativeContradictionSignalWriter.js";
import type { GateFinding, GateFindingResult, RunNarrativeTruthGateInput } from "./runNarrativeTruthGateTypes.js";

/**
 * Cache-hit short-circuit — byte-faithful to script L339-341: a non-null
 * `cache[ticker][dimension.id]` value skips the live probe for this
 * candidate. `null`/`undefined` are NOT hits (matches the script's
 * `cache_hit is not None` guard) — an explicit null cache entry still
 * re-probes live, it does not fabricate a PASS.
 */
export function cacheLookup(
  cache: RunNarrativeTruthGateInput["cache"],
  candidate: ClaimCandidate,
): ProbeResult | undefined {
  const hit = cache?.[candidate.ticker]?.[candidate.dimension.id];
  if (hit === undefined || hit === null) return undefined;
  return { raw: hit, isError: false };
}

/** NON_NULL -> FAIL (contradiction), NULL -> PASS (honest gap), ERROR -> WARN (inconclusive). */
function resultForClassification(classification: ReturnType<typeof classifyVerdict>): GateFindingResult {
  if (classification === "NON_NULL") return "FAIL";
  if (classification === "NULL") return "PASS";
  return "WARN";
}

/** Build one GateFinding from a scanned candidate + its (cache or live) probe result. */
export function toGateFinding(
  candidate: ClaimCandidate,
  probe: ProbeResult,
  source: "cache" | "live",
  toolNullMarkers: readonly string[],
): GateFinding {
  const classification = classifyVerdict(probe.raw, toolNullMarkers);
  return {
    dimension: candidate.dimension.id,
    tool: candidate.dimension.tool,
    ticker_or_dim: candidate.ticker_or_dim,
    probe_ticker: candidate.ticker,
    claim_text: candidate.claim_text,
    matched_negation: candidate.matched_negation,
    source,
    classification,
    result: resultForClassification(classification),
    returned_summary: summarizeVerdict(probe.raw),
  };
}

/** Map a FAIL GateFinding onto T4's NarrativeContradictionFinding shape (1:1 field rename, no transformation). */
export function toContradictionFinding(finding: GateFinding): NarrativeContradictionFinding {
  return {
    dimension: finding.dimension,
    tool: finding.tool,
    ticker_or_dim: finding.ticker_or_dim,
    probe_ticker: finding.probe_ticker,
    claim_text: finding.claim_text,
    returned_value: finding.returned_summary,
  };
}
