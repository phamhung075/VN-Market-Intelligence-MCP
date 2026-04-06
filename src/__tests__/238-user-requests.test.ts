/**
 * Task 238 — /ask + /why Telegram commands with async AI response
 *
 * Tests:
 *   - insertUserRequest creates row with status='pending'
 *   - getPendingRequests returns pending only, respects limit
 *   - markAnswered sets status='done' + response + answered_at
 *   - /ask with text inserts row and returns confirmation
 *   - /ask without text returns usage hint
 *   - /why VCB creates "Why did VCB move today?" payload
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  insertUserRequest,
  getPendingRequests,
  markAnswered,
  ensureUserRequestsTable,
  type UserRequest,
} from "../infrastructure/db/userRequestStore.js";
import { handleTelegramCommand } from "../infrastructure/notifiers/telegramCommands.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test database factory
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");

  // Ensure user_requests table
  ensureUserRequestsTable(db);

  // Minimal tables expected by telegramCommands.ts
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      company_name TEXT,
      exchange TEXT NOT NULL,
      domain TEXT NOT NULL DEFAULT 'other'
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices (
      code TEXT PRIMARY KEY,
      price REAL,
      change_amt REAL,
      change_pct REAL,
      volume REAL,
      updated_at TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      shares INTEGER NOT NULL,
      avg_price REAL NOT NULL,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      level TEXT NOT NULL,
      source_title TEXT,
      sentiment TEXT,
      impact_score REAL
    )
  `);

  return db;
}

function makeUpdate(text: string) {
  return {
    message: {
      chat: { id: 12345 },
      text,
      from: { first_name: "Test" },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Store tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 238 — userRequestStore", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    ensureUserRequestsTable(db);
  });

  it("insertUserRequest creates row with status='pending'", () => {
    const id = insertUserRequest(db, "ask", "VCB giam vi sao?");

    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);

    const row = db
      .prepare<UserRequest, [number]>(
        "SELECT * FROM user_requests WHERE id = ?",
      )
      .get(id);

    expect(row).not.toBeNull();
    expect(row!.command).toBe("ask");
    expect(row!.payload).toBe("VCB giam vi sao?");
    expect(row!.status).toBe("pending");
    expect(row!.response).toBeNull();
    expect(row!.answered_at).toBeNull();
  });

  it("getPendingRequests returns only pending rows", () => {
    const id1 = insertUserRequest(db, "ask", "Question 1");
    const id2 = insertUserRequest(db, "ask", "Question 2");

    // Mark one as done
    markAnswered(db, id1, "Answer 1");

    const pending = getPendingRequests(db);

    expect(pending.length).toBe(1);
    expect(pending[0]!.id).toBe(id2);
    expect(pending[0]!.status).toBe("pending");
  });

  it("getPendingRequests respects limit parameter", () => {
    insertUserRequest(db, "ask", "Q1");
    insertUserRequest(db, "ask", "Q2");
    insertUserRequest(db, "ask", "Q3");
    insertUserRequest(db, "ask", "Q4");

    const limited = getPendingRequests(db, 2);
    expect(limited.length).toBe(2);
  });

  it("getPendingRequests returns rows ordered by created_at ASC", () => {
    // Insert with slight delay to get different created_at values
    const id1 = insertUserRequest(db, "ask", "First question");
    const id2 = insertUserRequest(db, "ask", "Second question");

    const pending = getPendingRequests(db, 10);
    expect(pending[0]!.id).toBe(id1);
    expect(pending[1]!.id).toBe(id2);
  });

  it("markAnswered sets status='done', response, and answered_at", () => {
    const id = insertUserRequest(db, "ask", "Test question");

    markAnswered(db, id, "This is the answer");

    const row = db
      .prepare<UserRequest, [number]>(
        "SELECT * FROM user_requests WHERE id = ?",
      )
      .get(id);

    expect(row!.status).toBe("done");
    expect(row!.response).toBe("This is the answer");
    expect(row!.answered_at).not.toBeNull();
    expect(typeof row!.answered_at).toBe("string");
  });

  it("getPendingRequests returns empty array when all done", () => {
    const id = insertUserRequest(db, "ask", "Only question");
    markAnswered(db, id, "Answer");

    const pending = getPendingRequests(db);
    expect(pending.length).toBe(0);
  });

  it("insertUserRequest returns incrementing IDs", () => {
    const id1 = insertUserRequest(db, "ask", "Q1");
    const id2 = insertUserRequest(db, "ask", "Q2");

    expect(id2).toBeGreaterThan(id1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Telegram command tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 238 — /ask Telegram command", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("inserts a row into user_requests and returns confirmation", async () => {
    const result = await handleTelegramCommand(
      makeUpdate("/ask VCB giam vi sao hom nay?"),
      db,
    );

    expect(result).not.toBeNull();
    expect(result!.text).toContain("Dang phan tich");
    expect(result!.text).toContain("15 phut");
    expect(result!.text).toContain("ID:");

    // Verify row inserted
    const rows = db
      .prepare<UserRequest, []>("SELECT * FROM user_requests")
      .all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.payload).toBe("VCB giam vi sao hom nay?");
    expect(rows[0]!.command).toBe("ask");
    expect(rows[0]!.status).toBe("pending");
  });

  it("returns usage hint when no text provided", async () => {
    const result = await handleTelegramCommand(makeUpdate("/ask"), db);

    expect(result).not.toBeNull();
    expect(result!.text).toContain("Su dung");
    expect(result!.text).toContain("/ask");

    // No row should be inserted
    const count = db
      .prepare<{ c: number }, []>(
        "SELECT COUNT(*) as c FROM user_requests",
      )
      .get()!.c;
    expect(count).toBe(0);
  });

  it("returns usage hint when text is only whitespace", async () => {
    const result = await handleTelegramCommand(makeUpdate("/ask   "), db);

    expect(result).not.toBeNull();
    expect(result!.text).toContain("Su dung");
  });

  it("response contains the inserted row ID", async () => {
    const result = await handleTelegramCommand(
      makeUpdate("/ask FPT tang vi sao?"),
      db,
    );

    const rows = db
      .prepare<UserRequest, []>("SELECT * FROM user_requests")
      .all();
    const insertedId = rows[0]!.id;

    expect(result!.text).toContain(`ID: ${insertedId}`);
  });
});

describe("Task 238 — /why Telegram command", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("/why VCB creates 'why:VCB' payload (Task 307: structured prefix)", async () => {
    const result = await handleTelegramCommand(makeUpdate("/why VCB"), db);

    expect(result).not.toBeNull();
    expect(result!.text).toContain("ID:");

    const rows = db
      .prepare<UserRequest, []>("SELECT * FROM user_requests")
      .all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.payload).toBe("why:VCB");
    expect(rows[0]!.command).toBe("ask");
  });

  it("/why without ticker returns usage hint (Task 307: no-arg guard)", async () => {
    const result = await handleTelegramCommand(makeUpdate("/why"), db);

    expect(result).not.toBeNull();
    expect(result!.text).toContain("/why VCB");

    // No row inserted
    const count = db
      .prepare<{ c: number }, []>(
        "SELECT COUNT(*) as c FROM user_requests",
      )
      .get()!.c;
    expect(count).toBe(0);
  });

  it("/why FPT creates correct payload (Task 307: structured prefix)", async () => {
    await handleTelegramCommand(makeUpdate("/why FPT"), db);

    const rows = db
      .prepare<UserRequest, []>("SELECT * FROM user_requests")
      .all();
    expect(rows[0]!.payload).toBe("why:FPT");
  });
});

describe("Task 238 — /help includes /ask and /why", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("lists /ask in help output", async () => {
    const result = await handleTelegramCommand(makeUpdate("/help"), db);
    expect(result!.text).toContain("/ask");
  });

  it("lists /why in help output", async () => {
    const result = await handleTelegramCommand(makeUpdate("/help"), db);
    expect(result!.text).toContain("/why");
  });
});
