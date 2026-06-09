/**
 * Task 232 — /report + /fix Telegram bot commands
 *
 * Tests that:
 *   - /report <description> writes to agent_feedback with priority='medium'
 *   - /report without description returns a usage hint
 *   - /fix <description> writes to agent_feedback with priority='high'
 *   - both commands set agent='user-telegram' and category='user_report'
 *   - both commands set to='@dev' in the detail field (stored as JSON prefix)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { handleTelegramCommand } from "../infrastructure/notifiers/telegramCommands.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`PRAGMA journal_mode = WAL`);

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
      impact_score REAL,
      data_env TEXT
,
    source_url TEXT UNIQUE)
  `);

  // agent_feedback table (required by /report and /fix handlers)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_feedback (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      agent      TEXT NOT NULL,
      category   TEXT NOT NULL,
      title      TEXT NOT NULL,
      detail     TEXT NOT NULL DEFAULT '',
      priority   TEXT NOT NULL DEFAULT 'medium',
      status     TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL
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

interface FeedbackRow {
  agent: string;
  category: string;
  title: string;
  detail: string;
  priority: string;
  status: string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 232 — /report command", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("writes a row to agent_feedback with priority='medium'", async () => {
    const result = await handleTelegramCommand(
      makeUpdate("/report Price fetch is broken for VCB"),
      db,
    );

    expect(result).not.toBeNull();
    // Handler now returns Vietnamese confirmation (with diacritics)
    expect(result!.text).toContain("báo cáo");

    const rows = db
      .prepare<FeedbackRow, []>("SELECT * FROM agent_feedback")
      .all();

    expect(rows.length).toBe(1);
    expect(rows[0]!.priority).toBe("medium");
    expect(rows[0]!.agent).toBe("user-telegram");
    expect(rows[0]!.category).toBe("user_report");
    expect(rows[0]!.status).toBe("new");
  });

  it("sets title to first 100 chars of description", async () => {
    const description = "Alert notifications are not arriving for FPT even though market moved 5%";
    await handleTelegramCommand(makeUpdate(`/report ${description}`), db);

    const rows = db
      .prepare<FeedbackRow, []>("SELECT * FROM agent_feedback")
      .all();

    expect(rows.length).toBe(1);
    expect(rows[0]!.title).toBe(description.slice(0, 100));
  });

  it("stores full description in detail column", async () => {
    const description = "SSC scraper fails every night at 20:00 with a Puppeteer timeout";
    await handleTelegramCommand(makeUpdate(`/report ${description}`), db);

    const rows = db
      .prepare<FeedbackRow, []>("SELECT * FROM agent_feedback")
      .all();

    expect(rows[0]!.detail).toContain(description);
  });

  it("returns usage hint when no description is given", async () => {
    const result = await handleTelegramCommand(makeUpdate("/report"), db);

    expect(result).not.toBeNull();
    // Vietnamese usage hint: "Cách dùng: /report mô tả lỗi"
    expect(result!.text.toLowerCase()).toMatch(/cách dùng|usage|mô tả|su dung|mo ta/i);

    // No row should be inserted
    const count = db
      .prepare<{ c: number }, []>("SELECT COUNT(*) as c FROM agent_feedback")
      .get()!.c;
    expect(count).toBe(0);
  });

  it("sets agent to 'user-telegram'", async () => {
    await handleTelegramCommand(
      makeUpdate("/report Something is wrong"),
      db,
    );

    const rows = db
      .prepare<FeedbackRow, []>("SELECT * FROM agent_feedback")
      .all();

    expect(rows[0]!.agent).toBe("user-telegram");
  });
});

describe("Task 232 — /fix command", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("writes a row to agent_feedback with priority='high'", async () => {
    const result = await handleTelegramCommand(
      makeUpdate("/fix Morning briefing is completely silent"),
      db,
    );

    expect(result).not.toBeNull();
    // Handler returns "Đã gửi báo cáo KHẨN CẤP..." (Vietnamese with diacritics)
    expect(result!.text).toContain("KHẨN CẤP");

    const rows = db
      .prepare<FeedbackRow, []>("SELECT * FROM agent_feedback")
      .all();

    expect(rows.length).toBe(1);
    expect(rows[0]!.priority).toBe("high");
  });

  it("sets agent to 'user-telegram' and category to 'user_report'", async () => {
    await handleTelegramCommand(makeUpdate("/fix Telegram silent"), db);

    const rows = db
      .prepare<FeedbackRow, []>("SELECT * FROM agent_feedback")
      .all();

    expect(rows[0]!.agent).toBe("user-telegram");
    expect(rows[0]!.category).toBe("user_report");
  });

  it("returns usage hint when no description is given", async () => {
    const result = await handleTelegramCommand(makeUpdate("/fix"), db);

    expect(result).not.toBeNull();
    expect(result!.text.toLowerCase()).toMatch(/cách dùng|usage|mô tả|su dung|mo ta/i);

    const count = db
      .prepare<{ c: number }, []>("SELECT COUNT(*) as c FROM agent_feedback")
      .get()!.c;
    expect(count).toBe(0);
  });

  it("stores full description in detail and title", async () => {
    const description = "VN-Index price is stuck at yesterday's value";
    await handleTelegramCommand(makeUpdate(`/fix ${description}`), db);

    const rows = db
      .prepare<FeedbackRow, []>("SELECT * FROM agent_feedback")
      .all();

    expect(rows[0]!.title).toBe(description.slice(0, 100));
    expect(rows[0]!.detail).toContain(description);
  });
});

describe("Task 232 — /help includes new commands", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("lists /report in help output", async () => {
    const result = await handleTelegramCommand(makeUpdate("/help"), db);
    expect(result!.text).toContain("/report");
  });

  it("lists /fix in help output", async () => {
    const result = await handleTelegramCommand(makeUpdate("/help"), db);
    expect(result!.text).toContain("/fix");
  });
});
