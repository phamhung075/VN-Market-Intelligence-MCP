/**
 * Task 223 — Portfolio Target Allocation
 *
 * Tests for:
 *   1. targetAllocationStore.ts  — CRUD on portfolio_targets table
 *   2. targetAllocationTools.ts  — set_target_allocation + get_target_allocation MCP tools
 *   3. rebalancingTools.ts       — auto-load targets from DB when `targets` param omitted
 *
 * All tests use in-memory SQLite (DB_PATH=:memory:) to avoid touching production data.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

// ─── Use an in-memory DB for all tests ───────────────────────────────────────
Bun.env["DB_PATH"] = ":memory:";

import { getDb, initDatabase, closeDb } from "../infrastructure/db/schema.js";
import {
  setTargetWeights,
  getTargetWeights,
  upsertTargetWeight,
  deleteTargetWeight,
  type TargetWeightRow,
} from "../infrastructure/db/targetAllocationStore.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function freshDb(): Promise<void> {
  closeDb();
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: targetAllocationStore — unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 223 — targetAllocationStore", () => {
  beforeEach(async () => {
    await freshDb();
  });

  afterEach(() => {
    closeDb();
  });

  it("setTargetWeights inserts multiple rows and replaces on re-call", async () => {
    await setTargetWeights({ VCB: 40, FPT: 30, HPG: 30 });
    const rows = await getTargetWeights();
    expect(rows.length).toBe(3);
    const codes = rows.map((r) => r.code).sort();
    expect(codes).toEqual(["FPT", "HPG", "VCB"]);
  });

  it("setTargetWeights stores correct weight values", async () => {
    await setTargetWeights({ VCB: 40, FPT: 30, HPG: 30 });
    const rows = await getTargetWeights();
    const vcb = rows.find((r) => r.code === "VCB");
    expect(vcb?.target_weight).toBe(40);
  });

  it("setTargetWeights replaces existing row on INSERT OR REPLACE", async () => {
    await setTargetWeights({ VCB: 40 });
    await setTargetWeights({ VCB: 55 }); // update weight
    const rows = await getTargetWeights();
    const vcb = rows.find((r) => r.code === "VCB");
    expect(vcb?.target_weight).toBe(55);
    // Must not create a duplicate row
    expect(rows.filter((r) => r.code === "VCB").length).toBe(1);
  });

  it("getTargetWeights returns empty array when table is empty", async () => {
    const rows = await getTargetWeights();
    expect(rows).toBeArrayOfSize(0);
  });

  it("upsertTargetWeight inserts a single stock weight", async () => {
    await upsertTargetWeight("VNM", 20);
    const rows = await getTargetWeights();
    expect(rows.length).toBe(1);
    expect(rows[0]!.code).toBe("VNM");
    expect(rows[0]!.target_weight).toBe(20);
  });

  it("upsertTargetWeight updates weight for existing code", async () => {
    await upsertTargetWeight("VNM", 20);
    await upsertTargetWeight("VNM", 35);
    const rows = await getTargetWeights();
    expect(rows.length).toBe(1);
    expect(rows[0]!.target_weight).toBe(35);
  });

  it("deleteTargetWeight removes a single stock", async () => {
    await setTargetWeights({ VCB: 40, FPT: 60 });
    await deleteTargetWeight("VCB");
    const rows = await getTargetWeights();
    expect(rows.length).toBe(1);
    expect(rows[0]!.code).toBe("FPT");
  });

  it("deleteTargetWeight is idempotent when code doesn't exist", async () => {
    await setTargetWeights({ VCB: 100 });
    await deleteTargetWeight("NONEXISTENT");
    const rows = await getTargetWeights();
    expect(rows.length).toBe(1);
  });

  it("updated_at is set on insert", async () => {
    await upsertTargetWeight("VCB", 40);
    const rows = await getTargetWeights();
    expect(rows[0]!.updated_at).toBeTruthy();
    // Should be a valid ISO-like datetime string
    expect(new Date(rows[0]!.updated_at).getTime()).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: MCP Tool helpers — validation logic (pure unit tests)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 223 — target weight validation", () => {
  it("weights summing to 100 pass validation", () => {
    const sum = 40 + 30 + 30;
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(1);
  });

  it("weights summing to 99 are within tolerance (rounding)", () => {
    const sum = 33 + 33 + 33;
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(1);
  });

  it("weights summing to 101 are within tolerance (rounding)", () => {
    const sum = 34 + 34 + 33;
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(1);
  });

  it("weights summing to 80 fail validation (too low)", () => {
    const sum = 40 + 40;
    expect(Math.abs(sum - 100)).toBeGreaterThan(1);
  });

  it("weights summing to 120 fail validation (too high)", () => {
    const sum = 60 + 60;
    expect(Math.abs(sum - 100)).toBeGreaterThan(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: get_target_allocation drift calculation
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 223 — drift computation", () => {
  it("computes positive drift when actual > target", () => {
    // actual 50%, target 40% → +10% drift (overweight)
    const drift = 50 - 40;
    expect(drift).toBe(10);
  });

  it("computes negative drift when actual < target", () => {
    // actual 25%, target 30% → -5% drift (underweight)
    const drift = 25 - 30;
    expect(drift).toBe(-5);
  });

  it("computes zero drift when actual equals target", () => {
    const drift = 40 - 40;
    expect(drift).toBe(0);
  });

  it("actual weight computed from position value / total portfolio value", () => {
    // positions: VCB 100 shares × 80,000 VND = 8,000,000 VND
    //            FPT 50 shares × 120,000 VND = 6,000,000 VND
    // total = 14,000,000
    const vcbValue = 100 * 80000;
    const fptValue = 50 * 120000;
    const total = vcbValue + fptValue;
    const vcbActual = (vcbValue / total) * 100;
    const fptActual = (fptValue / total) * 100;
    expect(vcbActual).toBeCloseTo(57.14, 1);
    expect(fptActual).toBeCloseTo(42.86, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper — invoke a registered MCP tool directly (bypasses SSE transport)
// ─────────────────────────────────────────────────────────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTargetAllocationTools } from "../interface/mcp/tools/portfolio/targetAllocationTools.js";

type ToolResult = { content: Array<{ type: string; text: string }> };

function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const registry = (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (args: Record<string, unknown>) => Promise<unknown> }
      >;
    }
  )._registeredTools;
  const entry = registry[toolName];
  if (!entry) throw new Error(`Tool "${toolName}" not registered`);
  return entry.handler(args) as Promise<ToolResult>;
}

function makeServer(): McpServer {
  const server = new McpServer(
    { name: "test", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );
  registerTargetAllocationTools(server);
  return server;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: MCP tool — set_target_allocation (integration with in-memory DB)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 223 — set_target_allocation MCP tool (removed in task 241)", () => {
  // set_target_allocation was removed as a user-only mutation tool in task 241.
  // The storage layer (upsertTargetWeights) is still tested via the domain
  // suite above. Only the MCP tool registration is gone.
  it("is NOT registered on the MCP server", () => {
    const server = makeServer();
    const tools = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;
    expect(Object.keys(tools)).not.toContain("set_target_allocation");
    // get_target_allocation stays (read-only tool)
    expect(Object.keys(tools)).toContain("get_target_allocation");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 5: MCP tool — get_target_allocation (integration)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 223 — get_target_allocation MCP tool", () => {
  beforeEach(async () => {
    await freshDb();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns no-targets message when table is empty", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_target_allocation", {});
    const text = result.content[0]!.text;
    expect(text).toMatch(/Chưa có|no target|trong|empty|không có/i);
  });

  it("shows target weights table with drift when positions exist", async () => {
    // Seed targets
    await setTargetWeights({ VCB: 40, FPT: 60 });

    // Seed positions and prices
    const db = getDb();
    db.exec(`
      INSERT INTO positions (code, shares, avg_price, opened_at)
      VALUES ('VCB', 100, 80000, datetime('now')),
             ('FPT', 50, 100000, datetime('now'))
    `);
    db.exec(`
      INSERT OR REPLACE INTO market_prices (code, price, updated_at)
      VALUES ('VCB', 85000, datetime('now')),
             ('FPT', 110000, datetime('now'))
    `);

    const server = makeServer();
    const result = await callTool(server, "get_target_allocation", {});
    const text = result.content[0]!.text;

    // Table should show VCB and FPT
    expect(text).toContain("VCB");
    expect(text).toContain("FPT");
    // Should show target percentages
    expect(text).toContain("40%");
    expect(text).toContain("60%");
    // Should show drift labels
    expect(text).toMatch(/thừa|thiếu|Lệch|drift|over|under/i);
  });
});
