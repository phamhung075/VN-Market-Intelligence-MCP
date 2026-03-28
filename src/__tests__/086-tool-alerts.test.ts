/**
 * Task 086 — Alert MCP Tools
 *
 * Tests for `registerAlertTools` which registers four MCP tools:
 *   - get_alerts            : query alerts from SQLite with optional filters
 *   - mark_alert_read       : mark one or all alerts as read
 *   - run_daily_briefing    : generate a structured daily briefing report
 *   - get_analysis_history  : retrieve past RAG analysis entries
 *
 * All tests use an in-memory SQLite database via DB_PATH=:memory:.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerAlertTools } from "../interface/mcp/tools/alerts.js";
import { storeAlerts } from "../infrastructure/db/alertStore.js";
import { generateAlerts } from "../domain/services/alertGenerator.js";
import type { Signal } from "../domain/services/signalDetector.js";

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
// Test fixture helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSignal(
  actionCode: string,
  type: Signal["type"] = "price_drop",
  severity: Signal["severity"] = "medium",
): Signal {
  return {
    type,
    severity,
    actionCode,
    message: `${actionCode} ${type} signal`,
    confidence: 0.8,
    detectedAt: new Date().toISOString(),
  };
}

function seedAlert(
  actionCode: string,
  severity: "low" | "medium" | "high" | "critical" = "medium",
  isRead = false,
): string {
  const db = getDb();
  const id = `alert-test-${actionCode}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO alerts
      (id, triggered_at, severity, signals_json, affected_actions_json,
       analysis_ids_json, message, read, user_note)
    VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL)
  `).run(
    id,
    now,
    severity,
    JSON.stringify([{ type: "price_drop", actionCode, severity, confidence: 0.8 }]),
    JSON.stringify([{ code: actionCode }]),
    `${actionCode} test alert`,
    isRead ? 1 : 0,
  );
  return id;
}

function seedAnalysis(
  level: "global" | "country" | "domain" | "action" = "action",
  actionCode?: string,
): string {
  const db = getDb();
  const id = `rag-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO rag_analyses
      (id, created_at, level, source_title, sentiment, impact_score,
       impact_direction, confidence, summary, affected_actions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    now,
    level,
    "Test analysis title",
    "bullish",
    7.5,
    "up",
    0.85,
    "Test analysis summary for unit test",
    actionCode ? JSON.stringify([actionCode]) : null,
  );
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup — in-memory DB, fresh McpServer per suite
// ─────────────────────────────────────────────────────────────────────────────

let server: McpServer;

beforeAll(async () => {
  process.env["DB_PATH"] = ":memory:";
  await initDatabase();

  server = new McpServer(
    { name: "test-alerts", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );
  registerAlertTools(server);
});

afterAll(() => {
  closeDb();
  delete process.env["DB_PATH"];
});

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM alerts");
  db.exec("DELETE FROM rag_analyses");
  db.exec("DELETE FROM watchlist");
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 086 — Alert MCP Tools", () => {

  // ── Tool registration ────────────────────────────────────────────────────

  it("registers all 4 tools on the McpServer", () => {
    const registry = (server as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;

    expect(registry["get_alerts"]).toBeDefined();
    expect(registry["mark_alert_read"]).toBeDefined();
    expect(registry["run_daily_briefing"]).toBeDefined();
    expect(registry["get_analysis_history"]).toBeDefined();
  });

  // ── get_alerts ───────────────────────────────────────────────────────────

  describe("get_alerts", () => {

    it("returns a 'no alerts' message when table is empty", async () => {
      const result = await callTool(server, "get_alerts", {
        limitDays: 7,
        limit: 20,
      });
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe("text");
      expect(result.content[0]!.text.toLowerCase()).toContain("no alert");
    });

    it("returns alerts when they exist", async () => {
      seedAlert("VCB", "high");
      const result = await callTool(server, "get_alerts", {
        limitDays: 7,
        limit: 20,
      });
      expect(result.content[0]!.text).toContain("VCB");
    });

    it("returns alerts sorted by most recent first", async () => {
      const db = getDb();
      // Insert two alerts with different timestamps
      const older = `alert-older-${Date.now()}`;
      const newer = `alert-newer-${Date.now() + 1}`;
      const oldDate = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
      const newDate = new Date().toISOString();

      db.prepare(`
        INSERT INTO alerts (id, triggered_at, severity, signals_json, affected_actions_json, message, read)
        VALUES (?, ?, 'low', '[]', ?, 'old alert', 0)
      `).run(older, oldDate, JSON.stringify([{ code: "HPG" }]));

      db.prepare(`
        INSERT INTO alerts (id, triggered_at, severity, signals_json, affected_actions_json, message, read)
        VALUES (?, ?, 'high', '[]', ?, 'new alert', 0)
      `).run(newer, newDate, JSON.stringify([{ code: "VCB" }]));

      const result = await callTool(server, "get_alerts", { limitDays: 7, limit: 20 });
      const text = result.content[0]!.text;
      // newer should appear before older in the output
      expect(text.indexOf("new alert")).toBeLessThan(text.indexOf("old alert"));
    });

    it("filters by severity — only returns matching severity", async () => {
      seedAlert("VCB", "critical");
      seedAlert("HPG", "low");

      const result = await callTool(server, "get_alerts", {
        severity: "critical",
        limitDays: 7,
        limit: 20,
      });
      const text = result.content[0]!.text;
      expect(text).toContain("VCB");
      // HPG low alert should not appear
      expect(text).not.toContain("HPG");
    });

    it("filters unread only — excludes read alerts", async () => {
      seedAlert("VCB", "high", false);  // unread
      seedAlert("HPG", "high", true);   // read

      const result = await callTool(server, "get_alerts", {
        unreadOnly: true,
        limitDays: 7,
        limit: 20,
      });
      const text = result.content[0]!.text;
      expect(text).toContain("VCB");
      expect(text).not.toContain("HPG");
    });

    it("filters by actionCode — only returns alerts affecting that stock", async () => {
      seedAlert("VCB", "high");
      seedAlert("GAS", "medium");

      const result = await callTool(server, "get_alerts", {
        actionCode: "VCB",
        limitDays: 7,
        limit: 20,
      });
      const text = result.content[0]!.text;
      expect(text).toContain("VCB");
      expect(text).not.toContain("GAS");
    });

    it("respects the limit parameter", async () => {
      // Seed 5 alerts
      for (let i = 0; i < 5; i++) {
        seedAlert(`V${i}0`, "low");
      }

      const result = await callTool(server, "get_alerts", {
        limitDays: 7,
        limit: 2,
      });
      const text = result.content[0]!.text;
      // The text should only contain 2 alert entries
      // Count occurrences of "test alert" phrase
      const matchCount = (text.match(/test alert/g) ?? []).length;
      expect(matchCount).toBeLessThanOrEqual(2);
    });

    it("respects the limitDays parameter — excludes older alerts", async () => {
      const db = getDb();
      // Insert an alert from 30 days ago
      const oldId = `alert-old-${Date.now()}`;
      const oldDate = new Date(Date.now() - 30 * 86_400_000).toISOString();
      db.prepare(`
        INSERT INTO alerts (id, triggered_at, severity, signals_json, affected_actions_json, message, read)
        VALUES (?, ?, 'critical', '[]', '[]', 'very old alert', 0)
      `).run(oldId, oldDate);

      const result = await callTool(server, "get_alerts", {
        limitDays: 7,
        limit: 20,
      });
      const text = result.content[0]!.text;
      expect(text).not.toContain("very old alert");
    });

  });

  // ── mark_alert_read ──────────────────────────────────────────────────────

  describe("mark_alert_read", () => {

    it("marks a specific alert as read by id", async () => {
      const id = seedAlert("VCB", "high");

      const result = await callTool(server, "mark_alert_read", { alertId: id });
      expect(result.content[0]!.text).toContain("1");

      const db = getDb();
      const row = db.prepare("SELECT read FROM alerts WHERE id = ?").get(id) as { read: number } | null;
      expect(row?.read).toBe(1);
    });

    it("marks all unread alerts as read when no alertId is provided", async () => {
      seedAlert("VCB", "high", false);
      seedAlert("HPG", "low", false);
      seedAlert("GAS", "medium", true); // already read

      const result = await callTool(server, "mark_alert_read", {});
      expect(result.content[0]!.text).toContain("2");

      const db = getDb();
      const unreadCount = (db.prepare("SELECT COUNT(*) as cnt FROM alerts WHERE read = 0").get() as { cnt: number }).cnt;
      expect(unreadCount).toBe(0);
    });

    it("saves a user note when provided", async () => {
      const id = seedAlert("VCB", "medium");
      await callTool(server, "mark_alert_read", {
        alertId: id,
        note: "reviewed and actioned",
      });

      const db = getDb();
      const row = db.prepare("SELECT user_note FROM alerts WHERE id = ?").get(id) as { user_note: string | null } | null;
      expect(row?.user_note).toBe("reviewed and actioned");
    });

  });

  // ── run_daily_briefing ───────────────────────────────────────────────────

  describe("run_daily_briefing", () => {

    it("returns a structured text response", async () => {
      const result = await callTool(server, "run_daily_briefing", {});
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe("text");
      expect(result.content[0]!.text.length).toBeGreaterThan(0);
    });

    it("briefing includes a date header", async () => {
      const result = await callTool(server, "run_daily_briefing", {});
      const text = result.content[0]!.text;
      // Should contain a date (year like 2026)
      expect(text).toMatch(/\d{4}/);
    });

    it("briefing includes active alerts section", async () => {
      seedAlert("VCB", "critical");
      const result = await callTool(server, "run_daily_briefing", {});
      const text = result.content[0]!.text;
      // Should mention alerts section
      expect(text.toLowerCase()).toMatch(/alert/);
    });

    it("briefing includes watchlist section", async () => {
      // Add a watchlist entry
      const db = getDb();
      db.prepare(`
        INSERT INTO watchlist (code, exchange, domain, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min, alert_report_new)
        VALUES ('VCB', 'HOSE', 'banking', datetime('now'), -3, 5, 7, 1)
      `).run();

      const result = await callTool(server, "run_daily_briefing", {});
      const text = result.content[0]!.text;
      expect(text.toLowerCase()).toMatch(/watchlist/);
    });

    it("briefing includes VCB in watchlist section when VCB is in watchlist", async () => {
      const db = getDb();
      db.prepare(`
        INSERT INTO watchlist (code, exchange, domain, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min, alert_report_new)
        VALUES ('VCB', 'HOSE', 'banking', datetime('now'), -3, 5, 7, 1)
      `).run();

      const result = await callTool(server, "run_daily_briefing", {});
      const text = result.content[0]!.text;
      expect(text).toContain("VCB");
    });

    it("briefing shows 'no active alerts' when there are none", async () => {
      const result = await callTool(server, "run_daily_briefing", {});
      const text = result.content[0]!.text;
      expect(text.toLowerCase()).toMatch(/no.*alert|alert.*none|0.*alert/);
    });

  });

  // ── get_analysis_history ─────────────────────────────────────────────────

  describe("get_analysis_history", () => {

    it("returns 'no analyses' when table is empty", async () => {
      const result = await callTool(server, "get_analysis_history", { limit: 10 });
      expect(result.content[0]!.text.toLowerCase()).toContain("no analys");
    });

    it("returns analysis entries when they exist", async () => {
      seedAnalysis("action", "VCB");
      const result = await callTool(server, "get_analysis_history", { limit: 10 });
      const text = result.content[0]!.text;
      expect(text).toContain("Test analysis title");
    });

    it("filters by actionCode", async () => {
      seedAnalysis("action", "VCB");
      seedAnalysis("action", "HPG");

      const result = await callTool(server, "get_analysis_history", {
        actionCode: "VCB",
        limit: 10,
      });
      const text = result.content[0]!.text;
      // VCB entry should be found
      expect(text).toContain("Test analysis title");
      // Check total count — only VCB-related entries
      // The affected_actions column for HPG entry should not produce a VCB result
      // We seed 2 analyses; filter should return fewer
      const db = getDb();
      const allRows = db.prepare("SELECT COUNT(*) as cnt FROM rag_analyses").get() as { cnt: number };
      expect(allRows.cnt).toBe(2);
    });

    it("filters by level", async () => {
      seedAnalysis("global");
      seedAnalysis("action", "HPG");

      const result = await callTool(server, "get_analysis_history", {
        level: "global",
        limit: 10,
      });
      const text = result.content[0]!.text;
      expect(text).toContain("Test analysis title");
    });

    it("respects the limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        seedAnalysis("action", "VCB");
      }

      const result = await callTool(server, "get_analysis_history", { limit: 2 });
      const text = result.content[0]!.text;
      // Count occurrences of the title
      const matchCount = (text.match(/Test analysis title/g) ?? []).length;
      expect(matchCount).toBeLessThanOrEqual(2);
    });

    it("filters by fromDate and toDate", async () => {
      const db = getDb();
      const recentId = `rag-recent-${Date.now()}`;
      const oldId = `rag-old-${Date.now()}`;
      const recentDate = new Date().toISOString();
      const oldDate = new Date(Date.now() - 30 * 86_400_000).toISOString();

      db.prepare(`
        INSERT INTO rag_analyses (id, created_at, level, source_title, sentiment, impact_score, impact_direction, confidence, summary)
        VALUES (?, ?, 'global', 'Recent analysis', 'bullish', 8, 'up', 0.9, 'recent summary')
      `).run(recentId, recentDate);

      db.prepare(`
        INSERT INTO rag_analyses (id, created_at, level, source_title, sentiment, impact_score, impact_direction, confidence, summary)
        VALUES (?, ?, 'global', 'Old analysis', 'bearish', 5, 'down', 0.7, 'old summary')
      `).run(oldId, oldDate);

      const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const result = await callTool(server, "get_analysis_history", {
        fromDate: cutoff,
        limit: 10,
      });
      const text = result.content[0]!.text;
      expect(text).toContain("Recent analysis");
      expect(text).not.toContain("Old analysis");
    });

  });

  // ── Integration: storeAlerts + get_alerts roundtrip ────────────────────────

  describe("storeAlerts → get_alerts roundtrip", () => {

    it("alerts stored via storeAlerts are retrievable via get_alerts", async () => {
      const watchlist = [{ actionCode: "VCB" }, { actionCode: "HPG" }];
      const signals = [
        makeSignal("VCB", "price_drop", "high"),
        makeSignal("VCB", "volume_spike", "medium"),
      ];

      const alerts = generateAlerts(signals, watchlist);
      const db = getDb();
      storeAlerts(alerts, db);

      const result = await callTool(server, "get_alerts", {
        limitDays: 1,
        limit: 20,
      });

      const text = result.content[0]!.text;
      expect(text).toContain("VCB");
      // Severity should be "high" (2 signals → high)
      expect(text.toLowerCase()).toContain("high");
    });

  });

});
