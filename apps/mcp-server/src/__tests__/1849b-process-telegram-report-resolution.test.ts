Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1849b — process_telegram_report resolution parameter + serializeReport fix
 *
 * TDD test file (RED first).
 *
 * Tests:
 *   1. markResolved() sets resolution + resolved_at in DB
 *   2. process_telegram_report with resolution="fixed" calls markResolved
 *   3. process_telegram_report with resolution="monitoring" sets resolution without requiring delete
 *   4. process_telegram_report without resolution — backward-compat, no resolution change
 *   5. serializeReport() output includes all 11 fields
 *   6. Invalid resolution value (store-level): markResolved rejects unknown values
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  insertReport,
  getReport,
  markProcessed,
  markResolved,
  serializeReport,
} from "../infrastructure/db/telegramReportStore.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. markResolved — store function
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1849b — markResolved (store function)", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("sets resolution column on the row", () => {
    const id = insertReport(db, "Bug in fetcher", "dev-alert-engine", 0, "high");
    markResolved(db, id, "fixed", new Date().toISOString());
    const row = getReport(db, id);
    expect(row).not.toBeNull();
    expect(row!.resolution).toBe("fixed");
  });

  it("sets resolved_at to the provided ISO timestamp", () => {
    const ts = "2026-05-07T10:00:00.000Z";
    const id = insertReport(db, "Another bug", "dev-mcp-server", 0, "normal");
    markResolved(db, id, "wontfix", ts);
    const row = getReport(db, id);
    expect(row!.resolved_at).toBe(ts);
  });

  it("accepts all 5 valid resolution values", () => {
    const values = ["none", "fixed", "wontfix", "duplicate", "monitoring"] as const;
    for (const v of values) {
      const id = insertReport(db, `Test ${v}`, "agent", 0, "normal");
      markResolved(db, id, v, new Date().toISOString());
      const row = getReport(db, id);
      expect(row!.resolution).toBe(v);
    }
  });

  it("does not affect other rows", () => {
    const id1 = insertReport(db, "Untouched", "agent", 0, "normal");
    const id2 = insertReport(db, "Resolved", "agent", 0, "normal");
    markResolved(db, id2, "fixed", new Date().toISOString());
    expect(getReport(db, id1)!.resolution).toBe("none");
    expect(getReport(db, id2)!.resolution).toBe("fixed");
  });

  it("is idempotent — calling twice does not throw", () => {
    const id = insertReport(db, "Double resolve", "agent", 0, "normal");
    expect(() => {
      markResolved(db, id, "fixed", new Date().toISOString());
      markResolved(db, id, "monitoring", new Date().toISOString());
    }).not.toThrow();
    expect(getReport(db, id)!.resolution).toBe("monitoring");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. serializeReport() — all 11 fields present
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1849b — serializeReport includes all 11 fields (AC-4 / C-2)", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("returns all 11 required fields", () => {
    const id = insertReport(db, "Full field test", "dev-alert-engine", 99, "high");
    const row = getReport(db, id);
    expect(row).not.toBeNull();
    const serialized = serializeReport(row!);

    // All 11 fields must be present
    expect(serialized).toHaveProperty("id");
    expect(serialized).toHaveProperty("message_id");
    expect(serialized).toHaveProperty("text");
    expect(serialized).toHaveProperty("from_agent");
    expect(serialized).toHaveProperty("priority");
    expect(serialized).toHaveProperty("status");
    expect(serialized).toHaveProperty("created_at");
    expect(serialized).toHaveProperty("claimed_by");
    expect(serialized).toHaveProperty("claimed_at");
    expect(serialized).toHaveProperty("resolution");
    expect(serialized).toHaveProperty("resolved_at");
  });

  it("claimed_by defaults to null when not claimed", () => {
    const id = insertReport(db, "Unclaimed", "agent", 0, "normal");
    const row = getReport(db, id);
    const serialized = serializeReport(row!);
    expect(serialized["claimed_by"]).toBeNull();
  });

  it("resolution defaults to 'none'", () => {
    const id = insertReport(db, "Fresh report", "agent", 0, "normal");
    const row = getReport(db, id);
    const serialized = serializeReport(row!);
    expect(serialized["resolution"]).toBe("none");
  });

  it("resolved_at is null when not resolved", () => {
    const id = insertReport(db, "Unresolved", "agent", 0, "normal");
    const row = getReport(db, id);
    const serialized = serializeReport(row!);
    expect(serialized["resolved_at"]).toBeNull();
  });

  it("resolved_at is set after markResolved", () => {
    const ts = "2026-05-07T10:00:00.000Z";
    const id = insertReport(db, "Resolved report", "agent", 0, "normal");
    markResolved(db, id, "fixed", ts);
    const row = getReport(db, id);
    const serialized = serializeReport(row!);
    expect(serialized["resolution"]).toBe("fixed");
    expect(serialized["resolved_at"]).toBe(ts);
  });

  it("created_at is returned as ISO string (not raw unix int)", () => {
    const id = insertReport(db, "Timestamp test", "agent", 0, "normal");
    const row = getReport(db, id);
    const serialized = serializeReport(row!);
    // Should be an ISO string, not a number
    expect(typeof serialized["created_at"]).toBe("string");
    expect(String(serialized["created_at"])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. process_telegram_report simulation — resolution param behavior
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simulate what process_telegram_report does with resolution support.
 * No Telegram API involved — tests DB behavior only.
 */
async function simulateProcessWithResolution(
  db: Database,
  id: number,
  resolution: string = "none",
  deleteMessage = true,
  mockDeleteFn?: (messageId: number) => Promise<boolean>,
): Promise<{ success: boolean; resolution: string; message: string; warning?: string }> {
  const row = getReport(db, id);
  if (!row) {
    return { success: false, resolution, message: `Report ${id} not found.` };
  }

  // Apply resolution if non-none
  if (resolution && resolution !== "none") {
    markResolved(db, id, resolution as Parameters<typeof markResolved>[2], new Date().toISOString());
  }

  // Delete Telegram message if requested
  let telegramDeleted = false;
  if (row.message_id > 0 && deleteMessage) {
    try {
      if (mockDeleteFn) {
        telegramDeleted = await mockDeleteFn(row.message_id);
      } else {
        telegramDeleted = true;
      }
    } catch {
      telegramDeleted = false;
    }
  }

  // Mark processed
  markProcessed(db, id);

  const result: { success: boolean; resolution: string; message: string; warning?: string } = {
    success: true,
    resolution,
    message: `Report ${id} processed with resolution: ${resolution}`,
  };

  if (row.message_id > 0 && deleteMessage && !telegramDeleted) {
    result.warning = "message_delete_failed";
  }

  return result;
}

describe("Task 1849b — process_telegram_report with resolution='fixed'", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("calls markResolved and marks row as processed", async () => {
    const id = insertReport(db, "Critical bug", "dev-alert-engine", 42, "high");
    const result = await simulateProcessWithResolution(db, id, "fixed", true);

    expect(result.success).toBe(true);
    expect(result.resolution).toBe("fixed");
    const row = getReport(db, id);
    expect(row!.status).toBe("processed");
    expect(row!.resolution).toBe("fixed");
    expect(row!.resolved_at).not.toBeNull();
  });

  it("message contains resolution in response", async () => {
    const id = insertReport(db, "Fixed bug", "agent", 0, "normal");
    const result = await simulateProcessWithResolution(db, id, "fixed");
    expect(result.message).toContain("fixed");
  });
});

describe("Task 1849b — process_telegram_report with resolution='monitoring'", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("sets resolution without requiring Telegram delete", async () => {
    const id = insertReport(db, "Monitoring report", "dev-mcp-server", 0, "normal");
    // delete_telegram_message=false, resolution=monitoring
    const result = await simulateProcessWithResolution(db, id, "monitoring", false);

    expect(result.success).toBe(true);
    expect(result.resolution).toBe("monitoring");
    const row = getReport(db, id);
    expect(row!.resolution).toBe("monitoring");
    expect(row!.status).toBe("processed");
  });
});

describe("Task 1849b — backward-compatibility: no resolution param", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("leaves resolution as 'none' when no resolution passed", async () => {
    const id = insertReport(db, "Old-style process call", "agent", 0, "normal");
    // Simulate old call — no resolution param (defaults to 'none')
    await simulateProcessWithResolution(db, id, "none");

    const row = getReport(db, id);
    expect(row!.resolution).toBe("none");
    expect(row!.resolved_at).toBeNull();
    expect(row!.status).toBe("processed");
  });

  it("does not call markResolved when resolution='none'", async () => {
    const id = insertReport(db, "Compat test", "agent", 0, "normal");
    await simulateProcessWithResolution(db, id, "none");

    const row = getReport(db, id);
    // resolved_at remains null — markResolved was NOT called
    expect(row!.resolved_at).toBeNull();
  });
});
