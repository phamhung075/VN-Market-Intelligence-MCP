/**
 * Task 231 — claim_telegram_report ownership lock
 *
 * Tests for:
 *   1. claimReport — atomic claim succeeds on unclaimed report
 *   2. claimReport — second claim fails and returns existing claimant
 *   3. claimReport — calling twice by same claimant is idempotent (first call wins, second fails gracefully)
 *   4. listNewReports with unclaimed_only filter — excludes claimed rows
 *   5. Schema migration — claimed_by / claimed_at columns exist after ensureTelegramReportsTable
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ensureTelegramReportsTable,
  insertReport,
  claimReport,
  listNewReportsUnclaimed,
} from "../infrastructure/db/telegramReportStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  ensureTelegramReportsTable(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Schema — claimed_by and claimed_at columns exist
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 231 — schema: claimed_by / claimed_at columns", () => {
  it("telegram_reports table has claimed_by column after ensureTelegramReportsTable", () => {
    const db = new Database(":memory:");
    ensureTelegramReportsTable(db);
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(telegram_reports)")
      .all()
      .map((c) => c.name);
    expect(cols).toContain("claimed_by");
    db.close();
  });

  it("telegram_reports table has claimed_at column after ensureTelegramReportsTable", () => {
    const db = new Database(":memory:");
    ensureTelegramReportsTable(db);
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(telegram_reports)")
      .all()
      .map((c) => c.name);
    expect(cols).toContain("claimed_at");
    db.close();
  });

  it("claimed_by defaults to NULL on new rows", () => {
    const db = new Database(":memory:");
    ensureTelegramReportsTable(db);
    const id = insertReport(db, "Test row", "agent", 0, "normal");
    const row = db
      .query<{ claimed_by: string | null }, [number]>(
        "SELECT claimed_by FROM telegram_reports WHERE id = ?",
      )
      .get(id);
    expect(row).not.toBeNull();
    expect(row!.claimed_by).toBeNull();
    db.close();
  });

  it("ALTER TABLE migration is idempotent — ensureTelegramReportsTable is safe to call multiple times", () => {
    const db = new Database(":memory:");
    expect(() => {
      ensureTelegramReportsTable(db);
      ensureTelegramReportsTable(db);
      ensureTelegramReportsTable(db);
    }).not.toThrow();
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. claimReport — success path
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 231 — claimReport: success path", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("returns success=true when claiming an unclaimed report", () => {
    const id = insertReport(db, "Problem: VNM data stale", "analysis-agent", 0, "high");
    const result = claimReport(db, id, "dev-team");
    expect(result.success).toBe(true);
  });

  it("claimed_by is set to claimant after successful claim", () => {
    const id = insertReport(db, "Bug report", "market-watcher", 0, "normal");
    claimReport(db, id, "dev-team");
    const row = db
      .query<{ claimed_by: string | null }, [number]>(
        "SELECT claimed_by FROM telegram_reports WHERE id = ?",
      )
      .get(id);
    expect(row!.claimed_by).toBe("dev-team");
  });

  it("claimed_at is set after successful claim", () => {
    const id = insertReport(db, "Needs fix", "agent", 0, "normal");
    claimReport(db, id, "fixer");
    const row = db
      .query<{ claimed_at: string | null }, [number]>(
        "SELECT claimed_at FROM telegram_reports WHERE id = ?",
      )
      .get(id);
    expect(row!.claimed_at).not.toBeNull();
    // claimed_at should be a non-empty string (SQLite datetime)
    expect((row!.claimed_at ?? "").length).toBeGreaterThan(0);
  });

  it("does not return claimedBy in the success result (only relevant on failure)", () => {
    const id = insertReport(db, "Report", "agent", 0, "normal");
    const result = claimReport(db, id, "dev-team");
    expect(result.success).toBe(true);
    // claimedBy may be undefined on success
    expect(result.claimedBy).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. claimReport — contention / failure path
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 231 — claimReport: contention / failure path", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("returns success=false when a different claimant already claimed the report", () => {
    const id = insertReport(db, "Race condition target", "agent", 0, "critical");
    claimReport(db, id, "dev-team");
    const result2 = claimReport(db, id, "unified-agent");
    expect(result2.success).toBe(false);
  });

  it("returns the original claimant in claimedBy when claim fails", () => {
    const id = insertReport(db, "Already owned", "agent", 0, "high");
    claimReport(db, id, "dev-team");
    const result2 = claimReport(db, id, "unified-agent");
    expect(result2.claimedBy).toBe("dev-team");
  });

  it("second call by same claimant also returns success=false (first-write-wins is atomic)", () => {
    const id = insertReport(db, "Same claimant twice", "agent", 0, "normal");
    const r1 = claimReport(db, id, "dev-team");
    const r2 = claimReport(db, id, "dev-team");
    // First claim must succeed
    expect(r1.success).toBe(true);
    // Second claim is blocked because claimed_by is already set (NOT NULL)
    expect(r2.success).toBe(false);
  });

  it("does not throw when called with a non-existent id", () => {
    expect(() => claimReport(db, 99999, "dev-team")).not.toThrow();
  });

  it("returns success=false for a non-existent id", () => {
    const result = claimReport(db, 99999, "dev-team");
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. listNewReportsUnclaimed — filters out claimed rows
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 231 — listNewReportsUnclaimed", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("returns empty array when all new reports are claimed", () => {
    const id = insertReport(db, "Claimed report", "agent", 0, "normal");
    claimReport(db, id, "dev-team");
    const rows = listNewReportsUnclaimed(db);
    expect(rows).toHaveLength(0);
  });

  it("returns only unclaimed new reports", () => {
    const id1 = insertReport(db, "Unclaimed", "agent", 0, "normal");
    const id2 = insertReport(db, "Claimed", "agent", 0, "high");
    claimReport(db, id2, "dev-team");
    const rows = listNewReportsUnclaimed(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(id1);
  });

  it("returns all new unclaimed reports in ASC order", () => {
    db.prepare(
      "INSERT INTO telegram_reports (text, from_agent, message_id, priority, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("First", "agent", 1, "normal", "new", 1000);
    db.prepare(
      "INSERT INTO telegram_reports (text, from_agent, message_id, priority, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("Second", "agent", 2, "normal", "new", 2000);
    const rows = listNewReportsUnclaimed(db);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text).toBe("First");
    expect(rows[1]!.text).toBe("Second");
  });

  it("does not return processed + unclaimed rows", () => {
    const id = insertReport(db, "Processed unclaimed", "agent", 0, "normal");
    // Mark processed without claiming
    db.prepare("UPDATE telegram_reports SET status='processed' WHERE id=?").run(id);
    const rows = listNewReportsUnclaimed(db);
    expect(rows).toHaveLength(0);
  });
});
