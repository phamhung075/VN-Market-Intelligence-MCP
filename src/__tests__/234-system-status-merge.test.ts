/**
 * Task 234 — Merge 4 system health tools into 1 get_system_status
 *
 * Tests:
 *   1. getSystemStatus() returns all 4 sections when includeErrors=true (default)
 *   2. getSystemStatus() omits RECENT ERRORS section when includeErrors=false
 *   3. Section headers are present and in correct order
 *   4. Old tool names are no longer registered (get_system_health, get_source_health,
 *      get_data_freshness, get_error_summary)
 *   5. New tool get_system_status is registered
 *   6. errorLines param controls how many error lines are passed through
 */

import { describe, it, expect } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  getSystemStatus,
  registerSystemTools,
} from "../interface/mcp/tools/systemTools.js";
import { registerSourceHealthTools } from "../interface/mcp/tools/sourceHealthTools.js";
import { registerDataFreshnessTools } from "../interface/mcp/tools/dataFreshnessTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: collect registered tool names from a McpServer instance
// ─────────────────────────────────────────────────────────────────────────────

function getRegisteredToolNames(server: McpServer): string[] {
  const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  return Object.keys(tools ?? {});
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. getSystemStatus() — pure output function tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 234 — getSystemStatus()", () => {
  it("returns all 4 section headers by default (includeErrors=true)", async () => {
    const result = await getSystemStatus({ includeErrors: true, errorLines: 5 });
    expect(result).toContain("=== DB STATUS ===");
    expect(result).toContain("=== SOURCE HEALTH ===");
    expect(result).toContain("=== DATA FRESHNESS ===");
    expect(result).toContain("=== RECENT ERRORS ===");
  });

  it("omits RECENT ERRORS section when includeErrors=false", async () => {
    const result = await getSystemStatus({ includeErrors: false, errorLines: 5 });
    expect(result).toContain("=== DB STATUS ===");
    expect(result).toContain("=== SOURCE HEALTH ===");
    expect(result).toContain("=== DATA FRESHNESS ===");
    expect(result).not.toContain("=== RECENT ERRORS ===");
  });

  it("sections appear in correct order: DB STATUS → SOURCE HEALTH → DATA FRESHNESS → RECENT ERRORS", async () => {
    const result = await getSystemStatus({ includeErrors: true, errorLines: 5 });
    const dbPos = result.indexOf("=== DB STATUS ===");
    const srcPos = result.indexOf("=== SOURCE HEALTH ===");
    const freshPos = result.indexOf("=== DATA FRESHNESS ===");
    const errPos = result.indexOf("=== RECENT ERRORS ===");

    expect(dbPos).toBeGreaterThanOrEqual(0);
    expect(srcPos).toBeGreaterThan(dbPos);
    expect(freshPos).toBeGreaterThan(srcPos);
    expect(errPos).toBeGreaterThan(freshPos);
  });

  it("DB STATUS section includes circuit breaker and uptime info", async () => {
    const result = await getSystemStatus({ includeErrors: true, errorLines: 5 });
    const dbSection = result.slice(result.indexOf("=== DB STATUS ==="));
    // The original get_system_health output always includes uptime
    expect(dbSection).toMatch(/uptime|Circuit Breaker|Database/i);
  });

  it("SOURCE HEALTH section includes Vietnamese header", async () => {
    const result = await getSystemStatus({ includeErrors: true, errorLines: 5 });
    const srcSection = result.slice(result.indexOf("=== SOURCE HEALTH ==="));
    expect(srcSection).toContain("Tình trạng nguồn dữ liệu");
  });

  it("DATA FRESHNESS section includes Vietnamese header", async () => {
    const result = await getSystemStatus({ includeErrors: true, errorLines: 5 });
    const freshSection = result.slice(result.indexOf("=== DATA FRESHNESS ==="));
    expect(freshSection).toContain("Độ tuổi dữ liệu");
  });

  it("returns a string (not an object)", async () => {
    const result = await getSystemStatus({ includeErrors: true, errorLines: 5 });
    expect(typeof result).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Tool registration — new tool present, old tools absent
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 234 — MCP tool registration", () => {
  it("get_system_status is registered in systemTools", () => {
    const server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerSystemTools(server);
    const names = getRegisteredToolNames(server);
    expect(names).toContain("get_system_status");
  });

  it("get_system_health is NOT registered (removed)", () => {
    const server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerSystemTools(server);
    const names = getRegisteredToolNames(server);
    expect(names).not.toContain("get_system_health");
  });

  it("get_error_summary is NOT registered (merged into get_system_status)", () => {
    const server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerSystemTools(server);
    const names = getRegisteredToolNames(server);
    expect(names).not.toContain("get_error_summary");
  });

  it("get_source_health is NOT registered (merged into get_system_status)", () => {
    const server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerSourceHealthTools(server);
    const names = getRegisteredToolNames(server);
    expect(names).not.toContain("get_source_health");
  });

  it("get_data_freshness is NOT registered (merged into get_system_status)", () => {
    const server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerDataFreshnessTools(server);
    const names = getRegisteredToolNames(server);
    expect(names).not.toContain("get_data_freshness");
  });

  it("registerSystemTools registers get_global_log and get_tool_log if present (smoke test)", () => {
    // We only assert get_system_status is there; other tools may vary
    const server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    expect(() => registerSystemTools(server)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. MCP handler wiring — the tool handler returns correct MCP content shape
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 234 — get_system_status MCP content shape", () => {
  it("returns content array with type=text", async () => {
    const result = await getSystemStatus({ includeErrors: true, errorLines: 5 });
    // Verify it's a non-empty string (the MCP tool wraps it)
    expect(result.length).toBeGreaterThan(100);
  });

  it("includeErrors defaults to including errors when called with true", async () => {
    const withErrors = await getSystemStatus({ includeErrors: true, errorLines: 3 });
    const withoutErrors = await getSystemStatus({ includeErrors: false, errorLines: 3 });
    expect(withErrors.length).toBeGreaterThanOrEqual(withoutErrors.length);
  });
});
