Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 267 — MCP Tool Tests: get_crisis_early_warning
 *
 * Tests the crisisTools MCP tool registration and behavior:
 * 1. Tool is registered on the server
 * 2. Returns active crisis indicators for watchlist stocks
 * 3. Returns reputation scores for watchlist stocks
 * 4. Handles empty DB gracefully
 * 5. Tool returns correct content format
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { recordMention } from "../infrastructure/db/mentionVelocityStore.js";
import { saveReputation } from "../infrastructure/db/reputationStore.js";
import { registerCrisisTools } from "../interface/mcp/tools/sector/crisisTools.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

let db: Database;

beforeEach(async () => {
  closeDb();
  await initDatabase();
  db = getDb();
  // Ensure watchlist table exists (not created by initDatabase — create inline)
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY, company_name TEXT, exchange TEXT NOT NULL,
      domain TEXT NOT NULL DEFAULT 'other', notes TEXT, added_at TEXT NOT NULL,
      alert_drop_pct REAL NOT NULL DEFAULT -3, alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7, alert_report_new INTEGER NOT NULL DEFAULT 1
    );
  `);
});


// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 267 — MCP Tool: get_crisis_early_warning", () => {
  it("registerCrisisTools registers the tool on McpServer", () => {
    const server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerCrisisTools(server, db);
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect(tools).toHaveProperty("get_crisis_early_warning");
  });

  it("returns crisis indicators section in output", async () => {
    // Seed velocity data: VNM with high mentions
    const hour = new Date();
    hour.setMinutes(0, 0, 0);
    recordMention(db, {
      code: "VNM",
      hour: hour.toISOString(),
      mentionCount: 15,
      negativeCount: 10,
      sourceCount: 3,
    });
    db.prepare(`INSERT INTO watchlist (code, exchange, domain, added_at) VALUES (?, ?, ?, ?)`).run("VNM", "HOSE", "consumer_goods", new Date().toISOString());

    const { getCrisisEarlyWarning } = await import("../application/usecases/getCrisisEarlyWarning.js");
    const result = await getCrisisEarlyWarning(db, ["VNM"]);
    expect(result).toHaveProperty("crisisIndicators");
    expect(result).toHaveProperty("reputationScores");
    expect(Array.isArray(result.crisisIndicators)).toBe(true);
    expect(Array.isArray(result.reputationScores)).toBe(true);
  });

  it("returns empty arrays for stock with no crisis data", async () => {
    const { getCrisisEarlyWarning } = await import("../application/usecases/getCrisisEarlyWarning.js");
    const result = await getCrisisEarlyWarning(db, ["VNM"]);
    expect(result.crisisIndicators).toHaveLength(0);
    expect(result.reputationScores).toHaveLength(0);
  });

  it("includes reputation warnings when score < 50", async () => {
    const today = new Date().toISOString().slice(0, 10);
    saveReputation(db, {
      stockCode: "VNM",
      score: 35,
      riskLevel: "warning",
      trend: "deteriorating",
      computedAt: new Date().toISOString(),
    }, today);
    const { getCrisisEarlyWarning } = await import("../application/usecases/getCrisisEarlyWarning.js");
    const result = await getCrisisEarlyWarning(db, ["VNM"]);
    expect(result.reputationScores.length).toBeGreaterThanOrEqual(1);
    const vnmRep = result.reputationScores.find((r) => r.stockCode === "VNM");
    expect(vnmRep).toBeDefined();
    expect(vnmRep!.score).toBe(35);
  });

  it("tool content array follows MCP format", async () => {
    const { formatCrisisWarningOutput } = await import("../application/usecases/getCrisisEarlyWarning.js");
    const output = formatCrisisWarningOutput({
      crisisIndicators: [],
      reputationScores: [],
    });
    expect(Array.isArray(output)).toBe(true);
    expect(output[0]).toHaveProperty("type", "text");
    expect(output[0]).toHaveProperty("text");
  });
});
