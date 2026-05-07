/**
 * Task 1850f — FIX: Polymarket test fixture contamination
 *
 * Reports #2768, #2769, #2770: t163-mkt-* test fixture rows leak into
 * production get_prediction_markets responses.
 *
 * Tests:
 *   AC-1a: t163-mkt-* IDs are excluded from get_prediction_markets prod output
 *   AC-1b: t163-mkt-* with recent fetched_at are STILL excluded (ID filter, not just staleness)
 *   AC-2a: entries with fetched_at > 7 days are excluded from prod output
 *   AC-2b: entries with fetched_at <= 7 days are included
 *   AC-3: real production market IDs (no t___- prefix) are unaffected
 *   AC-4: test fixtures remain readable directly from DB (not deleted)
 *
 * Layer: tests — in-memory SQLite, no real HTTP.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerPredictionTools } from "../interface/mcp/tools/macro/predictionTools.js";

// ─── helpers ────────────────────────────────────────────────────────────────

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

function insertMarket(
  id: string,
  question: string,
  fetchedAt: string,
  endDate = "2026-12-31T00:00:00Z",
): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO prediction_markets
      (id, question, end_date, yes_price, no_price, volume_24h, volume_total,
       liquidity, last_trade_price, unique_wallets, tags, fetched_at, updated_at)
    VALUES (?, ?, ?, 0.6, 0.4, 1000, 50000, 2000, 0.6, 50, '[]', ?, ?)
  `).run(id, question, endDate, fetchedAt, fetchedAt);
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe("Task 1850f — Polymarket test fixture contamination", () => {
  let server: McpServer;

  /** Recent timestamp: 1 hour ago — fresh enough to pass staleness filter */
  const recentAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  /** Stale timestamp: 35 days ago — beyond the 7d staleness window */
  const staleAt = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
  /** Borderline: exactly 8 days ago — still stale */
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  /** Fresh: 6 days ago — within 7d window */
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    server = new McpServer(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerPredictionTools(server);
    const db = getDb();
    db.exec("DELETE FROM prediction_signals WHERE id LIKE '1850f-%'");
    db.exec("DELETE FROM prediction_markets WHERE id LIKE '1850f-%' OR id LIKE 't163-%'");
  });

  afterEach(() => {
    closeDb();
  });

  // ── AC-1a: t163-mkt-* with stale fetched_at excluded ────────────────────

  it("AC-1a: t163-mkt-* stale fixtures are excluded from get_prediction_markets", async () => {
    // Insert the exact fixtures from task 163 (stale fetched_at)
    insertMarket("t163-mkt-001", "Will the Fed cut rates in June 2026?", staleAt);
    insertMarket("t163-mkt-002", "Will oil prices exceed $100 in 2026?", staleAt);
    insertMarket("t163-mkt-004", "Will VN-Index hit 1300 in Q2 2026?", staleAt);
    insertMarket("t163-mkt-defaults", "Test defaults market", staleAt);

    const result = await callTool(server, "get_prediction_markets", {
      filter: "all",
      limit: 50,
    });

    const data = JSON.parse(result.content[0]!.text) as {
      markets: Array<{ id: string }>;
    };

    const ids = data.markets.map((m) => m.id);
    expect(ids).not.toContain("t163-mkt-001");
    expect(ids).not.toContain("t163-mkt-002");
    expect(ids).not.toContain("t163-mkt-004");
    expect(ids).not.toContain("t163-mkt-defaults");
  });

  // ── AC-1b: t163-mkt-* with recent fetched_at are ALSO excluded (ID filter) ─

  it("AC-1b: t163-mkt-* with recent fetched_at are excluded by ID filter", async () => {
    // Even if a test fixture somehow gets a recent fetched_at, it must be excluded
    insertMarket("t163-mkt-001", "Will the Fed cut rates in June 2026?", recentAt);
    insertMarket("t163-mkt-002", "Will oil prices exceed $100 in 2026?", recentAt);

    const result = await callTool(server, "get_prediction_markets", {
      filter: "all",
      limit: 50,
    });

    const data = JSON.parse(result.content[0]!.text) as {
      markets: Array<{ id: string }>;
    };

    const ids = data.markets.map((m) => m.id);
    expect(ids).not.toContain("t163-mkt-001");
    expect(ids).not.toContain("t163-mkt-002");
  });

  // ── AC-2a: entries with fetched_at > 7 days are excluded ─────────────────

  it("AC-2a: market with fetched_at 35 days ago is excluded (stale > 7d)", async () => {
    insertMarket("1850f-stale-mkt", "Will USD/VND weaken past 26000 in 2026?", staleAt);

    const result = await callTool(server, "get_prediction_markets", {
      filter: "all",
      limit: 50,
    });

    const data = JSON.parse(result.content[0]!.text) as {
      markets: Array<{ id: string }>;
    };

    const ids = data.markets.map((m) => m.id);
    expect(ids).not.toContain("1850f-stale-mkt");
  });

  it("AC-2a: market with fetched_at 8 days ago is excluded (stale > 7d)", async () => {
    insertMarket("1850f-8day-mkt", "Will Vietnam inflation stay below 4%?", eightDaysAgo);

    const result = await callTool(server, "get_prediction_markets", {
      filter: "all",
      limit: 50,
    });

    const data = JSON.parse(result.content[0]!.text) as {
      markets: Array<{ id: string }>;
    };

    const ids = data.markets.map((m) => m.id);
    expect(ids).not.toContain("1850f-8day-mkt");
  });

  // ── AC-2b: entries with fetched_at <= 7 days are included ────────────────

  it("AC-2b: market with fetched_at 6 days ago is included (fresh <= 7d)", async () => {
    insertMarket("1850f-fresh-mkt", "Will VCB earnings beat expectations in Q1 2026?", sixDaysAgo);

    const result = await callTool(server, "get_prediction_markets", {
      filter: "all",
      limit: 50,
    });

    const data = JSON.parse(result.content[0]!.text) as {
      markets: Array<{ id: string }>;
    };

    const ids = data.markets.map((m) => m.id);
    expect(ids).toContain("1850f-fresh-mkt");
  });

  // ── AC-3: real prod-style IDs are unaffected ──────────────────────────────

  it("AC-3: production market IDs (polymarket condition_id format) pass through", async () => {
    // Real Polymarket IDs look like: "0x1234abcd..." or "some-slug-123"
    insertMarket(
      "0x1a2b3c4d5e6f7890abcdef1234567890abcdef12",
      "Will the Fed cut rates by 25bp in June 2026?",
      recentAt,
    );
    insertMarket(
      "will-vietnam-gdp-exceed-7pct-2026",
      "Will Vietnam GDP grow above 7% in 2026?",
      sixDaysAgo,
    );

    const result = await callTool(server, "get_prediction_markets", {
      filter: "all",
      limit: 50,
    });

    const data = JSON.parse(result.content[0]!.text) as {
      markets: Array<{ id: string }>;
    };

    const ids = data.markets.map((m) => m.id);
    expect(ids).toContain("0x1a2b3c4d5e6f7890abcdef1234567890abcdef12");
    expect(ids).toContain("will-vietnam-gdp-exceed-7pct-2026");
  });

  // ── AC-4: test fixtures remain readable directly in DB (not deleted) ──────

  it("AC-4: t163-mkt-* rows remain in DB after tool query (not deleted)", async () => {
    insertMarket("t163-mkt-001", "Will the Fed cut rates in June 2026?", staleAt);

    // Call the tool (which must NOT delete rows)
    await callTool(server, "get_prediction_markets", { filter: "all", limit: 50 });

    // Row must still exist in DB
    const db = getDb();
    const row = db
      .prepare("SELECT id FROM prediction_markets WHERE id = 't163-mkt-001'")
      .get() as { id: string } | undefined;

    expect(row?.id).toBe("t163-mkt-001");
  });
});
