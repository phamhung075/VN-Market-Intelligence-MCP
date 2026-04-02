/**
 * Task 176 — trigger_alert_check MCP Tool
 *
 * Tests for the on-demand stock signal check tool.
 *
 * Acceptance criteria:
 *   1. `registerAlertCheckTools` is exported from the tools barrel index.
 *   2. `trigger_alert_check` tool is registered on an McpServer without throwing.
 *   3. With no signals detected, returns "Không có tín hiệu bất thường".
 *   4. With a single stock (actionCode filter), returns a summary for that stock only.
 *   5. With a HIGH/CRITICAL signal, the summary mentions the severity label.
 *   6. When no watchlist entries exist and no actionCode is given, returns a safe message.
 *   7. The tool is READ-ONLY — does NOT insert rows into the alerts table.
 *   8. Telegram send is attempted for HIGH/CRITICAL signals (mocked); graceful no-op if env vars absent.
 *
 * Strategy:
 *   - SQLite: real in-memory DB (DB_PATH = :memory:)
 *   - Price fetcher: injected mock (no network calls)
 *   - Telegram: env vars absent → graceful skip (no error)
 */

// Must set DB_PATH before any import that triggers getDb()
process.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerAlertCheckTools } from "../interface/mcp/tools/alertCheckTools.js";

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

function getText(result: { content: Array<{ type: string; text: string }> }): string {
  const first = result.content[0];
  if (!first || first.type !== "text") throw new Error("No text content in tool response");
  return first.text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock price fetcher types
// ─────────────────────────────────────────────────────────────────────────────

interface MockPrice {
  code: string;
  exchange: string;
  price: number;
  previousPrice: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  fetchedAt: string;
}

function makeMockPrice(overrides: Partial<MockPrice> & { code: string }): MockPrice {
  return {
    code: overrides.code,
    exchange: overrides.exchange ?? "HOSE",
    price: overrides.price ?? 50000,
    previousPrice: overrides.previousPrice ?? 50000,
    changePct: overrides.changePct ?? 0,
    volume: overrides.volume ?? 100000,
    avgVolume: overrides.avgVolume ?? 100000,
    fetchedAt: overrides.fetchedAt ?? new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

let server: McpServer;

beforeAll(async () => {
  await initDatabase();
  server = new McpServer(
    { name: "test-176", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );
  // Register with a mock price fetcher that returns empty by default
  // (individual tests will call the tool with overrides via injected deps)
  registerAlertCheckTools(server);
});

afterAll(() => {
  closeDb();
});

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM watchlist");
  db.exec("DELETE FROM alerts");
  db.exec("DELETE FROM market_prices");
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

// trigger_alert_check removed from MCP in sprint-036 task 230
describe("Task 176 — trigger_alert_check MCP Tool (tool removed in task 230)", () => {

  // ── 1. Registration ────────────────────────────────────────────────────────

  it("registerAlertCheckTools is a no-op — trigger_alert_check NOT registered (removed in task 230)", () => {
    const fresh = new McpServer(
      { name: "fresh-176", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    expect(() => registerAlertCheckTools(fresh)).not.toThrow();
    const reg = (fresh as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;
    expect("trigger_alert_check" in reg).toBe(false); // removed in task 230
  });

  // ── 2-8: Tool removed — skipped (sprint-036 task 230) ─────────────────────

  it.skip("returns safe message when watchlist is empty and no actionCode given", async () => {
    const result = await callTool(server, "trigger_alert_check", {
      _testPrices: [],
    });
    const text = getText(result);
    // Should not throw, should return something meaningful
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  // ── 3. No signals detected ─────────────────────────────────────────────────

  it.skip("returns 'Không có tín hiệu bất thường' when prices are normal", async () => {
    const db = getDb();
    db.prepare(`
      INSERT INTO watchlist (code, exchange, domain, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("VCB", "HOSE", "banking", new Date().toISOString(), 5, 5, 5);

    const flatPrice = makeMockPrice({ code: "VCB", changePct: 0.5 });
    const result = await callTool(server, "trigger_alert_check", {
      _testPrices: [flatPrice],
    });
    const text = getText(result);
    expect(text).toContain("Không có tín hiệu bất thường");
  });

  // ── 4. Single stock filter (actionCode) ────────────────────────────────────

  it.skip("filters to a single stock when actionCode is provided", async () => {
    const db = getDb();
    db.prepare(`INSERT INTO watchlist (code, exchange, domain, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min) VALUES (?, ?, ?, ?, ?, ?, ?)`).run("VCB", "HOSE", "banking", new Date().toISOString(), 5, 5, 5);
    db.prepare(`INSERT INTO watchlist (code, exchange, domain, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min) VALUES (?, ?, ?, ?, ?, ?, ?)`).run("FPT", "HOSE", "technology", new Date().toISOString(), 5, 5, 5);

    const prices = [
      makeMockPrice({ code: "VCB", changePct: 0 }),
      makeMockPrice({ code: "FPT", changePct: 0 }),
    ];
    const result = await callTool(server, "trigger_alert_check", {
      actionCode: "VCB",
      _testPrices: prices,
    });
    const text = getText(result);
    // Result should mention VCB
    expect(text).toContain("VCB");
    // Should NOT mention FPT since it was filtered out
    expect(text).not.toContain("FPT");
  });

  // ── 5. HIGH signal — summary mentions severity ─────────────────────────────

  it.skip("mentions HIGH severity label when a large price drop is detected", async () => {
    const db = getDb();
    db.prepare(`INSERT INTO watchlist (code, exchange, domain, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min) VALUES (?, ?, ?, ?, ?, ?, ?)`).run("VCB", "HOSE", "banking", new Date().toISOString(), 5, 5, 5);

    // -10% triggers HIGH severity (10–14.9% band)
    const droppedPrice = makeMockPrice({
      code: "VCB",
      price: 45000,
      previousPrice: 50000,
      changePct: -10,
      volume: 100000,
      avgVolume: 100000,
    });
    const result = await callTool(server, "trigger_alert_check", {
      _testPrices: [droppedPrice],
    });
    const text = getText(result);
    // Should mention the stock
    expect(text).toContain("VCB");
    // Should mention a signal type
    expect(text.toLowerCase()).toMatch(/drop|surge|signal|tín hiệu/i);
  });

  // ── 6. READ-ONLY — no rows inserted in alerts table ───────────────────────

  it.skip("does NOT insert rows into the alerts table", async () => {
    const db = getDb();
    db.prepare(`INSERT INTO watchlist (code, exchange, domain, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min) VALUES (?, ?, ?, ?, ?, ?, ?)`).run("VCB", "HOSE", "banking", new Date().toISOString(), 5, 5, 5);

    const droppedPrice = makeMockPrice({
      code: "VCB",
      price: 40000,
      previousPrice: 50000,
      changePct: -20,
      volume: 500000,
      avgVolume: 100000,
    });

    const alertsBefore = (db.prepare("SELECT COUNT(*) as cnt FROM alerts").get() as { cnt: number }).cnt;

    await callTool(server, "trigger_alert_check", {
      _testPrices: [droppedPrice],
    });

    const alertsAfter = (db.prepare("SELECT COUNT(*) as cnt FROM alerts").get() as { cnt: number }).cnt;
    expect(alertsAfter).toBe(alertsBefore); // READ-ONLY: no new rows
  });

  // ── 7. Telegram graceful no-op when env vars absent ───────────────────────

  it.skip("does not throw when Telegram env vars are absent (graceful no-op)", async () => {
    const db = getDb();
    db.prepare(`INSERT INTO watchlist (code, exchange, domain, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min) VALUES (?, ?, ?, ?, ?, ?, ?)`).run("VCB", "HOSE", "banking", new Date().toISOString(), 5, 5, 5);

    const droppedPrice = makeMockPrice({
      code: "VCB",
      price: 40000,
      previousPrice: 50000,
      changePct: -20,
      volume: 500000,
      avgVolume: 100000,
    });

    // Ensure Telegram env vars are absent
    delete process.env["TELEGRAM_BOT_TOKEN"];
    delete process.env["TELEGRAM_CHAT_ID"];

    let threw = false;
    try {
      await callTool(server, "trigger_alert_check", {
        _testPrices: [droppedPrice],
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  // ── 8. actionCode not in watchlist → safe message ─────────────────────────

  it.skip("returns safe message when actionCode is not in watchlist", async () => {
    // watchlist is empty (cleared in beforeEach)
    const result = await callTool(server, "trigger_alert_check", {
      actionCode: "HPG",
      _testPrices: [],
    });
    const text = getText(result);
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });
});
