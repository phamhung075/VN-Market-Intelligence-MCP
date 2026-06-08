/**
 * Task 1157 — User Request Command Encoding Fix
 *
 * Tests that command handlers return correctly accented Vietnamese usage hints.
 * Previous attempts used unaccented transliterations (e.g. "Su dung") which do
 * not match the actual implementation output ("Cách dùng").
 *
 * Covers three usage-hint paths:
 *   1. /price with no argument → "Cách dùng: /price VCB"
 *   2. /report with no argument → "Cách dùng: /report mô tả lỗi"
 *   3. /set_position with too few args → starts with "Cách dùng: /set_position"
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  handleTelegramCommand,
  type TelegramUpdate,
} from "../infrastructure/notifiers/telegramCommands.js";

Bun.env["DB_PATH"] = ":memory:";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeUpdate(text: string): TelegramUpdate {
  return {
    message: {
      chat: { id: 99 },
      text,
      from: { first_name: "Tester", id: 1 },
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
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL,
      volume INTEGER, updated_at TEXT,
      PRIMARY KEY (code, date)
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS positions (
      code TEXT PRIMARY KEY,
      avg_price REAL,
      shares REAL,
      current_price REAL
    );
    CREATE TABLE IF NOT EXISTS ask_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'default',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT,
      category TEXT,
      title TEXT,
      detail TEXT,
      priority TEXT,
      status TEXT DEFAULT 'new',
      created_at TEXT
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

describe("Task 1157 — user request command encoding", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("/price with no argument returns accented Vietnamese usage hint", async () => {
    const result = await handleTelegramCommand(makeUpdate("/price"), db);
    expect(result).not.toBeNull();
    // Must contain the accented form, not transliterated "Su dung"
    expect(result!.text).toBe("Cách dùng: /price VCB");
  });

  it("/report with no argument returns accented Vietnamese usage hint", async () => {
    const result = await handleTelegramCommand(makeUpdate("/report"), db);
    expect(result).not.toBeNull();
    expect(result!.text).toBe("Cách dùng: /report mô tả lỗi");
  });

  it("/set_position with too few args returns accented Vietnamese usage hint", async () => {
    const result = await handleTelegramCommand(makeUpdate("/set_position VCB"), db);
    expect(result).not.toBeNull();
    // First line starts with accented "Cách dùng:"
    expect(result!.text).toContain("Cách dùng: /set_position VCB 75000 1000");
  });
});
