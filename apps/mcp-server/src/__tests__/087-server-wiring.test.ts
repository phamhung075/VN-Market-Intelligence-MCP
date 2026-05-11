/**
 * Task 087 — Server Tool Wiring
 *
 * Tests that all register*Tools() functions are wired into createBunServer so
 * tools are actually callable through the MCP server.
 *
 * Acceptance criteria:
 *   1. registerWatchlistTools, registerReportTools, registerAlertTools and
 *      registerAnalysisTools are all exported from the tools barrel index.
 *   2. createBunServer registers all 4 tool groups — the toolCount exposed in
 *      the BunServerInstance equals the total number of registered tools and
 *      is greater than zero.
 *   3. GET /health includes a `toolCount` field with a positive integer.
 *   4. Duplicate registration does NOT throw (idempotent tool names per group).
 *   5. registerAnalysisTools is a no-op stub (zero tools) until task 083 is
 *      implemented — it must not throw.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createBunServer, type BunServerInstance } from "../interface/mcp/server.js";

// ── barrel re-exports ────────────────────────────────────────────────────────
import {
  registerWatchlistTools,
  registerReportTools,
  registerAlertTools,
  registerAnalysisTools,
} from "../interface/mcp/tools/index.js";

const TEST_PORT = 13087;

let serverInstance: BunServerInstance;
const baseUrl = `http://127.0.0.1:${TEST_PORT}`;

describe("Task 087 — Server Tool Wiring", () => {
  beforeAll(async () => {
    serverInstance = await createBunServer({ port: TEST_PORT });
  });

  afterAll(async () => {
    await serverInstance.close();
  });

  // ── 1. Barrel exports ──────────────────────────────────────────────────────

  it("barrel index exports registerWatchlistTools as a function", () => {
    expect(typeof registerWatchlistTools).toBe("function");
  });

  it("barrel index exports registerReportTools as a function", () => {
    expect(typeof registerReportTools).toBe("function");
  });

  it("barrel index exports registerAlertTools as a function", () => {
    expect(typeof registerAlertTools).toBe("function");
  });

  it("barrel index exports registerAnalysisTools as a function", () => {
    expect(typeof registerAnalysisTools).toBe("function");
  });

  // ── 2. Tool count exposed on the server instance ───────────────────────────

  it("BunServerInstance exposes a toolCount property >= 0", () => {
    expect(typeof (serverInstance as unknown as Record<string, unknown>).toolCount).toBe("number");
    expect((serverInstance as unknown as Record<string, unknown>).toolCount as number).toBeGreaterThanOrEqual(0);
  });

  it("toolCount is greater than zero (at least watchlist + reports + alerts)", () => {
    const count = (serverInstance as unknown as Record<string, unknown>).toolCount as number;
    // Watchlist: 4 tools, Reports: 3 tools, Alerts: 4 tools = 11 minimum
    expect(count).toBeGreaterThanOrEqual(11);
  });

  // ── 3. Health endpoint includes toolCount ─────────────────────────────────

  it("GET /health returns toolCount as a non-negative integer", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.toolCount).toBe("number");
    expect(body.toolCount as number).toBeGreaterThanOrEqual(0);
  });

  it("GET /health toolCount matches the server instance toolCount", async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json() as Record<string, unknown>;
    const instanceCount = (serverInstance as unknown as Record<string, unknown>).toolCount as number;
    expect(body.toolCount).toBe(instanceCount);
  });

  // ── 4. registerAnalysisTools stub does not throw ──────────────────────────

  it("registerAnalysisTools is a safe no-op stub on a fresh McpServer", () => {
    const freshServer = new McpServer(
      { name: "test-stub", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    expect(() => registerAnalysisTools(freshServer)).not.toThrow();
  });

  // ── 5. All register functions are safe on a fresh server ─────────────────

  it("all register functions run without throwing on a fresh McpServer", () => {
    const freshServer = new McpServer(
      { name: "test-all", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    expect(() => registerWatchlistTools(freshServer)).not.toThrow();
    expect(() => registerReportTools(freshServer)).not.toThrow();
    expect(() => registerAlertTools(freshServer)).not.toThrow();
    expect(() => registerAnalysisTools(freshServer)).not.toThrow();
  });
});
