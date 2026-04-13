/**
 * Task 1144 — GET /api/foreign-flow-status diagnostic endpoint
 *
 * Tests verify:
 * 1. 401 when no API key
 * 2. 200 + null lastPushSummary when no push has occurred
 * 3. configuredFields defaults from Bun.env (fbuyVol, fsellVol, currentRoom)
 * 4. lastPushSummary.itemCount when vps_push_log has rows for service='foreign-flow'
 * 5. staleSince when last push > 48h ago
 * 6. staleSince=null when last push is recent
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { buildForeignFlowStatusResponse } from "../interface/mcp/foreignFlowStatusHandler.js";

// ─── In-memory DB helpers ────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS vps_push_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      service     TEXT    NOT NULL,
      items_count INTEGER NOT NULL DEFAULT 0,
      status      TEXT    NOT NULL DEFAULT 'ok',
      error_msg   TEXT,
      duration_ms INTEGER,
      pushed_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      code            TEXT NOT NULL,
      date            TEXT NOT NULL,
      foreign_volume  REAL,
      foreign_room    REAL,
      holding_ratio   REAL,
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (code, date)
    );
  `);
  return db;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Task 1144 — GET /api/foreign-flow-status", () => {
  it("returns 401 when no API key provided", async () => {
    const db = makeDb();
    const result = buildForeignFlowStatusResponse({
      db,
      apiKey: "secret",
      requestApiKey: undefined,
      envOverride: {},
    });
    expect(result.status).toBe(401);
    expect((result.body as { error: string }).error).toBe("Unauthorized");
  });

  it("returns 401 when wrong API key provided", async () => {
    const db = makeDb();
    const result = buildForeignFlowStatusResponse({
      db,
      apiKey: "secret",
      requestApiKey: "wrong-key",
      envOverride: {},
    });
    expect(result.status).toBe(401);
  });

  it("returns 200 with null lastPushSummary when no push has occurred", () => {
    const db = makeDb();
    const result = buildForeignFlowStatusResponse({
      db,
      apiKey: "secret",
      requestApiKey: "secret",
      envOverride: {},
    });
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.lastPushSummary).toBeNull();
    expect(body.tableRowCount).toBe(0);
    expect(body.staleSince).toBeNull();
  });

  it("returns configuredFields with defaults (fbuyVol, fsellVol, currentRoom) when env vars absent", () => {
    const db = makeDb();
    const result = buildForeignFlowStatusResponse({
      db,
      apiKey: "secret",
      requestApiKey: "secret",
      envOverride: {
        FOREIGN_FLOW_FBUY_FIELD: undefined,
        FOREIGN_FLOW_FSELL_FIELD: undefined,
        FOREIGN_FLOW_FROOM_FIELD: undefined,
      },
    });
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    const fields = body.configuredFields as Record<string, string>;
    expect(fields.fbuyField).toBe("fbuyVol");
    expect(fields.fsellField).toBe("fsellVol");
    expect(fields.roomField).toBe("currentRoom");
  });

  it("returns configuredFields from env overrides when provided", () => {
    const db = makeDb();
    const result = buildForeignFlowStatusResponse({
      db,
      apiKey: "secret",
      requestApiKey: "secret",
      envOverride: {
        FOREIGN_FLOW_FBUY_FIELD: "buyVol",
        FOREIGN_FLOW_FSELL_FIELD: "sellVol",
        FOREIGN_FLOW_FROOM_FIELD: "roomVol",
      },
    });
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    const fields = body.configuredFields as Record<string, string>;
    expect(fields.fbuyField).toBe("buyVol");
    expect(fields.fsellField).toBe("sellVol");
    expect(fields.roomField).toBe("roomVol");
  });

  it("returns lastPushSummary.itemCount when vps_push_log has rows for service='foreign-flow'", () => {
    const db = makeDb();
    // Insert a recent push log row
    db.prepare(
      `INSERT INTO vps_push_log (service, items_count, status, pushed_at)
       VALUES (?, ?, ?, ?)`,
    ).run("foreign-flow", 42, "ok", new Date().toISOString());

    const result = buildForeignFlowStatusResponse({
      db,
      apiKey: "secret",
      requestApiKey: "secret",
      envOverride: {},
    });
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    const summary = body.lastPushSummary as Record<string, unknown> | null;
    expect(summary).not.toBeNull();
    expect(summary!.itemCount).toBe(42);
  });

  it("returns staleSince when last push > 48h ago", () => {
    const db = makeDb();
    // Insert a push log row that is 72h old
    const old72h = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO vps_push_log (service, items_count, status, pushed_at)
       VALUES (?, ?, ?, ?)`,
    ).run("foreign-flow", 10, "ok", old72h);

    const result = buildForeignFlowStatusResponse({
      db,
      apiKey: "secret",
      requestApiKey: "secret",
      envOverride: {},
    });
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.staleSince).not.toBeNull();
    expect(typeof body.staleSince).toBe("string");
  });

  it("returns staleSince=null when last push is recent (within 48h)", () => {
    const db = makeDb();
    // Insert a push log row from 1h ago
    const recent = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO vps_push_log (service, items_count, status, pushed_at)
       VALUES (?, ?, ?, ?)`,
    ).run("foreign-flow", 100, "ok", recent);

    const result = buildForeignFlowStatusResponse({
      db,
      apiKey: "secret",
      requestApiKey: "secret",
      envOverride: {},
    });
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.staleSince).toBeNull();
  });

  it("includes sampleRow from vnstock_trading_stats when foreign_volume != 0", () => {
    const db = makeDb();
    // Insert a push log row
    db.prepare(
      `INSERT INTO vps_push_log (service, items_count, status, pushed_at)
       VALUES (?, ?, ?, ?)`,
    ).run("foreign-flow", 1, "ok", new Date().toISOString());
    // Insert a trading stats row with foreign volume
    db.prepare(
      `INSERT INTO vnstock_trading_stats (code, date, foreign_volume, foreign_room, holding_ratio, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("VNM", "2026-04-12", 500000, 1000000, 0.45, new Date().toISOString());

    const result = buildForeignFlowStatusResponse({
      db,
      apiKey: "secret",
      requestApiKey: "secret",
      envOverride: {},
    });
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    const summary = body.lastPushSummary as Record<string, unknown> | null;
    expect(summary).not.toBeNull();
    const sampleRow = summary!.sampleRow as Record<string, unknown> | null;
    expect(sampleRow).not.toBeNull();
    expect(sampleRow!.code).toBe("VNM");
  });
});
