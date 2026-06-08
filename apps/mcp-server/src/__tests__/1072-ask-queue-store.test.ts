Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1072 — ask_queue DDL + askQueueStore CRUD helpers
 *
 * Covers:
 *   1. DDL migration creates ask_queue with all required columns
 *   2. insertAskQuestion → returns id, status='pending'
 *   3. getPendingAskQuestions → FIFO order by received_at
 *   4. markAskProcessing → status='processing', processing_started_at set
 *   5. answerAskQuestion (answered) → status='answered', answer_text, answered_at
 *   6. answerAskQuestion (escalated) → status='escalated'
 *   7. recoverStaleProcessing → rows stuck in 'processing' for > threshold → back to 'pending'
 *   8. FIFO ordering across multiple users
 *   9. Parameterized SQL binding — injection-safe payload stored verbatim
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  insertAskQuestion,
  getPendingAskQuestions,
  markAskProcessing,
  answerAskQuestion,
  recoverStaleProcessing,
  type AskQueueRow,
  type AskStatus,
} from "../infrastructure/db/askQueueStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB fixture with ask_queue DDL
// ─────────────────────────────────────────────────────────────────────────────

let db: Database;

function createSchema(database: Database): void {
  database.exec(`
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
  database.exec(`CREATE INDEX IF NOT EXISTS idx_ask_queue_status   ON ask_queue(status)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_ask_queue_received ON ask_queue(received_at)`);
}

beforeEach(() => {
  db = new Database(":memory:");
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  createSchema(db);
});

afterEach(() => {
  db.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. DDL — ask_queue table columns exist
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1072 — ask_queue DDL", () => {
  it("ask_queue table has all required columns", () => {
    const rows = db
      .prepare("PRAGMA table_info(ask_queue)")
      .all() as Array<{ name: string }>;

    const cols = rows.map((r) => r.name);
    expect(cols).toContain("id");
    expect(cols).toContain("user_id");
    expect(cols).toContain("message");
    expect(cols).toContain("received_at");
    expect(cols).toContain("status");
    expect(cols).toContain("answered_at");
    expect(cols).toContain("answer_text");
    expect(cols).toContain("processing_started_at");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. insertAskQuestion
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1072 — insertAskQuestion", () => {
  it("returns a positive integer id", () => {
    const id = insertAskQuestion(db, "What is VCB price target?");
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("stored row has status='pending' and message set", () => {
    const id = insertAskQuestion(db, "FPT outlook?");
    const row = db
      .prepare<AskQueueRow, [number]>("SELECT * FROM ask_queue WHERE id = ?")
      .get(id);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("pending");
    expect(row!.message).toBe("FPT outlook?");
    expect(row!.user_id).toBe("default");
    expect(row!.answered_at).toBeNull();
    expect(row!.answer_text).toBeNull();
    expect(row!.processing_started_at).toBeNull();
  });

  it("stores custom userId when supplied", () => {
    const id = insertAskQuestion(db, "VNM buy?", "user_42");
    const row = db
      .prepare<AskQueueRow, [number]>("SELECT * FROM ask_queue WHERE id = ?")
      .get(id);
    expect(row!.user_id).toBe("user_42");
  });

  it("truncates messages longer than 2000 chars", () => {
    const longMsg = "x".repeat(2500);
    const id = insertAskQuestion(db, longMsg);
    const row = db
      .prepare<AskQueueRow, [number]>("SELECT * FROM ask_queue WHERE id = ?")
      .get(id);
    expect(row!.message.length).toBe(2000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. getPendingAskQuestions — FIFO ordering
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1072 — getPendingAskQuestions", () => {
  it("returns empty array when no pending rows", () => {
    const results = getPendingAskQuestions(db);
    expect(results).toEqual([]);
  });

  it("returns pending rows in FIFO order (received_at ASC)", () => {
    // Insert with explicit received_at to guarantee ordering
    db.exec(
      `INSERT INTO ask_queue (message, received_at, status) VALUES ('first', '2026-01-01 09:00:00', 'pending')`,
    );
    db.exec(
      `INSERT INTO ask_queue (message, received_at, status) VALUES ('second', '2026-01-01 09:01:00', 'pending')`,
    );
    db.exec(
      `INSERT INTO ask_queue (message, received_at, status) VALUES ('third', '2026-01-01 09:02:00', 'pending')`,
    );

    const results = getPendingAskQuestions(db);
    expect(results.length).toBe(3);
    expect(results[0]!.message).toBe("first");
    expect(results[1]!.message).toBe("second");
    expect(results[2]!.message).toBe("third");
  });

  it("does not return non-pending rows", () => {
    db.exec(
      `INSERT INTO ask_queue (message, status) VALUES ('answered-q', 'answered')`,
    );
    db.exec(
      `INSERT INTO ask_queue (message, status) VALUES ('processing-q', 'processing')`,
    );
    db.exec(
      `INSERT INTO ask_queue (message, status) VALUES ('pending-q', 'pending')`,
    );

    const results = getPendingAskQuestions(db);
    expect(results.length).toBe(1);
    expect(results[0]!.message).toBe("pending-q");
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 5; i++) {
      insertAskQuestion(db, `question ${i}`);
    }
    const results = getPendingAskQuestions(db, 2);
    expect(results.length).toBe(2);
  });

  it("returns id, message, received_at fields", () => {
    insertAskQuestion(db, "test question");
    const results = getPendingAskQuestions(db);
    expect(results.length).toBe(1);
    const item = results[0]!;
    expect(typeof item.id).toBe("number");
    expect(typeof item.message).toBe("string");
    expect(typeof item.received_at).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. markAskProcessing
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1072 — markAskProcessing", () => {
  it("transitions status pending → processing", () => {
    const id = insertAskQuestion(db, "VCB analysis?");
    markAskProcessing(db, id);

    const row = db
      .prepare<AskQueueRow, [number]>("SELECT * FROM ask_queue WHERE id = ?")
      .get(id);
    expect(row!.status).toBe("processing");
  });

  it("sets processing_started_at to a non-null timestamp", () => {
    const id = insertAskQuestion(db, "What sector leads?");
    markAskProcessing(db, id);

    const row = db
      .prepare<AskQueueRow, [number]>("SELECT * FROM ask_queue WHERE id = ?")
      .get(id);
    expect(row!.processing_started_at).not.toBeNull();
    expect(typeof row!.processing_started_at).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. answerAskQuestion — answered
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1072 — answerAskQuestion (answered)", () => {
  it("sets status=answered, answer_text, and answered_at", () => {
    const id = insertAskQuestion(db, "VNM target?");
    markAskProcessing(db, id);
    answerAskQuestion(db, id, "VNM target: 85,000 VND", "answered");

    const row = db
      .prepare<AskQueueRow, [number]>("SELECT * FROM ask_queue WHERE id = ?")
      .get(id);
    expect(row!.status).toBe("answered");
    expect(row!.answer_text).toBe("VNM target: 85,000 VND");
    expect(row!.answered_at).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. answerAskQuestion — escalated
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1072 — answerAskQuestion (escalated)", () => {
  it("sets status=escalated with answer_text preserved", () => {
    const id = insertAskQuestion(db, "Complex macro question");
    markAskProcessing(db, id);
    answerAskQuestion(db, id, "Escalated: requires deeper analysis", "escalated");

    const row = db
      .prepare<AskQueueRow, [number]>("SELECT * FROM ask_queue WHERE id = ?")
      .get(id);
    expect(row!.status).toBe("escalated");
    expect(row!.answer_text).toBe("Escalated: requires deeper analysis");
    expect(row!.answered_at).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. recoverStaleProcessing
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1072 — recoverStaleProcessing", () => {
  it("resets stale processing rows back to pending", () => {
    // Insert a row stuck in 'processing' for > 20 minutes
    db.exec(`
      INSERT INTO ask_queue (message, status, processing_started_at)
      VALUES ('stale question', 'processing', datetime('now', '-25 minutes'))
    `);

    const recovered = recoverStaleProcessing(db);
    expect(recovered).toBe(1);

    const row = db
      .prepare<AskQueueRow, []>("SELECT * FROM ask_queue LIMIT 1")
      .get();
    expect(row!.status).toBe("pending");
    expect(row!.processing_started_at).toBeNull();
  });

  it("does not touch recently-started processing rows", () => {
    // Insert a row that started processing just 5 minutes ago
    db.exec(`
      INSERT INTO ask_queue (message, status, processing_started_at)
      VALUES ('fresh question', 'processing', datetime('now', '-5 minutes'))
    `);

    const recovered = recoverStaleProcessing(db);
    expect(recovered).toBe(0);

    const row = db
      .prepare<AskQueueRow, []>("SELECT * FROM ask_queue LIMIT 1")
      .get();
    expect(row!.status).toBe("processing");
  });

  it("returns 0 when nothing to recover", () => {
    insertAskQuestion(db, "fresh pending question");
    const recovered = recoverStaleProcessing(db);
    expect(recovered).toBe(0);
  });

  it("accepts custom maxAgeMinutes parameter", () => {
    // Insert a row stuck for 10 minutes
    db.exec(`
      INSERT INTO ask_queue (message, status, processing_started_at)
      VALUES ('semi-stale question', 'processing', datetime('now', '-10 minutes'))
    `);

    // With default 20 min threshold — should NOT recover (only 10 min old)
    const notRecovered = recoverStaleProcessing(db);
    expect(notRecovered).toBe(0);

    // With 5 min threshold — should recover (10 min > 5 min)
    const recovered = recoverStaleProcessing(db, 5);
    expect(recovered).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. FIFO ordering across multiple users
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1072 — FIFO ordering across multiple users", () => {
  it("interleaved multi-user questions are returned in global FIFO order", () => {
    db.exec(`
      INSERT INTO ask_queue (user_id, message, received_at, status)
      VALUES ('user_A', 'A question 1', '2026-01-01 09:00:00', 'pending')
    `);
    db.exec(`
      INSERT INTO ask_queue (user_id, message, received_at, status)
      VALUES ('user_B', 'B question 1', '2026-01-01 09:00:30', 'pending')
    `);
    db.exec(`
      INSERT INTO ask_queue (user_id, message, received_at, status)
      VALUES ('user_A', 'A question 2', '2026-01-01 09:01:00', 'pending')
    `);
    db.exec(`
      INSERT INTO ask_queue (user_id, message, received_at, status)
      VALUES ('user_B', 'B question 2', '2026-01-01 09:01:30', 'pending')
    `);

    const results = getPendingAskQuestions(db);
    expect(results.length).toBe(4);
    expect(results[0]!.message).toBe("A question 1");
    expect(results[1]!.message).toBe("B question 1");
    expect(results[2]!.message).toBe("A question 2");
    expect(results[3]!.message).toBe("B question 2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Parameterized SQL binding — injection safety
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1072 — Parameterized SQL binding", () => {
  it("stores SQL injection payload verbatim without error", () => {
    const maliciousPayload = `'; DROP TABLE ask_queue; --`;
    expect(() => insertAskQuestion(db, maliciousPayload)).not.toThrow();

    const results = getPendingAskQuestions(db);
    expect(results.length).toBe(1);
    expect(results[0]!.message).toBe(maliciousPayload);

    // Table still exists — injection did not execute
    const tableCheck = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ask_queue'")
      .get();
    expect(tableCheck).not.toBeNull();
  });

  it("stores unicode and Vietnamese text verbatim", () => {
    const viMessage = "FPT có nên mua không? Tỷ suất sinh lời kỳ vọng?";
    const id = insertAskQuestion(db, viMessage);
    const row = db
      .prepare<AskQueueRow, [number]>("SELECT * FROM ask_queue WHERE id = ?")
      .get(id);
    expect(row!.message).toBe(viMessage);
  });
});
