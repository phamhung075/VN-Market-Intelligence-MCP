/**
 * Task 206 — Stop-loss / Take-profit threshold alerts
 *
 * Tests for:
 *   - checkPriceAlerts() domain service (pure logic, no I/O)
 *   - MCP tool registration (set_price_alert, get_price_alerts, delete_price_alert)
 *   - SQLite schema for price_alerts table
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { checkPriceAlerts } from "../domain/services/priceAlertChecker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Domain service tests — checkPriceAlerts()
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 206 — checkPriceAlerts domain service", () => {
  const baseAlerts = [
    { id: 1, code: "VCB", alertType: "stop_loss", threshold: 80_000 },
    { id: 2, code: "FPT", alertType: "take_profit", threshold: 130_000 },
    { id: 3, code: "HPG", alertType: "stop_loss", threshold: 25_000 },
    { id: 4, code: "VNM", alertType: "take_profit", threshold: 60_000 },
  ];

  it("triggers stop_loss when currentPrice <= threshold", () => {
    const prices = new Map([["VCB", 79_000]]); // below 80_000
    const triggered = checkPriceAlerts(baseAlerts, prices);
    expect(triggered).toHaveLength(1);
    expect(triggered[0]!.alertId).toBe(1);
    expect(triggered[0]!.code).toBe("VCB");
    expect(triggered[0]!.alertType).toBe("stop_loss");
  });

  it("triggers stop_loss when currentPrice === threshold (boundary)", () => {
    const prices = new Map([["VCB", 80_000]]); // exactly at threshold
    const triggered = checkPriceAlerts(baseAlerts, prices);
    expect(triggered.some((t) => t.alertId === 1)).toBe(true);
  });

  it("does NOT trigger stop_loss when currentPrice > threshold", () => {
    const prices = new Map([["VCB", 85_000]]); // above 80_000 — safe
    const triggered = checkPriceAlerts(baseAlerts, prices);
    expect(triggered.some((t) => t.alertId === 1)).toBe(false);
  });

  it("triggers take_profit when currentPrice >= threshold", () => {
    const prices = new Map([["FPT", 131_000]]); // above 130_000
    const triggered = checkPriceAlerts(baseAlerts, prices);
    expect(triggered).toHaveLength(1);
    expect(triggered[0]!.alertId).toBe(2);
    expect(triggered[0]!.alertType).toBe("take_profit");
  });

  it("triggers take_profit when currentPrice === threshold (boundary)", () => {
    const prices = new Map([["FPT", 130_000]]); // exactly at threshold
    const triggered = checkPriceAlerts(baseAlerts, prices);
    expect(triggered.some((t) => t.alertId === 2)).toBe(true);
  });

  it("does NOT trigger take_profit when currentPrice < threshold", () => {
    const prices = new Map([["FPT", 115_000]]); // below 130_000 — not there yet
    const triggered = checkPriceAlerts(baseAlerts, prices);
    expect(triggered.some((t) => t.alertId === 2)).toBe(false);
  });

  it("returns empty array when no prices provided", () => {
    const triggered = checkPriceAlerts(baseAlerts, new Map());
    expect(triggered).toEqual([]);
  });

  it("returns empty array when alerts list is empty", () => {
    const prices = new Map([["VCB", 75_000]]);
    const triggered = checkPriceAlerts([], prices);
    expect(triggered).toEqual([]);
  });

  it("skips alerts whose code is not in currentPrices", () => {
    // HPG is in alerts but not in prices map — should not trigger
    const prices = new Map([["VCB", 85_000]]); // only VCB price
    const triggered = checkPriceAlerts(baseAlerts, prices);
    expect(triggered.some((t) => t.code === "HPG")).toBe(false);
  });

  it("can trigger multiple alerts simultaneously", () => {
    const prices = new Map([
      ["VCB", 78_000],   // stop_loss triggered (below 80k)
      ["FPT", 132_000],  // take_profit triggered (above 130k)
      ["HPG", 30_000],   // stop_loss NOT triggered (above 25k)
      ["VNM", 62_000],   // take_profit triggered (above 60k)
    ]);
    const triggered = checkPriceAlerts(baseAlerts, prices);
    expect(triggered).toHaveLength(3);
    const ids = triggered.map((t) => t.alertId);
    expect(ids).toContain(1); // VCB stop_loss
    expect(ids).toContain(2); // FPT take_profit
    expect(ids).toContain(4); // VNM take_profit
    expect(ids).not.toContain(3); // HPG not triggered
  });

  it("result includes currentPrice in triggered entry", () => {
    const prices = new Map([["VCB", 78_000]]);
    const triggered = checkPriceAlerts(baseAlerts, prices);
    expect(triggered[0]!.currentPrice).toBe(78_000);
    expect(triggered[0]!.threshold).toBe(80_000);
  });

  it("handles large number of alerts efficiently", () => {
    const manyAlerts = Array.from({ length: 1000 }, (_, i) => ({
      id: i + 1,
      code: `STK${i}`,
      alertType: i % 2 === 0 ? "stop_loss" : "take_profit",
      threshold: 50_000,
    }));
    const prices = new Map<string, number>();
    // None in price map — all should be skipped
    const triggered = checkPriceAlerts(manyAlerts, prices);
    expect(triggered).toHaveLength(0);
  });

  it("returns threshold in triggered entry for verification", () => {
    const alerts = [{ id: 7, code: "VCB", alertType: "stop_loss", threshold: 80_000 }];
    const prices = new Map([["VCB", 79_000]]);
    const result = checkPriceAlerts(alerts, prices);
    expect(result[0]!.threshold).toBe(80_000);
    expect(result[0]!.currentPrice).toBe(79_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP tool registration tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 206 — MCP tool registration", () => {
  it("registerPriceAlertTools export exists", async () => {
    const mod = await import("../interface/mcp/tools/market-data/priceAlertTools.js");
    expect(typeof mod.registerPriceAlertTools).toBe("function");
  });

  it("registers 2 tools: set_price_alert, delete_price_alert (get_price_alerts merged into get_alerts per task 241)", async () => {
    const { registerPriceAlertTools } = await import(
      "../interface/mcp/tools/market-data/priceAlertTools.js"
    );
    const McpServerMod = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const server = new McpServerMod.McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerPriceAlertTools(server);
    const tools = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;
    expect(Object.keys(tools)).toContain("set_price_alert");
    expect(Object.keys(tools)).toContain("delete_price_alert");
    // get_price_alerts was merged into get_alerts in task 241 — no longer registered here
    expect(Object.keys(tools)).not.toContain("get_price_alerts");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema — price_alerts table
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 206 — price_alerts SQLite schema", () => {
  let db: import("bun:sqlite").Database;

  beforeEach(() => {
    // Use in-memory DB for isolation
    const { Database } = require("bun:sqlite");
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS price_alerts (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        code         TEXT NOT NULL,
        alert_type   TEXT NOT NULL,
        threshold    REAL NOT NULL,
        status       TEXT NOT NULL DEFAULT 'active',
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        triggered_at TEXT,
        notes        TEXT
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  it("can insert a stop_loss alert", () => {
    db.exec(
      `INSERT INTO price_alerts (code, alert_type, threshold) VALUES ('VCB', 'stop_loss', 80000)`,
    );
    const row = db
      .query<{ code: string; alert_type: string; threshold: number; status: string }, []>(
        "SELECT code, alert_type, threshold, status FROM price_alerts",
      )
      .get();
    expect(row).not.toBeNull();
    expect(row!.code).toBe("VCB");
    expect(row!.alert_type).toBe("stop_loss");
    expect(row!.threshold).toBe(80_000);
    expect(row!.status).toBe("active");
  });

  it("can insert a take_profit alert", () => {
    db.exec(
      `INSERT INTO price_alerts (code, alert_type, threshold) VALUES ('FPT', 'take_profit', 130000)`,
    );
    const row = db
      .query<{ alert_type: string }, []>(
        "SELECT alert_type FROM price_alerts",
      )
      .get();
    expect(row!.alert_type).toBe("take_profit");
  });

  it("status defaults to 'active'", () => {
    db.exec(
      `INSERT INTO price_alerts (code, alert_type, threshold) VALUES ('HPG', 'stop_loss', 25000)`,
    );
    const row = db
      .query<{ status: string }, []>("SELECT status FROM price_alerts")
      .get();
    expect(row!.status).toBe("active");
  });

  it("can update status to triggered", () => {
    db.exec(
      `INSERT INTO price_alerts (code, alert_type, threshold) VALUES ('VCB', 'stop_loss', 80000)`,
    );
    db.exec(
      `UPDATE price_alerts SET status = 'triggered', triggered_at = datetime('now') WHERE code = 'VCB'`,
    );
    const row = db
      .query<{ status: string }, []>("SELECT status FROM price_alerts")
      .get();
    expect(row!.status).toBe("triggered");
  });

  it("can delete an alert by id", () => {
    db.exec(
      `INSERT INTO price_alerts (code, alert_type, threshold) VALUES ('VCB', 'stop_loss', 80000)`,
    );
    const id = db.query<{ id: number }, []>("SELECT id FROM price_alerts").get()!.id;
    db.exec(`DELETE FROM price_alerts WHERE id = ${id}`);
    const count = db.query<{ n: number }, []>("SELECT COUNT(*) as n FROM price_alerts").get()!.n;
    expect(count).toBe(0);
  });

  it("notes column accepts optional text", () => {
    db.exec(
      `INSERT INTO price_alerts (code, alert_type, threshold, notes) VALUES ('VNM', 'take_profit', 60000, 'TP muc tieu Q2')`,
    );
    const row = db
      .query<{ notes: string | null }, []>("SELECT notes FROM price_alerts")
      .get();
    expect(row!.notes).toBe("TP muc tieu Q2");
  });
});
