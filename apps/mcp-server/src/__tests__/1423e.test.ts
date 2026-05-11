/**
 * Task 1423e — get_macro_calendar MCP tool targeted tests
 *
 * Verifies:
 *   - Tool is registered on the MCP server via registerCarryTools
 *   - Default 60-day window returns at least 3 events
 *   - daysAhead parameter filters correctly (short window < long window)
 *   - _testReferenceDate injection produces deterministic output
 *   - Response is valid JSON wrapped in content array
 *   - Each event has required shape fields
 */

import { describe, it, expect } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerCarryTools } from "../interface/mcp/tools/macro/carryTools.js";
import type { MacroCalendarResult } from "../domain/services/macro/macroCalendar.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: invoke a registered MCP tool by name
// ─────────────────────────────────────────────────────────────────────────────

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      callback?: (args: Record<string, unknown>) => unknown;
      handler?: (args: Record<string, unknown>) => unknown;
    }>;
  })._registeredTools;

  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);

  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable found for tool: ${toolName}`);

  return fn(args) as Promise<{ content: Array<{ type: string; text: string }> }>;
}

async function callMacroCalendar(
  server: McpServer,
  days?: number,
  referenceDate?: string,
): Promise<MacroCalendarResult> {
  const args: Record<string, unknown> = {};
  if (days !== undefined) args["days"] = days;
  if (referenceDate !== undefined) args["_testReferenceDate"] = referenceDate;

  const response = await callTool(server, "get_macro_calendar", args);
  const text = response.content[0]?.text ?? "{}";
  return JSON.parse(text) as MacroCalendarResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite — get_macro_calendar MCP tool
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1423e — get_macro_calendar MCP tool", () => {
  let server: McpServer;

  // Fresh server per test — no DB state needed (pure domain function)
  function makeServer(): McpServer {
    const s = new McpServer({ name: "test-1423e", version: "0.0.0" });
    registerCarryTools(s);
    return s;
  }

  // ── tool registration ────────────────────────────────────────────────────

  it("registers get_macro_calendar on the MCP server", () => {
    server = makeServer();
    const tools = (server as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;
    expect(tools["get_macro_calendar"]).toBeDefined();
  });

  // ── default 60-day window returns at least 3 events ─────────────────────

  it("returns at least 3 events for a standard 60-day window (Jan 2026)", async () => {
    server = makeServer();
    const result = await callMacroCalendar(server, 60, "2026-01-01");
    expect(result.events.length).toBeGreaterThanOrEqual(3);
  });

  it("returns at least 3 events using default days (no days arg)", async () => {
    server = makeServer();
    const result = await callMacroCalendar(server, undefined, "2026-04-01");
    expect(result.events.length).toBeGreaterThanOrEqual(3);
  });

  // ── daysAhead filtering ──────────────────────────────────────────────────

  it("short window returns fewer events than long window", async () => {
    server = makeServer();
    const short = await callMacroCalendar(server, 7, "2026-01-01");
    const long = await callMacroCalendar(server, 180, "2026-01-01");
    expect(long.events.length).toBeGreaterThan(short.events.length);
  });

  it("days=30 window from Jan 1 excludes events after Jan 30", async () => {
    server = makeServer();
    const result = await callMacroCalendar(server, 30, "2026-01-01");
    const cutoff = "2026-01-30";
    for (const event of result.events) {
      expect(event.date <= cutoff).toBe(true);
    }
  });

  // ── deterministic output with fixed reference date ───────────────────────

  it("produces deterministic output for the same reference date", async () => {
    server = makeServer();
    const a = await callMacroCalendar(server, 60, "2026-05-01");
    const b = await callMacroCalendar(server, 60, "2026-05-01");
    expect(a.events.length).toBe(b.events.length);
    expect(a.events[0]?.date).toBe(b.events[0]?.date);
  });

  // ── result shape ─────────────────────────────────────────────────────────

  it("response is valid JSON in content array", async () => {
    server = makeServer();
    const raw = await callTool(server, "get_macro_calendar", {
      _testReferenceDate: "2026-03-01",
      days: 60,
    });
    expect(Array.isArray(raw.content)).toBe(true);
    expect(raw.content[0]?.type).toBe("text");
    expect(() => JSON.parse(raw.content[0]?.text ?? "")).not.toThrow();
  });

  it("result has required top-level fields", async () => {
    server = makeServer();
    const result = await callMacroCalendar(server, 60, "2026-01-01");
    expect(result).toHaveProperty("events");
    expect(result).toHaveProperty("currentMonthIsPivotWindow");
    expect(result).toHaveProperty("nextPivotWindow");
    expect(result).toHaveProperty("pivotWindowWarning");
  });

  it("each event has required fields with correct types", async () => {
    server = makeServer();
    const result = await callMacroCalendar(server, 60, "2026-01-01");
    expect(result.events.length).toBeGreaterThan(0);

    for (const event of result.events) {
      expect(typeof event.date).toBe("string");
      expect(event.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof event.name).toBe("string");
      expect(typeof event.type).toBe("string");
      expect(typeof event.source).toBe("string");
      expect(typeof event.isPivotWindow).toBe("boolean");
      expect(typeof event.description).toBe("string");
    }
  });

  // ── pivot window metadata ─────────────────────────────────────────────────

  it("currentMonthIsPivotWindow=true when reference date is in June", async () => {
    server = makeServer();
    const result = await callMacroCalendar(server, 30, "2026-06-01");
    expect(result.currentMonthIsPivotWindow).toBe(true);
  });

  it("currentMonthIsPivotWindow=false when reference date is in April", async () => {
    server = makeServer();
    const result = await callMacroCalendar(server, 30, "2026-04-01");
    expect(result.currentMonthIsPivotWindow).toBe(false);
  });

  it("nextPivotWindow label is a non-empty string", async () => {
    server = makeServer();
    const result = await callMacroCalendar(server, 30, "2026-04-01");
    expect(typeof result.nextPivotWindow).toBe("string");
    expect(result.nextPivotWindow.length).toBeGreaterThan(0);
  });

  it("nextPivotWindow returns June 2026 when reference is April 2026", async () => {
    server = makeServer();
    const result = await callMacroCalendar(server, 30, "2026-04-10");
    expect(result.nextPivotWindow).toBe("June 2026");
  });
});
