process.env["DB_PATH"] = ":memory:";

/**
 * Task 228 — read_telegram_reports MCP tool
 *
 * Tests for the read_telegram_reports tool behaviour:
 *   1. Returns Vietnamese exit message when status=new and no rows exist
 *   2. Returns JSON array of new reports
 *   3. Returns all reports when status=all
 *   4. Returns only processed reports when status=processed
 *   5. Respects the limit parameter
 *   6. created_at is returned as ISO 8601 string (not raw unix integer)
 *   7. Each row includes all required fields
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  insertReport,
  markProcessed,
} from "../infrastructure/db/telegramReportStore.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simulate what the MCP tool does: list rows filtered by status and limit,
 * serialize created_at to ISO string.
 *
 * We test the pure data-layer behaviour here — the MCP wrapper just calls
 * these same store functions and serializes.
 */
function simulateReadTool(
  db: Database,
  status: "new" | "processed" | "all" = "new",
  limit = 20,
): { exitMessage: string } | Array<Record<string, unknown>> {
  // Import store functions inline to mirror what the tool does
  const { listNewReports, listAllReports } = require("../infrastructure/db/telegramReportStore.js") as typeof import("../infrastructure/db/telegramReportStore.js");

  let rows;
  if (status === "new") {
    const all = listNewReports(db);
    rows = all.slice(0, limit);
  } else if (status === "processed") {
    const all = listAllReports(db, limit * 2);
    rows = all.filter((r) => r.status === "processed").slice(0, limit);
  } else {
    rows = listAllReports(db, limit);
  }

  if (status === "new" && rows.length === 0) {
    return { exitMessage: "Khong co bao cao moi. Vong lap ket thuc." };
  }

  return rows.map((row) => ({
    id: row.id,
    message_id: row.message_id,
    text: row.text,
    from_agent: row.from_agent,
    priority: row.priority,
    status: row.status,
    created_at: new Date(row.created_at * 1000).toISOString(),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Empty state — exit message
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 228 — read_telegram_reports: empty state", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("returns exit message when status=new and no reports exist", () => {
    const result = simulateReadTool(db, "new");
    expect(result).toEqual({ exitMessage: "Khong co bao cao moi. Vong lap ket thuc." });
  });

  it("returns exit message after all reports are processed", () => {
    const id = insertReport(db, "Report A", "agent", 0, "normal");
    markProcessed(db, id);
    const result = simulateReadTool(db, "new");
    expect(result).toEqual({ exitMessage: "Khong co bao cao moi. Vong lap ket thuc." });
  });

  it("does NOT return exit message when status=all even if no new rows", () => {
    // Insert + process a row → no new rows, but all query should still return it
    const id = insertReport(db, "Processed report", "agent", 0, "normal");
    markProcessed(db, id);
    const result = simulateReadTool(db, "all");
    expect(Array.isArray(result)).toBe(true);
    expect((result as unknown[]).length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. status=new — returns only new reports
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 228 — read_telegram_reports: status=new", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("returns an array when new reports exist", () => {
    insertReport(db, "New report 1", "agent-a", 10, "high");
    insertReport(db, "New report 2", "agent-b", 20, "normal");
    const result = simulateReadTool(db, "new") as Array<Record<string, unknown>>;
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
  });

  it("does not include processed reports", () => {
    const id1 = insertReport(db, "New", "agent", 0, "normal");
    const id2 = insertReport(db, "Processed", "agent", 0, "normal");
    markProcessed(db, id2);
    const result = simulateReadTool(db, "new") as Array<Record<string, unknown>>;
    expect(result.length).toBe(1);
    expect(result[0]!.id).toBe(id1);
  });

  it("all returned rows have status='new'", () => {
    insertReport(db, "Report A", "agent", 0, "normal");
    insertReport(db, "Report B", "agent", 0, "high");
    const result = simulateReadTool(db, "new") as Array<Record<string, unknown>>;
    for (const row of result) {
      expect(row.status).toBe("new");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. status=processed — returns only processed reports
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 228 — read_telegram_reports: status=processed", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("returns empty array when no processed reports exist", () => {
    insertReport(db, "Unprocessed", "agent", 0, "normal");
    const result = simulateReadTool(db, "processed") as Array<Record<string, unknown>>;
    expect(result.length).toBe(0);
  });

  it("returns only processed reports", () => {
    const id1 = insertReport(db, "Report A", "agent", 0, "normal");
    insertReport(db, "Report B", "agent", 0, "high");
    markProcessed(db, id1);
    const result = simulateReadTool(db, "processed") as Array<Record<string, unknown>>;
    expect(result.length).toBe(1);
    expect(result[0]!.id).toBe(id1);
    expect(result[0]!.status).toBe("processed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. status=all — returns all reports
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 228 — read_telegram_reports: status=all", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("returns both new and processed reports", () => {
    const id1 = insertReport(db, "New", "agent", 0, "normal");
    const id2 = insertReport(db, "Processed", "agent", 0, "normal");
    markProcessed(db, id2);
    const result = simulateReadTool(db, "all") as Array<Record<string, unknown>>;
    expect(result.length).toBe(2);
    const ids = result.map((r) => r.id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. limit parameter
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 228 — read_telegram_reports: limit parameter", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("respects limit=1 and returns only 1 row", () => {
    insertReport(db, "Report 1", "agent", 0, "normal");
    insertReport(db, "Report 2", "agent", 0, "normal");
    insertReport(db, "Report 3", "agent", 0, "normal");
    const result = simulateReadTool(db, "new", 1) as Array<Record<string, unknown>>;
    expect(result.length).toBe(1);
  });

  it("returns all rows when limit > total rows", () => {
    insertReport(db, "Only one", "agent", 0, "normal");
    const result = simulateReadTool(db, "new", 50) as Array<Record<string, unknown>>;
    expect(result.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. created_at is ISO string
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 228 — read_telegram_reports: field serialization", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("created_at is returned as ISO 8601 string", () => {
    insertReport(db, "ISO test", "agent", 0, "normal");
    const result = simulateReadTool(db, "new") as Array<Record<string, unknown>>;
    const createdAt = result[0]!.created_at as string;
    expect(typeof createdAt).toBe("string");
    // Should parse as a valid date
    expect(isNaN(Date.parse(createdAt))).toBe(false);
    // ISO format contains a T separator
    expect(createdAt).toContain("T");
  });

  it("each row includes all 7 required fields", () => {
    insertReport(db, "Full fields test", "dev-agent", 77, "critical");
    const result = simulateReadTool(db, "new") as Array<Record<string, unknown>>;
    const row = result[0]!;
    expect("id" in row).toBe(true);
    expect("message_id" in row).toBe(true);
    expect("text" in row).toBe(true);
    expect("from_agent" in row).toBe(true);
    expect("priority" in row).toBe(true);
    expect("status" in row).toBe(true);
    expect("created_at" in row).toBe(true);
  });

  it("row values match what was inserted", () => {
    insertReport(db, "Check values", "analysis-agent", 42, "high");
    const result = simulateReadTool(db, "new") as Array<Record<string, unknown>>;
    const row = result[0]!;
    expect(row.text).toBe("Check values");
    expect(row.from_agent).toBe("analysis-agent");
    expect(row.message_id).toBe(42);
    expect(row.priority).toBe("high");
    expect(row.status).toBe("new");
  });
});
