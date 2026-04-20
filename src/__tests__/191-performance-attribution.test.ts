/**
 * Task 191 — get_performance_attribution MCP Tool
 *
 * Tests the performance attribution analysis:
 *   - computeAttribution() pure domain function
 *   - Groups alerts by signal type, measures 3-day price outcome
 *   - Calculates win rate and average return per signal type
 *   - MCP tool registration and output format
 *
 * All tests use an in-memory SQLite database via DB_PATH=:memory:.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  computeAttribution,
  type SignalPerformance,
} from "../domain/services/performanceAttribution.js";
import { registerPerformanceTools } from "../interface/mcp/tools/portfolio/performanceTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — direct tool invocation (bypass SSE transport)
// ─────────────────────────────────────────────────────────────────────────────

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const registry = (server as unknown as {
    _registeredTools: Record<string, {
      handler: (args: Record<string, unknown>) => Promise<unknown>;
    }>;
  })._registeredTools;

  const entry = registry[toolName];
  if (!entry) throw new Error(`Tool "${toolName}" not registered`);
  return entry.handler(args) as Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

let server: McpServer;

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();
  server = new McpServer({ name: "test", version: "0.0.0" });
  registerPerformanceTools(server);
});

afterAll(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Domain service — computeAttribution()
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 191 — computeAttribution() domain service", () => {
  it("returns empty array when alerts is empty", () => {
    const result = computeAttribution([], new Map());
    expect(result).toEqual([]);
  });

  it("groups alerts by signal type and computes totals", () => {
    const alerts = [
      { signalType: "news_mention", actionCode: "VNM", triggeredAt: "2026-01-01T10:00:00Z" },
      { signalType: "news_mention", actionCode: "FPT", triggeredAt: "2026-01-02T10:00:00Z" },
      { signalType: "price_drop",   actionCode: "VCB", triggeredAt: "2026-01-03T10:00:00Z" },
    ];
    const priceHistory: Map<string, Array<{ date: string; price: number }>> = new Map();
    // No price data → all UNKNOWN

    const result = computeAttribution(alerts, priceHistory);
    expect(result.length).toBeGreaterThanOrEqual(2); // at least news_mention + price_drop

    const newsSignal = result.find((s) => s.signalType === "news_mention");
    expect(newsSignal).toBeDefined();
    expect(newsSignal!.totalAlerts).toBe(2);

    const priceDropSignal = result.find((s) => s.signalType === "price_drop");
    expect(priceDropSignal).toBeDefined();
    expect(priceDropSignal!.totalAlerts).toBe(1);
  });

  it("counts hits and misses correctly with price data", () => {
    const baseDate = "2026-02-01T10:00:00Z";
    const futureDate = "2026-02-04T10:00:00Z"; // 3 days later

    const alerts = [
      // price_drop alert for VNM — price went down → HIT
      { signalType: "price_drop", actionCode: "VNM", triggeredAt: baseDate },
    ];

    const priceHistory = new Map<string, Array<{ date: string; price: number }>>([
      ["VNM", [
        { date: "2026-02-01T10:00:00Z", price: 100 },
        { date: futureDate, price: 95 }, // -5% = down → HIT for price_drop
      ]],
    ]);

    const result = computeAttribution(alerts, priceHistory);
    const priceDropSig = result.find((s) => s.signalType === "price_drop");
    expect(priceDropSig).toBeDefined();
    expect(priceDropSig!.hitCount).toBe(1);
    expect(priceDropSig!.missCount).toBe(0);
    expect(priceDropSig!.winRate).toBe(100);
  });

  it("records a miss when price goes up after price_drop signal", () => {
    const baseDate = "2026-02-05T10:00:00Z";
    const futureDate = "2026-02-08T10:00:00Z";

    const alerts = [
      { signalType: "price_drop", actionCode: "FPT", triggeredAt: baseDate },
    ];

    const priceHistory = new Map<string, Array<{ date: string; price: number }>>([
      ["FPT", [
        { date: baseDate, price: 80 },
        { date: futureDate, price: 85 }, // +6.25% = up → MISS for price_drop
      ]],
    ]);

    const result = computeAttribution(alerts, priceHistory);
    const sig = result.find((s) => s.signalType === "price_drop");
    expect(sig!.hitCount).toBe(0);
    expect(sig!.missCount).toBe(1);
    expect(sig!.winRate).toBe(0);
  });

  it("computes avgReturnPct correctly (negative for miss, positive for hit)", () => {
    const alerts = [
      { signalType: "price_surge", actionCode: "VCB", triggeredAt: "2026-03-01T10:00:00Z" },
    ];

    const priceHistory = new Map<string, Array<{ date: string; price: number }>>([
      ["VCB", [
        { date: "2026-03-01T10:00:00Z", price: 50 },
        { date: "2026-03-04T10:00:00Z", price: 53 }, // +6% → HIT for price_surge
      ]],
    ]);

    const result = computeAttribution(alerts, priceHistory);
    const sig = result.find((s) => s.signalType === "price_surge");
    expect(sig).toBeDefined();
    expect(sig!.avgReturnPct).toBeCloseTo(6, 0);
  });

  it("treats news_mention as neutral (no direction) — counted but not hit/miss", () => {
    const alerts = [
      { signalType: "news_mention", actionCode: "VNM", triggeredAt: "2026-03-05T10:00:00Z" },
    ];

    const priceHistory = new Map<string, Array<{ date: string; price: number }>>([
      ["VNM", [
        { date: "2026-03-05T10:00:00Z", price: 100 },
        { date: "2026-03-08T10:00:00Z", price: 105 },
      ]],
    ]);

    const result = computeAttribution(alerts, priceHistory);
    const sig = result.find((s) => s.signalType === "news_mention");
    expect(sig).toBeDefined();
    expect(sig!.totalAlerts).toBe(1);
    // news_mention direction is neutral → can't determine hit/miss
    expect(sig!.hitCount + sig!.missCount).toBe(0);
  });

  it("handles multiple signal types with mixed outcomes", () => {
    const alerts = [
      { signalType: "price_drop", actionCode: "VNM", triggeredAt: "2026-04-01T10:00:00Z" },
      { signalType: "price_drop", actionCode: "FPT", triggeredAt: "2026-04-01T10:00:00Z" },
      { signalType: "price_surge", actionCode: "VCB", triggeredAt: "2026-04-01T10:00:00Z" },
    ];

    const priceHistory = new Map<string, Array<{ date: string; price: number }>>([
      ["VNM", [
        { date: "2026-04-01T10:00:00Z", price: 100 },
        { date: "2026-04-04T10:00:00Z", price: 96 }, // -4% → HIT for price_drop
      ]],
      ["FPT", [
        { date: "2026-04-01T10:00:00Z", price: 80 },
        { date: "2026-04-04T10:00:00Z", price: 82 }, // +2.5% → MISS for price_drop
      ]],
      ["VCB", [
        { date: "2026-04-01T10:00:00Z", price: 50 },
        { date: "2026-04-04T10:00:00Z", price: 48 }, // -4% → MISS for price_surge
      ]],
    ]);

    const result = computeAttribution(alerts, priceHistory);

    const drop = result.find((s) => s.signalType === "price_drop");
    expect(drop!.totalAlerts).toBe(2);
    expect(drop!.hitCount).toBe(1);
    expect(drop!.missCount).toBe(1);
    expect(drop!.winRate).toBe(50);

    const surge = result.find((s) => s.signalType === "price_surge");
    expect(surge!.totalAlerts).toBe(1);
    expect(surge!.hitCount).toBe(0);
    expect(surge!.missCount).toBe(1);
    expect(surge!.winRate).toBe(0);
  });

  it("uses 3-day window: ignores price changes after day 3", () => {
    const baseDate = "2026-05-01T10:00:00Z";

    const alerts = [
      { signalType: "price_drop", actionCode: "VNM", triggeredAt: baseDate },
    ];

    const priceHistory = new Map<string, Array<{ date: string; price: number }>>([
      ["VNM", [
        { date: baseDate, price: 100 },
        // price at day 4 (outside 3-day window) should be ignored
        { date: "2026-05-05T10:00:00Z", price: 90 },
      ]],
    ]);

    const result = computeAttribution(alerts, priceHistory);
    const sig = result.find((s) => s.signalType === "price_drop");
    // No data in 1–3 day window → not a hit or miss
    expect(sig!.hitCount + sig!.missCount).toBe(0);
  });

  it("ignores price changes < 0.1% (noise threshold)", () => {
    const baseDate = "2026-05-10T10:00:00Z";

    const alerts = [
      { signalType: "price_drop", actionCode: "VNM", triggeredAt: baseDate },
    ];

    const priceHistory = new Map<string, Array<{ date: string; price: number }>>([
      ["VNM", [
        { date: baseDate, price: 100 },
        { date: "2026-05-13T10:00:00Z", price: 100.05 }, // 0.05% → noise
      ]],
    ]);

    const result = computeAttribution(alerts, priceHistory);
    const sig = result.find((s) => s.signalType === "price_drop");
    expect(sig!.hitCount + sig!.missCount).toBe(0);
  });

  it("returns results sorted by totalAlerts descending", () => {
    const baseDate = "2026-06-01T10:00:00Z";
    const futureDate = "2026-06-04T10:00:00Z";

    const alerts = [
      { signalType: "price_drop", actionCode: "VNM", triggeredAt: baseDate },
      { signalType: "news_mention", actionCode: "FPT", triggeredAt: baseDate },
      { signalType: "news_mention", actionCode: "VCB", triggeredAt: baseDate },
      { signalType: "news_mention", actionCode: "VEA", triggeredAt: baseDate },
    ];

    const priceHistory = new Map<string, Array<{ date: string; price: number }>>();

    const result = computeAttribution(alerts, priceHistory);
    // news_mention has 3 alerts, price_drop has 1 → news_mention should be first
    expect(result[0]!.signalType).toBe("news_mention");
    expect(result[0]!.totalAlerts).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. MCP tool — get_performance_attribution
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 191 — get_performance_attribution MCP tool", () => {
  beforeEach(() => {
    // Clear alerts and price history before each test
    const db = getDb();
    db.exec("DELETE FROM alerts");
    db.exec("DELETE FROM market_prices_history");
  });

  it("registers the tool without error", () => {
    const registry = (server as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;
    expect(registry["get_performance_attribution"]).toBeDefined();
  });

  it("returns Vietnamese no-data message when alerts table is empty", async () => {
    const result = await callTool(server, "get_performance_attribution", { days: 30 });
    expect(result.content[0]!.text).toContain("Không có dữ liệu");
  });

  it("returns formatted attribution table with alerts data", async () => {
    const db = getDb();
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();

    // Insert a price_drop alert
    db.prepare(`
      INSERT INTO alerts (id, triggered_at, severity, signals_json, affected_actions_json, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      "test-alert-1",
      now,
      "warning",
      JSON.stringify([{ type: "price_drop" }]),
      JSON.stringify([{ code: "VNM" }]),
      "Test alert",
    );

    // Insert matching price history (price went down → hit)
    db.prepare(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES (?, ?, ?, ?)
    `).run("VNM", 100, 1000, now);

    db.prepare(`
      INSERT INTO market_prices_history (code, price, volume, fetched_at)
      VALUES (?, ?, ?, ?)
    `).run("VNM", 95, 1200, future);

    const result = await callTool(server, "get_performance_attribution", { days: 30 });
    const text = result.content[0]!.text;

    // Should contain header (case-insensitive check)
    expect(text.toLowerCase()).toContain("hiệu suất".toLowerCase());
    // Should mention price_drop signal type
    expect(text).toContain("price_drop");
  });

  it("output contains win rate summary line", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO alerts (id, triggered_at, severity, signals_json, affected_actions_json, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      "test-alert-2",
      now,
      "info",
      JSON.stringify([{ type: "news_mention" }]),
      JSON.stringify([{ code: "FPT" }]),
      "Test news alert",
    );

    const result = await callTool(server, "get_performance_attribution", { days: 30 });
    const text = result.content[0]!.text;

    // Vietnamese summary should appear
    expect(text).toContain("Win Rate");
  });

  it("respects the days parameter — excludes old alerts", async () => {
    const db = getDb();
    const oldDate = new Date(Date.now() - 60 * 86_400_000).toISOString(); // 60 days ago

    db.prepare(`
      INSERT INTO alerts (id, triggered_at, severity, signals_json, affected_actions_json, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      "test-alert-old",
      oldDate,
      "info",
      JSON.stringify([{ type: "price_drop" }]),
      JSON.stringify([{ code: "VCB" }]),
      "Old alert",
    );

    const result = await callTool(server, "get_performance_attribution", { days: 30 });
    const text = result.content[0]!.text;

    // 60-day-old alert should not appear in 30-day window
    expect(text).toContain("Không có dữ liệu");
  });

  it("accepts optional signalType filter parameter", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO alerts (id, triggered_at, severity, signals_json, affected_actions_json, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      "test-alert-filter",
      now,
      "warning",
      JSON.stringify([{ type: "price_surge" }]),
      JSON.stringify([{ code: "VNM" }]),
      "Test surge",
    );

    // Filter by signalType=price_surge should show it
    const result = await callTool(server, "get_performance_attribution", {
      days: 30,
      signalType: "price_surge",
    });
    const text = result.content[0]!.text;
    expect(text).toContain("price_surge");
  });

  it("returns error content (not throw) on unexpected error", async () => {
    // Force an error by closing the DB temporarily — tool should catch and return text
    closeDb();
    try {
      const result = await callTool(server, "get_performance_attribution", { days: 30 });
      // Should return error text, not throw
      expect(result.content[0]!.type).toBe("text");
      expect(result.content[0]!.text.length).toBeGreaterThan(0);
    } finally {
      // Restore DB for subsequent tests
      Bun.env["DB_PATH"] = ":memory:";
      await initDatabase();
    }
  });
});
