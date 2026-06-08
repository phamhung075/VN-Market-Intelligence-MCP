Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1073 — Telegram /ask Handler
 *
 * TDD test suite for the /ask command handler.
 * Tests:
 *   1. Valid /ask enqueues to ask_queue with status='pending'
 *   2. Reply matches regex "Câu hỏi đã ghi nhận (#<id>)"
 *   3. Empty /ask → error reply with usage hint, no DB row inserted
 *   4. /ask with only whitespace → same as empty
 *   5. Long message accepted (no arbitrary length cap)
 *   6. FIFO ordering: multiple /ask calls preserve insertion order
 *   7. userId from Telegram from.id is stored in user_id column
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  handleTelegramCommand,
  type TelegramUpdate,
} from "../infrastructure/notifiers/telegramCommands.js";
import { getPendingAskQuestions } from "../infrastructure/db/askQueueStore.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeUpdate(text: string, userId?: number): TelegramUpdate {
  return {
    message: {
      chat: { id: 12345 },
      text,
      from: { first_name: "Test", id: userId ?? 99999 },
    },
  };
}

function makeDb(): Database {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code         TEXT PRIMARY KEY,
      company_name TEXT,
      exchange     TEXT,
      domain       TEXT
    );

    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      INTEGER,
      updated_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS agent_feedback (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      agent      TEXT,
      category   TEXT,
      title      TEXT,
      detail     TEXT,
      priority   TEXT,
      status     TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS positions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT    NOT NULL UNIQUE,
      shares      INTEGER NOT NULL DEFAULT 0,
      avg_price   REAL    NOT NULL DEFAULT 0,
      opened_at   TEXT    NOT NULL,
      closed_at   TEXT,
      notes       TEXT
    );

    CREATE TABLE IF NOT EXISTS ask_queue (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                TEXT    NOT NULL DEFAULT 'default',
      message                TEXT    NOT NULL,
      received_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      status                 TEXT    NOT NULL DEFAULT 'pending',
      answered_at            TEXT,
      answer_text            TEXT,
      processing_started_at  TEXT
    );
  `);

  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

let db: Database;

beforeEach(() => {
  db = makeDb();
});

afterEach(() => {
  db.close();
});

describe("Task 1073 — Telegram /ask handler", () => {
  it("valid /ask enqueues a row with status=pending", async () => {
    const update = makeUpdate("/ask FPT có nên mua không?");
    await handleTelegramCommand(update, db);

    const rows = getPendingAskQuestions(db, 10);
    expect(rows.length).toBe(1);
    expect(rows[0]!.message).toBe("FPT có nên mua không?");
  });

  it("reply matches 'Câu hỏi đã ghi nhận (#<id>)'", async () => {
    const update = makeUpdate("/ask VCB có triển vọng không?");
    const result = await handleTelegramCommand(update, db);

    expect(result).not.toBeNull();
    expect(result!.text).toMatch(/Câu hỏi đã ghi nhận \(#[0-9]+\)/);
    expect(result!.text).toContain("Đang xử lý");
  });

  it("reply includes the assigned queue id", async () => {
    const update = makeUpdate("/ask FPT");
    const result = await handleTelegramCommand(update, db);

    const rows = getPendingAskQuestions(db, 10);
    const id = rows[0]!.id;
    expect(result!.text).toContain(`(#${id})`);
  });

  it("empty /ask → usage hint, no DB row inserted", async () => {
    const update = makeUpdate("/ask");
    const result = await handleTelegramCommand(update, db);

    expect(result).not.toBeNull();
    expect(result!.text).toContain("Vui lòng cung cấp câu hỏi sau /ask");
    expect(result!.text).toContain("/ask VCB");

    const rows = getPendingAskQuestions(db, 10);
    expect(rows.length).toBe(0);
  });

  it("/ask with only whitespace → usage hint, no row inserted", async () => {
    const update = makeUpdate("/ask   ");
    const result = await handleTelegramCommand(update, db);

    expect(result!.text).toContain("Vui lòng cung cấp câu hỏi sau /ask");

    const rows = getPendingAskQuestions(db, 10);
    expect(rows.length).toBe(0);
  });

  it("long message (>500 chars) is accepted without error", async () => {
    const longText = "Phân tích chi tiết ".repeat(50); // ~950 chars
    const update = makeUpdate(`/ask ${longText}`);
    const result = await handleTelegramCommand(update, db);

    expect(result!.text).toMatch(/Câu hỏi đã ghi nhận \(#[0-9]+\)/);

    const rows = getPendingAskQuestions(db, 10);
    expect(rows.length).toBe(1);
    // message stored (may be truncated to 2000 chars by store)
    expect(rows[0]!.message.length).toBeGreaterThan(0);
  });

  it("FIFO ordering: two questions from same user preserve insertion order", async () => {
    await handleTelegramCommand(makeUpdate("/ask câu hỏi 1"), db);
    await handleTelegramCommand(makeUpdate("/ask câu hỏi 2"), db);

    const rows = getPendingAskQuestions(db, 10);
    expect(rows.length).toBe(2);
    expect(rows[0]!.message).toBe("câu hỏi 1");
    expect(rows[1]!.message).toBe("câu hỏi 2");
  });

  it("userId from update.message.from.id is stored in ask_queue.user_id", async () => {
    const update = makeUpdate("/ask Test userId", 777888);
    await handleTelegramCommand(update, db);

    const row = db
      .prepare<{ user_id: string }, []>("SELECT user_id FROM ask_queue LIMIT 1")
      .get();
    expect(row?.user_id).toBe("777888");
  });

  it("/ask is listed in /help output", async () => {
    const update = makeUpdate("/help");
    const result = await handleTelegramCommand(update, db);

    expect(result!.text).toContain("/ask");
  });
});
