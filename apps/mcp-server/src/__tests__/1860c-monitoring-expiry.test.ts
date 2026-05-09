Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1860c — expireMonitoringReports() auto-expiry
 *
 * Reports with resolution='monitoring' accumulate forever because only
 * fixed/wontfix/duplicate rows are cleaned up by the existing archive logic.
 *
 * expireMonitoringReports() fixes this by transitioning stale monitoring rows
 * to 'wontfix' so the existing archive logic picks them up automatically.
 *
 * Rules:
 *   - resolution='monitoring' AND resolved_at < NOW() - 72h → flip to 'wontfix', return count
 *   - resolution='monitoring' AND resolved_at >= NOW() - 72h → untouched
 *   - resolution other than 'monitoring' → untouched regardless of age
 *   - Returns 0 when no rows qualify
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  insertReport,
  getReport,
  markResolved,
  expireMonitoringReports,
  MONITORING_EXPIRY_HOURS,
} from "../infrastructure/db/telegramReportStore.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: insert a report and set resolution + resolved_at via raw SQL
// so we can control exact timestamps without relying on real clock drift.
// ─────────────────────────────────────────────────────────────────────────────
function insertMonitoringAt(db: Database, resolvedAt: string): number {
  const id = insertReport(db, "Monitoring report", "agent", 0, "normal");
  db.prepare(
    `UPDATE telegram_reports SET resolution = 'monitoring', resolved_at = ? WHERE id = ?`,
  ).run(resolvedAt, id);
  return id;
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Reports > 72h old → expired (flipped to wontfix)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1860c — monitoring > 72h → expires to wontfix", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("returns count=1 when one stale monitoring report exists", () => {
    insertMonitoringAt(db, isoHoursAgo(73));
    const count = expireMonitoringReports(db);
    expect(count).toBe(1);
  });

  it("flips resolution from monitoring to wontfix", () => {
    const id = insertMonitoringAt(db, isoHoursAgo(73));
    expireMonitoringReports(db);
    expect(getReport(db, id)!.resolution).toBe("wontfix");
  });

  it("returns count=3 when three stale monitoring reports exist", () => {
    insertMonitoringAt(db, isoHoursAgo(73));
    insertMonitoringAt(db, isoHoursAgo(96));
    insertMonitoringAt(db, isoHoursAgo(200));
    const count = expireMonitoringReports(db);
    expect(count).toBe(3);
  });

  it("exactly 72h + 1 second is expired", () => {
    // resolved_at just over the boundary
    const id = insertMonitoringAt(db, isoHoursAgo(72.001));
    const count = expireMonitoringReports(db);
    expect(count).toBe(1);
    expect(getReport(db, id)!.resolution).toBe("wontfix");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Reports < 72h old → untouched
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1860c — monitoring < 72h → untouched", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("returns count=0 when monitoring report is only 1h old", () => {
    insertMonitoringAt(db, isoHoursAgo(1));
    const count = expireMonitoringReports(db);
    expect(count).toBe(0);
  });

  it("leaves resolution as monitoring when < 72h", () => {
    const id = insertMonitoringAt(db, isoHoursAgo(71));
    expireMonitoringReports(db);
    expect(getReport(db, id)!.resolution).toBe("monitoring");
  });

  it("returns count=0 when monitoring report is exactly 71h old", () => {
    insertMonitoringAt(db, isoHoursAgo(71));
    const count = expireMonitoringReports(db);
    expect(count).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Other resolutions → untouched regardless of age
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1860c — non-monitoring resolutions → always untouched", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("does not touch a 'fixed' report even if > 72h old", () => {
    const id = insertReport(db, "Old fixed report", "agent", 0, "normal");
    markResolved(db, id, "fixed", isoHoursAgo(100));
    expireMonitoringReports(db);
    expect(getReport(db, id)!.resolution).toBe("fixed");
  });

  it("does not touch a 'wontfix' report even if > 72h old", () => {
    const id = insertReport(db, "Old wontfix report", "agent", 0, "normal");
    markResolved(db, id, "wontfix", isoHoursAgo(100));
    expireMonitoringReports(db);
    expect(getReport(db, id)!.resolution).toBe("wontfix");
  });

  it("does not touch a 'duplicate' report even if > 72h old", () => {
    const id = insertReport(db, "Old duplicate report", "agent", 0, "normal");
    markResolved(db, id, "duplicate", isoHoursAgo(100));
    expireMonitoringReports(db);
    expect(getReport(db, id)!.resolution).toBe("duplicate");
  });

  it("does not touch a 'none' report even if created a long time ago", () => {
    const id = insertReport(db, "Old none resolution report", "agent", 0, "normal");
    // 'none' has no resolved_at — still must not be touched
    expireMonitoringReports(db);
    expect(getReport(db, id)!.resolution).toBe("none");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Mixed scenario: some expire, some don't
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1860c — mixed scenario: selective expiry", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("expires only stale monitoring rows, leaves fresh monitoring and fixed untouched", () => {
    const stale1 = insertMonitoringAt(db, isoHoursAgo(80));
    const stale2 = insertMonitoringAt(db, isoHoursAgo(100));
    const fresh  = insertMonitoringAt(db, isoHoursAgo(10));
    const fixed  = insertReport(db, "Fixed report", "agent", 0, "normal");
    markResolved(db, fixed, "fixed", isoHoursAgo(90));

    const count = expireMonitoringReports(db);

    expect(count).toBe(2);
    expect(getReport(db, stale1)!.resolution).toBe("wontfix");
    expect(getReport(db, stale2)!.resolution).toBe("wontfix");
    expect(getReport(db, fresh)!.resolution).toBe("monitoring");
    expect(getReport(db, fixed)!.resolution).toBe("fixed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1860c — edge cases", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("returns 0 when table is empty", () => {
    const count = expireMonitoringReports(db);
    expect(count).toBe(0);
  });

  it("is idempotent — calling twice does not change count on second call", () => {
    insertMonitoringAt(db, isoHoursAgo(80));
    const first  = expireMonitoringReports(db);
    const second = expireMonitoringReports(db);
    expect(first).toBe(1);
    expect(second).toBe(0); // already flipped to wontfix — no longer qualifies
  });

  it("MONITORING_EXPIRY_HOURS constant equals 72", () => {
    expect(MONITORING_EXPIRY_HOURS).toBe(72);
  });
});
