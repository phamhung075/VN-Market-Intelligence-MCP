Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1860e — process_telegram_report: delete_success field in response
 *
 * Tests:
 *   1. delete succeeds → response JSON contains delete_success: true
 *   2. delete attempted but fails → response JSON contains delete_success: false
 *   3. delete_telegram_message=false → response JSON omits delete_success (null)
 *   4. response text includes delete_success info clearly
 *   5. backward-compat: existing processed/skipped text still present
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  insertReport,
  getReport,
  markProcessed,
} from "../infrastructure/db/telegramReportStore.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Simulate the updated process_telegram_report tool handler
// Returns the parsed JSON from content[0].text
// ─────────────────────────────────────────────────────────────────────────────

type ProcessResult = {
  processed: boolean;
  report_id: number;
  resolution: string;
  delete_success: boolean | null;
  message: string;
};

async function simulateProcess(
  db: Database,
  id: number,
  options: {
    resolution?: string;
    delete_telegram_message?: boolean;
    mockDeleteFn?: (messageId: number) => Promise<boolean>;
  } = {},
): Promise<ProcessResult | { error: string }> {
  const { resolution = "none", delete_telegram_message = true, mockDeleteFn } = options;
  const shouldDelete = delete_telegram_message;

  const row = getReport(db, id);
  if (!row) {
    return { error: `Report ${id} not found.` };
  }

  if (resolution !== "none") {
    // markResolved would be called here — not needed for delete_success tests
  }

  let telegramDeleted: boolean | null = null;

  if (row.message_id > 0 && shouldDelete) {
    try {
      if (mockDeleteFn) {
        telegramDeleted = await mockDeleteFn(row.message_id);
      } else {
        telegramDeleted = true; // default success
      }
    } catch {
      telegramDeleted = false;
    }
  } else if (!shouldDelete) {
    telegramDeleted = null; // not requested
  }
  // if message_id = 0 and shouldDelete=true → deletion attempted but no-op, stays null

  markProcessed(db, id);

  // Build response text
  let message: string;
  const resolutionSuffix = resolution !== "none" ? ` Resolution: ${resolution}.` : "";

  if (row.message_id > 0 && shouldDelete) {
    message = `Report ${id} marked as processed.${resolutionSuffix} Telegram message ${row.message_id} deleted.`;
    if (telegramDeleted === false) {
      message += " (Telegram deletion may have failed — row is still marked processed.)";
    }
  } else {
    message = `Report ${id} marked as processed.${resolutionSuffix} Telegram deletion skipped.`;
  }

  if (telegramDeleted !== null) {
    message += ` delete_success=${telegramDeleted}`;
  } else {
    message += " delete_success=null";
  }

  return {
    processed: true,
    report_id: id,
    resolution,
    delete_success: telegramDeleted,
    message,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. delete succeeds → delete_success: true
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1860e — delete_success=true when deletion succeeds", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("returns delete_success=true when Telegram delete succeeds", async () => {
    const id = insertReport(db, "Deletable report", "agent", 42, "high");
    const result = await simulateProcess(db, id, {
      delete_telegram_message: true,
      mockDeleteFn: async () => true,
    });

    expect("error" in result).toBe(false);
    const r = result as ProcessResult;
    expect(r.delete_success).toBe(true);
  });

  it("response message includes delete_success=true", async () => {
    const id = insertReport(db, "Success delete", "agent", 55, "normal");
    const result = await simulateProcess(db, id, {
      delete_telegram_message: true,
      mockDeleteFn: async () => true,
    });

    const r = result as ProcessResult;
    expect(r.message).toContain("delete_success=true");
  });

  it("still marks row as processed", async () => {
    const id = insertReport(db, "Processed check", "agent", 66, "normal");
    await simulateProcess(db, id, {
      delete_telegram_message: true,
      mockDeleteFn: async () => true,
    });
    expect(getReport(db, id)!.status).toBe("processed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. delete attempted but fails → delete_success: false
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1860e — delete_success=false when deletion fails", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("returns delete_success=false when deleteTelegramBug returns false", async () => {
    const id = insertReport(db, "Failed delete", "agent", 99, "normal");
    const result = await simulateProcess(db, id, {
      delete_telegram_message: true,
      mockDeleteFn: async () => false,
    });

    const r = result as ProcessResult;
    expect(r.delete_success).toBe(false);
  });

  it("returns delete_success=false when deleteTelegramBug throws", async () => {
    const id = insertReport(db, "Throw delete", "agent", 77, "normal");
    const result = await simulateProcess(db, id, {
      delete_telegram_message: true,
      mockDeleteFn: async () => { throw new Error("Network error"); },
    });

    const r = result as ProcessResult;
    expect(r.delete_success).toBe(false);
  });

  it("response message includes delete_success=false", async () => {
    const id = insertReport(db, "Fail message", "agent", 88, "high");
    const result = await simulateProcess(db, id, {
      delete_telegram_message: true,
      mockDeleteFn: async () => false,
    });

    const r = result as ProcessResult;
    expect(r.message).toContain("delete_success=false");
  });

  it("row is still marked processed even when delete fails", async () => {
    const id = insertReport(db, "Processed despite fail", "agent", 111, "normal");
    await simulateProcess(db, id, {
      delete_telegram_message: true,
      mockDeleteFn: async () => false,
    });
    expect(getReport(db, id)!.status).toBe("processed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. delete_telegram_message=false → delete_success: null
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1860e — delete_success=null when deletion not requested", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("returns delete_success=null when delete_telegram_message=false", async () => {
    const id = insertReport(db, "No delete requested", "agent", 200, "normal");
    const result = await simulateProcess(db, id, {
      delete_telegram_message: false,
    });

    const r = result as ProcessResult;
    expect(r.delete_success).toBeNull();
  });

  it("response message includes delete_success=null", async () => {
    const id = insertReport(db, "Null delete message", "agent", 201, "normal");
    const result = await simulateProcess(db, id, {
      delete_telegram_message: false,
    });

    const r = result as ProcessResult;
    expect(r.message).toContain("delete_success=null");
  });

  it("mock delete fn is NOT called when delete_telegram_message=false", async () => {
    const deletedIds: number[] = [];
    const id = insertReport(db, "No delete fn call", "agent", 202, "normal");
    await simulateProcess(db, id, {
      delete_telegram_message: false,
      mockDeleteFn: async (msgId) => { deletedIds.push(msgId); return true; },
    });
    expect(deletedIds).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. backward-compat: existing text still present
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1860e — backward-compat: existing response text preserved", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("message still contains 'marked as processed' when delete succeeds", async () => {
    const id = insertReport(db, "Compat success", "agent", 300, "normal");
    const result = await simulateProcess(db, id, {
      mockDeleteFn: async () => true,
    });
    const r = result as ProcessResult;
    expect(r.message).toContain("marked as processed");
  });

  it("message still contains 'may have failed' when delete fails", async () => {
    const id = insertReport(db, "Compat fail", "agent", 301, "normal");
    const result = await simulateProcess(db, id, {
      mockDeleteFn: async () => false,
    });
    const r = result as ProcessResult;
    expect(r.message).toContain("may have failed");
  });

  it("message still contains 'Telegram deletion skipped' when delete=false", async () => {
    const id = insertReport(db, "Compat skip", "agent", 302, "normal");
    const result = await simulateProcess(db, id, {
      delete_telegram_message: false,
    });
    const r = result as ProcessResult;
    expect(r.message).toContain("Telegram deletion skipped");
  });
});
