/**
 * Task 1847d-D — Interface: MCP Tool Upgrades for Alert Accuracy
 *
 * Tests:
 *   1. get_alert_accuracy reads from DB outcome column when available (Path 1)
 *   2. get_alert_accuracy falls back to on-the-fly when outcome IS NULL (Path 2)
 *   3. get_alert_accuracy includes summary_by_type in response
 *   4. get_alert_accuracy includes scored_pct in response
 *   5. mark_alert_outcome writes successfully
 *   6. mark_alert_outcome is idempotent (second call returns already_scored=true)
 *   7. mark_alert_outcome rejects invalid outcome value (zod schema enforcement)
 *   8. mark_alert_outcome rejects non-existent alert_id
 *
 * All tests use in-memory SQLite via DB_PATH=:memory:.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  registerAlertAccuracyTool,
  registerMarkAlertOutcomeTool,
} from "../interface/mcp/tools/alerts/alertAccuracy.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper — invoke registered MCP tool directly (bypass SSE transport)
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

/** Parse the JSON payload from the first content item */
function parseResult(res: { content: Array<{ type: string; text: string }> }): unknown {
  return JSON.parse(res.content[0]!.text);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function insertAlert(
  id: string,
  signalType: string,
  code: string,
  outcome: string | null = null,
  daysAgo = 5,
): void {
  const db = getDb();
  const triggeredAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO alerts
      (id, triggered_at, severity, signals_json, affected_actions_json,
       message, read, notified_telegram, sent_by, outcome)
    VALUES (?, ?, 'medium', ?, ?, 'test', 0, 0, 'server', ?)
  `).run(
    id,
    triggeredAt,
    JSON.stringify([{ type: signalType }]),
    JSON.stringify([{ code }]),
    outcome,
  );
}

function insertPriceHistory(code: string, price: number, offsetHours: number): void {
  const db = getDb();
  const fetchedAt = new Date(Date.now() - offsetHours * 3_600_000).toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO market_prices_history (code, price, volume, fetched_at)
    VALUES (?, ?, 0, ?)
  `).run(code, price, fetchedAt);
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

let server: McpServer;

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  closeDb();
  await initDatabase();

  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      volume     REAL NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (code, fetched_at)
    );
    CREATE INDEX IF NOT EXISTS idx_mph_code_fetched
      ON market_prices_history(code, fetched_at DESC);
  `);

  server = new McpServer(
    { name: "test", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );
  registerAlertAccuracyTool(server);
  registerMarkAlertOutcomeTool(server);
});

afterAll(() => {
  closeDb();
});

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM alerts");
  db.exec("DELETE FROM market_prices_history");
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1847d-D — Alert Accuracy + Outcome Tools", () => {
  // ── Test 1: Path 1 — use DB outcome column ────────────────────────────────

  it("get_alert_accuracy reads from DB outcome column when available (Path 1)", async () => {
    // Insert alert pre-scored as HIT in DB
    insertAlert("alert-hit-1", "price_drop", "VNM", "HIT");
    insertAlert("alert-miss-1", "price_drop", "HPG", "MISS");

    const res = await callTool(server, "get_alert_accuracy", { days: 30 });
    const report = parseResult(res) as { hits: number; misses: number; scored_pct: number };

    // Both alerts have outcome column → Path 1 used for both
    expect(report.hits).toBe(1);
    expect(report.misses).toBe(1);
    // scored_pct = 2/2 = 100%
    expect(report.scored_pct).toBe(100);
  });

  // ── Test 2: Path 2 — on-the-fly fallback when outcome IS NULL ────────────

  it("get_alert_accuracy falls back to on-the-fly when outcome IS NULL (Path 2)", async () => {
    // Insert alert with no pre-scored outcome
    insertAlert("alert-null-1", "price_drop", "FPT", null, 5);

    // Seed price history: price at alert time + price 2 days later (dropped)
    // alert is ~5 days ago, price at alert ~5d ago, price after ~3d ago
    insertPriceHistory("FPT", 100, 5 * 24);      // at alert time
    insertPriceHistory("FPT", 95, (5 - 2) * 24); // 2 days after → drop → HIT

    const res = await callTool(server, "get_alert_accuracy", { days: 30 });
    const report = parseResult(res) as { total: number; scored_pct: number };

    // scored_pct should be 0 (no pre-scored outcomes in DB)
    expect(report.scored_pct).toBe(0);
    // total should be 1 (the alert was processed via fallback)
    expect(report.total).toBe(1);
  });

  // ── Test 3: summary_by_type present ──────────────────────────────────────

  it("get_alert_accuracy includes summary_by_type in response", async () => {
    insertAlert("a1", "price_drop", "VNM", "HIT");
    insertAlert("a2", "price_drop", "HPG", "MISS");
    insertAlert("a3", "price_surge", "FPT", "HIT");

    const res = await callTool(server, "get_alert_accuracy", { days: 30 });
    const report = parseResult(res) as {
      summary_by_type: Record<string, { hit: number; miss: number; unknown: number }>;
    };

    expect(report.summary_by_type).toBeDefined();
    // price_drop: 1 HIT, 1 MISS
    expect(report.summary_by_type["price_drop"]).toBeDefined();
    expect(report.summary_by_type["price_drop"]!.hit).toBe(1);
    expect(report.summary_by_type["price_drop"]!.miss).toBe(1);
    // price_surge: 1 HIT
    expect(report.summary_by_type["price_surge"]).toBeDefined();
    expect(report.summary_by_type["price_surge"]!.hit).toBe(1);
  });

  // ── Test 4: scored_pct reflects fraction with non-null outcome ────────────

  it("get_alert_accuracy includes scored_pct in response", async () => {
    insertAlert("scored-1", "price_drop", "VNM", "HIT");
    insertAlert("scored-2", "price_drop", "HPG", "MISS");
    insertAlert("unscored-1", "price_drop", "FPT", null); // no outcome

    const res = await callTool(server, "get_alert_accuracy", { days: 30 });
    const report = parseResult(res) as { scored_pct: number };

    // 2 out of 3 rows have outcome column → scored_pct = 67%
    // (rows.length = 3, scoredFromDb = 2, Math.round(2/3*100) = 67)
    expect(report.scored_pct).toBe(67);
  });

  // ── Test 5: mark_alert_outcome writes successfully ────────────────────────

  it("mark_alert_outcome writes successfully", async () => {
    insertAlert("target-alert", "price_drop", "VNM", null);

    const res = await callTool(server, "mark_alert_outcome", {
      alert_id: "target-alert",
      outcome: "HIT",
      detail: "Price dropped 3.2% next day",
    });
    const result = parseResult(res) as {
      success: boolean;
      outcome: string;
      already_scored: boolean;
    };

    expect(result.success).toBe(true);
    expect(result.outcome).toBe("HIT");
    expect(result.already_scored).toBe(false);

    // Verify DB was updated
    const db = getDb();
    const row = db
      .prepare<{ outcome: string; outcome_detail: string }, [string]>(
        "SELECT outcome, outcome_detail FROM alerts WHERE id = ?",
      )
      .get("target-alert");
    expect(row?.outcome).toBe("HIT");
    expect(row?.outcome_detail).toBe("Price dropped 3.2% next day");
  });

  // ── Test 6: mark_alert_outcome is idempotent ──────────────────────────────

  it("mark_alert_outcome is idempotent — second call returns already_scored=true", async () => {
    insertAlert("idempotent-alert", "price_drop", "HPG", null);

    // First call
    await callTool(server, "mark_alert_outcome", {
      alert_id: "idempotent-alert",
      outcome: "HIT",
    });

    // Second call
    const res2 = await callTool(server, "mark_alert_outcome", {
      alert_id: "idempotent-alert",
      outcome: "MISS",
    });
    const result2 = parseResult(res2) as {
      success: boolean;
      already_scored: boolean;
      outcome: string;
    };

    expect(result2.success).toBe(true);
    expect(result2.already_scored).toBe(true);
    // Outcome was overwritten to MISS on second call
    expect(result2.outcome).toBe("MISS");
  });

  // ── Test 7: mark_alert_outcome rejects invalid outcome value ─────────────

  it("mark_alert_outcome rejects invalid outcome value", async () => {
    insertAlert("valid-alert", "price_drop", "VNM", null);

    // Handler has explicit validation guard — returns error JSON
    const res = await callTool(server, "mark_alert_outcome", {
      alert_id: "valid-alert",
      outcome: "WRONG_VALUE",
    });
    const result = parseResult(res) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("WRONG_VALUE");

    // DB must NOT be updated
    const db = getDb();
    const row = db
      .prepare<{ outcome: string | null }, [string]>(
        "SELECT outcome FROM alerts WHERE id = ?",
      )
      .get("valid-alert");
    expect(row?.outcome).toBeNull();
  });

  // ── Test 8: mark_alert_outcome rejects non-existent alert_id ─────────────

  it("mark_alert_outcome rejects non-existent alert_id", async () => {
    const res = await callTool(server, "mark_alert_outcome", {
      alert_id: "does-not-exist-xyz",
      outcome: "HIT",
    });
    const result = parseResult(res) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does-not-exist-xyz");
  });
});
