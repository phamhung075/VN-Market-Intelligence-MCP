/**
 * Task 217 — compare_stocks MCP Tool
 *
 * Side-by-side comparison of 2-5 stocks showing price, financials,
 * alerts, and conviction. All data is pulled from existing SQLite tables.
 *
 * Tables used:
 *   - market_prices       — price, change_pct
 *   - financial_reports   — pe, roe, net_revenue (latest report per stock)
 *   - alerts              — count of alerts in last 7 days
 *   - conviction_history  — latest conviction score (optional, may not exist)
 *
 * Output: plain-text Vietnamese table format.
 *
 * Tests use an in-memory SQLite DB — no network calls.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerCompareTools } from "../interface/mcp/tools/compareTools.js";

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

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

function seedPrices(): void {
  const db = getDb();
  db.exec(`
    INSERT OR REPLACE INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
    VALUES
      ('VCB',  85000.0,  1000.0,  1.2, 1500000, '2026-04-01T09:30:00Z'),
      ('FPT', 115000.0, -575.0,  -0.5, 800000,  '2026-04-01T09:30:00Z'),
      ('HPG',  28000.0,  630.0,   2.3, 5000000, '2026-04-01T09:30:00Z'),
      ('VNM',  72000.0,  -72.0,  -0.1, 600000,  '2026-04-01T09:30:00Z')
  `);
}

function seedFinancialReports(): void {
  const db = getDb();
  // Insert financial reports with pe, roe, net_revenue for latest periods.
  // financial_reports schema uses parsed_at (not created_at), period_start, period_end.
  // balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json are NOT NULL.
  const emptyJson = "{}";
  const insert = db.prepare(`
    INSERT OR REPLACE INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       sort_key, period_year, period_quarter, period_type,
       period_start, period_end, audit_status, parsed_at,
       net_revenue, pe, roe,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  type Row = [string, string, string, string, string, string, number, number | null, string, string, string, string, string, number, number, number];
  const rows: Row[] = [
    ["rep-vcb-q4-25", "VCB", "Vietcombank", "HOSE", "banking", "2025-Q4", 2025, 4, "Q4", "2025-10-01", "2025-12-31", "audited", "2026-01-15T00:00:00Z", 50000000.0, 12.5, 22.1],
    ["rep-vcb-q3-25", "VCB", "Vietcombank", "HOSE", "banking", "2025-Q3", 2025, 3, "Q3", "2025-07-01", "2025-09-30", "audited", "2025-10-15T00:00:00Z", 46000000.0, 11.0, 20.5],
    ["rep-fpt-q4-25", "FPT", "FPT Corp",    "HOSE", "tech",    "2025-Q4", 2025, 4, "Q4", "2025-10-01", "2025-12-31", "audited", "2026-01-20T00:00:00Z", 30000000.0, 18.3, 19.8],
    ["rep-hpg-q4-25", "HPG", "Hoa Phat",    "HOSE", "steel",   "2025-Q4", 2025, 4, "Q4", "2025-10-01", "2025-12-31", "audited", "2026-01-18T00:00:00Z", 40000000.0,  8.7, 15.3],
    ["rep-vnm-q4-25", "VNM", "Vinamilk",    "HOSE", "other",   "2025-Q4", 2025, 4, "Q4", "2025-10-01", "2025-12-31", "audited", "2026-01-22T00:00:00Z", 20000000.0, 15.2, 28.5],
  ];

  for (const r of rows) {
    insert.run(...r, emptyJson, emptyJson, emptyJson, emptyJson);
  }
}

function seedAlerts(): void {
  const db = getDb();
  const now = new Date();
  // Alerts within last 7 days for each stock
  const make = (id: string, code: string, daysAgo: number) => {
    const ts = new Date(now.getTime() - daysAgo * 86400 * 1000).toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO alerts
        (id, triggered_at, severity, signals_json, affected_actions_json, message, read)
      VALUES (?, ?, 'warning', '["price_drop"]', ?, 'Test alert', 0)
    `).run(id, ts, JSON.stringify([{ code }]));
  };
  make("a1", "VCB", 1);
  make("a2", "VCB", 3);
  make("a3", "VCB", 6);
  make("a4", "FPT", 2);
  make("a5", "HPG", 1);
  make("a6", "HPG", 2);
  make("a7", "HPG", 4);
  make("a8", "HPG", 5);
  make("a9", "HPG", 6);
  // Old alert > 7 days — must NOT be counted
  make("a10", "VNM", 8);
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

let server: McpServer;

beforeAll(async () => {
  process.env["DB_PATH"] = ":memory:";
  await initDatabase();
  server = new McpServer(
    { name: "test-compare", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );
  registerCompareTools(server);
});

afterAll(() => {
  closeDb();
  delete process.env["DB_PATH"];
});

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM market_prices");
  db.exec("DELETE FROM financial_reports");
  db.exec("DELETE FROM alerts");
});

// Helper to safely extract text from first content item
function firstText(result: { content: Array<{ type: string; text: string }> }): string {
  const item = result.content[0];
  if (!item) throw new Error("No content returned by tool");
  return item.text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 217 — compare_stocks MCP tool", () => {

  // ── 1. Tool registration ──────────────────────────────────────────────────

  it("registerCompareTools registers compare_stocks tool", () => {
    const registry = (server as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;
    expect(typeof registry["compare_stocks"]).toBe("object");
  });

  // ── 2. Validation: requires 2 to 5 codes ─────────────────────────────────

  it("returns error when fewer than 2 codes are provided", async () => {
    const result = await callTool(server, "compare_stocks", { codes: ["VCB"] });
    expect(firstText(result)).toMatch(/[Ii]t nhất 2|at least 2|2.*m[aã]/i);
  });

  it("returns error when more than 5 codes are provided", async () => {
    const result = await callTool(server, "compare_stocks", {
      codes: ["VCB", "FPT", "HPG", "VNM", "SSI", "ACB"],
    });
    expect(firstText(result)).toMatch(/[Tt]ối đa 5|at most 5|t[oô]i.*5/i);
  });

  // ── 3. Header format ──────────────────────────────────────────────────────

  it("output includes Vietnamese header with number of stocks", async () => {
    seedPrices();
    const result = await callTool(server, "compare_stocks", {
      codes: ["VCB", "FPT"],
    });
    expect(firstText(result)).toContain("So sanh");
  });

  it("output includes stock codes as column headers", async () => {
    seedPrices();
    const result = await callTool(server, "compare_stocks", {
      codes: ["VCB", "FPT", "HPG"],
    });
    const text = firstText(result);
    expect(text).toContain("VCB");
    expect(text).toContain("FPT");
    expect(text).toContain("HPG");
  });

  // ── 4. Price row ──────────────────────────────────────────────────────────

  it("output contains Gia row with formatted prices", async () => {
    seedPrices();
    const result = await callTool(server, "compare_stocks", {
      codes: ["VCB", "FPT"],
    });
    const text = firstText(result);
    expect(text).toMatch(/Gia/i);
    // VCB price 85,000
    expect(text).toMatch(/85[,.]?000/);
  });

  it("output contains Thay doi row with +/- sign", async () => {
    seedPrices();
    const result = await callTool(server, "compare_stocks", {
      codes: ["VCB", "FPT"],
    });
    const text = firstText(result);
    expect(text).toMatch(/Thay doi/i);
    // VCB +1.2%, FPT -0.5%
    expect(text).toMatch(/\+1\.2%/);
    expect(text).toMatch(/-0\.5%/);
  });

  // ── 5. Financial metrics from financial_reports ───────────────────────────

  it("output contains P/E row with values from latest financial report", async () => {
    seedPrices();
    seedFinancialReports();
    const result = await callTool(server, "compare_stocks", {
      codes: ["VCB", "FPT"],
    });
    const text = firstText(result);
    expect(text).toMatch(/P\/E|PE/i);
    // VCB pe=12.5, FPT pe=18.3
    expect(text).toContain("12.5");
    expect(text).toContain("18.3");
  });

  it("output contains ROE row with values from latest financial report", async () => {
    seedPrices();
    seedFinancialReports();
    const result = await callTool(server, "compare_stocks", {
      codes: ["VCB", "FPT"],
    });
    const text = firstText(result);
    expect(text).toMatch(/ROE/i);
    // VCB roe=22.1%, FPT roe=19.8%
    expect(text).toContain("22.1");
    expect(text).toContain("19.8");
  });

  it("uses LATEST report when multiple exist for same stock", async () => {
    seedPrices();
    seedFinancialReports(); // VCB has Q4-2025 (pe=12.5) and Q3-2025 (pe=11.0)
    const result = await callTool(server, "compare_stocks", {
      codes: ["VCB", "FPT"],
    });
    const text = firstText(result);
    // Should show Q4 (12.5), not Q3 (11.0)
    expect(text).toContain("12.5");
  });

  it("shows N/A for P/E when no financial report exists", async () => {
    seedPrices();
    // No financial reports seeded
    const result = await callTool(server, "compare_stocks", {
      codes: ["VCB", "FPT"],
    });
    const text = firstText(result);
    expect(text).toMatch(/N\/A|n\/a|-/);
  });

  // ── 6. Revenue delta (YoY) ────────────────────────────────────────────────

  it("output contains DT YoY row", async () => {
    seedPrices();
    seedFinancialReports();
    const result = await callTool(server, "compare_stocks", {
      codes: ["VCB", "FPT"],
    });
    const text = firstText(result);
    // Vietnamese label for revenue YoY
    expect(text).toMatch(/DT\s*YoY|doanh\s*thu/i);
  });

  // ── 7. Alert count ────────────────────────────────────────────────────────

  it("output contains Canh bao row with alert counts for last 7 days", async () => {
    seedPrices();
    seedAlerts();
    const result = await callTool(server, "compare_stocks", {
      codes: ["VCB", "FPT", "HPG", "VNM"],
    });
    const text = firstText(result);
    expect(text).toMatch(/Canh bao/i);
  });

  it("counts VCB alerts correctly (3 in last 7 days)", async () => {
    seedPrices();
    seedAlerts();
    const result = await callTool(server, "compare_stocks", {
      codes: ["VCB", "FPT"],
    });
    const text = firstText(result);
    // VCB has 3 alerts; FPT has 1 alert
    // The text should contain "3" and "1" in the Canh bao row
    const lines = text.split("\n");
    const alertLine = lines.find((l) => /Canh bao/i.test(l));
    expect(alertLine).toBeDefined();
    expect(alertLine!).toContain("3");
  });

  it("excludes alerts older than 7 days from count", async () => {
    seedPrices();
    seedAlerts(); // VNM has 1 alert that is 8 days old
    const result = await callTool(server, "compare_stocks", {
      codes: ["VNM", "FPT"],
    });
    const text = firstText(result);
    const lines = text.split("\n");
    const alertLine = lines.find((l) => /Canh bao/i.test(l));
    expect(alertLine).toBeDefined();
    // VNM should show 0 (old alert excluded)
    expect(alertLine!).toContain("0");
  });

  // ── 8. Conviction row ─────────────────────────────────────────────────────

  it("output contains Xac tin row (even if N/A when no table)", async () => {
    seedPrices();
    const result = await callTool(server, "compare_stocks", {
      codes: ["VCB", "FPT"],
    });
    const text = firstText(result);
    expect(text).toMatch(/Xac tin|xac.*tin/i);
  });

  // ── 9. Stock not found in any table ──────────────────────────────────────

  it("handles stock code with no data gracefully (N/A in all fields)", async () => {
    // No data seeded
    const result = await callTool(server, "compare_stocks", {
      codes: ["ZZZ", "YYY"],
    });
    const text = firstText(result);
    // Should not throw, should show N/A
    expect(text).toMatch(/N\/A|n\/a|-/);
  });

  // ── 10. 5 stocks (maximum) ────────────────────────────────────────────────

  it("handles 5 stocks (maximum) without error", async () => {
    seedPrices();
    seedFinancialReports();
    seedAlerts();
    const result = await callTool(server, "compare_stocks", {
      codes: ["VCB", "FPT", "HPG", "VNM", "ZZZ"],
    });
    const text = firstText(result);
    expect(text).toContain("VCB");
    expect(text).toContain("FPT");
    expect(text).toContain("HPG");
    expect(text).toContain("VNM");
    expect(text).toContain("ZZZ");
  });

  // ── 11. Uppercase normalisation ───────────────────────────────────────────

  it("normalises lowercase input codes to uppercase", async () => {
    seedPrices();
    const result = await callTool(server, "compare_stocks", {
      codes: ["vcb", "fpt"],
    });
    const text = firstText(result);
    expect(text).toContain("VCB");
    expect(text).toContain("FPT");
  });

  // ── 12. Return structure ──────────────────────────────────────────────────

  it("returns MCP content array with type=text", async () => {
    seedPrices();
    const result = await callTool(server, "compare_stocks", {
      codes: ["VCB", "FPT"],
    });
    expect(Array.isArray(result.content)).toBe(true);
    const item = result.content[0];
    expect(item).toBeDefined();
    expect(item!.type).toBe("text");
    expect(typeof item!.text).toBe("string");
    expect(item!.text.length).toBeGreaterThan(0);
  });
});
