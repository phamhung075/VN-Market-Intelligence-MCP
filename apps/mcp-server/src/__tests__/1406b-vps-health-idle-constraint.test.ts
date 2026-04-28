/**
 * Task 1406b — Regression: vps_service_health CHECK constraint must include 'idle'
 *
 * Root cause: vpsHealthPoller returns 'idle' for market-hours-only services
 * (vn-price-fetch, vn-foreign-flow) when the VN market is closed.  The old
 * CHECK constraint only allowed ('healthy','unhealthy','unreachable'), so every
 * off-market-hours poll produced a SQLiteError CHECK constraint failure that was
 * silently swallowed — 50 invisible errors every 8h.
 *
 * Fix: schema-system.ts now includes 'idle' in the CHECK and carries a
 * migration guard that recreates the table on existing deployments where the
 * old constraint is present.
 *
 * REG-1: INSERT with health_status='idle' succeeds (the bug case)
 * REG-2: INSERT with each of 'healthy'/'unhealthy'/'unreachable' still succeeds
 * REG-3: INSERT with an invalid value ('offline') is rejected by the CHECK
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, closeDb, getDb } from "../infrastructure/db/schema.js";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Insert a single row into vps_service_health and return the row-id. */
function insertHealthRow(db: Database, healthStatus: string): number {
  const stmt = db.prepare(`
    INSERT INTO vps_service_health
      (service_name, polled_at, health_status, response_time_ms)
    VALUES ('vn-price-fetch', datetime('now'), ?, 0)
  `);
  const result = stmt.run(healthStatus);
  return Number(result.lastInsertRowid);
}

// ── suite ────────────────────────────────────────────────────────────────────

describe("Task 1406 — vps_service_health CHECK constraint includes 'idle'", () => {
  beforeEach(async () => {
    Bun.env["DB_PATH"] = ":memory:";
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  // REG-1: the bug: 'idle' was rejected before this fix
  it("REG-1: INSERT with health_status='idle' succeeds (off-market-hours case)", () => {
    const db = getDb();
    let rowId: number;
    expect(() => {
      rowId = insertHealthRow(db, "idle");
    }).not.toThrow();

    const row = db
      .query<{ health_status: string }, []>(
        "SELECT health_status FROM vps_service_health WHERE id = last_insert_rowid()",
      )
      .get();
    expect(row?.health_status).toBe("idle");
  });

  // REG-2: existing valid values must continue to work
  it("REG-2: INSERT with 'healthy', 'unhealthy', 'unreachable' all succeed", () => {
    const db = getDb();
    const validStatuses = ["healthy", "unhealthy", "unreachable"] as const;

    for (const status of validStatuses) {
      expect(
        () => insertHealthRow(db, status),
        `expected '${status}' to be accepted`,
      ).not.toThrow();
    }

    const count = db
      .query<{ c: number }, []>(
        "SELECT COUNT(*) AS c FROM vps_service_health",
      )
      .get();
    expect(count?.c).toBe(3);
  });

  // REG-3: invalid values must still be rejected
  it("REG-3: INSERT with invalid health_status='offline' is rejected by CHECK constraint", () => {
    const db = getDb();
    expect(() => insertHealthRow(db, "offline")).toThrow();
  });
});
