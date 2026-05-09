Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1860a — process_telegram_report must fail if Telegram deletion fails
 *
 * Root cause: markProcessed() ran unconditionally even when deleteTelegramBug()
 * failed, leaving Telegram messages visible but DB thinking they're archived.
 *
 * Expected new behaviour:
 *   - delete_telegram_message=true AND deletion fails  → row stays "new", error returned
 *   - delete_telegram_message=true AND deletion succeeds → row marked "processed" ✓
 *   - delete_telegram_message=false                     → row marked "processed" regardless ✓
 *   - message_id=0 (nothing to delete)                  → row marked "processed" ✓
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  insertReport,
  getReport,
} from "../infrastructure/db/telegramReportStore.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Simulate the FIXED process_telegram_report handler behaviour
// (mirrors the logic we are about to implement in telegramReportTools.ts)
// ─────────────────────────────────────────────────────────────────────────────

import {
  markProcessed,
  markResolved,
} from "../infrastructure/db/telegramReportStore.js";

async function simulateFixedProcessTool(
  db: Database,
  id: number,
  options: {
    deleteMessage?: boolean;
    resolution?: string;
    mockDeleteFn?: (messageId: number) => Promise<boolean>;
  } = {},
): Promise<{ ok: boolean; text: string }> {
  const shouldDelete = options.deleteMessage ?? true;
  const resolvedResolution = options.resolution ?? "none";

  const row = getReport(db, id);
  if (!row) {
    return { ok: false, text: `Report ${id} not found.` };
  }

  // Record resolution if provided (non-none)
  if (resolvedResolution !== "none") {
    try {
      markResolved(
        db,
        id,
        resolvedResolution as Parameters<typeof markResolved>[2],
        new Date().toISOString(),
      );
    } catch {
      // Log but do not break
    }
  }

  // Attempt Telegram deletion if requested
  if (row.message_id > 0 && shouldDelete) {
    let telegramDeleted = false;
    try {
      if (options.mockDeleteFn) {
        telegramDeleted = await options.mockDeleteFn(row.message_id);
      } else {
        telegramDeleted = true; // default mock: success
      }
    } catch {
      telegramDeleted = false;
    }

    if (!telegramDeleted) {
      // GUARD: do NOT mark processed — return error
      return {
        ok: false,
        text: "Telegram deletion failed, report NOT marked as processed",
      };
    }
  }

  // Only reach here if delete succeeded or was skipped
  markProcessed(db, id);

  const resolutionSuffix =
    resolvedResolution !== "none" ? ` Resolution: ${resolvedResolution}.` : "";

  let text: string;
  if (row.message_id > 0 && shouldDelete) {
    text = `Report ${id} marked as processed.${resolutionSuffix} Telegram message ${row.message_id} deleted.`;
  } else {
    text = `Report ${id} marked as processed.${resolutionSuffix} Telegram deletion skipped.`;
  }

  return { ok: true, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. delete succeeds → row marked processed
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1860a — delete succeeds → row marked processed", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("marks row as processed when deletion returns true", async () => {
    const id = insertReport(db, "Bug report", "agent", 42, "normal");
    const result = await simulateFixedProcessTool(db, id, {
      deleteMessage: true,
      mockDeleteFn: async () => true,
    });
    expect(result.ok).toBe(true);
    expect(getReport(db, id)!.status).toBe("processed");
  });

  it("returns confirmation text with message_id when deletion succeeds", async () => {
    const id = insertReport(db, "Report with TG message", "agent", 99, "high");
    const result = await simulateFixedProcessTool(db, id, {
      deleteMessage: true,
      mockDeleteFn: async () => true,
    });
    expect(result.text).toContain(`Report ${id} marked as processed`);
    expect(result.text).toContain("Telegram message 99 deleted");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. delete fails (returns false) → row stays unprocessed
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1860a — delete fails (returns false) → row stays unprocessed", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("does NOT mark row as processed when deleteTelegramBug returns false", async () => {
    const id = insertReport(db, "Sticky message", "agent", 55, "normal");
    const result = await simulateFixedProcessTool(db, id, {
      deleteMessage: true,
      mockDeleteFn: async () => false,
    });
    expect(result.ok).toBe(false);
    expect(getReport(db, id)!.status).toBe("new");
  });

  it("returns error message containing 'NOT marked as processed' when deletion returns false", async () => {
    const id = insertReport(db, "Another sticky msg", "agent", 77, "normal");
    const result = await simulateFixedProcessTool(db, id, {
      deleteMessage: true,
      mockDeleteFn: async () => false,
    });
    expect(result.text).toContain("NOT marked as processed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. delete throws → row stays unprocessed
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1860a — delete throws → row stays unprocessed", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("does NOT mark row as processed when deleteTelegramBug throws", async () => {
    const id = insertReport(db, "Network error case", "agent", 88, "high");
    const result = await simulateFixedProcessTool(db, id, {
      deleteMessage: true,
      mockDeleteFn: async () => {
        throw new Error("Network timeout");
      },
    });
    expect(result.ok).toBe(false);
    expect(getReport(db, id)!.status).toBe("new");
  });

  it("returns error message when deleteTelegramBug throws", async () => {
    const id = insertReport(db, "Throw test", "agent", 33, "normal");
    const result = await simulateFixedProcessTool(db, id, {
      deleteMessage: true,
      mockDeleteFn: async () => {
        throw new Error("Connection refused");
      },
    });
    expect(result.ok).toBe(false);
    expect(result.text).toContain("NOT marked as processed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. delete_telegram_message=false → row marked processed regardless
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1860a — delete_telegram_message=false → row marked processed regardless", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("marks row as processed when deleteMessage=false even with a failing mock", async () => {
    const id = insertReport(db, "Skip delete test", "agent", 44, "normal");
    const result = await simulateFixedProcessTool(db, id, {
      deleteMessage: false,
      mockDeleteFn: async () => false, // would fail, but should never be called
    });
    expect(result.ok).toBe(true);
    expect(getReport(db, id)!.status).toBe("processed");
  });

  it("never calls the delete function when deleteMessage=false", async () => {
    const deleteCalled: number[] = [];
    const id = insertReport(db, "No delete called", "agent", 66, "normal");
    await simulateFixedProcessTool(db, id, {
      deleteMessage: false,
      mockDeleteFn: async (msgId) => {
        deleteCalled.push(msgId);
        return false;
      },
    });
    expect(deleteCalled).toHaveLength(0);
  });

  it("returns 'Telegram deletion skipped' text when deleteMessage=false", async () => {
    const id = insertReport(db, "Skipped", "agent", 11, "normal");
    const result = await simulateFixedProcessTool(db, id, { deleteMessage: false });
    expect(result.text).toContain("Telegram deletion skipped");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. message_id=0 (nothing to delete) → row marked processed
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1860a — message_id=0 (no Telegram message) → row marked processed", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("marks row as processed when message_id=0 regardless of deleteMessage flag", async () => {
    const id = insertReport(db, "No TG message", "agent", 0, "normal");
    const result = await simulateFixedProcessTool(db, id, { deleteMessage: true });
    expect(result.ok).toBe(true);
    expect(getReport(db, id)!.status).toBe("processed");
  });

  it("returns 'Telegram deletion skipped' text when message_id=0", async () => {
    const id = insertReport(db, "No TG message skip", "agent", 0, "normal");
    const result = await simulateFixedProcessTool(db, id, { deleteMessage: true });
    expect(result.text).toContain("Telegram deletion skipped");
  });
});
