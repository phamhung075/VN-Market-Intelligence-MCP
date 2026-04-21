Bun.env["DB_PATH"] = ":memory:";

/**
 * VPS Proxy Health Observability Tests
 *
 * Tests for vps_push_log table, logVpsPush, getVpsProxyHealth,
 * and the get_vps_proxy_health MCP tool.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { logVpsPush, getVpsProxyHealth, purgeOldVpsPushLogs } from "../../src/infrastructure/db/vpsPushLogStore.js";

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS vps_push_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      service      TEXT    NOT NULL,
      items_count  INTEGER NOT NULL DEFAULT 0,
      status       TEXT    NOT NULL DEFAULT 'ok',
      error_msg    TEXT,
      duration_ms  INTEGER,
      pushed_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vpl_service_ts ON vps_push_log(service, pushed_at)`);

  // Task 1566: Extended observability columns (matching production schema)
  const columns = [
    "truncation_detected",
    "schema_errors_count",
    "failed_item_indices",
    "parse_time_ms",
    "validation_time_ms",
    "db_time_ms",
    "vps_response_size_bytes",
    "circuit_breaker_state"
  ];

  for (const col of columns) {
    try {
      db.exec(`ALTER TABLE vps_push_log ADD COLUMN ${col} ${col === "failed_item_indices" || col === "circuit_breaker_state" ? "TEXT" : "INTEGER"}`);
    } catch {
      // Column may already exist in :memory: schema
    }
  }

  return db;
}

describe("VPS Proxy Health", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  test("logVpsPush inserts a row", () => {
    logVpsPush({ service: "prices", itemsCount: 76, status: "ok" }, db);
    const count = db.prepare("SELECT COUNT(*) as cnt FROM vps_push_log").get() as { cnt: number };
    expect(count.cnt).toBe(1);
  });

  test("logVpsPush records error with message", () => {
    logVpsPush({ service: "news", itemsCount: 0, status: "error", errorMsg: "timeout" }, db);
    const row = db.prepare("SELECT * FROM vps_push_log WHERE service = 'news'").get() as any;
    expect(row.status).toBe("error");
    expect(row.error_msg).toBe("timeout");
    expect(row.items_count).toBe(0);
  });

  test("getVpsProxyHealth returns all 4 services", () => {
    const health = getVpsProxyHealth(db);
    expect(health.length).toBe(4);
    expect(health.map((h) => h.service).sort()).toEqual(["bctc", "news", "prices", "sbv"]);
  });

  test("getVpsProxyHealth shows no_data when no pushes", () => {
    const health = getVpsProxyHealth(db);
    for (const s of health) {
      expect(s.lastPushAt).toBeNull();
      expect(s.lastStatus).toBe("no_data");
      expect(s.pushes24h).toBe(0);
    }
  });

  test("getVpsProxyHealth shows correct stats after pushes", () => {
    logVpsPush({ service: "prices", itemsCount: 76, status: "ok", durationMs: 150 }, db);
    logVpsPush({ service: "prices", itemsCount: 74, status: "ok", durationMs: 200 }, db);
    logVpsPush({ service: "prices", itemsCount: 0, status: "error", errorMsg: "timeout" }, db);

    const health = getVpsProxyHealth(db);
    const prices = health.find((h) => h.service === "prices")!;
    expect(prices.pushes24h).toBe(3);
    expect(prices.errors24h).toBe(1);
    expect(prices.totalItems24h).toBe(150); // 76 + 74 + 0
    expect(prices.lastStatus).toBe("error"); // most recent
  });

  test("purgeOldVpsPushLogs deletes old entries", () => {
    // Insert an old entry
    db.prepare(
      "INSERT INTO vps_push_log (service, items_count, status, pushed_at) VALUES (?, ?, ?, ?)",
    ).run("prices", 10, "ok", "2020-01-01T00:00:00");

    // Insert a recent entry
    logVpsPush({ service: "prices", itemsCount: 76, status: "ok" }, db);

    const deleted = purgeOldVpsPushLogs(30, db);
    expect(deleted).toBe(1);

    const remaining = db.prepare("SELECT COUNT(*) as cnt FROM vps_push_log").get() as { cnt: number };
    expect(remaining.cnt).toBe(1);
  });

  test("logVpsPush with duration_ms", () => {
    logVpsPush({ service: "sbv", itemsCount: 1, status: "ok", durationMs: 342 }, db);
    const row = db.prepare("SELECT duration_ms FROM vps_push_log WHERE service = 'sbv'").get() as { duration_ms: number };
    expect(row.duration_ms).toBe(342);
  });

  test("multiple services tracked independently", () => {
    logVpsPush({ service: "prices", itemsCount: 76, status: "ok" }, db);
    logVpsPush({ service: "news", itemsCount: 45, status: "ok" }, db);
    logVpsPush({ service: "sbv", itemsCount: 1, status: "ok" }, db);
    logVpsPush({ service: "bctc", itemsCount: 1, status: "ok" }, db);

    const health = getVpsProxyHealth(db);
    expect(health.find((h) => h.service === "prices")!.totalItems24h).toBe(76);
    expect(health.find((h) => h.service === "news")!.totalItems24h).toBe(45);
    expect(health.find((h) => h.service === "sbv")!.totalItems24h).toBe(1);
    expect(health.find((h) => h.service === "bctc")!.totalItems24h).toBe(1);
  });
});
