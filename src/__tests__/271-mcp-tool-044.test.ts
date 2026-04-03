/**
 * Task 271 — MCP Tool: get_pharma_signals
 *
 * Tests for the pharmaTools MCP tool registration and output format.
 */

import { describe, it, expect } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPharmaTools } from "../interface/mcp/tools/pharmaTools.js";
import { Database } from "bun:sqlite";
import { initPharmaStore, insertPharmaEvent } from "../infrastructure/db/pharmaStore.js";

/** Create a McpServer instance and extract its registered tool names. */
function getRegisteredTools(server: McpServer): string[] {
  const registry = (server as unknown as { _registeredTools: Record<string, unknown> })
    ._registeredTools;
  return Object.keys(registry ?? {});
}

describe("Task 271 — MCP Tool: get_pharma_signals", () => {
  it("registers get_pharma_signals tool on McpServer", () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    const db = new Database(":memory:");
    initPharmaStore(db);

    registerPharmaTools(server, db);

    const tools = getRegisteredTools(server);
    expect(tools).toContain("get_pharma_signals");
  });

  it("get_pharma_signals returns empty list when no events in DB", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    const db = new Database(":memory:");
    initPharmaStore(db);

    registerPharmaTools(server, db);

    // Invoke tool directly via server registry
    const registry = (server as unknown as {
      _registeredTools: Record<string, { handler: (args: unknown) => unknown }>
    })._registeredTools;
    const tool = registry["get_pharma_signals"];
    expect(tool).toBeDefined();

    const result = await tool!.handler({}) as { content: Array<{ text: string }> };
    expect(result.content[0]!.text).toContain("0");
  });

  it("get_pharma_signals returns events from DB", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    const db = new Database(":memory:");
    initPharmaStore(db);

    // Seed some events
    insertPharmaEvent(db, {
      event_type: "drug_approval",
      drug_name: "Amoxicillin 500mg",
      manufacturer: "Dược Hậu Giang",
      stock_code: "DHG",
      approval_date: "2026-04-01",
      description: "DAV phê duyệt thuốc kháng sinh mới",
      severity: "medium",
    });
    insertPharmaEvent(db, {
      event_type: "outbreak",
      drug_name: null,
      manufacturer: null,
      stock_code: "IMP",
      approval_date: null,
      description: "Dịch cúm A bùng phát — tăng nhu cầu vaccine",
      severity: "high",
    });

    registerPharmaTools(server, db);

    const registry = (server as unknown as {
      _registeredTools: Record<string, { handler: (args: unknown) => unknown }>
    })._registeredTools;
    const tool = registry["get_pharma_signals"];
    const result = await tool!.handler({}) as { content: Array<{ text: string }> };
    const text = result.content[0]!.text;

    // Should mention both events
    expect(text).toContain("DHG");
    expect(text).toContain("IMP");
  });

  it("get_pharma_signals filters by stock code", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    const db = new Database(":memory:");
    initPharmaStore(db);

    insertPharmaEvent(db, {
      event_type: "drug_approval",
      drug_name: "Drug A",
      manufacturer: "DHG",
      stock_code: "DHG",
      approval_date: null,
      description: "DHG event",
      severity: "low",
    });
    insertPharmaEvent(db, {
      event_type: "outbreak",
      drug_name: null,
      manufacturer: null,
      stock_code: "IMP",
      approval_date: null,
      description: "IMP outbreak",
      severity: "high",
    });

    registerPharmaTools(server, db);

    const registry = (server as unknown as {
      _registeredTools: Record<string, { handler: (args: unknown) => unknown }>
    })._registeredTools;
    const tool = registry["get_pharma_signals"];

    const result = await tool!.handler({ stock: "DHG" }) as { content: Array<{ text: string }> };
    const text = result.content[0]!.text;

    expect(text).toContain("DHG");
    // IMP should NOT appear when filtering for DHG only
    expect(text).not.toContain("IMP outbreak");
  });

  it("get_pharma_signals result has correct MCP content format", async () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    const db = new Database(":memory:");
    initPharmaStore(db);

    registerPharmaTools(server, db);

    const registry = (server as unknown as {
      _registeredTools: Record<string, { handler: (args: unknown) => unknown }>
    })._registeredTools;
    const tool = registry["get_pharma_signals"];
    const result = await tool!.handler({}) as { content: Array<{ type: string; text: string }> };

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]!.type).toBe("text");
    expect(typeof result.content[0]!.text).toBe("string");
  });
});
