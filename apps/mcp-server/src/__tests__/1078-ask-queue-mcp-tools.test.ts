Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1078 — askQueueTools MCP tools
 *
 * Tests for two MCP tools used by 07-qa-responder agent:
 *   1. get_pending_ask_questions — FIFO list of pending questions
 *   2. answer_ask_question       — mark a question answered|escalated|failed
 *
 * Strategy: create an in-memory SQLite DB, seed it, then invoke the
 * registerAskQueueTools function and call the handler callbacks directly
 * via a McpServer probe instance.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAskQueueTools } from "../interface/mcp/tools/system/askQueueTools.js";
import {
  insertAskQuestion,
  getPendingAskQuestions,
  answerAskQuestion,
  type AskStatus,
} from "../infrastructure/db/askQueueStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB fixture
// ─────────────────────────────────────────────────────────────────────────────

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS ask_queue (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                TEXT    NOT NULL DEFAULT 'default',
      message                TEXT    NOT NULL,
      received_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      status                 TEXT    NOT NULL DEFAULT 'pending',
      answered_at            TEXT,
      answer_text            TEXT,
      processing_started_at  TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ask_queue_status   ON ask_queue(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ask_queue_received ON ask_queue(received_at)`);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: extract tool handler from a registered McpServer
// McpServer stores tools in _registeredTools keyed by tool name.
// ─────────────────────────────────────────────────────────────────────────────

type ToolEntry = {
  handler: (args: Record<string, unknown>) => Promise<{ content: [{ type: string; text: string }, ...{ type: string; text: string }[]] }>;
};

function getToolHandler(server: McpServer, name: string): ToolEntry["handler"] {
  const tools = (server as unknown as { _registeredTools: Record<string, ToolEntry> })
    ._registeredTools;
  if (!tools[name]) throw new Error(`Tool '${name}' not registered`);
  return tools[name].handler;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1078 — askQueueTools MCP tools", () => {
  let db: Database;
  let server: McpServer;

  beforeEach(() => {
    db = createTestDb();
    server = new McpServer(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerAskQueueTools(server, db);
  });

  // ── Tool registration ──────────────────────────────────────────────────────

  it("registers get_pending_ask_questions tool", () => {
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(tools["get_pending_ask_questions"]).toBeDefined();
  });

  it("registers answer_ask_question tool", () => {
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(tools["answer_ask_question"]).toBeDefined();
  });

  // ── get_pending_ask_questions ──────────────────────────────────────────────

  it("returns empty list when no pending questions", async () => {
    const handler = getToolHandler(server, "get_pending_ask_questions");
    const result = await handler({});
    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(0);
  });

  it("returns pending questions in FIFO order", async () => {
    // Insert with tiny sleep trick avoided — use SQL to force ordering
    insertAskQuestion(db, "First question", "user1");
    insertAskQuestion(db, "Second question", "user2");

    const handler = getToolHandler(server, "get_pending_ask_questions");
    const result = await handler({});
    const text = result.content[0].text;
    const parsed = JSON.parse(text) as { id: number; user_id: string; message: string; received_at: string }[];

    expect(parsed.length).toBeGreaterThanOrEqual(2);
    // FIFO: first inserted comes first
    expect(parsed[0]!.message).toBe("First question");
    expect(parsed[1]!.message).toBe("Second question");
  });

  it("each item has id, message, received_at (store contract)", async () => {
    insertAskQuestion(db, "Test question", "user_abc");

    const handler = getToolHandler(server, "get_pending_ask_questions");
    const result = await handler({});
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>[];

    expect(parsed).toHaveLength(1);
    const item = parsed[0]!;
    expect(typeof item.id).toBe("number");
    expect(item.message).toBe("Test question");
    expect(typeof item.received_at).toBe("string");
  });

  it("does not return non-pending questions", async () => {
    const id1 = insertAskQuestion(db, "Pending question", "user1");
    const id2 = insertAskQuestion(db, "Answered question", "user2");
    // Mark id2 as answered
    answerAskQuestion(db, id2, "Some answer", "answered");

    const handler = getToolHandler(server, "get_pending_ask_questions");
    const result = await handler({});
    const parsed = JSON.parse(result.content[0].text) as { id: number }[];

    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.id).toBe(id1);
  });

  // ── answer_ask_question ────────────────────────────────────────────────────

  it("returns success=true and newStatus='answered' for valid answered call", async () => {
    const id = insertAskQuestion(db, "What is VCB ROE?", "user1");

    const handler = getToolHandler(server, "answer_ask_question");
    const result = await handler({ id, answer_text: "ROE is 22%", status: "answered" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.success).toBe(true);
    expect(parsed.id).toBe(id);
    expect(parsed.newStatus).toBe("answered");
  });

  it("returns success=true for status='escalated'", async () => {
    const id = insertAskQuestion(db, "Complex question", "user2");

    const handler = getToolHandler(server, "answer_ask_question");
    const result = await handler({ id, answer_text: "Escalated to analyst", status: "escalated" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.success).toBe(true);
    expect(parsed.newStatus).toBe("escalated");
  });

  it("returns success=true for status='failed'", async () => {
    const id = insertAskQuestion(db, "Unanswerable question", "user3");

    const handler = getToolHandler(server, "answer_ask_question");
    const result = await handler({ id, answer_text: "Could not process", status: "failed" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.success).toBe(true);
    expect(parsed.newStatus).toBe("failed");
  });

  it("actually persists the answer in the DB", async () => {
    const id = insertAskQuestion(db, "Persist test", "user1");

    const handler = getToolHandler(server, "answer_ask_question");
    await handler({ id, answer_text: "Persisted answer", status: "answered" });

    // Verify via DB query directly
    const row = db
      .query<{ status: string; answer_text: string }, [number]>(
        `SELECT status, answer_text FROM ask_queue WHERE id = ?`,
      )
      .get(id);

    expect(row).not.toBeNull();
    expect(row!.status).toBe("answered");
    expect(row!.answer_text).toBe("Persisted answer");
  });

  it("rejects unknown status with error response", async () => {
    const id = insertAskQuestion(db, "Some question", "user1");

    const handler = getToolHandler(server, "answer_ask_question");
    // 'pending' is not a valid terminal status
    const result = await handler({ id, answer_text: "text", status: "pending" });
    const text = result.content[0].text;

    // Should contain error indication
    expect(text.toLowerCase()).toContain("error");
  });

  it("returns MCP-compliant content shape for get_pending", async () => {
    const handler = getToolHandler(server, "get_pending_ask_questions");
    const result = await handler({});
    expect(result.content).toBeInstanceOf(Array);
    expect(result.content[0].type).toBe("text");
    expect(typeof result.content[0].text).toBe("string");
  });

  it("returns MCP-compliant content shape for answer_ask_question", async () => {
    const id = insertAskQuestion(db, "Shape test", "user1");
    const handler = getToolHandler(server, "answer_ask_question");
    const result = await handler({ id, answer_text: "ok", status: "answered" });
    expect(result.content).toBeInstanceOf(Array);
    expect(result.content[0].type).toBe("text");
    expect(typeof result.content[0].text).toBe("string");
  });
});
