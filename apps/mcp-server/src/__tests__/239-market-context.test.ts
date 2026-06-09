Bun.env["DB_PATH"] = ":memory:";
/**
 * Task 239 — get_market_context compound MCP tool
 *
 * Tests for `registerMarketContextTools` which registers one compound tool:
 *   - get_market_context : returns watchlist + prices + macro + alerts + analysis in one call
 *
 * All tests use an in-memory SQLite database via DB_PATH=:memory:.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerMarketContextTools } from "../interface/mcp/tools/market-data/marketContextTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper — invoke a registered MCP tool directly (bypasses SSE transport)
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

/** Extract the text from the first content item (throws if missing).
 * If the item is a JSON envelope with a "text" field (MacroSnapshotResponse shape),
 * returns the inner text so callers can split on real newlines. */
function getText(result: { content: Array<{ type: string; text: string }> }): string {
  const first = result.content[0];
  if (!first) throw new Error("Tool returned empty content array");
  try {
    const parsed = JSON.parse(first.text) as { text?: string };
    if (typeof parsed.text === "string") return parsed.text;
  } catch {
    // not JSON — return raw
  }
  return first.text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

function seedWatchlistStock(
  code: string,
  exchange: string = "HOSE",
  domain: string = "banking",
): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO watchlist
      (code, exchange, domain, notes, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min, alert_report_new)
    VALUES (?, ?, ?, NULL, ?, -3, 5, 7, 1)
  `).run(code, exchange, domain, new Date().toISOString());
}

function seedPrice(
  code: string,
  price: number,
  changePct: number,
  exchange: string = "HOSE",
): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO market_prices (code, price, change_amt, change_pct, volume, updated_at, exchange)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(code, price, price * changePct / 100, changePct, 1_000_000, new Date().toISOString(), exchange);
}

function seedStalePrice(
  code: string,
  price: number,
  changePct: number,
  daysAgo: number,
  exchange: string = "HOSE",
): void {
  const db = getDb();
  const staleDate = new Date(Date.now() - daysAgo * 24 * 3_600_000).toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO market_prices (code, price, change_amt, change_pct, volume, updated_at, exchange)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(code, price, price * changePct / 100, changePct, 1_000_000, staleDate, exchange);
}

function seedAlert(
  code: string,
  severity: "low" | "medium" | "high" | "critical",
  hoursAgo: number = 1,
): void {
  const db = getDb();
  const id = `alert-${code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const triggeredAt = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  db.prepare(`
    INSERT INTO alerts
      (id, triggered_at, severity, signals_json, affected_actions_json, analysis_ids_json, message, read, user_note)
    VALUES (?, ?, ?, ?, ?, NULL, ?, 0, NULL)
  `).run(
    id,
    triggeredAt,
    severity,
    JSON.stringify([{ type: "price_drop", actionCode: code, severity }]),
    JSON.stringify([{ code }]),
    `${code} price drop alert`,
  );
}

function seedAnalysis(
  title: string,
  sentiment: string,
  impactScore: number,
  hoursAgo: number = 1,
): void {
  const db = getDb();
  const id = `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  db.prepare(`
    INSERT INTO rag_analyses
      (id, created_at, level, source_url, source_title, sentiment, impact_score, impact_direction, summary)
    VALUES (?, ?, 'country', NULL, ?, ?, ?, 'down', 'Test analysis summary')
  `).run(id, createdAt, title, sentiment, impactScore);
}

function seedMacroIndicator(name: string, value: number): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
    VALUES (?, ?, 0, 0, 0, ?)
  `).run(name, value, new Date().toISOString());
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup / teardown
// ─────────────────────────────────────────────────────────────────────────────

let server: McpServer;

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();
  // Add exchange column (normally added by hose/hnx fetchers at runtime)
  const db = getDb();
  try {
    db.exec("ALTER TABLE market_prices ADD COLUMN exchange TEXT DEFAULT 'HOSE'");
  } catch {
    // already exists — safe to ignore
  }
  server = new McpServer(
    { name: "test-server", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );
  registerMarketContextTools(server);
});

afterAll(() => {
  closeDb();
});

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM watchlist");
  db.exec("DELETE FROM market_prices");
  db.exec("DELETE FROM alerts");
  db.exec("DELETE FROM rag_analyses");
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 239 — get_market_context compound tool", () => {

  it("returns all 5 labeled sections in one response", async () => {
    seedWatchlistStock("VNM", "HOSE", "agriculture");
    seedPrice("VNM", 72_500, -1.2);
    seedAlert("VNM", "high", 1);
    seedAnalysis("China trade war impact", "bearish", 8, 1);

    const result = await callTool(server, "get_market_context", { hours_back: 24 });
    const text = getText(result);

    expect(text).toContain("=== WATCHLIST & PRICES ===");
    expect(text).toContain("=== MACRO ===");
    expect(text).toContain("=== OPEN ALERTS");
    expect(text).toContain("=== RECENT ANALYSIS");
    expect(text).toContain("=== SYSTEM STATUS ===");
  });

  it("shows watchlist stocks with price and change_pct", async () => {
    seedWatchlistStock("VCB", "HOSE", "banking");
    seedPrice("VCB", 88_000, 1.5);

    const result = await callTool(server, "get_market_context", { hours_back: 24 });
    const text = getText(result);

    expect(text).toContain("VCB");
    expect(text).toContain("HOSE");
    expect(text).toContain("+1.50%");
  });

  it("hours_back filters alerts to only those within the window", async () => {
    seedWatchlistStock("FPT", "HOSE", "tech");
    seedAlert("FPT", "high", 2);   // 2 hours ago — within 24h window
    seedAlert("FPT", "critical", 30); // 30 hours ago — outside 24h window

    const result = await callTool(server, "get_market_context", { hours_back: 24 });
    const text = getText(result);

    // Should include the 2h-ago alert, not the 30h-ago one
    // Count [HIGH] vs [CRITICAL] in alerts section only
    const alertsSection = (text.split("=== RECENT ANALYSIS")[0] ?? "")
      .split("=== OPEN ALERTS")[1] ?? "";
    expect(alertsSection).toContain("HIGH");
    expect(alertsSection).not.toContain("CRITICAL");
  });

  it("hours_back filters analysis entries to only those within the window", async () => {
    seedWatchlistStock("VNM", "HOSE", "agriculture");
    seedAnalysis("Recent FDI inflow", "bullish", 7, 2);    // 2h ago — in window
    seedAnalysis("Old steel tariff", "bearish", 6, 50);    // 50h ago — outside 24h

    const result = await callTool(server, "get_market_context", { hours_back: 24 });
    const text = getText(result);

    const analysisSection = (text.split("=== SYSTEM STATUS")[0] ?? "")
      .split("=== RECENT ANALYSIS")[1] ?? "";
    expect(analysisSection).toContain("Recent FDI inflow");
    expect(analysisSection).not.toContain("Old steel tariff");
  });

  it("handles empty watchlist gracefully", async () => {
    const result = await callTool(server, "get_market_context", { hours_back: 24 });
    const text = getText(result);

    expect(text).toContain("=== WATCHLIST & PRICES ===");
    expect(text).toContain("empty");
  });

  it("handles no alerts gracefully", async () => {
    seedWatchlistStock("VCB", "HOSE", "banking");

    const result = await callTool(server, "get_market_context", { hours_back: 24 });
    const text = getText(result);

    expect(text).toContain("=== OPEN ALERTS");
    // Should say no alerts or show 0
    const alertsSection = (text.split("=== RECENT ANALYSIS")[0] ?? "")
      .split("=== OPEN ALERTS")[1] ?? "";
    expect(alertsSection.trim().length).toBeGreaterThan(0);
  });

  it("handles no analyses gracefully", async () => {
    seedWatchlistStock("VCB", "HOSE", "banking");

    const result = await callTool(server, "get_market_context", { hours_back: 24 });
    const text = getText(result);

    expect(text).toContain("=== RECENT ANALYSIS");
    const analysisSection = (text.split("=== SYSTEM STATUS")[0] ?? "")
      .split("=== RECENT ANALYSIS")[1] ?? "";
    expect(analysisSection.trim().length).toBeGreaterThan(0);
  });

  it("defaults hours_back to 24 when not supplied", async () => {
    seedWatchlistStock("VNM", "HOSE", "agriculture");
    seedAlert("VNM", "high", 1);

    const result = await callTool(server, "get_market_context", {});
    const text = getText(result);

    expect(text).toContain("=== WATCHLIST & PRICES ===");
    expect(text).toContain("=== OPEN ALERTS");
  });

  it("analysis section lists entries by impact_score descending", async () => {
    seedWatchlistStock("FPT", "HOSE", "tech");
    seedAnalysis("Low impact story", "neutral", 3, 1);
    seedAnalysis("High impact story", "bearish", 9, 2);

    const result = await callTool(server, "get_market_context", { hours_back: 24 });
    const text = getText(result);

    const analysisSection = (text.split("=== SYSTEM STATUS")[0] ?? "")
      .split("=== RECENT ANALYSIS")[1] ?? "";

    const highIdx = analysisSection.indexOf("High impact story");
    const lowIdx = analysisSection.indexOf("Low impact story");
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it("system status section contains pending alert count", async () => {
    seedWatchlistStock("VCB", "HOSE", "banking");
    seedAlert("VCB", "high", 1);
    seedAlert("VCB", "medium", 2);

    const result = await callTool(server, "get_market_context", { hours_back: 24 });
    const text = getText(result);

    expect(text).toContain("=== SYSTEM STATUS ===");
    // Should contain the pending alert count (unread alerts in DB)
    expect(text).toMatch(/\d+ alert/);
  });

  // ── Task 1253 — stale price staleness warning ────────────────────────────
  it("Task 1253: marks price >24h old as [STALE] and shows summary warning", async () => {
    seedWatchlistStock("VCB", "HOSE", "banking");
    // Seed a price that is 18 days old (simulates the reported VCB bug)
    seedStalePrice("VCB", 88_000, 3.53, 18);

    const result = await callTool(server, "get_market_context", { hours_back: 24 });
    const text = getText(result);

    expect(text).toContain("[STALE]");
    expect(text).toContain("stale (>24h)");
    expect(text).toContain("Do NOT use for intraday signals");
  });

  it("Task 1253: fresh price (<24h) does NOT show [STALE] tag", async () => {
    seedWatchlistStock("VCB", "HOSE", "banking");
    // Fresh price — just now
    seedPrice("VCB", 59_300, 0.17);

    const result = await callTool(server, "get_market_context", { hours_back: 24 });
    const text = getText(result);

    expect(text).not.toContain("[STALE]");
    expect(text).not.toContain("stale (>24h)");
  });

  it("Task 1253: mixed fresh+stale prices — only stale ones get [STALE] flag", async () => {
    seedWatchlistStock("VCB", "HOSE", "banking");
    seedWatchlistStock("FPT", "HOSE", "tech");
    seedStalePrice("VCB", 88_000, 3.53, 18); // 18 days stale
    seedPrice("FPT", 145_000, 1.0);          // fresh

    const result = await callTool(server, "get_market_context", { hours_back: 24 });
    const text = getText(result);

    // VCB should be stale, FPT should not
    const watchlistSection = (text.split("=== MACRO")[0] ?? "")
      .split("=== WATCHLIST")[1] ?? "";
    const vcbLine = watchlistSection.split("\n").find((l) => l.includes("VCB")) ?? "";
    const fptLine = watchlistSection.split("\n").find((l) => l.includes("FPT")) ?? "";

    expect(vcbLine).toContain("[STALE]");
    expect(fptLine).not.toContain("[STALE]");
    // Summary warning should mention exactly 1 stale price
    expect(text).toContain("1 price(s) are stale");
  });
});
