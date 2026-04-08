/**
 * Task 226 — telegram_reports SQLite table + CRUD store
 *
 * Tests for:
 *   1. telegramReportStore.ts — SQLite CRUD helpers (insert / list / markProcessed)
 *   2. Table DDL — correct columns and defaults
 *   3. listNewReports — returns only status="new" rows, ordered by created_at ASC
 *   4. markProcessed — flips status to "processed"
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  insertReport,
  listNewReports,
  markProcessed,
  getReport as getReportById,
} from "../infrastructure/db/telegramReportStore.js";
import { ensureTelegramReportsTable } from "./helpers/telegramReportsTestDdl.js";

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
// 1. DDL — table structure
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 226 — ensureTelegramReportsTable (DDL)", () => {
  it("creates the telegram_reports table without error", () => {
    const db = new Database(":memory:");
    expect(() => ensureTelegramReportsTable(db)).not.toThrow();
    db.close();
  });

  it("is idempotent — safe to call multiple times", () => {
    const db = new Database(":memory:");
    expect(() => {
      ensureTelegramReportsTable(db);
      ensureTelegramReportsTable(db);
      ensureTelegramReportsTable(db);
    }).not.toThrow();
    db.close();
  });

  it("creates idx_telegram_reports_status index", () => {
    const db = new Database(":memory:");
    ensureTelegramReportsTable(db);
    const idx = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_telegram_reports_status'",
      )
      .get();
    expect(idx).not.toBeNull();
    expect(idx?.name).toBe("idx_telegram_reports_status");
    db.close();
  });

  it("creates idx_telegram_reports_created index", () => {
    const db = new Database(":memory:");
    ensureTelegramReportsTable(db);
    const idx = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_telegram_reports_created'",
      )
      .get();
    expect(idx).not.toBeNull();
    expect(idx?.name).toBe("idx_telegram_reports_created");
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. insertReport — write path
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 226 — insertReport (write path)", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("returns a positive integer row id", () => {
    const id = insertReport(db, "Test report text", "analysis-agent", 0, "normal");
    expect(id).toBeGreaterThan(0);
  });

  it("returns incrementing IDs for successive inserts", () => {
    const id1 = insertReport(db, "First report", "agent-a", 0, "normal");
    const id2 = insertReport(db, "Second report", "agent-b", 101, "high");
    expect(id2).toBeGreaterThan(id1);
  });

  it("stores text, fromAgent, messageId, priority correctly", () => {
    const id = insertReport(db, "Alert: VNM dropped 5%", "market-analyst", 42, "high");
    const row = getReportById(db, id);
    expect(row).not.toBeNull();
    expect(row!.text).toBe("Alert: VNM dropped 5%");
    expect(row!.from_agent).toBe("market-analyst");
    expect(row!.message_id).toBe(42);
    expect(row!.priority).toBe("high");
  });

  it("sets default status to 'new'", () => {
    const id = insertReport(db, "Some report", "agent", 0, "normal");
    const row = getReportById(db, id);
    expect(row!.status).toBe("new");
  });

  it("sets created_at as a unix timestamp (integer > 0)", () => {
    const id = insertReport(db, "Timestamp test", "agent", 0, "normal");
    const row = getReportById(db, id);
    expect(row!.created_at).toBeGreaterThan(0);
  });

  it("accepts all valid priority values", () => {
    const priorities = ["critical", "high", "normal", "monitor"] as const;
    for (const p of priorities) {
      const id = insertReport(db, `Priority ${p} report`, "agent", 0, p);
      const row = getReportById(db, id);
      expect(row!.priority).toBe(p);
    }
  });

  it("stores messageId=0 when message not sent to Telegram", () => {
    const id = insertReport(db, "No message", "agent", 0, "normal");
    const row = getReportById(db, id);
    expect(row!.message_id).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. listNewReports — read path
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 226 — listNewReports (read path)", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("returns empty array when no reports exist", () => {
    expect(listNewReports(db)).toHaveLength(0);
  });

  it("returns all new reports", () => {
    insertReport(db, "Report 1", "agent-a", 10, "normal");
    insertReport(db, "Report 2", "agent-b", 20, "high");
    const rows = listNewReports(db);
    expect(rows).toHaveLength(2);
  });

  it("returns rows ordered by created_at ASC (oldest first)", () => {
    // Insert reports with slight delay via direct SQL to control created_at
    db.prepare("INSERT INTO telegram_reports (text, from_agent, message_id, priority, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run("First", "agent", 1, "normal", "new", 1000);
    db.prepare("INSERT INTO telegram_reports (text, from_agent, message_id, priority, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run("Second", "agent", 2, "normal", "new", 2000);
    db.prepare("INSERT INTO telegram_reports (text, from_agent, message_id, priority, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run("Third", "agent", 3, "normal", "new", 3000);
    const rows = listNewReports(db);
    expect(rows[0]!.text).toBe("First");
    expect(rows[1]!.text).toBe("Second");
    expect(rows[2]!.text).toBe("Third");
  });

  it("does NOT return processed reports", () => {
    const id = insertReport(db, "To be processed", "agent", 0, "normal");
    markProcessed(db, id);
    const rows = listNewReports(db);
    expect(rows).toHaveLength(0);
  });

  it("returns only new rows when mix of new and processed exist", () => {
    const id1 = insertReport(db, "Report A", "agent", 0, "normal");
    insertReport(db, "Report B", "agent", 0, "high");
    markProcessed(db, id1);
    const rows = listNewReports(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text).toBe("Report B");
  });

  it("returned rows include all required fields", () => {
    insertReport(db, "Full row test", "dev-team", 99, "critical");
    const rows = listNewReports(db);
    const row = rows[0]!;
    expect(typeof row.id).toBe("number");
    expect(typeof row.message_id).toBe("number");
    expect(typeof row.text).toBe("string");
    expect(typeof row.from_agent).toBe("string");
    expect(typeof row.priority).toBe("string");
    expect(typeof row.status).toBe("string");
    expect(typeof row.created_at).toBe("number");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. markProcessed — update path
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 226 — markProcessed (update path)", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("flips status from 'new' to 'processed'", () => {
    const id = insertReport(db, "Process me", "agent", 0, "normal");
    expect(getReportById(db, id)!.status).toBe("new");
    markProcessed(db, id);
    expect(getReportById(db, id)!.status).toBe("processed");
  });

  it("does not throw when called with a non-existent id", () => {
    expect(() => markProcessed(db, 99999)).not.toThrow();
  });

  it("does not affect other rows", () => {
    const id1 = insertReport(db, "Stay new", "agent", 0, "normal");
    const id2 = insertReport(db, "Process me", "agent", 0, "normal");
    markProcessed(db, id2);
    expect(getReportById(db, id1)!.status).toBe("new");
    expect(getReportById(db, id2)!.status).toBe("processed");
  });

  it("calling markProcessed twice is idempotent", () => {
    const id = insertReport(db, "Double process", "agent", 0, "normal");
    expect(() => {
      markProcessed(db, id);
      markProcessed(db, id);
    }).not.toThrow();
    expect(getReportById(db, id)!.status).toBe("processed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. getReportById — point lookup
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 226 — getReportById (point lookup)", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("returns the correct row by id", () => {
    const id = insertReport(db, "Lookup test", "tester", 55, "monitor");
    const row = getReportById(db, id);
    expect(row).not.toBeNull();
    expect(row!.id).toBe(id);
    expect(row!.text).toBe("Lookup test");
    expect(row!.from_agent).toBe("tester");
    expect(row!.message_id).toBe(55);
    expect(row!.priority).toBe("monitor");
  });

  it("returns null for a non-existent id", () => {
    const row = getReportById(db, 99999);
    expect(row).toBeNull();
  });
});
