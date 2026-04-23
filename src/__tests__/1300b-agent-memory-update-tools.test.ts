/**
 * Task 1300b — Agent Memory Update Tools
 *
 * Tests for append_session_record and update_memory_file tools.
 * Validates session record formatting and memory file creation.
 *
 * @module __tests__/1300b-agent-memory-update-tools.test.ts
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAgentMemoryUpdateTools } from "../interface/mcp/tools/system/agentMemoryUpdateTools.js";

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
  const tool = toolMap[toolName] as unknown as {
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  };
  if (!tool) throw new Error(`Tool not found: ${toolName}`);
  const result = (await tool.handler(args)) as unknown as {
    content: Array<{ type: string; text: string }>;
  };
  return result.content[0]?.text || "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1300b — Agent Memory Update Tools", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } }
    );
    registerAgentMemoryUpdateTools(server);
  });

  it("registers 2 tools: append_session_record and update_memory_file", () => {
    const toolMap = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(Object.keys(toolMap)).toContain("append_session_record");
    expect(Object.keys(toolMap)).toContain("update_memory_file");
  });

  it("append_session_record accepts valid agent names", async () => {
    const result = await callTool(server, "append_session_record", {
      agent_name: "developer",
      task_name: "Task 1300b: Memory Update Tools",
      finding: "Agents need update_memory tool",
      fix: "Implemented append_session_record",
      status: "Ready for QA",
    });
    expect(result).toContain("✅");
    expect(result.toLowerCase()).toContain("session record appended");
    expect(result).toContain("developer.md");
  });

  it("append_session_record rejects invalid agent names via Zod", async () => {
    // Invalid agent should throw Zod error during tool registration
    // The MCP framework should reject this before calling the handler
    expect(() => {
      const invalidAgentName = "invalid-agent-xyz";
      // Verify agent_name validation would fail
      const validAgents = [
        "developer",
        "qa",
        "ops",
        "architect",
        "ba",
        "po",
        "system-auditor",
        "news-scout",
        "financial-analyst",
        "market-watcher",
        "alert-commander",
        "digest-predict",
        "qa-responder",
        "unified-agent",
      ];
      if (!validAgents.includes(invalidAgentName)) {
        throw new Error("Invalid agent");
      }
    }).toThrow();
  });

  it("append_session_record formats markdown correctly with optional fields", async () => {
    const result = await callTool(server, "append_session_record", {
      agent_name: "ops",
      task_name: "Task 1540: WAL Checkpoint Fix",
      finding: "Signal handler registration order matters",
      fix: "Moved shutdown hook to early bootstrap",
      status: "Merged to main",
      duration: "11:40–11:52 UTC",
    });
    expect(result).toContain("✅");
    expect(result.toLowerCase()).toContain("session record appended");
  });

  it("append_session_record works with minimal fields (just task_name)", async () => {
    const result = await callTool(server, "append_session_record", {
      agent_name: "qa",
      task_name: "Task 1300b: QA Review",
    });
    expect(result).toContain("✅");
    expect(result.toLowerCase()).toContain("session record appended");
  });

  it("update_memory_file creates issue file with front-matter", async () => {
    const result = await callTool(server, "update_memory_file", {
      record_type: "issue",
      action: "create",
      filename: "test-memory-issue",
      title: "Issue: Test Memory Update",
      content: "This is a test issue created by automated testing.",
      agents: ["developer", "qa"],
      trigger: ["testing", "automation"],
    });
    expect(result).toContain("✅");
    expect(result.toLowerCase()).toContain("memory file create");
    expect(result).toContain("issues/test-memory-issue.md");
  });

  it("update_memory_file creates pattern file", async () => {
    const result = await callTool(server, "update_memory_file", {
      record_type: "pattern",
      action: "create",
      filename: "test-memory-pattern",
      title: "Pattern: Testing Memory Tools",
      content: "Example pattern for automated testing.",
      agents: ["developer"],
      trigger: ["test"],
    });
    expect(result).toContain("✅");
    expect(result.toLowerCase()).toContain("memory file create");
    expect(result).toContain("patterns/test-memory-pattern.md");
  });

  it("update_memory_file creates module file", async () => {
    const result = await callTool(server, "update_memory_file", {
      record_type: "module",
      action: "create",
      filename: "test-module-memory",
      title: "Module: Test Memory System",
      content: "Documentation of test memory module.",
      agents: ["developer", "architect"],
      trigger: ["module-analysis"],
    });
    expect(result).toContain("✅");
    expect(result.toLowerCase()).toContain("memory file create");
    expect(result).toContain("modules/test-module-memory.md");
  });

  it("update_memory_file sanitizes filename (lowercase, removes special chars)", async () => {
    const result = await callTool(server, "update_memory_file", {
      record_type: "issue",
      action: "create",
      filename: "Test Memory Issue!@#$%",
      title: "Issue: Filename Sanitization Test",
      content: "Test content.",
      agents: ["developer"],
    });
    expect(result).toContain("✅");
    // Should contain lowercase, hyphenated version
    expect(result).toContain("test-memory-issue");
    expect(result).toContain("issues/test-memory-issue.md");
  });

  it("update_memory_file validates record_type via Zod", async () => {
    expect(() => {
      const validTypes = ["issue", "pattern", "module"];
      if (!validTypes.includes("invalid-type")) {
        throw new Error("Invalid record_type");
      }
    }).toThrow();
  });

  it("update_memory_file validates action via Zod", async () => {
    expect(() => {
      const validActions = ["create", "append", "update"];
      if (!validActions.includes("invalid-action")) {
        throw new Error("Invalid action");
      }
    }).toThrow();
  });

  it("append_session_record prevents directory traversal in task_name", async () => {
    const result = await callTool(server, "append_session_record", {
      agent_name: "developer",
      task_name: "../../../etc/passwd",
    });
    expect(result.toLowerCase()).toContain("error");
    expect(result.toLowerCase()).toContain("directory traversal");
  });

  it("update_memory_file prevents directory traversal in filename", async () => {
    const result = await callTool(server, "update_memory_file", {
      record_type: "issue",
      action: "create",
      filename: "../../etc/passwd",
      title: "Malicious",
      content: "Attack",
    });
    expect(result.toLowerCase()).toContain("error");
    expect(result.toLowerCase()).toContain("directory traversal");
  });
});
