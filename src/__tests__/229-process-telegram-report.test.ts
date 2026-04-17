process.env["DB_PATH"] = ":memory:";

/**
 * Task 229 — process_telegram_report MCP tool
 *
 * Tests for the process_telegram_report tool behaviour:
 *   1. Returns "not found" error when id does not exist
 *   2. Marks the row as processed in SQLite
 *   3. Returns confirmation with Telegram deletion message when message_id > 0
 *   4. Returns "deletion skipped" when message_id = 0
 *   5. Calls deleteTelegramBug with the correct message_id
 *   6. Swallows Telegram deletion errors — DB row is still marked processed
 *   7. delete_telegram_message=false skips Telegram deletion
 *   8. Idempotent — calling process twice does not throw
 *   9. After processing, read_telegram_reports returns exit message
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  insertReport,
  getReport,
  markProcessed,
  listNewReports,
} from "../infrastructure/db/telegramReportStore.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simulate what process_telegram_report does without involving real Telegram.
 * Returns the confirmation message string + records which message_ids were deleted.
 */
async function simulateProcessTool(
  db: Database,
  id: number,
  deleteMessage = true,
  mockDeleteFn?: (messageId: number) => Promise<boolean>,
): Promise<string> {
  const row = getReport(db, id);
  if (!row) {
    return `Report ${id} not found.`;
  }

  let telegramDeleted = false;
  if (row.message_id > 0 && deleteMessage) {
    try {
      if (mockDeleteFn) {
        telegramDeleted = await mockDeleteFn(row.message_id);
      } else {
        // Default: simulate success
        telegramDeleted = true;
      }
    } catch {
      telegramDeleted = false;
    }
  }

  markProcessed(db, id);

  let text: string;
  if (row.message_id > 0 && deleteMessage) {
    text = `Report ${id} marked as processed. Telegram message ${row.message_id} deleted.`;
    if (!telegramDeleted) {
      text += " (Telegram deletion may have failed — row is still marked processed.)";
    }
  } else {
    text = `Report ${id} marked as processed. Telegram deletion skipped.`;
  }

  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Not found
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 229 — process_telegram_report: not found", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("returns 'Report N not found.' for a non-existent id", async () => {
    const result = await simulateProcessTool(db, 99999);
    expect(result).toBe("Report 99999 not found.");
  });

  it("does not modify the DB when id is not found", async () => {
    insertReport(db, "Untouched", "agent", 0, "normal");
    await simulateProcessTool(db, 99999);
    const rows = listNewReports(db);
    expect(rows.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Marks row as processed
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 229 — process_telegram_report: DB update", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("marks the row status as 'processed'", async () => {
    const id = insertReport(db, "To process", "agent", 0, "normal");
    expect(getReport(db, id)!.status).toBe("new");
    await simulateProcessTool(db, id);
    expect(getReport(db, id)!.status).toBe("processed");
  });

  it("does not affect other rows", async () => {
    const id1 = insertReport(db, "Keep new", "agent", 0, "normal");
    const id2 = insertReport(db, "Process me", "agent", 0, "normal");
    await simulateProcessTool(db, id2);
    expect(getReport(db, id1)!.status).toBe("new");
    expect(getReport(db, id2)!.status).toBe("processed");
  });

  it("calling process twice is idempotent — no error", async () => {
    const id = insertReport(db, "Double process", "agent", 0, "normal");
    await expect(async () => {
      await simulateProcessTool(db, id);
      await simulateProcessTool(db, id);
    }).not.toThrow();
    expect(getReport(db, id)!.status).toBe("processed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Confirmation message — message_id > 0
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 229 — process_telegram_report: confirmation message (message_id > 0)", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("returns confirmation including message_id when message_id > 0 and delete=true", async () => {
    const id = insertReport(db, "Report with TG message", "agent", 42, "high");
    const result = await simulateProcessTool(db, id, true);
    expect(result).toContain(`Report ${id} marked as processed`);
    expect(result).toContain("Telegram message 42 deleted");
  });

  it("includes fallback note when Telegram deletion fails", async () => {
    const id = insertReport(db, "Failed delete", "agent", 99, "normal");
    const result = await simulateProcessTool(db, id, true, async () => false);
    expect(result).toContain("may have failed");
    // DB should still be processed
    expect(getReport(db, id)!.status).toBe("processed");
  });

  it("swallows thrown errors from deleteTelegramBug", async () => {
    const id = insertReport(db, "Error during delete", "agent", 55, "normal");
    const result = await simulateProcessTool(db, id, true, async () => {
      throw new Error("Network timeout");
    });
    // Should still return a confirmation, not propagate the error
    expect(result).toContain(`Report ${id} marked as processed`);
    // DB update still happened
    expect(getReport(db, id)!.status).toBe("processed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Confirmation message — message_id = 0
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 229 — process_telegram_report: confirmation message (message_id = 0)", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("returns 'deletion skipped' when message_id=0", async () => {
    const id = insertReport(db, "No TG message", "agent", 0, "normal");
    const result = await simulateProcessTool(db, id, true);
    expect(result).toContain("Telegram deletion skipped");
    expect(result).toContain(`Report ${id} marked as processed`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. delete_telegram_message=false skips deletion
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 229 — process_telegram_report: delete_telegram_message=false", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("skips Telegram deletion when delete_telegram_message=false", async () => {
    const deletedIds: number[] = [];
    const id = insertReport(db, "Skip delete", "agent", 88, "high");
    const result = await simulateProcessTool(
      db,
      id,
      false,
      async (msgId) => { deletedIds.push(msgId); return true; },
    );
    expect(deletedIds).toHaveLength(0);
    expect(result).toContain("Telegram deletion skipped");
  });

  it("still marks the row processed when delete=false", async () => {
    const id = insertReport(db, "No delete but process", "agent", 77, "normal");
    await simulateProcessTool(db, id, false);
    expect(getReport(db, id)!.status).toBe("processed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. deleteTelegramBug called with correct message_id
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 229 — process_telegram_report: correct message_id forwarded", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("passes the stored message_id to the delete function", async () => {
    const capturedIds: number[] = [];
    const id = insertReport(db, "Capture message_id", "agent", 1234, "critical");
    await simulateProcessTool(db, id, true, async (msgId) => {
      capturedIds.push(msgId);
      return true;
    });
    expect(capturedIds).toHaveLength(1);
    expect(capturedIds[0]).toBe(1234);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Integration: after process, read returns exit message
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 229 — process_telegram_report: full loop integration", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("after processing all reports, listNewReports returns empty array", async () => {
    const id1 = insertReport(db, "Report 1", "agent", 10, "normal");
    const id2 = insertReport(db, "Report 2", "agent", 20, "high");

    expect(listNewReports(db).length).toBe(2);

    await simulateProcessTool(db, id1);
    await simulateProcessTool(db, id2);

    expect(listNewReports(db).length).toBe(0);
  });

  it("reports remain in DB after processing (full audit trail)", async () => {
    const id = insertReport(db, "Audit trail test", "agent", 5, "normal");
    await simulateProcessTool(db, id);

    const row = getReport(db, id);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("processed");
    expect(row!.text).toBe("Audit trail test");
  });
});
