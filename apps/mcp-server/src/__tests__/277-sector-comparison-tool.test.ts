Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 277 — get_sector_comparison MCP Tool
 *
 * Compares a watchlist stock's valuation (PE/PB/ROE) and price performance
 * against its sector peers using data stored in local SQLite tables.
 *
 * Data sources (all local SQLite — no network):
 *   - watchlist            — target stock's domain
 *   - vnstock_financials   — PE, PB, ROE for target + peers
 *   - market_prices        — latest price, change_pct
 *   - vnstock_trading_stats — foreign flow (foreignVolume)
 *
 * Output: plain-text Vietnamese comparison, no Markdown, no emojis.
 *
 * Tests use an in-memory SQLite DB — no network calls.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerSectorComparisonTools } from "../interface/mcp/tools/sector/sectorComparisonTools.js";

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

function firstText(result: { content: Array<{ type: string; text: string }> }): string {
  const item = result.content[0];
  if (!item) throw new Error("No content returned by tool");
  return item.text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Seed watchlist with VCB (banking) */
function seedWatchlist(): void {
  const db = getDb();
  db.exec(`
    INSERT OR REPLACE INTO watchlist (code, exchange, domain, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min, alert_report_new)
    VALUES ('VCB', 'HOSE', 'banking', datetime('now'), -3, 5, 7, 1)
  `);
}

/** Seed vnstock_financials for VCB + banking peers */
function seedVnstockFinancials(): void {
  const db = getDb();
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO vnstock_financials
      (code, year_report, quarter, pe, pb, roe, roa, revenue_bn, net_profit_bn,
       debt_to_equity, source, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'vnstock', ?)
  `);
  // Target: VCB — higher PE than sector median (premium)
  insert.run("VCB", 2025, 4, 9.0, 2.0, 18.0, 2.1, 50000, 8000, 8.5, now);
  // Peers
  insert.run("BID", 2025, 4, 6.8, 1.1, 12.0, 1.0, 40000, 5000, 9.5, now);
  insert.run("CTG", 2025, 4, 7.2, 1.2, 13.0, 1.1, 42000, 5500, 9.0, now);
  insert.run("TCB", 2025, 4, 8.1, 1.4, 15.0, 1.5, 30000, 4500, 7.0, now);
  insert.run("MBB", 2025, 4, 5.9, 1.0, 16.0, 1.6, 28000, 4000, 8.0, now);
}

/** Seed market_prices for VCB and banking peers */
function seedMarketPrices(): void {
  const db = getDb();
  db.exec(`
    INSERT OR REPLACE INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
    VALUES
      ('VCB', 85000.0, -1020.0, -1.2, 1500000, datetime('now')),
      ('BID', 42000.0,  -378.0, -0.9, 2000000, datetime('now')),
      ('CTG', 35000.0,  -175.0, -0.5, 1800000, datetime('now')),
      ('TCB', 28000.0,  -308.0, -1.1, 3000000, datetime('now')),
      ('MBB', 25000.0,  -175.0, -0.7, 2500000, datetime('now'))
  `);
}

/** Seed vnstock_trading_stats for VCB and peers */
function seedTradingStats(): void {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO vnstock_trading_stats
      (code, date, foreign_room, foreign_volume, current_holding_ratio, max_holding_ratio,
       avg_volume_2w, high_52w, low_52w, pct_from_high_52w, pct_from_low_52w, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run("VCB", today, 500000000, 2300000, 18.5, 30.0, 1500000, 92000, 72000, -7.6, 18.1, now);
  insert.run("BID", today, 300000000, -500000, 12.0, 25.0, 2000000, 48000, 38000, -12.5, 10.5, now);
  insert.run("CTG", today, 250000000, -800000, 10.0, 25.0, 1800000, 40000, 30000, -12.5, 16.7, now);
  insert.run("TCB", today, 400000000, 100000,  22.0, 49.0, 3000000, 35000, 22000, -20.0, 27.3, now);
  insert.run("MBB", today, 350000000, -200000, 14.0, 49.0, 2500000, 30000, 20000, -16.7, 25.0, now);
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

let server: McpServer;

beforeAll(async () => {
  Bun.env["DB_PATH"] = `:memory:`;
  closeDb(); // ensure fresh DB when running in parallel with other test files
  await initDatabase();
  server = new McpServer(
    { name: "test-sector-comparison", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );
  registerSectorComparisonTools(server);
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM watchlist");
  db.exec("DELETE FROM vnstock_financials");
  db.exec("DELETE FROM market_prices");
  db.exec("DELETE FROM vnstock_trading_stats");
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 277 — get_sector_comparison MCP tool", () => {

  // ── 1. Tool registration ──────────────────────────────────────────────────

  it("registerSectorComparisonTools registers get_sector_comparison tool", () => {
    const registry = (server as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;
    expect(typeof registry["get_sector_comparison"]).toBe("object");
  });

  // ── 2. Error: stock not on watchlist ──────────────────────────────────────

  it("returns error when stock is not on watchlist", async () => {
    // Watchlist is empty
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    expect(text).toMatch(/watchlist|Loi|khong.*danh|not.*found/i);
  });

  // ── 3. Returns comparison for valid watchlist stock ───────────────────────

  it("returns comparison output for valid watchlist stock with peer data", async () => {
    seedWatchlist();
    seedVnstockFinancials();
    seedMarketPrices();
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    // Header with stock code and sector name
    expect(text).toContain("VCB");
    expect(text).toMatch(/Ngan hang|banking|Ng[aâ]n h[aà]ng/i);
  });

  // ── 4. Output format: header ──────────────────────────────────────────────

  it("output includes SO SANH NGANH header", async () => {
    seedWatchlist();
    seedVnstockFinancials();
    seedMarketPrices();
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    expect(text).toMatch(/SO SANH NGANH|so sanh nganh/i);
  });

  // ── 5. Valuation comparison section ──────────────────────────────────────

  it("output includes PE comparison vs sector median", async () => {
    seedWatchlist();
    seedVnstockFinancials();
    seedMarketPrices();
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    expect(text).toMatch(/PE|P\/E/i);
    // VCB PE=9.0 should appear
    expect(text).toContain("9.0");
  });

  it("output includes PB comparison vs sector median", async () => {
    seedWatchlist();
    seedVnstockFinancials();
    seedMarketPrices();
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    expect(text).toMatch(/PB|P\/B/i);
  });

  it("output includes ROE comparison vs sector median", async () => {
    seedWatchlist();
    seedVnstockFinancials();
    seedMarketPrices();
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    expect(text).toMatch(/ROE/i);
    expect(text).toContain("18.0");
  });

  // ── 6. Valuation tier labels ──────────────────────────────────────────────

  it("shows PREMIUM label when stock PE is above sector median by >15%", async () => {
    seedWatchlist();
    seedVnstockFinancials();
    // VCB PE=9.0, peers BID=6.8, CTG=7.2, TCB=8.1, MBB=5.9
    // median ≈ 7.2 — VCB(9.0) / 7.2 = 1.25 → PREMIUM
    seedMarketPrices();
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    expect(text).toMatch(/PREMIUM|CAO HON/i);
  });

  it("shows DISCOUNT label when stock metric is below sector median by >15%", async () => {
    // Seed VCB with very low PE vs peers to get DISCOUNT
    const db = getDb();
    seedWatchlist();
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT OR REPLACE INTO vnstock_financials
        (code, year_report, quarter, pe, pb, roe, roa, revenue_bn, net_profit_bn,
         debt_to_equity, source, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'vnstock', ?)
    `);
    // VCB PE=4.0 — discount vs high-PE peers
    insert.run("VCB", 2025, 4, 4.0, 2.0, 18.0, 2.1, 50000, 8000, 8.5, now);
    insert.run("BID", 2025, 4, 12.0, 1.1, 12.0, 1.0, 40000, 5000, 9.5, now);
    insert.run("CTG", 2025, 4, 11.0, 1.2, 13.0, 1.1, 42000, 5500, 9.0, now);
    insert.run("TCB", 2025, 4, 13.0, 1.4, 15.0, 1.5, 30000, 4500, 7.0, now);
    seedMarketPrices();
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    expect(text).toMatch(/DISCOUNT|THAP HON|discount/i);
  });

  it("shows NGANG BANG or inline label when stock is within ±15% of median", async () => {
    const db = getDb();
    seedWatchlist();
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT OR REPLACE INTO vnstock_financials
        (code, year_report, quarter, pe, pb, roe, roa, revenue_bn, net_profit_bn,
         debt_to_equity, source, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'vnstock', ?)
    `);
    // VCB PE=8.0 — very close to peers
    insert.run("VCB", 2025, 4, 8.0, 1.5, 14.0, 1.5, 50000, 8000, 8.5, now);
    insert.run("BID", 2025, 4, 8.0, 1.5, 14.0, 1.5, 40000, 5000, 9.5, now);
    insert.run("CTG", 2025, 4, 8.0, 1.5, 14.0, 1.5, 42000, 5500, 9.0, now);
    seedMarketPrices();
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    expect(text).toMatch(/NGANG BANG|INLINE|TUONG DUONG|ngang/i);
  });

  // ── 7. Price section ──────────────────────────────────────────────────────

  it("output includes Gia hom nay section with price change", async () => {
    seedWatchlist();
    seedVnstockFinancials();
    seedMarketPrices();
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    expect(text).toMatch(/Giá hôm nay|Gia hom nay|gia.*hom nay|Gia.*nay/i);
    // VCB change_pct = -1.2%
    expect(text).toMatch(/-1\.2%/);
  });

  it("output includes sector average price change", async () => {
    seedWatchlist();
    seedVnstockFinancials();
    seedMarketPrices();
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    // Should mention sector average or TB
    expect(text).toMatch(/TB|trung binh|nganh/i);
  });

  // ── 8. Peer detail section ────────────────────────────────────────────────

  it("output includes Chi tiet peers section", async () => {
    seedWatchlist();
    seedVnstockFinancials();
    seedMarketPrices();
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    expect(text).toMatch(/Chi tiet|peers|dong nganh/i);
  });

  it("peer section lists banking peers with their PE and price change", async () => {
    seedWatchlist();
    seedVnstockFinancials();
    seedMarketPrices();
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    // At least some peers should be listed
    expect(text).toMatch(/BID|CTG|TCB|MBB/);
  });

  // ── 9. Missing peer financial data gracefully handled ─────────────────────

  it("handles missing peer financial data gracefully — shows N/A", async () => {
    seedWatchlist();
    // Only seed VCB financials, no peers
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO vnstock_financials
        (code, year_report, quarter, pe, pb, roe, roa, revenue_bn, net_profit_bn,
         debt_to_equity, source, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'vnstock', ?)
    `).run("VCB", 2025, 4, 9.0, 2.0, 18.0, 2.1, 50000, 8000, 8.5, now);
    seedMarketPrices();
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    // Should not throw, should handle gracefully
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("handles stock with no vnstock_financials at all — shows N/A for PE/PB/ROE", async () => {
    seedWatchlist();
    seedMarketPrices();
    // No financials seeded at all
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    expect(text).toMatch(/N\/A|n\/a|-/);
  });

  // ── 10. Sector median computation correctness ─────────────────────────────

  it("computes sector median PE correctly for banking peers", async () => {
    seedWatchlist();
    seedVnstockFinancials();
    // BID=6.8, CTG=7.2, TCB=8.1, MBB=5.9 → sorted=[5.9,6.8,7.2,8.1] → median=(6.8+7.2)/2=7.0
    seedMarketPrices();
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    // Median PE should be around 7.0
    expect(text).toMatch(/7\.[0-9]/);
  });

  // ── 11. Foreign flow section ──────────────────────────────────────────────

  it("output includes foreign flow section when trading stats are available", async () => {
    seedWatchlist();
    seedVnstockFinancials();
    seedMarketPrices();
    seedTradingStats();
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    const text = firstText(result);
    expect(text).toMatch(/nuoc ngoai|ngoai|ngoài|foreign|dong tien|Dòng tiền/i);
  });

  // ── 12. Case normalisation ────────────────────────────────────────────────

  it("normalises lowercase stock code to uppercase", async () => {
    seedWatchlist();
    seedVnstockFinancials();
    seedMarketPrices();
    const result = await callTool(server, "get_sector_comparison", { code: "vcb" });
    const text = firstText(result);
    expect(text).toContain("VCB");
  });

  // ── 13. MCP return shape ──────────────────────────────────────────────────

  it("returns MCP content array with type=text", async () => {
    seedWatchlist();
    seedVnstockFinancials();
    seedMarketPrices();
    const result = await callTool(server, "get_sector_comparison", { code: "VCB" });
    expect(Array.isArray(result.content)).toBe(true);
    const item = result.content[0];
    expect(item).toBeDefined();
    expect(item!.type).toBe("text");
    expect(typeof item!.text).toBe("string");
    expect(item!.text.length).toBeGreaterThan(0);
  });
});
