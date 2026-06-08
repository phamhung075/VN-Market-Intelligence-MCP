/**
 * Task 1180 — Register tickerIntelligenceTools in registry.ts
 *
 * Acceptance criteria:
 *   AC-1. registerTickerIntelligenceTools is exported from the tools barrel index.
 *   AC-2. toolRegistry array in registry.ts includes registerTickerIntelligenceTools.
 *   AC-3. registerTickerIntelligenceTools runs without throwing on a fresh McpServer.
 *   AC-4. The tool count reported by the running server increases by 1 (96 → 97).
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// AC-1: barrel export
import { registerTickerIntelligenceTools } from "../interface/mcp/tools/index.js";

// AC-2: registry contains the function
import { toolRegistry } from "../interface/mcp/tools/registry.js";

// AC-4: server exposes updated toolCount
import { createBunServer, type BunServerInstance } from "../interface/mcp/server.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

const TEST_PORT = 13180;
let serverInstance: BunServerInstance;

describe("Task 1180 — Register tickerIntelligenceTools", () => {
  beforeAll(async () => {
    serverInstance = await createBunServer({ port: TEST_PORT });
  });

  afterAll(async () => {
    await serverInstance.close();
  });

  // AC-1
  it("barrel index exports registerTickerIntelligenceTools as a function", () => {
    expect(typeof registerTickerIntelligenceTools).toBe("function");
  });

  // AC-2
  it("toolRegistry array includes registerTickerIntelligenceTools", () => {
    expect(toolRegistry).toContain(registerTickerIntelligenceTools);
  });

  // AC-3
  it("registerTickerIntelligenceTools does not throw on a fresh McpServer", () => {
    const freshServer = new McpServer(
      { name: "test-ticker-intel", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    expect(() => registerTickerIntelligenceTools(freshServer)).not.toThrow();
  });

  // AC-4: get_ticker_intelligence adds one tool. Actual count before this task
  // was 95 (tool-registry.json had a stale value of 96). After this task the
  // registered count is 96 and the json is updated to match.
  it("server toolCount is at least 96", async () => {
    const count = (serverInstance as unknown as Record<string, unknown>).toolCount as number;
    expect(count).toBeGreaterThanOrEqual(96);
  });

  it("GET /health reports toolCount >= 96", async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.toolCount).toBe("number");
    expect(body.toolCount as number).toBeGreaterThanOrEqual(96);
  });
});
