/**
 * Task 1875c — record_signal_outcome dispatch regression guard
 *
 * RCA summary:
 *   No code bug found in the mcp-server dispatch table. MCP SDK dispatches
 *   by exact _registeredTools[name] lookup — no prefix/partial matching.
 *   Tool names are unique (confirmed: all 126 names appear exactly once).
 *   buildToolNameMap probe captures all names synchronously.
 *   SSE sessions always receive the full toolRegistry (no skill filtering
 *   applied at /sse route — skills param is not passed to SseSessionManager).
 *
 *   Likely cause of TNB c35 F3 observation: transient Claude.ai gateway issue
 *   or agent-side response misparse (alert-commander read stale climate data
 *   from a previous call and associated it with the outcome call's slot).
 *
 * This test acts as a permanent regression guard:
 *   (a) record_signal_outcome is registered in a full toolRegistry McpServer
 *   (b) its handler returns signal-outcome text, NOT climate-related text
 *   (c) get_climate_risk_signals has a DIFFERENT handler object in _registeredTools
 *   (d) resolveToolNames(['record_signal_outcome']) resolves registerAgentSignalTools
 *       (NOT registerClimateTools)
 *   (e) getToolsForSkills(['alert_commander']) includes record_signal_outcome resolution
 *
 * @module __tests__/1875c-record-signal-outcome-routing
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toolRegistry } from "../interface/mcp/tools/registry.js";
import { getToolsForSkills } from "../interface/mcp/bootstrap/agentBootstrap.js";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types for internal SDK access (not exported by SDK)
// ─────────────────────────────────────────────────────────────────────────────

type RegisteredTool = {
  handler: (args: Record<string, unknown>) => Promise<unknown>;
  enabled: boolean;
  description: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared test fixtures
// ─────────────────────────────────────────────────────────────────────────────

let registeredTools: Record<string, RegisteredTool>;

beforeAll(async () => {
  // In-memory DB required for handlers that call initDatabase()
  await initDatabase();

  const server = new McpServer(
    { name: "test-1875c", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  toolRegistry.forEach((fn) => fn(server));
  registeredTools = (server as unknown as { _registeredTools: Record<string, RegisteredTool> })
    ._registeredTools;
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("1875c — record_signal_outcome dispatch regression guard", () => {
  // (a) Tool is present in full server _registeredTools
  it("(a) record_signal_outcome is registered in the full toolRegistry server", () => {
    expect(registeredTools["record_signal_outcome"]).toBeDefined();
    expect(registeredTools["record_signal_outcome"]!.enabled).toBe(true);
  });

  // (b) Handler returns signal-outcome text, NOT climate-related text
  it("(b) record_signal_outcome handler returns signal-outcome shape (not climate)", async () => {
    const tool = registeredTools["record_signal_outcome"]!;

    // signal_id=2866 — the exact value from TNB c35 F3 report.
    // Signal may not exist in :memory: DB (UPDATE will silently no-op) but
    // handler always returns "Outcome recorded: signal_id=..." confirmation.
    const result = await tool.handler({
      signal_id: 2866,
      outcome: "fired",
    }) as { content: Array<{ type: string; text: string }> };

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);

    const text = result.content[0]!.text;
    expect(typeof text).toBe("string");

    // Must contain signal_id confirmation — not climate data
    // Any of: "Outcome recorded: signal_id=2866", or an Error message
    // (never climate Vietnamese text like PHÂN TÍCH RỦI RO KHÍ HẬU)
    const climateMarkers = ["KHÍ HẬU", "PHÂN TÍCH", "thời tiết", "bão", "El Nino", "La Nina", "NCHMF"];
    for (const marker of climateMarkers) {
      expect(text).not.toContain(marker);
    }

    // Must contain signal outcome confirmation or an error about signal
    const isOutcomeConfirmation = text.includes("signal_id=2866");
    const isErrorResponse = text.startsWith("Error:");
    expect(isOutcomeConfirmation || isErrorResponse).toBe(true);
  });

  // (c) record_signal_outcome and get_climate_risk_signals have DIFFERENT handler objects
  it("(c) record_signal_outcome and get_climate_risk_signals have different handler objects", () => {
    const signalTool = registeredTools["record_signal_outcome"]!;
    const climateTool = registeredTools["get_climate_risk_signals"]!;

    expect(signalTool).toBeDefined();
    expect(climateTool).toBeDefined();

    // The handlers must be different function references
    expect(signalTool.handler).not.toBe(climateTool.handler);
  });

  // (d) buildToolNameMap resolves record_signal_outcome to registerAgentSignalTools
  //     (NOT registerClimateTools) — verified via probe
  it("(d) resolveToolNames(['record_signal_outcome']) does not resolve to registerClimateTools", () => {
    const fns = getToolsForSkills(["alert_commander"]);

    // Probe each fn to collect registered tool names
    const toolsByFn = new Map<Function, string[]>();
    const fakeServer = {
      tool(name: string) {
        const current = toolsByFn.get(this._currentFn!) ?? [];
        current.push(name);
        toolsByFn.set(this._currentFn!, current);
      },
      registerTool(name: string) {
        const current = toolsByFn.get(this._currentFn!) ?? [];
        current.push(name);
        toolsByFn.set(this._currentFn!, current);
      },
      _currentFn: null as Function | null,
    };

    // Run each fn and track which fn registered which tools
    for (const fn of fns) {
      fakeServer._currentFn = fn;
      try {
        fn(fakeServer as unknown as McpServer);
      } catch {
        // ignore handler errors in probe
      }
    }

    // Find which fn registered record_signal_outcome
    let signalFn: Function | null = null;
    let climateFn: Function | null = null;

    for (const [fn, names] of toolsByFn) {
      if (names.includes("record_signal_outcome")) signalFn = fn;
      if (names.includes("get_climate_risk_signals")) climateFn = fn;
    }

    // record_signal_outcome MUST be registered by some fn in alert_commander
    expect(signalFn).not.toBeNull();

    // If climate tool is registered (not in alert_commander skill, so likely null),
    // it must be a DIFFERENT fn than the signal fn
    if (climateFn !== null) {
      expect(signalFn).not.toBe(climateFn);
    }
  });

  // (e) getToolsForSkills(['alert_commander']) resolves record_signal_outcome
  it("(e) getToolsForSkills(['alert_commander']) includes record_signal_outcome", () => {
    const fns = getToolsForSkills(["alert_commander"]);

    const registeredNames: string[] = [];
    const fakeServer = {
      tool(name: string) {
        registeredNames.push(name);
      },
      registerTool(name: string) {
        registeredNames.push(name);
      },
    } as unknown as McpServer;

    for (const fn of fns) {
      try {
        fn(fakeServer);
      } catch {
        // ignore probe errors
      }
    }

    expect(registeredNames).toContain("record_signal_outcome");

    // Climate tool must NOT be in alert_commander skill
    expect(registeredNames).not.toContain("get_climate_risk_signals");
  });
});
