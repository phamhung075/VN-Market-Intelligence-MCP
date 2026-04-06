/**
 * Task 305 — user_requests MCP Tools
 *
 * TDD tests for:
 *   - log_user_request(question, source) → { id, status: 'pending' }
 *   - get_pending_user_requests(limit?) → UserRequest[]
 *
 * Tests use an in-memory SQLite database and call the store functions
 * directly to verify the business logic underneath the MCP tool registration.
 *
 * @module __tests__/305-user-requests-mcp-tools
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";

import {
  ensureUserRequestsTable,
  insertUserRequest,
  getPendingRequests,
  markAnswered,
  type UserRequest,
} from "../infrastructure/db/userRequestStore.js";

import {
  logUserRequest,
  getPendingUserRequests,
} from "../interface/mcp/tools/userRequestTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  ensureUserRequestsTable(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: logUserRequest (business logic)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 305 — logUserRequest", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("inserts a row with command='ask', status='pending', and returns {id, status}", () => {
    const result = logUserRequest(db, "Cho toi biet VNM hom nay?", "user");

    expect(result.status).toBe("pending");
    expect(typeof result.id).toBe("number");
    expect(result.id).toBeGreaterThan(0);
  });

  it("persists the correct payload in the database", () => {
    const question = "Cho toi biet VNM hom nay?";
    const result = logUserRequest(db, question, "user");

    const rows = getPendingRequests(db, 10);
    const inserted = rows.find((r) => r.id === result.id);

    expect(inserted).toBeDefined();
    expect(inserted!.command).toBe("ask");
    expect(inserted!.payload).toBe(question);
    expect(inserted!.status).toBe("pending");
  });

  it("returns distinct ids for successive calls", () => {
    const r1 = logUserRequest(db, "Question one?", "user");
    const r2 = logUserRequest(db, "Question two?", "user");

    expect(r1.id).not.toBe(r2.id);
  });

  it("stores source label in payload or as command regardless of source param", () => {
    // source param is informational — stored as command always 'ask'
    const r = logUserRequest(db, "Test question", "telegram");
    const rows = getPendingRequests(db, 10);
    const row = rows.find((x) => x.id === r.id);

    expect(row!.command).toBe("ask");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: getPendingUserRequests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 305 — getPendingUserRequests", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("returns empty array when no pending requests exist", () => {
    const result = getPendingUserRequests(db, 5);
    expect(result).toEqual([]);
  });

  it("returns pending rows ordered by created_at ASC", () => {
    insertUserRequest(db, "ask", "First question");
    insertUserRequest(db, "ask", "Second question");
    insertUserRequest(db, "ask", "Third question");

    const rows = getPendingUserRequests(db, 10);

    expect(rows.length).toBe(3);
    const [r0, r1, r2] = rows;
    expect(r0?.payload).toBe("First question");
    expect(r1?.payload).toBe("Second question");
    expect(r2?.payload).toBe("Third question");
  });

  it("respects the limit parameter (default 5)", () => {
    for (let i = 0; i < 8; i++) {
      insertUserRequest(db, "ask", `Question ${i}`);
    }

    const defaultRows = getPendingUserRequests(db);
    expect(defaultRows.length).toBe(5);

    const limitedRows = getPendingUserRequests(db, 3);
    expect(limitedRows.length).toBe(3);
  });

  it("excludes rows that have been marked answered (status='done')", () => {
    const id1 = insertUserRequest(db, "ask", "Answered question");
    insertUserRequest(db, "ask", "Pending question");

    markAnswered(db, id1, "Here is your answer");

    const rows = getPendingUserRequests(db, 10);

    expect(rows.length).toBe(1);
    expect(rows[0]?.payload).toBe("Pending question");
  });

  it("returns all required fields on each row", () => {
    insertUserRequest(db, "ask", "Full row question?");

    const rows = getPendingUserRequests(db, 5);

    expect(rows.length).toBe(1);
    const row = rows[0] as UserRequest;
    expect(typeof row.id).toBe("number");
    expect(typeof row.command).toBe("string");
    expect(typeof row.payload).toBe("string");
    expect(typeof row.status).toBe("string");
    expect(typeof row.created_at).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: MCP tool output format
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 305 — MCP tool registration", () => {
  it("registerUserRequestTools exports a function", async () => {
    const mod = await import("../interface/mcp/tools/userRequestTools.js");
    expect(typeof mod.registerUserRequestTools).toBe("function");
  });

  it("logUserRequest is exported from userRequestTools", async () => {
    const mod = await import("../interface/mcp/tools/userRequestTools.js");
    expect(typeof mod.logUserRequest).toBe("function");
  });

  it("getPendingUserRequests is exported from userRequestTools", async () => {
    const mod = await import("../interface/mcp/tools/userRequestTools.js");
    expect(typeof mod.getPendingUserRequests).toBe("function");
  });
});
