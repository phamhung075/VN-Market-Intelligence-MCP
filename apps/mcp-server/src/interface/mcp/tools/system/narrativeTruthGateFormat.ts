/**
 * narrativeTruthGateFormat.ts — CCATO-MCP-T6-TOOL-REGISTRATION
 *
 * Formats a GateResult (CCATO-MCP-T5) into the plain-text tool response
 * (brief §3.1) — byte-identical per-finding line format to
 * scripts/narrative-truth-gate.sh L371-378 (the em-dash before "honest
 * no-data confirmed" / "probe inconclusive" is U+2014, verified against the
 * live script byte-for-byte) so
 * .claude/skills/claim-truth-gate/SKILL.md's self-correct protocol, which
 * parses `tool=<name> ticker=<ticker>` off `[FAIL]` lines, needs zero change.
 * Split out of narrativeTruthGateTool.ts to keep both files under the 120L
 * size-lint cap (same split-over-header precedent CCATO-MCP-T1..T5
 * established this sprint — see runNarrativeTruthGateTypes.ts's header).
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.1
 */

import type { GateFinding, GateResult } from "../../../../application/usecases/runNarrativeTruthGate.js";

function formatFinding(f: GateFinding): string {
  if (f.result === "FAIL") {
    return `[FAIL] dimension=${f.dimension} tool=${f.tool} ticker=${f.ticker_or_dim} claim="${f.claim_text}" returned="${f.returned_summary}"`;
  }
  if (f.result === "PASS") {
    return `[PASS] dimension=${f.dimension} tool=${f.tool} ticker=${f.ticker_or_dim} — honest no-data confirmed: "${f.returned_summary}"`;
  }
  return `[WARN] narrative-truth-gate: dimension=${f.dimension} tool=${f.tool} ticker=${f.ticker_or_dim} — probe inconclusive: ${f.returned_summary}`;
}

/** Builds the plain-text `GATE_VERDICT:` report — first line the verdict marker, then one line per scanned candidate. */
export function formatGateReport(result: GateResult): string {
  if (result.verdict === "CONFIG_ERROR") {
    return `GATE_VERDICT: CONFIG_ERROR: ${result.config_error_reason ?? "unknown"}`;
  }

  const failCount = result.findings.filter((f) => f.result === "FAIL").length;
  const header =
    result.verdict === "FAIL" ? `GATE_VERDICT: FAIL (${failCount} contradiction(s))` : "GATE_VERDICT: PASS";

  return [header, ...result.findings.map(formatFinding)].join("\n");
}
