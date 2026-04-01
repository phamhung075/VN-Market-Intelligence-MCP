/**
 * Task 168 — get_prediction_markets MCP tool
 *
 * Tests:
 *   1. Empty DB → returns empty result shape with zeros
 *   2. filter="all" → returns all 3 markets
 *   3. filter="signals_only" → returns only markets with recent signals
 *   4. limit parameter caps result count
 *   5. Active signals aggregated from GROUP_CONCAT
 *   6. registerPredictionTools is exported and callable
 *   7. Server tool count goes from 20 → 21
 */

process.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerPredictionTools } from "../interface/mcp/tools/predictionTools.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function seedMarket(
  id: string,
  question: string,
  yesPrice = 0.6,
  fetchedAt = new Date().toISOString(),
): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO prediction_markets
      (id, question, end_date, yes_price, no_price, volume_24h, volume_total,
       liquidity, last_trade_price, unique_wallets, tags, fetched_at, updated_at)
    VALUES
      (?, ?, '2026-12-31T00:00:00Z', ?, ?, 1000, 50000, 2000, ?, 50, '[]', ?, ?)
  `).run(id, question, yesPrice, 1 - yesPrice, yesPrice, fetchedAt, fetchedAt);
}

function seedSignal(
  id: string,
  marketId: string,
  signalType = "probability_shift",
  detectedAt = new Date().toISOString(),
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO prediction_signals
      (id, market_id, signal_type, severity, yes_price_prev, yes_price_curr,
       volume_24h, unique_wallets, confidence, mapped_sectors, mapped_stocks,
       reasoning, detected_at)
    VALUES
      (?, ?, ?, 'medium', 0.5, 0.6, 1000, 50, 0.75, '["banking"]', '["VCB"]',
       'test signal', ?)
  `).run(id, marketId, signalType, detectedAt);
}

/**
 * Invoke the MCP tool handler directly by reaching into the server's
 * _registeredTools map (same trick used in existing MCP tests).
 */
async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
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
  return tool.handler(args) as Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe("Task 168 — get_prediction_markets MCP tool", () => {
  let server: McpServer;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    server = new McpServer(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerPredictionTools(server);

    // Clean up in case prior test left rows
    const db = getDb();
    db.exec("DELETE FROM prediction_signals WHERE id LIKE 't168-%'");
    db.exec("DELETE FROM prediction_markets WHERE id LIKE 't168-%'");
  });

  afterEach(() => {
    closeDb();
  });

  // ── 1. Empty DB ──────────────────────────────────────────────────────────

  it("empty DB returns zero-filled result", async () => {
    const result = await callTool(server, "get_prediction_markets", {
      filter: "all",
      limit: 20,
    });

    expect(result.content).toHaveLength(1);
    const item0 = result.content[0]!;
    expect(item0.type).toBe("text");

    const data = JSON.parse(item0.text) as {
      markets: unknown[];
      totalRelevantMarkets: number;
      lastPollAt: null;
      signalCount: number;
    };

    expect(data.markets).toEqual([]);
    expect(data.totalRelevantMarkets).toBe(0);
    expect(data.lastPollAt).toBeNull();
    expect(data.signalCount).toBe(0);
  });

  // ── 2. filter="all" returns all markets ─────────────────────────────────

  it('filter="all" returns all 3 markets', async () => {
    seedMarket("t168-m1", "Will the Fed cut rates in June 2026?");
    seedMarket("t168-m2", "Will China impose new tariffs?");
    seedMarket("t168-m3", "Will Vietnam GDP grow above 7% in 2026?");

    const result = await callTool(server, "get_prediction_markets", {
      filter: "all",
      limit: 20,
    });

    const data = JSON.parse(result.content[0]!.text) as {
      markets: Array<{
        id: string;
        question: string;
        yesPrice: number;
        noPrice: number;
        volume24h: number;
        uniqueWalletsCount: number;
        fetchedAt: string;
        activeSignals: unknown[];
        mappedSectors: unknown[];
        mappedStocks: unknown[];
      }>;
      totalRelevantMarkets: number;
      lastPollAt: string;
      signalCount: number;
    };

    expect(data.markets).toHaveLength(3);
    expect(data.totalRelevantMarkets).toBe(3);
    expect(data.signalCount).toBe(0);
    expect(data.lastPollAt).not.toBeNull();

    // Verify shape of first market object
    const m = data.markets[0]!;
    expect(typeof m.id).toBe("string");
    expect(typeof m.question).toBe("string");
    expect(typeof m.yesPrice).toBe("number");
    expect(typeof m.noPrice).toBe("number");
    expect(typeof m.volume24h).toBe("number");
    expect(typeof m.uniqueWalletsCount).toBe("number");
    expect(typeof m.fetchedAt).toBe("string");
    expect(Array.isArray(m.activeSignals)).toBe(true);
    expect(Array.isArray(m.mappedSectors)).toBe(true);
    expect(Array.isArray(m.mappedStocks)).toBe(true);
  });

  // ── 3. filter="signals_only" ─────────────────────────────────────────────

  it('filter="signals_only" returns only markets with recent signals', async () => {
    seedMarket("t168-m1", "Will the Fed cut rates in June 2026?");
    seedMarket("t168-m2", "Will China impose new tariffs?");
    seedMarket("t168-m3", "Will Vietnam GDP grow above 7% in 2026?");

    // Only m1 and m2 get signals (within last hour)
    seedSignal("t168-s1", "t168-m1");
    seedSignal("t168-s2", "t168-m2");

    const result = await callTool(server, "get_prediction_markets", {
      filter: "signals_only",
      limit: 20,
    });

    const data = JSON.parse(result.content[0]!.text) as {
      markets: Array<{ id: string }>;
      totalRelevantMarkets: number;
      signalCount: number;
    };

    expect(data.markets).toHaveLength(2);
    const ids = data.markets.map((m) => m.id);
    expect(ids).toContain("t168-m1");
    expect(ids).toContain("t168-m2");
    expect(ids).not.toContain("t168-m3");
    expect(data.signalCount).toBe(2);
    expect(data.totalRelevantMarkets).toBe(2);
  });

  // ── 4. limit parameter caps results ──────────────────────────────────────

  it("limit=2 caps result to 2 markets", async () => {
    seedMarket("t168-m1", "Will the Fed cut rates in June 2026?");
    seedMarket("t168-m2", "Will China impose new tariffs?");
    seedMarket("t168-m3", "Will Vietnam GDP grow above 7% in 2026?");

    const result = await callTool(server, "get_prediction_markets", {
      filter: "all",
      limit: 2,
    });

    const data = JSON.parse(result.content[0]!.text) as {
      markets: unknown[];
    };
    expect(data.markets).toHaveLength(2);
  });

  // ── 5. Active signals aggregated correctly ────────────────────────────────

  it("activeSignals array contains signal types for markets with recent signals", async () => {
    seedMarket("t168-m1", "Will the Fed cut rates in June 2026?");
    seedSignal("t168-s1", "t168-m1", "probability_shift");
    seedSignal("t168-s2", "t168-m1", "volume_spike");

    const result = await callTool(server, "get_prediction_markets", {
      filter: "all",
      limit: 20,
    });

    const data = JSON.parse(result.content[0]!.text) as {
      markets: Array<{ id: string; activeSignals: string[] }>;
      signalCount: number;
    };

    const market = data.markets.find((m) => m.id === "t168-m1");
    expect(market).toBeDefined();
    expect(market!.activeSignals).toContain("probability_shift");
    expect(market!.activeSignals).toContain("volume_spike");
    expect(data.signalCount).toBe(2);
  });

  // ── 6. Stale signals (older than 1 hour) are excluded from activeSignals ──

  it("signals older than 1 hour are excluded from activeSignals but market still returned in all filter", async () => {
    seedMarket("t168-m1", "Will the Fed cut rates in June 2026?");

    // Insert a signal with detected_at > 1 hour ago
    const staleTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    seedSignal("t168-s1-stale", "t168-m1", "volume_spike", staleTime);

    const result = await callTool(server, "get_prediction_markets", {
      filter: "all",
      limit: 20,
    });

    const data = JSON.parse(result.content[0]!.text) as {
      markets: Array<{ id: string; activeSignals: string[] }>;
      signalCount: number;
    };

    expect(data.markets).toHaveLength(1);
    const market = data.markets[0]!;
    expect(market.activeSignals).toHaveLength(0);
    expect(data.signalCount).toBe(0);
  });

  // ── 7. Tool is registered on the server ──────────────────────────────────

  it("registerPredictionTools registers get_prediction_markets on the server", () => {
    const tools = (
      server as unknown as {
        _registeredTools: Record<string, unknown>;
      }
    )._registeredTools;

    expect(tools["get_prediction_markets"]).toBeDefined();
  });

  // ── 8. Default filter is "all" ────────────────────────────────────────────

  it("omitting filter defaults to all markets", async () => {
    seedMarket("t168-m1", "Will the Fed cut rates in June 2026?");
    seedMarket("t168-m2", "Will Vietnam GDP grow above 7%?");

    const result = await callTool(server, "get_prediction_markets", {
      limit: 20,
    });

    const data = JSON.parse(result.content[0]!.text) as {
      markets: unknown[];
      totalRelevantMarkets: number;
    };

    expect(data.markets).toHaveLength(2);
    expect(data.totalRelevantMarkets).toBe(2);
  });
});
