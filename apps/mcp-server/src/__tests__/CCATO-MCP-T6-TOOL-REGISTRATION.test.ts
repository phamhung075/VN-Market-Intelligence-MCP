/**
 * CCATO-MCP-T6-TOOL-REGISTRATION — unit tests
 *
 * Scope: the interface-layer adapter only (Zod schema, registration wiring,
 * plain-text report formatting). Orchestration correctness (CONFIG_ERROR
 * guards, candidate scan, probe/classify, signal-emit fan-out) is already
 * covered by CCATO-MCP-T5-USECASE.test.ts against the injectable deps bag —
 * not re-derived here (dispatcher scope: "stay inside T6's scope").
 *
 * Deliberately does NOT exercise a FAIL verdict through the fully-registered
 * tool end-to-end: the interface layer calls runNarrativeTruthGate() with no
 * deps override, so a real FAIL candidate would invoke the REAL
 * writeNarrativeContradictionSignals() against the REAL, live
 * docs/data/orch/orch-state.json (DEFAULT_ORCH_STATE_PATH) — never
 * acceptable from a test. FAIL-shape coverage instead goes through the pure
 * formatGateReport() unit tests below (zero I/O, synthetic GateResult).
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.1
 */

import { describe, it, expect } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerNarrativeTruthGateTool } from "../interface/mcp/tools/system/narrativeTruthGateTool.js";
import { formatGateReport } from "../interface/mcp/tools/system/narrativeTruthGateFormat.js";
import { toolRegistry } from "../interface/mcp/tools/registry.js";
import type { GateFinding, GateResult } from "../application/usecases/runNarrativeTruthGate.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper — invoke a registered MCP tool's raw handler directly (bypasses SSE
// transport AND the SDK's JSON-RPC-layer Zod validation — same harness
// pattern as 082-tool-watchlist.test.ts / FIX-BCTC-REPORT-ID-LOOKUP-TOOL.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

function makeServer(): McpServer {
  const server = new McpServer({ name: "test", version: "0.0.0" }, { capabilities: { tools: {} } });
  registerNarrativeTruthGateTool(server);
  return server;
}

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const registry = (
    server as unknown as {
      _registeredTools: Record<string, { handler: (args: Record<string, unknown>) => Promise<unknown> }>;
    }
  )._registeredTools;
  const entry = registry[toolName];
  if (!entry) throw new Error(`Tool "${toolName}" not registered`);
  return entry.handler(args) as Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration + registry.ts wiring
// ─────────────────────────────────────────────────────────────────────────────

describe("CCATO-MCP-T6 — registration", () => {
  it("registers narrative_truth_gate on the McpServer", () => {
    const server = makeServer();
    const registered = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect(Object.keys(registered)).toContain("narrative_truth_gate");
  });

  it("registry.ts wires registerNarrativeTruthGateTool into the flat toolRegistry array", () => {
    expect(toolRegistry).toContain(registerNarrativeTruthGateTool);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Handler — end-to-end through the real usecase, I/O-safe paths only
// ─────────────────────────────────────────────────────────────────────────────

describe("CCATO-MCP-T6 — handler (CONFIG_ERROR + zero-candidate PASS only, no live-write paths)", () => {
  it("whitespace-only agent_id -> CONFIG_ERROR, isError:true, GATE_VERDICT header", async () => {
    const server = makeServer();
    const result = await callTool(server, "narrative_truth_gate", {
      post_body: "Thị trường VN-Index hôm nay tăng nhẹ, thanh khoản ổn định.",
      agent_id: "   ",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe("GATE_VERDICT: CONFIG_ERROR: agent_id is empty");
  });

  it("post_body with zero negation-lexicon matches -> PASS, no isError, no findings lines", async () => {
    const server = makeServer();
    const result = await callTool(server, "narrative_truth_gate", {
      post_body: "Thị trường VN-Index hôm nay tăng nhẹ 0.5 điểm, thanh khoản ổn định.",
      agent_id: "test-agent",
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toBe("GATE_VERDICT: PASS");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatGateReport — pure, byte-fidelity to scripts/narrative-truth-gate.sh
// L371-378 (verified em-dash U+2014 byte-for-byte against the live script).
// ─────────────────────────────────────────────────────────────────────────────

function finding(overrides: Partial<GateFinding>): GateFinding {
  return {
    dimension: "technical_indicators",
    tool: "get_technical_indicators",
    ticker_or_dim: "VNM",
    probe_ticker: "VNM",
    claim_text: "VNM không có dữ liệu kỹ thuật phiên này.",
    matched_negation: "không có dữ liệu kỹ thuật phiên này",
    source: "cache",
    classification: "NON_NULL",
    result: "FAIL",
    returned_summary: "RSI 20.3, MACD bullish",
    ...overrides,
  };
}

describe("CCATO-MCP-T6 — formatGateReport (pure, zero I/O)", () => {
  it("CONFIG_ERROR verdict -> single-line report, ignores findings", () => {
    const result: GateResult = { verdict: "CONFIG_ERROR", findings: [], config_error_reason: "post_body is empty" };
    expect(formatGateReport(result)).toBe("GATE_VERDICT: CONFIG_ERROR: post_body is empty");
  });

  it("PASS verdict, zero findings -> header line only", () => {
    const result: GateResult = { verdict: "PASS", findings: [] };
    expect(formatGateReport(result)).toBe("GATE_VERDICT: PASS");
  });

  it("FAIL verdict, one FAIL finding -> count in header + byte-exact [FAIL] line", () => {
    const f = finding({});
    const result: GateResult = { verdict: "FAIL", findings: [f] };
    const text = formatGateReport(result);
    expect(text).toBe(
      "GATE_VERDICT: FAIL (1 contradiction(s))\n" +
        '[FAIL] dimension=technical_indicators tool=get_technical_indicators ticker=VNM claim="VNM không có dữ liệu kỹ thuật phiên này." returned="RSI 20.3, MACD bullish"',
    );
  });

  it("PASS finding -> byte-exact em-dash [PASS] line (honest no-data confirmed)", () => {
    const f = finding({
      dimension: "foreign_flow",
      tool: "get_foreign_flow",
      ticker_or_dim: "ANI",
      result: "PASS",
      classification: "NULL",
      returned_summary: "No foreign flow data found for ANI",
    });
    const result: GateResult = { verdict: "PASS", findings: [f] };
    expect(formatGateReport(result)).toBe(
      "GATE_VERDICT: PASS\n" +
        '[PASS] dimension=foreign_flow tool=get_foreign_flow ticker=ANI — honest no-data confirmed: "No foreign flow data found for ANI"',
    );
  });

  it("WARN finding -> byte-exact em-dash [WARN] line, does not affect PASS verdict", () => {
    const f = finding({
      dimension: "macro",
      tool: "get_macro_snapshot",
      ticker_or_dim: "VIC",
      result: "WARN",
      classification: "ERROR",
      returned_summary: "macro service timeout",
    });
    const result: GateResult = { verdict: "PASS", findings: [f] };
    expect(formatGateReport(result)).toBe(
      "GATE_VERDICT: PASS\n" +
        "[WARN] narrative-truth-gate: dimension=macro tool=get_macro_snapshot ticker=VIC — probe inconclusive: macro service timeout",
    );
  });

  it("mixed FAIL+PASS+WARN findings -> header count reflects FAIL-only, one line per finding, order preserved", () => {
    const findings: GateFinding[] = [
      finding({ dimension: "technical_indicators", ticker_or_dim: "VNM", result: "FAIL" }),
      finding({
        dimension: "foreign_flow",
        tool: "get_foreign_flow",
        ticker_or_dim: "ANI",
        result: "PASS",
        returned_summary: "no data",
      }),
      finding({
        dimension: "macro",
        tool: "get_macro_snapshot",
        ticker_or_dim: "VIC",
        result: "WARN",
        returned_summary: "timeout",
      }),
    ];
    const result: GateResult = { verdict: "FAIL", findings };
    const lines = formatGateReport(result).split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("GATE_VERDICT: FAIL (1 contradiction(s))");
    expect(lines[1]).toStartWith("[FAIL] dimension=technical_indicators");
    expect(lines[2]).toStartWith("[PASS] dimension=foreign_flow");
    expect(lines[3]).toStartWith("[WARN] narrative-truth-gate: dimension=macro");
  });
});
