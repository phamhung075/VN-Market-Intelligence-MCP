Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 236 — Merge alert mute 2→1 (manage_alert_mute)
 *
 * Tests for the new unified `manage_alert_mute` MCP tool that replaces
 * the two separate `mute_stock_alerts` and `unmute_stock_alerts` tools.
 *
 * Acceptance criteria:
 *   1. manage_alert_mute action="mute" creates a mute entry in the DB
 *   2. manage_alert_mute action="unmute" removes the mute entry
 *   3. Old tool names (mute_stock_alerts, unmute_stock_alerts) are NOT registered
 *   4. Default hours is 24 when action="mute" and hours is not provided
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  muteStock,
  listMutes,
} from "../infrastructure/db/alertMuteStore.js";
import { registerAlertMuteTools } from "../interface/mcp/tools/alerts/alertMuteTools.js";

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
  return db;
}

function getRegisteredToolNames(server: McpServer): string[] {
  const tools = (
    server as unknown as { _registeredTools: Record<string, unknown> }
  )._registeredTools;
  return Object.keys(tools ?? {});
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Tool registration — correct names
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 236 — manage_alert_mute tool registration", () => {
  it("registers exactly 1 tool named manage_alert_mute", () => {
    const server = new McpServer(
      { name: "test", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    registerAlertMuteTools(server);
    const names = getRegisteredToolNames(server);
    expect(names).toContain("manage_alert_mute");
    expect(names).toHaveLength(1);
  });

  it("does NOT register old mute_stock_alerts tool", () => {
    const server = new McpServer(
      { name: "test", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    registerAlertMuteTools(server);
    const names = getRegisteredToolNames(server);
    expect(names).not.toContain("mute_stock_alerts");
  });

  it("does NOT register old unmute_stock_alerts tool", () => {
    const server = new McpServer(
      { name: "test", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    registerAlertMuteTools(server);
    const names = getRegisteredToolNames(server);
    expect(names).not.toContain("unmute_stock_alerts");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. action="mute" — creates a mute entry
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 236 — manage_alert_mute action=mute (store layer)", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });
  afterEach(() => {
    db.close();
  });

  it("muteStock with hours=24 creates a row with correct expiry (default hours)", () => {
    const before = Date.now();
    muteStock(db, "VCB", 24);
    const after = Date.now();
    const rows = listMutes(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.code).toBe("VCB");
    const until = new Date(rows[0]!.muted_until).getTime();
    // Should be ~24 hours from now
    expect(until).toBeGreaterThanOrEqual(before + 24 * 3600 * 1000 - 1000);
    expect(until).toBeLessThanOrEqual(after + 24 * 3600 * 1000 + 1000);
  });

  it("muteStock with hours=48 creates a row with 48h expiry", () => {
    const before = Date.now();
    muteStock(db, "FPT", 48, "extended noise");
    const after = Date.now();
    const rows = listMutes(db);
    expect(rows[0]!.code).toBe("FPT");
    expect(rows[0]!.reason).toBe("extended noise");
    const until = new Date(rows[0]!.muted_until).getTime();
    expect(until).toBeGreaterThanOrEqual(before + 48 * 3600 * 1000 - 1000);
    expect(until).toBeLessThanOrEqual(after + 48 * 3600 * 1000 + 1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. action="unmute" — removes mute entry
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 236 — manage_alert_mute action=unmute (store layer)", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });
  afterEach(() => {
    db.close();
  });

  it("unmuteStock removes an existing row", () => {
    muteStock(db, "VNM", 24);
    expect(listMutes(db)).toHaveLength(1);
    // Import unmuteStock directly to verify the store-level operation
    const { unmuteStock } = require("../infrastructure/db/alertMuteStore.js");
    unmuteStock(db, "VNM");
    expect(listMutes(db)).toHaveLength(0);
  });

  it("unmuteStock is safe when stock was never muted", () => {
    const { unmuteStock } = require("../infrastructure/db/alertMuteStore.js");
    expect(() => unmuteStock(db, "NOTMUTED")).not.toThrow();
    expect(listMutes(db)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Default hours = 24 (documented in schema)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 236 — default hours is 24", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });
  afterEach(() => {
    db.close();
  });

  it("muteStock() with no hours argument defaults to 24 hours", () => {
    const before = Date.now();
    muteStock(db, "VEA"); // no hours argument
    const after = Date.now();
    const rows = listMutes(db);
    const until = new Date(rows[0]!.muted_until).getTime();
    // Default = 24 hours
    expect(until).toBeGreaterThanOrEqual(before + 24 * 3600 * 1000 - 1000);
    expect(until).toBeLessThanOrEqual(after + 24 * 3600 * 1000 + 1000);
  });
});
