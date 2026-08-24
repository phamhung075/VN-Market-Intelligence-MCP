/**
 * narrative_truth_gate — CCATO-MCP-T6-TOOL-REGISTRATION
 *
 * Registers the MCP-native CCATO (Claim Contradicts Authorized Tool Output)
 * truth gate as `narrative_truth_gate`, wrapping CCATO-MCP-T5's
 * runNarrativeTruthGate() usecase. This file is the interface-layer adapter
 * only — zero business logic: Zod-validate -> usecase -> format text report.
 * Placed alongside the other cross-cutting governance tools already in
 * tools/system/ (feedbackTools.ts, coordinationTools.ts, agentMemoryTools.ts,
 * cycleBootstrapTool.ts) per brief §3.1 — this is a quality-gate tool, not
 * domain-specific to macro/market-data/financial-reports.
 *
 * Response is plain text (matches every tool in this codebase — none return
 * structured JSON content); first line is a machine-parseable verdict marker
 * so the calling flow can branch without an exit code (MCP has none).
 *
 * `isError: true` set ONLY for CONFIG_ERROR (mirrors the bash engine's exit
 * code 2). A semantic FAIL (contradiction found) is a normal, non-error tool
 * response — exactly as get_technical_indicators returns "GIẢM" as a normal
 * response, not an error (brief §3.1). Signal-emit on FAIL happens
 * server-side inside runNarrativeTruthGate() (T5) — never delegated here.
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.1
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runNarrativeTruthGate } from "../../../../application/usecases/runNarrativeTruthGate.js";
import { formatGateReport } from "./narrativeTruthGateFormat.js";

const InputSchema = {
  post_body: z.string().min(1).describe("Composed narrative text to scan for CCATO claim candidates."),
  agent_id: z.string().min(1).describe("Calling agent kebab-case id, e.g. fb-market-poster."),
  cache: z
    .record(z.record(z.unknown()))
    .optional()
    .describe('Optional pre-fetched working-memory cache: { "<TICKER>": { "<dimension_id>": <non-null value> } }.'),
};

export function registerNarrativeTruthGateTool(server: McpServer): void {
  server.tool(
    "narrative_truth_gate",
    "CCATO truth gate: scans post_body for claim candidates against the negation lexicon " +
      "(docs/data/claim-tool-map.json), re-probes the live authorized tool per dimension, " +
      "classifies each candidate FAIL (contradiction) / PASS (honest no-data confirmed) / " +
      "WARN (probe inconclusive). On >=1 FAIL, appends a narrative_contradiction row to " +
      "signal_queue server-side (cowork agents cannot write orch-state.json themselves). " +
      "Returns plain text: first line 'GATE_VERDICT: PASS' | 'GATE_VERDICT: FAIL (N " +
      "contradiction(s))' | 'GATE_VERDICT: CONFIG_ERROR: <reason>', followed by one " +
      "[FAIL]/[PASS]/[WARN] line per scanned candidate.",
    InputSchema,
    async ({ post_body, agent_id, cache }) => {
      const result = await runNarrativeTruthGate(cache === undefined ? { post_body, agent_id } : { post_body, agent_id, cache });
      const text = formatGateReport(result);
      return {
        content: [{ type: "text" as const, text }],
        ...(result.verdict === "CONFIG_ERROR" ? { isError: true } : {}),
      };
    },
  );
}
