/**
 * Task 1858c — logVpsPush fix + silent-failure hardening
 *
 * Tests:
 *  1. logVpsPush inserts a row into vps_push_log
 *  2. logVpsPush with all optional fields
 *  3. logVpsPush survives a bad DB gracefully (no unhandled throw)
 *  4. safeLogVpsPush wrapper never throws even when DB is closed
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import {
  logVpsPush,
  safeLogVpsPush,
} from "../infrastructure/db/vpsPushLogStore.js";

function makeMemDb(): Database {
  return new Database(":memory:");
}

describe("Task 1858c — logVpsPush", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    db = makeMemDb();
    await initDatabase(db);
  });

  it("inserts a basic ok entry", () => {
    logVpsPush({ service: "news", itemsCount: 205, status: "ok" }, db);

    const row = db
      .query("SELECT * FROM vps_push_log WHERE service = 'news' LIMIT 1")
      .get() as Record<string, unknown> | null;

    expect(row).not.toBeNull();
    expect(row!["service"]).toBe("news");
    expect(row!["items_count"]).toBe(205);
    expect(row!["status"]).toBe("ok");
    expect(row!["error_msg"]).toBeNull();
  });

  it("inserts an error entry with errorMsg", () => {
    logVpsPush(
      { service: "news", itemsCount: 0, status: "error", errorMsg: "timeout" },
      db,
    );

    const row = db
      .query("SELECT * FROM vps_push_log WHERE status = 'error' LIMIT 1")
      .get() as Record<string, unknown> | null;

    expect(row).not.toBeNull();
    expect(row!["error_msg"]).toBe("timeout");
  });

  it("inserts entry with all extended fields", () => {
    logVpsPush(
      {
        service: "news",
        itemsCount: 100,
        status: "ok",
        durationMs: 350,
        truncationDetected: true,
        schemaErrorsCount: 2,
        failedItemIndices: "[1,3]",
        parseTimeMs: 50,
        validationTimeMs: 80,
        dbTimeMs: 120,
        vpsResponseSizeBytes: 40960,
        circuitBreakerState: "closed",
      },
      db,
    );

    const row = db
      .query("SELECT * FROM vps_push_log LIMIT 1")
      .get() as Record<string, unknown> | null;

    expect(row!["duration_ms"]).toBe(350);
    expect(row!["truncation_detected"]).toBe(1); // SQLite stores boolean as 1/0
    expect(row!["schema_errors_count"]).toBe(2);
    expect(row!["failed_item_indices"]).toBe("[1,3]");
    expect(row!["parse_time_ms"]).toBe(50);
    expect(row!["validation_time_ms"]).toBe(80);
    expect(row!["db_time_ms"]).toBe(120);
    expect(row!["vps_response_size_bytes"]).toBe(40960);
    expect(row!["circuit_breaker_state"]).toBe("closed");
  });

  it("safeLogVpsPush does not throw when DB is closed", () => {
    const badDb = makeMemDb();
    badDb.close(); // closed — any write will throw

    // Must not propagate the error
    expect(() =>
      safeLogVpsPush(
        { service: "news", itemsCount: 5, status: "ok" },
        badDb,
      ),
    ).not.toThrow();
  });

  it("safeLogVpsPush inserts normally when DB is healthy", () => {
    safeLogVpsPush({ service: "sbv", itemsCount: 1, status: "ok" }, db);

    const row = db
      .query("SELECT * FROM vps_push_log WHERE service = 'sbv' LIMIT 1")
      .get() as Record<string, unknown> | null;

    expect(row).not.toBeNull();
    expect(row!["items_count"]).toBe(1);
  });
});
