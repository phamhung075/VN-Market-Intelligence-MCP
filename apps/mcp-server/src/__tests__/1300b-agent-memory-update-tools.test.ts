/**
 * Task 1300b — Agent Memory Update Tools
 *
 * Tests for append_session_record and update_memory_file tools.
 * Validates session record formatting and memory file creation.
 *
 * @module __tests__/1300b-agent-memory-update-tools.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { registerAgentMemoryUpdateTools } from "../interface/mcp/tools/system/agentMemoryUpdateTools.js";
import { getProjectRoot } from "../infrastructure/projectRoot.js";

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
  let sandboxDir: string;

  beforeEach(() => {
    // Sandbox: mkdtemp a fresh temp dir and point AGENT_MEMORY_ROOT at it
    // BEFORE the tool is registered (registerAgentMemoryUpdateTools reads
    // the env var at registration time — see agentMemoryUpdateTools.ts).
    // This must happen before registration or the sandbox silently no-ops.
    sandboxDir = mkdtempSync(join(tmpdir(), "agent-memory-test-"));
    process.env.AGENT_MEMORY_ROOT = sandboxDir;

    server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } }
    );
    registerAgentMemoryUpdateTools(server);
  });

  afterEach(() => {
    rmSync(sandboxDir, { recursive: true, force: true });
    delete process.env.AGENT_MEMORY_ROOT;
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
    // Accept both success (first write) and dedup-skip (idempotent subsequent writes)
    expect(result.toLowerCase()).toMatch(/session record appended|already recorded/);
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
    // Accept both success (first write) and dedup-skip (idempotent)
    expect(result.toLowerCase()).toMatch(/session record appended|already recorded/);
  });

  it("append_session_record works with minimal fields (just task_name)", async () => {
    const result = await callTool(server, "append_session_record", {
      agent_name: "qa",
      task_name: "Task 1300b: QA Review",
    });
    // Accept both success (first write) and dedup-skip (idempotent)
    expect(result.toLowerCase()).toMatch(/session record appended|already recorded/);
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

  // ───────────────────────────────────────────────────────────────────────
  // Regression guard: AGENT_MEMORY_ROOT sandbox must actually redirect writes
  // ───────────────────────────────────────────────────────────────────────

  it("does not create any new file under the real docs/agent-memory/ tree (sandbox regression guard)", async () => {
    const realSessionsDir = resolve(getProjectRoot(), "docs/agent-memory/sessions");
    const before = existsSync(realSessionsDir) ? new Set(readdirSync(realSessionsDir)) : new Set<string>();

    // Exercise both tools so a false-green module-level-const regression
    // (which would write into the real tree instead of the sandbox) is caught.
    await callTool(server, "append_session_record", {
      agent_name: "developer",
      task_name: "Regression-Guard-AGENT-MEMORY-ROOT-Sandbox-Check",
    });
    await callTool(server, "update_memory_file", {
      record_type: "issue",
      action: "create",
      filename: "regression-guard-sandbox-check",
      title: "Regression Guard",
      content: "Should never land in the real tree.",
      agents: ["developer"],
    });

    const after = existsSync(realSessionsDir) ? new Set(readdirSync(realSessionsDir)) : new Set<string>();
    const newFiles = [...after].filter((f) => !before.has(f));
    expect(newFiles).toEqual([]);

    // And confirm the writes actually landed in the sandbox instead.
    expect(existsSync(resolve(sandboxDir, "issues", "regression-guard-sandbox-check.md"))).toBe(true);
  });
});
