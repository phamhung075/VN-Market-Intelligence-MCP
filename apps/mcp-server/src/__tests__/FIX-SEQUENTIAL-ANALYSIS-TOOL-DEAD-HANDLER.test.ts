// src/__tests__/FIX-SEQUENTIAL-ANALYSIS-TOOL-DEAD-HANDLER.test.ts
/**
 * FIX-SEQUENTIAL-ANALYSIS-TOOL-DEAD-HANDLER
 *
 * `sequential_market_analysis` was unreachable over the wire: its
 * `registerSequentialMarketAnalysisTools()` passed the handler nested inside
 * the config object (`{ ..., handler: tool.handle }`) instead of as the MCP
 * SDK's required 3rd positional callback argument
 * (`server.registerTool(name, config, cb)`). The SDK's `registerTool()` only
 * destructures title/description/inputSchema/outputSchema/annotations/_meta
 * from config — an unknown `handler` key is silently dropped, leaving `cb`
 * (and therefore `_registeredTools[name].handler`) `undefined`. Every real
 * invocation then threw "originalHandler is not a function"
 * (`server.ts`'s per-call telemetry wrapper calls `originalHandler(args)`).
 *
 * This test registers the tool on a real McpServer instance (no mocking of
 * registerTool) and asserts the resulting `_registeredTools` entry carries an
 * actually-callable handler that returns a real result — the exact wiring
 * path a live MCP client invocation exercises, not just the standalone
 * `createSequentialMarketAnalysisTool().handle()` logic (already covered by
 * FACTORY-INTERFACE-sequential-confidence-05-mask.test.ts).
 */

import { describe, it, expect } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSequentialMarketAnalysisTools } from "../interface/mcp/tools/analysis/sequential-market-analysis.js";

describe("FIX-SEQUENTIAL-ANALYSIS-TOOL-DEAD-HANDLER", () => {
  it("registers sequential_market_analysis with a real callable handler (3rd positional arg, not nested in config)", async () => {
    const server = new McpServer(
      { name: "test-probe", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );

    await registerSequentialMarketAnalysisTools(server);

    const registeredToolsMap = (
      server as unknown as { _registeredTools: Record<string, { handler: unknown }> }
    )._registeredTools;

    const toolDef = registeredToolsMap["sequential_market_analysis"];
    expect(toolDef).toBeDefined();
    // The regression: handler was `undefined` when nested inside config.
    expect(typeof toolDef!.handler).toBe("function");
  });

  it("the registered handler is reachable and returns a real result, not 'originalHandler is not a function'", async () => {
    const server = new McpServer(
      { name: "test-probe-2", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );

    await registerSequentialMarketAnalysisTools(server);

    const registeredToolsMap = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<unknown> }>;
      }
    )._registeredTools;
    const handler = registeredToolsMap["sequential_market_analysis"]!.handler;

    const result = await handler(
      {
        analysisType: "hypothesis_test",
        thought: "regression probe call",
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      },
      {},
    );

    expect(result).toBeDefined();
    expect((result as { status: string }).status).toBe("complete");
    expect((result as { thought: { content: string } }).thought.content).toBe(
      "regression probe call",
    );
  });
});
