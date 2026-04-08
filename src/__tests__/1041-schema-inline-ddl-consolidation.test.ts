/**
 * Tasks 1040 + 1041 — Janitor: Move inline DDLs into initDatabase()
 *
 * Verifies that both audit_state and briefing_log tables are created
 * by initDatabase() alone — without any scheduler-specific helper.
 *
 * Before this fix:
 *   - audit_state was created inside dataAuditJob.ts:ensureAuditDependencies()
 *   - briefing_log was created inline in morningBriefingJob.ts
 *
 * After this fix:
 *   - both tables are created by initDatabase() in schema.ts
 *   - scheduler files no longer execute CREATE TABLE at runtime
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

process.env["DB_PATH"] = ":memory:";

import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

function tableExists(tableName: string): boolean {
  const db = getDb();
  const row = db
    .query<{ name: string }, [string]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    )
    .get(tableName);
  return row !== null;
}

describe("Tasks 1040+1041 — inline DDL consolidation into initDatabase()", () => {
  beforeAll(async () => {
    closeDb();
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
  });

  // ── Task 1041: audit_state ─────────────────────────────────────────────────

  it("audit_state table exists after initDatabase() — no scheduler helper needed", () => {
    expect(tableExists("audit_state")).toBe(true);
  });

  it("audit_state has all required columns", () => {
    const db = getDb();
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(audit_state)")
      .all()
      .map((r) => r.name);
    expect(cols).toContain("id");
    expect(cols).toContain("last_daily_audit_at");
    expect(cols).toContain("last_weekly_audit_at");
    expect(cols).toContain("last_daily_findings");
    expect(cols).toContain("last_weekly_findings");
  });

  it("audit_state enforces id=1 constraint (singleton row)", () => {
    const db = getDb();
    // Insert id=1 — should succeed
    db.exec(
      "INSERT OR IGNORE INTO audit_state (id) VALUES (1)",
    );
    // Insert id=2 — should fail due to CHECK constraint
    expect(() => {
      db.exec("INSERT INTO audit_state (id) VALUES (2)");
    }).toThrow();
  });

  // ── Task 1040: briefing_log ────────────────────────────────────────────────

  it("briefing_log table exists after initDatabase() — no scheduler helper needed", () => {
    expect(tableExists("briefing_log")).toBe(true);
  });

  it("briefing_log has required columns: date (PK), sent_at", () => {
    const db = getDb();
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(briefing_log)")
      .all()
      .map((r) => r.name);
    expect(cols).toContain("date");
    expect(cols).toContain("sent_at");
  });

  it("briefing_log date is PRIMARY KEY (no duplicate dates)", () => {
    const db = getDb();
    db.exec(
      "INSERT OR IGNORE INTO briefing_log (date, sent_at) VALUES ('2026-04-08', '2026-04-08T09:00:00Z')",
    );
    // Inserting same date again should not throw (INSERT OR IGNORE) and result in 1 row
    db.exec(
      "INSERT OR IGNORE INTO briefing_log (date, sent_at) VALUES ('2026-04-08', '2026-04-08T10:00:00Z')",
    );
    const count = db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) AS n FROM briefing_log WHERE date='2026-04-08'",
      )
      .get()!.n;
    expect(count).toBe(1);
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it("initDatabase() called again does not crash (idempotent)", async () => {
    await expect(initDatabase()).resolves.toBeUndefined();
  });
});
