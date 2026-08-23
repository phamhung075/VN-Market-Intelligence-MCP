/**
 * runNarrativeTruthGate.ts — CCATO-MCP-T5-USECASE
 *
 * Application-layer composition root for the CCATO (Claim Contradicts
 * Authorized Tool Output) truth gate. Orchestrates T1 (pure domain
 * scan/classify), T2 (claim-tool-map SSOT loader), T3 (5 live probe
 * adapters), and T4 (narrative_contradiction signal writer) — domain stays
 * pure, infrastructure stays behind ports, per the DDD layer map in the
 * architecture brief §3.2. This file itself does zero fs/network I/O —
 * every side effect is delegated to an injected T2/T3/T4 function.
 *
 * Steps (byte-faithful to scripts/narrative-truth-gate.sh's overall shape,
 * script L280-453; per-candidate helpers in runNarrativeTruthGateFindings.ts):
 *   1. Guard: empty agent_id/post_body -> CONFIG_ERROR (script L58-61, L133-135).
 *   2. Load claim-tool-map.json (T2) — load failure -> CONFIG_ERROR.
 *   3. Scan post_body for candidate claims (T1 claimCandidateScanner).
 *   4. Per candidate: cache-hit short-circuit else live probe (T3 probeDimension).
 *   5. Classify each probe response (T1 verdictClassifier) -> FAIL/PASS/WARN.
 *   6. On >=1 FAIL: emit one narrative_contradiction signal per FAIL finding
 *      (T4 writeNarrativeContradictionSignals) — server-side write, REQUIRED
 *      per brief §2.1 (cowork agents cannot write orch-state.json themselves).
 *
 * DI: every T2/T3/T4 call is an injectable trailing-deps-bag field
 * defaulting to the real implementation — same "optional param defaults to
 * real impl" convention T1-T4 use, bundled into one object here because
 * this composition root has more dependencies than a positional-arg
 * signature stays readable with (mirrors T3's own multi-fn adapter map).
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.1-3.2
 */

import { loadClaimToolMap, ClaimToolMapLoadError, type ClaimToolMap } from "../../infrastructure/fileStore/claimToolMapLoader.js";
import { scanClaimCandidates } from "../../domain/services/narrativeTruthGate/claimCandidateScanner.js";
import type { ClaimCandidate } from "../../domain/services/narrativeTruthGate/claimToolMapTypes.js";
import {
  probeDimension,
  DEFAULT_PROBE_ADAPTERS,
  type ProbeAdapterMap,
  type ProbeResult,
} from "../../infrastructure/probes/narrativeTruthProbeAdapters.js";
import {
  writeNarrativeContradictionSignals,
  type NarrativeContradictionFinding,
} from "../../infrastructure/signals/narrativeContradictionSignalWriter.js";
import { cacheLookup, toGateFinding, toContradictionFinding } from "./runNarrativeTruthGateFindings.js";
import type { GateFinding, GateResult, RunNarrativeTruthGateInput } from "./runNarrativeTruthGateTypes.js";

export type {
  RunNarrativeTruthGateInput,
  GateVerdict,
  GateFindingResult,
  GateFinding,
  GateResult,
} from "./runNarrativeTruthGateTypes.js";

/** Injectable dependency bag — every field defaults to the real T2/T3/T4 implementation; test isolation only. */
export interface RunNarrativeTruthGateDeps {
  loadClaimToolMapFn?: (filePath?: string) => ClaimToolMap;
  claimToolMapPath?: string;
  probeFn?: (candidate: ClaimCandidate, now: Date, adapters?: ProbeAdapterMap) => Promise<ProbeResult>;
  adapters?: ProbeAdapterMap;
  writeSignalsFn?: (
    findings: readonly NarrativeContradictionFinding[],
    agentId: string,
    orchStatePath?: string,
    now?: Date,
  ) => void;
  orchStatePath?: string;
  now?: Date;
}

/** Main use case entry — called by the interface layer (CCATO-MCP-T6, not yet landed) after Zod validation. */
export async function runNarrativeTruthGate(
  input: RunNarrativeTruthGateInput,
  deps: RunNarrativeTruthGateDeps = {},
): Promise<GateResult> {
  if (input.agent_id.trim().length === 0) {
    return { verdict: "CONFIG_ERROR", findings: [], config_error_reason: "agent_id is empty" };
  }
  if (input.post_body.trim().length === 0) {
    return { verdict: "CONFIG_ERROR", findings: [], config_error_reason: "post_body is empty" };
  }

  const loadClaimToolMapFn = deps.loadClaimToolMapFn ?? loadClaimToolMap;
  const probeFn = deps.probeFn ?? probeDimension;
  const adapters = deps.adapters ?? DEFAULT_PROBE_ADAPTERS;
  const writeSignalsFn = deps.writeSignalsFn ?? writeNarrativeContradictionSignals;
  const now = deps.now ?? new Date();

  let claimMap: ClaimToolMap;
  try {
    claimMap = loadClaimToolMapFn(deps.claimToolMapPath);
  } catch (err) {
    const reason = err instanceof ClaimToolMapLoadError ? err.message : String(err);
    return { verdict: "CONFIG_ERROR", findings: [], config_error_reason: reason };
  }

  const toolNullMarkers = claimMap.tool_null_markers ?? [];
  const candidates = scanClaimCandidates(input.post_body, claimMap);

  const findings: GateFinding[] = [];
  for (const candidate of candidates) {
    const cacheHit = cacheLookup(input.cache, candidate);
    const probe = cacheHit ?? (await probeFn(candidate, now, adapters));
    findings.push(toGateFinding(candidate, probe, cacheHit ? "cache" : "live", toolNullMarkers));
  }

  const failFindings = findings.filter((f) => f.result === "FAIL");
  if (failFindings.length > 0) {
    writeSignalsFn(failFindings.map(toContradictionFinding), input.agent_id, deps.orchStatePath, now);
  }

  return { verdict: failFindings.length > 0 ? "FAIL" : "PASS", findings };
}
