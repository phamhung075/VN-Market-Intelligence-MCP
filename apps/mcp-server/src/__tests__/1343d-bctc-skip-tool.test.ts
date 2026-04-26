/**
 * Task 1343d — bctc_skip_queue_item MCP Tool Tests
 *
 * Covers:
 *   1. Mark queue item as skipped + verify attempts incremented
 *   2. Invalid queue item (not in DB) returns error response
 *   3. Skip reason is included in the success message
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database as SqliteDatabase } from "bun:sqlite";
import type { Database } from "bun:sqlite";

import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { registerBctcSkipTool } from "../interface/mcp/tools/financial-reports/bctcSkipTool.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal McpServer stub — captures tool handler by name
// ─────────────────────────────────────────────────────────────────────────────

type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

class FakeMcpServer {
  private handlers: Map<string, ToolHandler> = new Map();

  tool(name: string, _desc: string, _schema: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  async call(name: string, params: Record<string, unknown>): Promise<unknown> {
    const h = this.handlers.get(name);
    if (!h) throw new Error(`Tool not registered: ${name}`);
    return h(params);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function insertPendingItem(
  db: Database,
  actionCode: string,
  year: number,
  quarter: string,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, attempts)
    VALUES (?, ?, ?, 'pending', 0)
  `).run(actionCode, year, quarter);
}

interface QueueRow {
  status: string;
  attempts: number;
  last_attempt: string | null;
}

function getQueueRow(db: Database, code: string, year: number, quarter: string): QueueRow | null {
  return db.query<QueueRow, [string, number, string]>(`
    SELECT status, attempts, last_attempt
    FROM bctc_vps_queue
    WHERE action_code = ? AND period_year = ? AND period_quarter = ?
  `).get(code, year, quarter);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1343d — bctc_skip_queue_item MCP Tool", () => {
  let testDb: Database;
  let fakeServer: FakeMcpServer;

  beforeEach(async () => {
    closeDb();
    testDb = new SqliteDatabase(":memory:");
    testDb.exec("PRAGMA foreign_keys = ON");
    testDb.exec("PRAGMA journal_mode = WAL");
    await initDatabase(testDb);
    testDb.exec("DELETE FROM bctc_vps_queue");

    fakeServer = new FakeMcpServer();
    registerBctcSkipTool(fakeServer as never, testDb);
  });

  afterEach(() => {
    testDb.close();
    closeDb();
  });

  // ── Test 1: Mark queue item as skipped + verify attempts incremented ────────
  it("marks a pending queue item as skipped and increments attempts", async () => {
    insertPendingItem(testDb, "FPT", 2025, "Q1");

    const result = await fakeServer.call("bctc_skip_queue_item", {
      action_code: "FPT",
      period_year: 2025,
      period_quarter: "Q1",
      skip_reason: "404 not found",
    }) as { content: Array<{ type: string; text: string }> };

    const payload = JSON.parse(result.content[0].text) as {
      success: boolean;
      updates: { status: string; attempts_incremented: boolean };
    };

    expect(payload.success).toBe(true);

    const row = getQueueRow(testDb, "FPT", 2025, "Q1");
    expect(row).not.toBeNull();
    expect(row!.status).toBe("skipped");
    expect(row!.attempts).toBe(1);
  });

  // ── Test 2: Invalid queue item returns error ────────────────────────────────
  it("returns error response when queue item does not exist", async () => {
    const result = await fakeServer.call("bctc_skip_queue_item", {
      action_code: "XXX",
      period_year: 2025,
      period_quarter: "Q3",
    }) as { content: Array<{ type: string; text: string }> };

    const payload = JSON.parse(result.content[0].text) as {
      success: boolean;
      message: string;
    };

    expect(payload.success).toBe(false);
    expect(payload.message).toContain("not found");
  });

  // ── Test 3: Skip reason is included in the logged message ──────────────────
  it("includes skip_reason in the success message", async () => {
    insertPendingItem(testDb, "VCB", 2024, "Q4");

    const result = await fakeServer.call("bctc_skip_queue_item", {
      action_code: "VCB",
      period_year: 2024,
      period_quarter: "Q4",
      skip_reason: "malformed URL",
    }) as { content: Array<{ type: string; text: string }> };

    const payload = JSON.parse(result.content[0].text) as {
      success: boolean;
      message: string;
    };

    expect(payload.success).toBe(true);
    expect(payload.message).toContain("malformed URL");
  });
});
