/**
 * Task 225 — Sentiment Trend per stock: get_sentiment_trend MCP tool
 *
 * Tests domain service `computeSentimentTrend` and the MCP tool
 * `get_sentiment_trend` wired through `registerSentimentTrendTools`.
 *
 * TDD: all tests are written before implementation (RED → GREEN).
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  computeSentimentTrend,
  type DailySentiment,
  type SentimentTrend,
} from "../domain/services/sentimentTrend.js";
import { registerSentimentTrendTools } from "../interface/mcp/tools/news-analysis/sentimentTrendTools.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a fake entry array for `computeSentimentTrend`.
 * `daysAgo` = 0 means today, 1 = yesterday, etc.
 */
function makeEntry(sentiment: string, daysAgo: number): { sentiment: string; createdAt: string } {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return { sentiment, createdAt: d.toISOString().slice(0, 10) };
}

// ─── Domain service tests ────────────────────────────────────────────────────

describe("Task 225 — computeSentimentTrend (domain service)", () => {
  it("returns zero-filled result on empty entries", () => {
    const result = computeSentimentTrend([], "VNM", 7);
    expect(result.code).toBe("VNM");
    expect(result.windowDays).toBe(7);
    expect(result.dailyBreakdown).toHaveLength(0);
    expect(result.trendDirection).toBe("stable");
    expect(result.slope).toBe(0);
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("groups entries by date correctly", () => {
    const entries = [
      makeEntry("bullish", 0),
      makeEntry("bullish", 0),
      makeEntry("bearish", 0),
      makeEntry("neutral", 1),
      makeEntry("bullish", 1),
    ];
    const result = computeSentimentTrend(entries, "VNM", 7);
    expect(result.dailyBreakdown.length).toBeGreaterThanOrEqual(2);

    const today = result.dailyBreakdown.find(
      (d) => d.date === new Date().toISOString().slice(0, 10),
    );
    expect(today).toBeDefined();
    expect(today!.total).toBe(3);
    expect(today!.bullish).toBe(2);
    expect(today!.bearish).toBe(1);
    expect(today!.neutral).toBe(0);
    expect(today!.netScore).toBe(1); // 2 - 1
  });

  it("computes netScore = bullish - bearish per day", () => {
    const entries = [
      makeEntry("bullish", 2),
      makeEntry("bullish", 2),
      makeEntry("bullish", 2),
      makeEntry("bearish", 2),
    ];
    const result = computeSentimentTrend(entries, "FPT", 7);
    const day = result.dailyBreakdown.find((d) => {
      const expected = new Date();
      expected.setDate(expected.getDate() - 2);
      return d.date === expected.toISOString().slice(0, 10);
    });
    expect(day).toBeDefined();
    expect(day!.netScore).toBe(2); // 3 bullish - 1 bearish
  });

  it("detects improving trend (positive slope)", () => {
    // Day 6 days ago: all bearish → low netScore
    // Day 0 (today): all bullish → high netScore
    const entries: Array<{ sentiment: string; createdAt: string }> = [];
    for (let i = 6; i >= 3; i--) {
      entries.push(makeEntry("bearish", i));
    }
    for (let i = 2; i >= 0; i--) {
      entries.push(makeEntry("bullish", i));
      entries.push(makeEntry("bullish", i));
    }
    const result = computeSentimentTrend(entries, "VCB", 7);
    expect(result.trendDirection).toBe("improving");
    expect(result.slope).toBeGreaterThan(0);
  });

  it("detects deteriorating trend (negative slope)", () => {
    // Day 6 days ago: all bullish → high netScore
    // Day 0 (today): all bearish → low netScore
    const entries: Array<{ sentiment: string; createdAt: string }> = [];
    for (let i = 6; i >= 3; i--) {
      entries.push(makeEntry("bullish", i));
      entries.push(makeEntry("bullish", i));
    }
    for (let i = 2; i >= 0; i--) {
      entries.push(makeEntry("bearish", i));
    }
    const result = computeSentimentTrend(entries, "VCB", 7);
    expect(result.trendDirection).toBe("deteriorating");
    expect(result.slope).toBeLessThan(0);
  });

  it("detects stable trend (|slope| < 0.05)", () => {
    // Flat pattern: same mix every day
    const entries: Array<{ sentiment: string; createdAt: string }> = [];
    for (let i = 6; i >= 0; i--) {
      entries.push(makeEntry("bullish", i));
      entries.push(makeEntry("bearish", i));
    }
    const result = computeSentimentTrend(entries, "VNM", 7);
    expect(result.trendDirection).toBe("stable");
    expect(Math.abs(result.slope)).toBeLessThan(0.05);
  });

  it("uses correct linear regression formula", () => {
    // Manual test: 3 days with netScores [0, 1, 2]
    // x = [0, 1, 2], y = [0, 1, 2]
    // n=3, Σxy=0+1+4=5, ΣxΣy=3*3=9, Σx²=0+1+4=5, (Σx)²=9
    // slope = (3*5 - 3*3) / (3*5 - 9) = (15-9) / (15-9) = 1.0
    const entries: Array<{ sentiment: string; createdAt: string }> = [];
    // day 2: 0 netScore (1 bearish, 1 neutral ... but net 0 is tricky)
    // Easier: day2=1 bullish (net=1), day1=2 bullish (net=2), day0=3 bullish (net=3) → slope > 0
    entries.push(makeEntry("bullish", 2));
    entries.push(makeEntry("bullish", 1));
    entries.push(makeEntry("bullish", 1));
    entries.push(makeEntry("bullish", 0));
    entries.push(makeEntry("bullish", 0));
    entries.push(makeEntry("bullish", 0));
    const result = computeSentimentTrend(entries, "TEST", 7);
    expect(result.slope).toBeGreaterThan(0.4); // strong positive slope
    expect(result.trendDirection).toBe("improving");
  });

  it("limits entries to windowDays window", () => {
    const entries: Array<{ sentiment: string; createdAt: string }> = [];
    // Add entries outside the 3-day window (10 days ago)
    entries.push(makeEntry("bearish", 10));
    entries.push(makeEntry("bearish", 10));
    entries.push(makeEntry("bearish", 10));
    // Add entries inside the 3-day window
    entries.push(makeEntry("bullish", 0));
    entries.push(makeEntry("bullish", 1));
    const result = computeSentimentTrend(entries, "VNM", 3);
    // Should not include day 10 entries
    const allDates = result.dailyBreakdown.map((d) => d.date);
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    expect(allDates).not.toContain(tenDaysAgo.toISOString().slice(0, 10));
    // Should have at most 3 days
    expect(result.dailyBreakdown.length).toBeLessThanOrEqual(3);
  });

  it("returns sorted dailyBreakdown (most recent first)", () => {
    const entries = [
      makeEntry("bullish", 2),
      makeEntry("bearish", 0),
      makeEntry("neutral", 1),
    ];
    const result = computeSentimentTrend(entries, "VNM", 7);
    const dates = result.dailyBreakdown.map((d) => d.date);
    // Verify descending order
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]! <= dates[i - 1]!).toBe(true);
    }
  });

  it("generates Vietnamese summary text", () => {
    const entries = [
      makeEntry("bullish", 0),
      makeEntry("bullish", 1),
      makeEntry("bearish", 2),
    ];
    const result = computeSentimentTrend(entries, "VNM", 7);
    // Summary should contain the stock code and Vietnamese text
    expect(result.summary).toContain("VNM");
    // Should contain at least Vietnamese-style content (numbers or key words)
    expect(result.summary.length).toBeGreaterThan(10);
  });

  it("handles all-neutral entries as stable", () => {
    const entries = [
      makeEntry("neutral", 0),
      makeEntry("neutral", 1),
      makeEntry("neutral", 2),
    ];
    const result = computeSentimentTrend(entries, "VNM", 7);
    expect(result.trendDirection).toBe("stable");
    result.dailyBreakdown.forEach((d) => {
      expect(d.netScore).toBe(0);
    });
  });

  it("handles single day with only bullish as improving or stable", () => {
    const entries = [makeEntry("bullish", 0)];
    const result = computeSentimentTrend(entries, "VNM", 7);
    // With only 1 data point, slope is 0 → stable
    expect(result.trendDirection).toBe("stable");
  });

  it("slope is 0 when only one unique day of data", () => {
    const entries = [
      makeEntry("bullish", 0),
      makeEntry("bearish", 0),
    ];
    const result = computeSentimentTrend(entries, "FPT", 7);
    // Only 1 day → denominator in regression is 0 → slope = 0
    expect(result.slope).toBe(0);
  });

  it("DailySentiment fields are all non-negative integers", () => {
    const entries = [
      makeEntry("bullish", 0),
      makeEntry("bearish", 1),
      makeEntry("neutral", 2),
    ];
    const result = computeSentimentTrend(entries, "VNM", 7);
    for (const day of result.dailyBreakdown) {
      expect(day.total).toBeGreaterThanOrEqual(0);
      expect(day.bullish).toBeGreaterThanOrEqual(0);
      expect(day.bearish).toBeGreaterThanOrEqual(0);
      expect(day.neutral).toBeGreaterThanOrEqual(0);
      expect(day.bullish + day.bearish + day.neutral).toBe(day.total);
    }
  });
});

// ─── MCP tool integration tests ──────────────────────────────────────────────

/** Invoke a registered MCP tool by name, handling both `callback` and `handler` shapes. */
async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        {
          callback?: (args: Record<string, unknown>) => Promise<unknown>;
          handler?: (args: Record<string, unknown>) => Promise<unknown>;
        }
      >;
    }
  )._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable found for tool: ${toolName}`);
  return fn(args) as Promise<{ content: Array<{ type: string; text: string }> }>;
}

describe("Task 225 — registerSentimentTrendTools (MCP integration)", () => {
  it("registers get_sentiment_trend tool on McpServer", () => {
    const server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerSentimentTrendTools(server);
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(tools["get_sentiment_trend"]).toBeDefined();
  });

  it("returns no-data message when rag_analyses is empty", async () => {
    const testDb = new Database(":memory:");
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS rag_analyses (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        level TEXT NOT NULL,
        sentiment TEXT,
        affected_actions TEXT,
        data_env TEXT
)
    `);
    const server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerSentimentTrendTools(server, testDb);
    const result = await callTool(server, "get_sentiment_trend", { stock_code: "VNM", window_days: 7 });
    expect(result.content[0]?.text).toContain("VNM");
    testDb.close();
  });

  it("returns formatted trend table when data exists", async () => {
    const testDb = new Database(":memory:");
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS rag_analyses (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        level TEXT NOT NULL,
        sentiment TEXT,
        affected_actions TEXT,
        data_env TEXT
)
    `);
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    testDb.exec(`
      INSERT INTO rag_analyses (id, created_at, level, sentiment, affected_actions)
      VALUES
        ('a1', '${today}', 'action', 'bullish', '["VNM","FPT"]'),
        ('a2', '${today}', 'action', 'bullish', '["VNM"]'),
        ('a3', '${yesterday}', 'action', 'bearish', '["VNM"]'),
        ('a4', '${yesterday}', 'action', 'neutral', '["VCB"]')
    `);

    const server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerSentimentTrendTools(server, testDb);
    const result = await callTool(server, "get_sentiment_trend", { stock_code: "VNM", window_days: 7 });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("VNM");
    // Should contain date row DD/MM format
    expect(text).toContain(today.slice(8, 10) + "/" + today.slice(5, 7));
    testDb.close();
  });

  it("handles unknown stock gracefully (no crash)", async () => {
    const testDb = new Database(":memory:");
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS rag_analyses (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        level TEXT NOT NULL,
        sentiment TEXT,
        affected_actions TEXT,
        data_env TEXT
)
    `);
    const server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerSentimentTrendTools(server, testDb);
    const result = await callTool(server, "get_sentiment_trend", { stock_code: "ZZUNKNOWN", window_days: 7 });
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0]?.text).toBeDefined();
    testDb.close();
  });
});
