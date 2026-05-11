import { describe, it, expect } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSmartCompactTool } from "../interface/mcp/tools/system/smartCompactTool.js";

const NONEXISTENT_SESSION = "/tmp/nonexistent-1821b.jsonl";

describe("Task 1821b — smartCompactTool", () => {
  it("registers smart_compact tool without throwing", () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    expect(() => registerSmartCompactTool(server)).not.toThrow();
  });

  it("spawnSmartCompact returns CompactResult shape on missing session", async () => {
    const { spawnSmartCompact } = await import(
      "../infrastructure/agents/smartCompactSpawner.js"
    );
    const result = await spawnSmartCompact(NONEXISTENT_SESSION);
    expect(result).toHaveProperty("success");
    expect(typeof result.success).toBe("boolean");
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe("string");
  });
});
