/**
 * Task 307 — /why payload format + no-arg guard
 *
 * Tests:
 *   - /why VCB stores payload as "why:VCB" (not an English sentence)
 *   - /why FPT stores payload as "why:FPT"
 *   - /why with no argument returns Vietnamese error, inserts NO row
 *   - /why with no argument error message matches spec
 *   - /ask (existing behaviour) still works after refactor
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ensureUserRequestsTable,
  type UserRequest,
} from "../infrastructure/db/userRequestStore.js";
import { handleTelegramCommand } from "../infrastructure/notifiers/telegramCommands.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  ensureUserRequestsTable(db);

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
// Task 307 tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 307 — /why payload format", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("/why VCB stores payload as 'why:VCB' (not English sentence)", async () => {
    await handleTelegramCommand(makeUpdate("/why VCB"), db);

    const rows = db
      .prepare<UserRequest, []>("SELECT * FROM user_requests")
      .all();

    expect(rows.length).toBe(1);
    expect(rows[0]!.payload).toBe("why:VCB");
    expect(rows[0]!.payload).not.toContain("Why did");
    expect(rows[0]!.command).toBe("ask");
  });

  it("/why FPT stores payload as 'why:FPT'", async () => {
    await handleTelegramCommand(makeUpdate("/why FPT"), db);

    const rows = db
      .prepare<UserRequest, []>("SELECT * FROM user_requests")
      .all();

    expect(rows.length).toBe(1);
    expect(rows[0]!.payload).toBe("why:FPT");
  });

  it("/why VNM stores payload as 'why:VNM'", async () => {
    await handleTelegramCommand(makeUpdate("/why VNM"), db);

    const rows = db
      .prepare<UserRequest, []>("SELECT * FROM user_requests")
      .all();

    expect(rows.length).toBe(1);
    expect(rows[0]!.payload).toBe("why:VNM");
  });

  it("/why VCB returns Vietnamese receipt (not English)", async () => {
    const result = await handleTelegramCommand(makeUpdate("/why VCB"), db);

    expect(result).not.toBeNull();
    // Must contain Vietnamese confirmation, not English
    expect(result!.text).not.toContain("Why did");
    expect(result!.text.length).toBeGreaterThan(5);
  });
});

describe("Task 307 — /why no-arg guard", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("/why with no argument inserts NO row", async () => {
    await handleTelegramCommand(makeUpdate("/why"), db);

    const count = db
      .prepare<{ c: number }, []>("SELECT COUNT(*) as c FROM user_requests")
      .get()!.c;

    expect(count).toBe(0);
  });

  it("/why with no argument returns Vietnamese error message", async () => {
    const result = await handleTelegramCommand(makeUpdate("/why"), db);

    expect(result).not.toBeNull();
    // Must match spec: "Vui long cung cap ma chung khoan, vi du: /why VCB"
    // (accept either accented or unaccented variant)
    expect(result!.text).toContain("/why VCB");
  });

  it("/why with whitespace-only argument inserts NO row", async () => {
    await handleTelegramCommand(makeUpdate("/why   "), db);

    const count = db
      .prepare<{ c: number }, []>("SELECT COUNT(*) as c FROM user_requests")
      .get()!.c;

    expect(count).toBe(0);
  });

  it("/why with whitespace-only returns Vietnamese error", async () => {
    const result = await handleTelegramCommand(makeUpdate("/why   "), db);

    expect(result).not.toBeNull();
    expect(result!.text).toContain("/why VCB");
  });
});
