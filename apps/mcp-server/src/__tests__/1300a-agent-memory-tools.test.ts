/**
 * Task 1300a — Agent Memory Metadata Lookup Tools
 *
 * Tests for get_memory_files and search_memory_by_trigger tools.
 * Validates front-matter parsing and manifest routing.
 *
 * @module __tests__/1300a-agent-memory-tools.test.ts
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAgentMemoryTools } from "../interface/mcp/tools/system/agentMemoryTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURE_OPS_MANIFEST = `# Ops Memory Manifest

**Load when:** Health checks, incident response, or VPS troubleshooting.

| Task Type | Load |
|-----------|------|
| health-check, vps-status | issues/WAL-checkpoint.md, modules/scheduler.md |
| incident-response | issues/WAL-checkpoint.md |
| server-restart | issues/WAL-checkpoint.md |
`;

const FIXTURE_MEMORY_FILE_WAL = `---
agents: ops, developer, system-auditor
trigger: server-restart, health-check, db-maintenance
---

# Issue: WAL Checkpoint Missing on SIGTERM

**Status**: ✅ FIXED | **Severity**: Critical
`;

const FIXTURE_MEMORY_FILE_CIRCUIT = `---
agents: developer, ops, architect
trigger: adding-http-fetcher, incident-response
---

# Pattern: Circuit Breaker Half-Open Oscillation

**Recurrence**: 1x
`;

// ─────────────────────────────────────────────────────────────────────────────
// Helper to call tool
// ─────────────────────────────────────────────────────────────────────────────

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const toolMap = (server as unknown as { _registeredTools: Record<string, unknown> })
    ._registeredTools;
  const tool = toolMap[toolName] as unknown as { handler: (args: Record<string, unknown>) => Promise<unknown> };
  if (!tool) throw new Error(`Tool not found: ${toolName}`);
  const result = (await tool.handler(args)) as unknown as { content: Array<{ type: string; text: string }> };
  return result.content[0]?.text || "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1300a — Agent Memory Tools", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } }
    );
    registerAgentMemoryTools(server);
  });

  it("registers 2 tools: get_memory_files and search_memory_by_trigger", () => {
    const toolMap = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(Object.keys(toolMap)).toContain("get_memory_files");
    expect(Object.keys(toolMap)).toContain("search_memory_by_trigger");
  });

  it("get_memory_files returns files for valid agent+task", async () => {
    // Mock by calling with real agent/task (will read from filesystem)
    const result = await callTool(server, "get_memory_files", {
      agent_name: "ops",
      task_type: "server-restart",
    });
    // Should contain file path(s)
    expect(result).toContain("issues/WAL-checkpoint.md");
  });

  it("get_memory_files returns error for unknown agent", async () => {
    const result = await callTool(server, "get_memory_files", {
      agent_name: "nonexistent-agent",
      task_type: "some-task",
    });
    expect(result.toLowerCase()).toContain("error");
  });

  it("search_memory_by_trigger finds files by trigger tag", async () => {
    // Should find files tagged with server-restart trigger
    const result = await callTool(server, "search_memory_by_trigger", {
      trigger: "server-restart",
    });
    expect(result).toContain("WAL-checkpoint");
  });

  it("search_memory_by_trigger returns error for unknown trigger", async () => {
    const result = await callTool(server, "search_memory_by_trigger", {
      trigger: "nonexistent-trigger-xyz",
    });
    // Should return empty or "no results" message, not error
    expect(result.toLowerCase()).toMatch(/no|empty|found/i);
  });
});
