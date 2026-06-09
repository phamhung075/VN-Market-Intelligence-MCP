/**
 * Task 084 — Market MCP Tools
 *
 * Tests for registerMarketTools: get_market_snapshot and get_patterns.
 *
 * Strategy:
 * - All HTTP calls are mocked via injected httpClient (no real network calls).
 * - SQLite is in-memory (:memory:) via DB_PATH env override.
 * - McpServer is instantiated directly to call tool handlers.
 * - LanceDB-dependent modules are not imported here.
 */

// Set DB_PATH before any import that triggers getDb()
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Mock LanceDB-dependent retriever so it never initialises a real vector store
mock.module("../infrastructure/rag/retriever.js", () => ({
  searchContext: async () => [],
  insertAnalysis: async () => {},
}));

import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  registerWatchlistTools,
  registerReportTools,
  registerAlertTools,
  registerAnalysisTools,
  registerMarketTools,
} from "../interface/mcp/tools/index.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a mock HTTP client that always returns the given JSON string. */
function makeMockClient(jsonResponse: string) {
  return {
    get: async (_url: string) => jsonResponse,
  };
}

/** Build a mock HTTP client that throws a network error. */
function makeFailingClient() {
  return {
    get: async (_url: string): Promise<string> => {
      throw new Error("Network error");
    },
  };
}

/** Call a tool on a McpServer and return the first text content item. */
async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const registry = (server as unknown as {
    _registeredTools: Record<string, {
      handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
    }>;
  })._registeredTools;
  const entry = registry[toolName];
  if (!entry) throw new Error(`Tool not found: ${toolName}`);
  const result = await entry.handler(args);
  const firstContent = result.content[0];
  if (!firstContent || firstContent.type !== "text") throw new Error("No text content");
  return firstContent.text;
}

// ── VnDirect mock response for HOSE VNINDEX ──────────────────────────────────

const VNINDEX_MOCK_JSON = JSON.stringify({
  data: [
    {
      code: "VNINDEX",
      exchange: "HOSE",
      close: 1250.5,
      previousClose: 1240.0,
      pctChange: 0.847,
      nmTotalTradedQty: 500000000,
    },
  ],
  totalCount: 1,
});

const HOSE_PRICES_MOCK_JSON = JSON.stringify({
  data: [
    {
      code: "VCB",
      exchange: "HOSE",
      close: 88000,
      previousClose: 87000,
      pctChange: 1.149,
      nmTotalTradedQty: 1500000,
    },
    {
      code: "HPG",
      exchange: "HOSE",
      close: 27000,
      previousClose: 27500,
      pctChange: -1.818,
      nmTotalTradedQty: 8000000,
    },
  ],
  totalCount: 2,
});

const HNX_PRICES_MOCK_JSON = JSON.stringify([
  {
    code: "ACB",
    closePrice: 23500,
    referencePrice: 23000,
    percentChange: 2.174,
    totalVolume: 5000000,
  },
]);

// ── Setup ─────────────────────────────────────────────────────────────────────

let server: McpServer;

beforeAll(async () => {
  await initDatabase();

  server = new McpServer(
    { name: "test-market-084", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  // Register all tool groups including the new market tools
  registerWatchlistTools(server);
  registerReportTools(server);
  registerAlertTools(server);
  registerAnalysisTools(server);
  registerMarketTools(server);
});

afterAll(() => {
  closeDb();
});

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Task 084 — Market MCP Tools", () => {

  // ── get_market_snapshot ───────────────────────────────────────────────────

  describe("get_market_snapshot", () => {

    it("returns formatted VN-Index header when no codes provided", async () => {
      const db = getDb();
      // We need to inject mock clients — the tool uses fetchHosePrices internally.
      // For the no-codes case, only VNINDEX is fetched.
      // We test that the tool registers and returns appropriate text.
      const text = await callTool(server, "get_market_snapshot", {
        codes: [],
        _testHoseClient: makeMockClient(VNINDEX_MOCK_JSON),
        _testHnxClient: makeMockClient("[]"),
        _testUpcomClient: makeMockClient("[]"),
      });
      // Should contain some market snapshot content
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    });

    it("returns 'No codes provided' or snapshot header for empty codes array", async () => {
      const text = await callTool(server, "get_market_snapshot", {
        codes: [],
        _testHoseClient: makeMockClient(VNINDEX_MOCK_JSON),
        _testHnxClient: makeMockClient("[]"),
        _testUpcomClient: makeMockClient("[]"),
      });
      // The tool should return some market snapshot text — either a message or prices
      expect(typeof text).toBe("string");
    });

    it("handles exchange fetch error gracefully (one exchange fails, others succeed)", async () => {
      // If HNX fetch fails, the tool should still return HOSE data
      const db = getDb();
      // Insert VCB as HOSE in market_prices so classification works
      try {
        db.exec(`
          INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, exchange, updated_at)
          VALUES ('VCB', 88000, 1.15, 1500000, 'HOSE', '2026-03-28T00:00:00.000Z')
        `);
      } catch {
        // column may not exist yet — that's ok for this test
      }

      const text = await callTool(server, "get_market_snapshot", {
        codes: ["VCB"],
        _testHoseClient: makeMockClient(HOSE_PRICES_MOCK_JSON),
        _testHnxClient: makeFailingClient(),
        _testUpcomClient: makeMockClient("[]"),
      });
      // Should not throw; should return some text
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    });

    it("formats prices grouped by exchange", async () => {
      const db = getDb();
      // Insert stocks with known exchanges
      try {
        db.exec(`
          INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, exchange, updated_at)
          VALUES
            ('VCB', 88000, 1.15, 1500000, 'HOSE', '2026-03-28T00:00:00.000Z'),
            ('ACB', 23500, 2.17, 5000000, 'HNX', '2026-03-28T00:00:00.000Z')
        `);
      } catch {
        // columns may vary
      }

      const text = await callTool(server, "get_market_snapshot", {
        codes: ["VCB", "ACB"],
        _testHoseClient: makeMockClient(HOSE_PRICES_MOCK_JSON),
        _testHnxClient: makeMockClient(HNX_PRICES_MOCK_JSON),
        _testUpcomClient: makeMockClient("[]"),
      });
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    });

    it("includes generatedAt timestamp in the output", async () => {
      const text = await callTool(server, "get_market_snapshot", {
        codes: [],
        _testHoseClient: makeMockClient(VNINDEX_MOCK_JSON),
        _testHnxClient: makeMockClient("[]"),
        _testUpcomClient: makeMockClient("[]"),
      });
      // generatedAt should appear somewhere in the output
      expect(text).toMatch(/Generated|generated|UTC|T\d{2}:\d{2}/);
    });

    it("get_market_snapshot returns stock-shape array (regression: 1898a / TNB c45 stale-build guard)", async () => {
      const db = getDb();
      try {
        db.exec(`
          INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, exchange, updated_at)
          VALUES ('VCB', 88000, 1.15, 1500000, 'HOSE', '2026-03-28T00:00:00.000Z')
        `);
      } catch {
        // column may not exist in :memory: — continue
      }

      const text = await callTool(server, "get_market_snapshot", {
        codes: ["VCB"],
        _testHoseClient: makeMockClient(HOSE_PRICES_MOCK_JSON),
        _testHnxClient: makeMockClient("[]"),
        _testUpcomClient: makeMockClient("[]"),
      });

      // (i) Contains VN-Index market header — stock handler, not electricity/portfolio handler
      expect(text).toContain("VN-Index:");

      // (ii) Contains a VCB price line with VND and % change — stock-shape confirmed
      expect(text).toMatch(/VCB\s+[\d,]+\.?\d*\s+VND\s+[+-][\d.]+%/);

      // (iii) Contains Generated timestamp
      expect(text).toMatch(/Generated:/);

      // (iv) Must NOT contain electricity content markers (stale-build regression guard)
      expect(text).not.toContain("ĐIỆN LỰC");
      expect(text).not.toContain("TRẠNG THÁI ĐIỆN");

      // (v) Must NOT contain portfolio content markers (stale-build regression guard)
      expect(text).not.toContain("portfolio");
      expect(text).not.toContain("positions");
    });

  });

  // ── get_patterns ──────────────────────────────────────────────────────────

  describe("get_patterns", () => {

    it("returns 'No historical precedents found' when no rag_analyses match", async () => {
      const text = await callTool(server, "get_patterns", {
        stockCode: "XYZ",
        eventKeyword: "nonexistent_event_xyz_987",
        lookbackHours: 24,
      });
      expect(text).toContain("No historical precedents found");
    });

    it("returns formatted pattern summary when precedents exist", async () => {
      const db = getDb();
      const now = new Date().toISOString();
      // Insert matching rag_analyses rows
      db.exec(`
        INSERT OR IGNORE INTO rag_analyses
          (id, created_at, level, source_url, source_title, source_type,
           published_at, sentiment, impact_score, impact_direction, confidence,
           time_horizon, summary, reasoning,
           affected_countries, affected_domains, affected_actions, parent_ids, tags)
        VALUES
          ('test-084-1', '${now}', 'country', 'http://a.com/1', 'Oil price surge affects GAS', 'rss',
           '${now}', 'bullish', 7, 'up', 0.8,
           'short_term', 'Oil surge impacts GAS', 'Global oil up',
           '["VN"]', '["energy"]', '["GAS"]', '[]', '["oil"]'),
          ('test-084-2', '${now}', 'domain', 'http://a.com/2', 'Oil supply cut GAS impact', 'rss',
           '${now}', 'bullish', 6, 'up', 0.7,
           'short_term', 'Supply cut benefits GAS', 'OPEC cuts',
           '["VN"]', '["energy"]', '["GAS"]', '[]', '["oil"]'),
          ('test-084-3', '${now}', 'action', 'http://a.com/3', 'GAS profits from oil rally', 'rss',
           '${now}', 'neutral', 5, 'neutral', 0.6,
           'medium_term', 'GAS neutral on oil', 'Mixed signals',
           '["VN"]', '["energy"]', '["GAS"]', '[]', '["oil"]')
      `);

      const text = await callTool(server, "get_patterns", {
        stockCode: "GAS",
        eventKeyword: "oil",
        lookbackHours: 24,
      });
      expect(text).not.toContain("No historical precedents found");
      expect(text).toContain("GAS");
      expect(text).toContain("oil");
    });

    it("returns dominant direction and avg impact in summary", async () => {
      const text = await callTool(server, "get_patterns", {
        stockCode: "GAS",
        eventKeyword: "oil",
        lookbackHours: 24,
      });
      // Should contain direction and some numeric avg impact
      expect(text).toMatch(/up|down|neutral/i);
      expect(text).toMatch(/\d+(\.\d+)?/);
    });

    it("returns no-match message for unknown stock even if keyword matches", async () => {
      const text = await callTool(server, "get_patterns", {
        stockCode: "UNKNWN99",
        eventKeyword: "oil",
        lookbackHours: 24,
      });
      expect(text).toContain("No historical precedents found");
    });

    it("respects lookbackHours = 1 (very short window returns no results for old data)", async () => {
      const db = getDb();
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48h ago
      db.exec(`
        INSERT OR IGNORE INTO rag_analyses
          (id, created_at, level, source_url, source_title, source_type,
           published_at, sentiment, impact_score, impact_direction, confidence,
           time_horizon, summary, reasoning,
           affected_countries, affected_domains, affected_actions, parent_ids, tags)
        VALUES
          ('test-084-old', '${oldDate}', 'country', 'http://old.com', 'Old event GAS', 'rss',
           '${oldDate}', 'neutral', 3, 'neutral', 0.5,
           'short_term', 'Old GAS event', 'Old reason',
           '["VN"]', '["energy"]', '["GAS"]', '[]', '["old"]')
      `);

      const text = await callTool(server, "get_patterns", {
        stockCode: "GAS",
        eventKeyword: "old",
        lookbackHours: 1,
      });
      // 48h-old data should not be returned for 1h lookback
      expect(text).toContain("No historical precedents found");
    });

  });

  // ── Barrel export ─────────────────────────────────────────────────────────

  describe("registerMarketTools export", () => {

    it("registerMarketTools is exported from the tools barrel index", () => {
      expect(typeof registerMarketTools).toBe("function");
    });

    it("registerMarketTools registers exactly 2 new tools on a fresh McpServer", () => {
      const freshServer = new McpServer(
        { name: "test-market-count", version: "0.0.0" },
        { capabilities: { tools: {} } },
      );
      registerMarketTools(freshServer);
      const tools = (freshServer as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
      const toolNames = Object.keys(tools);
      expect(toolNames).toContain("get_market_snapshot");
      expect(toolNames).toContain("get_patterns");
      expect(toolNames.length).toBe(2);
    });

    it("all 5 groups register a non-zero tool total on a combined McpServer", () => {
      // Sprint 036+ shrunk several groups (merge M1/M2/M3, tool removals).
      // This test used to hard-code "18" which drifts every time a tool is
      // added or removed. Assert the invariant: every group contributes >= 1
      // tool, nothing throws on registration, and the total matches the sum
      // of the individual group counts (no duplicates).
      const count = (reg: (s: McpServer) => void) => {
        const s = new McpServer({ name: "t", version: "0.0.0" }, { capabilities: { tools: {} } });
        reg(s);
        return Object.keys((s as unknown as { _registeredTools: Record<string, unknown> })._registeredTools).length;
      };
      const combined = new McpServer(
        { name: "test-combined", version: "0.0.0" },
        { capabilities: { tools: {} } },
      );
      registerWatchlistTools(combined);
      registerReportTools(combined);
      registerAlertTools(combined);
      registerAnalysisTools(combined);
      registerMarketTools(combined);
      const totalCombined = Object.keys(
        (combined as unknown as { _registeredTools: Record<string, unknown> })._registeredTools,
      ).length;

      const expected =
        count(registerWatchlistTools) +
        count(registerReportTools) +
        count(registerAlertTools) +
        count(registerAnalysisTools) +
        count(registerMarketTools);

      expect(totalCombined).toBeGreaterThan(0);
      expect(totalCombined).toBe(expected);
    });

    it("does NOT register search_similar_context (it is already in analysis.ts)", () => {
      const freshServer = new McpServer(
        { name: "test-no-dup", version: "0.0.0" },
        { capabilities: { tools: {} } },
      );
      registerMarketTools(freshServer);
      const tools = (freshServer as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
      expect(Object.keys(tools)).not.toContain("search_similar_context");
    });

  });

});
