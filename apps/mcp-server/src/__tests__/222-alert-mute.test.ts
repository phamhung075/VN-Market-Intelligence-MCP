Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 222 — Alert snooze/mute
 *
 * Tests for:
 *   1. alertMuteChecker.ts  — pure domain function `isStockMuted`
 *   2. alertMuteStore.ts    — SQLite CRUD helpers (mute / unmute / list)
 *   3. alertGenerator.ts    — honours mutes when generating alerts
 *   4. alertMuteTools.ts    — MCP tool registration smoke test
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { isStockMuted } from "../domain/services/alertMuteChecker.js";
import {
  muteStock,
  unmuteStock,
  loadMutesMap,
  listMutes,
} from "../infrastructure/db/alertMuteStore.js";
import { generateAlerts } from "../domain/services/alertGenerator.js";
import type { Signal } from "../domain/services/signalDetector.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAlertMuteTools } from "../interface/mcp/tools/alerts/alertMuteTools.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  // Mirror schema.ts alert_mutes DDL (canonical in initDatabase); task 1049
  // removed the per-store ensure helper.
  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_mutes (
      code        TEXT PRIMARY KEY,
      muted_until TEXT NOT NULL,
      reason      TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_alert_mutes_until ON alert_mutes(muted_until)`);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

function makeSignal(code: string): Signal {
  return {
    type: "price_drop",
    actionCode: code,
    severity: "high",
    message: `${code} dropped 5%`,
    confidence: 0.9,
    detectedAt: new Date().toISOString(),
  };
}

const FUTURE = new Date(Date.now() + 3_600_000); // +1 hour
const PAST = new Date(Date.now() - 3_600_000);   // -1 hour

// ─────────────────────────────────────────────────────────────────────────────
// 1. isStockMuted — pure domain function
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 222 — isStockMuted (pure domain)", () => {
  it("returns false when mutes map is empty", () => {
    expect(isStockMuted("VCB", new Map())).toBe(false);
  });

  it("returns false when stock is not in mutes map", () => {
    const mutes = new Map([["FPT", FUTURE]]);
    expect(isStockMuted("VCB", mutes)).toBe(false);
  });

  it("returns true when stock is muted with future expiry", () => {
    const mutes = new Map([["VCB", FUTURE]]);
    expect(isStockMuted("VCB", mutes)).toBe(true);
  });

  it("returns false when mute has already expired", () => {
    const mutes = new Map([["VCB", PAST]]);
    expect(isStockMuted("VCB", mutes)).toBe(false);
  });

  it("is case-sensitive (VCB != vcb)", () => {
    const mutes = new Map([["VCB", FUTURE]]);
    expect(isStockMuted("vcb", mutes)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. alertMuteStore — SQLite CRUD
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 222 — alertMuteStore (infrastructure)", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("muteStock inserts a row into alert_mutes", () => {
    muteStock(db, "VCB", 24, "earnings season noise");
    const rows = listMutes(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.code).toBe("VCB");
    expect(rows[0]!.reason).toBe("earnings season noise");
  });

  it("muteStock without reason stores null", () => {
    muteStock(db, "FPT", 12);
    const rows = listMutes(db);
    expect(rows[0]!.reason).toBeNull();
  });

  it("muteStock sets muted_until approximately N hours from now", () => {
    const before = Date.now();
    muteStock(db, "VNM", 4);
    const after = Date.now();
    const rows = listMutes(db);
    const until = new Date(rows[0]!.muted_until).getTime();
    expect(until).toBeGreaterThanOrEqual(before + 4 * 3600 * 1000 - 1000);
    expect(until).toBeLessThanOrEqual(after + 4 * 3600 * 1000 + 1000);
  });

  it("muteStock replaces existing mute (upsert)", () => {
    muteStock(db, "VCB", 4);
    muteStock(db, "VCB", 48, "extended");
    const rows = listMutes(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reason).toBe("extended");
  });

  it("unmuteStock removes the row", () => {
    muteStock(db, "VCB", 24);
    unmuteStock(db, "VCB");
    expect(listMutes(db)).toHaveLength(0);
  });

  it("unmuteStock is a no-op when stock is not muted", () => {
    expect(() => unmuteStock(db, "VCB")).not.toThrow();
  });

  it("loadMutesMap returns a Map<string, Date>", () => {
    muteStock(db, "VCB", 24);
    muteStock(db, "FPT", 2);
    const map = loadMutesMap(db);
    expect(map.size).toBe(2);
    expect(map.get("VCB")).toBeInstanceOf(Date);
    expect(map.get("FPT")).toBeInstanceOf(Date);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. generateAlerts respects mutes
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 222 — generateAlerts with mutes", () => {
  it("suppresses alert for muted stock", () => {
    const signals = [makeSignal("VCB"), makeSignal("FPT")];
    const watchlist = [{ actionCode: "VCB" }, { actionCode: "FPT" }];
    const mutes = new Map([["VCB", FUTURE]]);
    const alerts = generateAlerts(signals, watchlist, mutes);
    expect(alerts.map((a) => a.actionCode)).not.toContain("VCB");
    expect(alerts.map((a) => a.actionCode)).toContain("FPT");
  });

  it("does not suppress alert for stock with expired mute", () => {
    const signals = [makeSignal("VCB")];
    const watchlist = [{ actionCode: "VCB" }];
    const mutes = new Map([["VCB", PAST]]);
    const alerts = generateAlerts(signals, watchlist, mutes);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.actionCode).toBe("VCB");
  });

  it("passes through normally when mutes map is empty", () => {
    const signals = [makeSignal("VNM")];
    const watchlist = [{ actionCode: "VNM" }];
    const alerts = generateAlerts(signals, watchlist, new Map());
    expect(alerts).toHaveLength(1);
  });

  it("backward-compatible: works without mutes argument (defaults to empty map)", () => {
    const signals = [makeSignal("VNM")];
    const watchlist = [{ actionCode: "VNM" }];
    // No third argument — should still work (no regression)
    const alerts = generateAlerts(signals, watchlist);
    expect(alerts).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. MCP tool registration smoke test
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 222 — registerAlertMuteTools", () => {
  // Updated in task 236: mute_stock_alerts + unmute_stock_alerts merged into
  // a single manage_alert_mute tool to reduce MCP surface area.
  it("registers exactly 1 unified manage_alert_mute tool on the MCP server", () => {
    const server = new McpServer(
      { name: "test", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    registerAlertMuteTools(server);
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    const names = Object.keys(tools);
    expect(names).toContain("manage_alert_mute");
    expect(names).not.toContain("mute_stock_alerts");
    expect(names).not.toContain("unmute_stock_alerts");
    expect(names).toHaveLength(1);
  });
});
