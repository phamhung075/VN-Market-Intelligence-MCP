/**
 * Task 1194 — Agent 08 Prediction Synthesizer MCP Tools Wiring Audit
 *
 * Verifies that the MCP tools required by the 08-prediction-synthesizer
 * Cowork agent are properly registered and functional:
 *
 *   1. create_prediction_claim — insert a falsifiable prediction claim
 *   2. get_prediction_accuracy — retrospective accuracy metrics for signals
 *   3. get_open_chain_findings — open findings from the agent signal bus
 *
 * get_prediction_markets was deregistered by
 * FIX-POLYMARKET-FETCH-DEAD-GEOBLOCK-ACTUATOR (2026-07-31, architect RULING:
 * RETIRE — gamma-api.polymarket.com blocked at the ISP level by France's ANJ
 * gambling regulator); its two AC tests here (registration + empty-envelope)
 * were removed with it.
 *
 * All tools already exist; this test suite provides an integration-level
 * smoke test from the perspective of Agent 08 to confirm the full wiring.
 *
 * Tests:
 *   AC-1: All three tools are registered on the server
 *   AC-3: get_prediction_accuracy returns text response (empty DB — no data msg)
 *   AC-4: get_open_chain_findings returns valid JSON envelope (empty DB)
 *   AC-5: create_prediction_claim without price data returns descriptive error
 *   AC-6: create_prediction_claim with price data inserts claim and returns id
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerPredictionTools } from "../interface/mcp/tools/macro/predictionTools.js";
import { registerAgentSignalTools } from "../interface/mcp/tools/news-analysis/agentSignalTools.js";
import { registerEvidenceTools } from "../interface/mcp/tools/macro/evidenceTools.js";

// ─── helpers ────────────────────────────────────────────────────────────────

type ToolResponse = { content: Array<{ type: string; text: string }> };

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (args: unknown) => Promise<unknown> }
      >;
    }
  )._registeredTools;

  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  return tool.handler(args) as Promise<ToolResponse>;
}

function registeredTools(server: McpServer): Record<string, unknown> {
  return (
    server as unknown as { _registeredTools: Record<string, unknown> }
  )._registeredTools;
}

// ─── setup ──────────────────────────────────────────────────────────────────

describe("Task 1194 — Agent 08 Prediction Synthesizer tool wiring", () => {
  let server: McpServer;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    server = new McpServer(
      { name: "test-1194", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    // Register all three tool modules used by Agent 08
    registerPredictionTools(server);
    registerAgentSignalTools(server);
    registerEvidenceTools(server);
  });

  afterEach(() => {
    closeDb();
  });

  // ── AC-1: All three tools are registered ─────────────────────────────────

  it("AC-1: create_prediction_claim is registered", () => {
    expect(registeredTools(server)["create_prediction_claim"]).toBeDefined();
  });

  it("AC-1: get_prediction_accuracy is registered", () => {
    expect(registeredTools(server)["get_prediction_accuracy"]).toBeDefined();
  });

  it("AC-1: get_open_chain_findings is registered", () => {
    expect(registeredTools(server)["get_open_chain_findings"]).toBeDefined();
  });

  // ── AC-3: get_prediction_accuracy empty DB ───────────────────────────────

  it("AC-3: get_prediction_accuracy returns non-empty text response on empty DB", async () => {
    const result = await callTool(server, "get_prediction_accuracy", {
      days: 30,
    });

    expect(result.content).toHaveLength(1);
    const item = result.content[0]!;
    expect(item.type).toBe("text");
    // With no validated outcomes, we expect the "no data" message
    expect(typeof item.text).toBe("string");
    expect(item.text.length).toBeGreaterThan(0);
  });

  // ── AC-4: get_open_chain_findings empty DB ───────────────────────────────

  it("AC-4: get_open_chain_findings returns valid envelope on empty DB", async () => {
    const result = await callTool(server, "get_open_chain_findings", {
      minutes_back: 30,
    });

    expect(result.content).toHaveLength(1);
    const item = result.content[0]!;
    expect(item.type).toBe("text");

    const data = JSON.parse(item.text) as {
      total_findings: number;
      stock_groups: number;
      groups: unknown[];
      minutes_back: number;
    };

    expect(data.total_findings).toBe(0);
    expect(data.stock_groups).toBe(0);
    expect(Array.isArray(data.groups)).toBe(true);
    expect(data.minutes_back).toBe(30);
  });

  // ── AC-5: create_prediction_claim with no OHLCV data ────────────────────

  it("AC-5: create_prediction_claim returns error when no price data for ticker", async () => {
    const result = await callTool(server, "create_prediction_claim", {
      stock: "ZZZNOPRICE",
      claim_text: "ZZZNOPRICE se tang trong 10 phien",
      probability: 0.7,
      horizon_days: 10,
      resolution_criteria: JSON.stringify({
        metric: "price_close",
        operator: ">",
        value: 100000,
        currency: "VND",
        description: "Close above 100,000 VND",
      }),
      direction: "bullish",
      expected_move_pct: 0.05,
    });

    expect(result.content).toHaveLength(1);
    const text = result.content[0]!.text;
    expect(typeof text).toBe("string");
    // Should explain missing price data
    expect(text.toLowerCase()).toMatch(/no price|cannot compute|khong co/i);
  });

  // ── AC-6: create_prediction_claim with price data inserts claim ──────────

  it("AC-6: create_prediction_claim inserts claim and returns id when price data exists", async () => {
    // Seed an OHLCV price row so the tool can look up creation_price.
    // The daily_ohlcv table requires updated_at (NOT NULL).
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("T1194", "2026-04-13", 80000, 82000, 79000, 81000, 100000, new Date().toISOString());

    const result = await callTool(server, "create_prediction_claim", {
      stock: "T1194",
      claim_text: "T1194 se dong cua tren 85,000 VND trong 10 phien giao dich",
      probability: 0.72,
      horizon_days: 10,
      resolution_criteria: JSON.stringify({
        metric: "price_close",
        operator: ">",
        value: 85000,
        currency: "VND",
        description: "T1194 closing price above 85,000 VND",
      }),
      direction: "bullish",
      expected_move_pct: 0.05,
    });

    expect(result.content).toHaveLength(1);
    const text = result.content[0]!.text;
    expect(typeof text).toBe("string");

    // Should not be an error
    expect(text.toLowerCase()).not.toMatch(/^error/i);

    // Parse the response — either JSON with id or structured text
    // The tool returns a JSON-serialized object with claim_id or id field
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Some tools return plain text; the key is it must NOT be an error
    }

    if (parsed !== null) {
      // JSON response: verify it has a claim identifier
      const hasId =
        "claim_id" in parsed ||
        "id" in parsed ||
        "claimId" in parsed ||
        text.includes("T1194");
      expect(hasId).toBe(true);
    } else {
      // Plain text response: must mention the ticker or resolution date
      expect(text).toMatch(/T1194|resolution_date|claim/i);
    }

    // Verify row was actually inserted in the DB
    const row = db
      .prepare(
        `SELECT id FROM prediction_claims WHERE stock = 'T1194' LIMIT 1`,
      )
      .get();
    expect(row).not.toBeNull();
  });
});
