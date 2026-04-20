/**
 * Task 1110 — sent_by column on alerts table + Alert Commander filter
 *
 * Tests:
 *  1. After initDatabase(), alerts table has sent_by column with default 'server'
 *  2. New alert inserted without sent_by → defaults to 'server'
 *  3. Alert inserted with sent_by='alert-commander' → stored correctly
 *  4. get_alerts with sentBy filter returns only matching alerts
 *  5. get_alerts without sentBy filter returns all alerts (backward compatible)
 *  6. Existing rows (pre-migration) have sent_by='server' (SQLite column default)
 *  7. storeAlerts() sets sent_by='server' by default
 *  8. storeAlertsFromCommander() sets sent_by='alert-commander'
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Override DB_PATH before any import that opens the DB
Bun.env["DB_PATH"] = ":memory:";

import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { storeAlerts, storeAlertsFromCommander } from "../infrastructure/db/alertStore.js";
import { registerAlertTools } from "../interface/mcp/tools/alerts/alerts.js";
import type { Alert } from "../domain/services/alertGenerator.js";
import type { Signal } from "../domain/services/signalDetector.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSignal(): Signal {
  return {
    type: "price_drop",
    severity: "high",
    actionCode: "VCB",
    message: "price_drop signal",
    confidence: 0.9,
    detectedAt: new Date().toISOString(),
  };
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    severity: "high",
    signals: [makeSignal()],
    actionCode: "VCB",
    message: "Test alert",
    isRead: false,
    ...overrides,
  };
}

// ── setup / teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
  closeDb();
  await initDatabase();
});

afterEach(() => {
  closeDb();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("Task 1110 — sent_by column on alerts table", () => {

  it("alerts table has sent_by column after initDatabase()", async () => {
    const db = getDb();
    // PRAGMA table_info returns one row per column
    const cols = db.prepare("PRAGMA table_info(alerts)").all() as Array<{ name: string; dflt_value: string | null }>;
    const sentByCol = cols.find((c) => c.name === "sent_by");
    expect(sentByCol).toBeDefined();
    // Default value must be 'server' (SQLite stores it quoted: "'server'")
    expect(sentByCol?.dflt_value).toBe("'server'");
  });

  it("alert inserted without sent_by defaults to 'server'", async () => {
    const db = getDb();
    db.prepare(`
      INSERT INTO alerts (id, triggered_at, severity, message)
      VALUES (?, datetime('now'), 'high', 'bare insert')
    `).run("bare-1");

    const row = db.prepare("SELECT sent_by FROM alerts WHERE id = ?").get("bare-1") as { sent_by: string };
    expect(row.sent_by).toBe("server");
  });

  it("alert inserted with sent_by='alert-commander' is stored correctly", async () => {
    const db = getDb();
    db.prepare(`
      INSERT INTO alerts (id, triggered_at, severity, message, sent_by)
      VALUES (?, datetime('now'), 'high', 'commander alert', 'alert-commander')
    `).run("cmd-1");

    const row = db.prepare("SELECT sent_by FROM alerts WHERE id = ?").get("cmd-1") as { sent_by: string };
    expect(row.sent_by).toBe("alert-commander");
  });

  it("storeAlerts() sets sent_by='server'", async () => {
    const db = getDb();
    const alert = makeAlert({ id: "store-server-1" });
    storeAlerts([alert], db);

    const row = db.prepare("SELECT sent_by FROM alerts WHERE id = ?").get("store-server-1") as { sent_by: string };
    expect(row.sent_by).toBe("server");
  });

  it("storeAlertsFromCommander() sets sent_by='alert-commander'", async () => {
    const db = getDb();
    const alert = makeAlert({ id: "store-cmd-1" });
    storeAlertsFromCommander([alert], db);

    const row = db.prepare("SELECT sent_by FROM alerts WHERE id = ?").get("store-cmd-1") as { sent_by: string };
    expect(row.sent_by).toBe("alert-commander");
  });

  it("pre-migration rows receive 'server' default from column definition", async () => {
    // Simulate a pre-migration row: insert without specifying sent_by
    const db = getDb();
    db.prepare(`
      INSERT INTO alerts (id, triggered_at, severity, message)
      VALUES ('legacy-1', datetime('now'), 'info', 'legacy row')
    `).run();

    const row = db.prepare("SELECT sent_by FROM alerts WHERE id = 'legacy-1'").get() as { sent_by: string };
    // The column default 'server' is applied by SQLite automatically
    expect(row.sent_by).toBe("server");
  });

});

describe("Task 1110 — get_alerts sentBy filter", () => {

  async function buildMcpClient(): Promise<{ client: Client; server: McpServer }> {
    const server = new McpServer({ name: "test-server", version: "0.0.1" });
    registerAlertTools(server);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.1" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return { client, server };
  }

  it("get_alerts returns all alerts when sentBy filter is omitted (backward compatible)", async () => {
    const db = getDb();
    // Insert one server alert and one commander alert
    const a1 = makeAlert({ id: "ga-server-1", severity: "high" });
    const a2 = makeAlert({ id: "ga-cmd-1", severity: "high" });
    storeAlerts([a1], db);
    storeAlertsFromCommander([a2], db);

    const { client } = await buildMcpClient();
    const result = await client.callTool({ name: "get_alerts", arguments: { type: "system", limitDays: 1, limit: 50 } });
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";

    // Both alerts should appear
    expect(text).toContain("ga-server-1");
    expect(text).toContain("ga-cmd-1");
  });

  it("get_alerts with sentBy='server' returns only server alerts", async () => {
    const db = getDb();
    const a1 = makeAlert({ id: "ga-server-2", severity: "high" });
    const a2 = makeAlert({ id: "ga-cmd-2", severity: "high" });
    storeAlerts([a1], db);
    storeAlertsFromCommander([a2], db);

    const { client } = await buildMcpClient();
    const result = await client.callTool({
      name: "get_alerts",
      arguments: { type: "system", limitDays: 1, limit: 50, sentBy: "server" },
    });
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";

    expect(text).toContain("ga-server-2");
    expect(text).not.toContain("ga-cmd-2");
  });

  it("get_alerts with sentBy='alert-commander' returns only commander alerts", async () => {
    const db = getDb();
    const a1 = makeAlert({ id: "ga-server-3", severity: "high" });
    const a2 = makeAlert({ id: "ga-cmd-3", severity: "high" });
    storeAlerts([a1], db);
    storeAlertsFromCommander([a2], db);

    const { client } = await buildMcpClient();
    const result = await client.callTool({
      name: "get_alerts",
      arguments: { type: "system", limitDays: 1, limit: 50, sentBy: "alert-commander" },
    });
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";

    expect(text).not.toContain("ga-server-3");
    expect(text).toContain("ga-cmd-3");
  });

  it("get_alerts with notifiedTelegramFilter=pending returns only unnotified alerts", async () => {
    const db = getDb();
    const a1 = makeAlert({ id: "cmd-pending-abc", severity: "high" });
    const a2 = makeAlert({ id: "cmd-sent-xyz", severity: "high" });
    storeAlertsFromCommander([a1, a2], db);
    // Mark a2 as sent to Telegram
    db.prepare("UPDATE alerts SET notified_telegram = 1 WHERE id = ?").run("cmd-sent-xyz");

    const { client } = await buildMcpClient();
    const result = await client.callTool({
      name: "get_alerts",
      arguments: {
        type: "system",
        limitDays: 1,
        limit: 50,
        sentBy: "alert-commander",
        notifiedTelegramFilter: "pending",
      },
    });
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";

    expect(text).toContain("cmd-pending-abc");
    expect(text).not.toContain("cmd-sent-xyz");
  });

});
