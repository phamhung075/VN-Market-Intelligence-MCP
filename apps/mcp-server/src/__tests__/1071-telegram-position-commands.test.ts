Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1071 — Telegram /set_position + /check_position Handlers
 *
 * TDD test suite for the two new Telegram command handlers.
 * All tests operate on an in-memory SQLite database.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { handleTelegramCommand, type TelegramUpdate } from "../infrastructure/notifiers/telegramCommands.js";
import { upsertPosition } from "../infrastructure/db/positionStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a minimal Telegram update with a text message
// ─────────────────────────────────────────────────────────────────────────────

function makeUpdate(text: string): TelegramUpdate {
  return {
    message: {
      chat: { id: 12345 },
      text,
      from: { first_name: "Test" },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: provision an in-memory DB with required tables
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT    NOT NULL UNIQUE,
      shares      INTEGER NOT NULL DEFAULT 0,
      avg_price   REAL    NOT NULL DEFAULT 0,
      opened_at   TEXT    NOT NULL,
      closed_at   TEXT,
      notes       TEXT
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
      code       TEXT    NOT NULL,
      date       TEXT    NOT NULL,
      open       REAL    NOT NULL,
      high       REAL    NOT NULL,
      low        REAL    NOT NULL,
      close      REAL    NOT NULL,
      volume     REAL    NOT NULL DEFAULT 0,
      updated_at TEXT    NOT NULL,
      PRIMARY KEY (code, date)
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      code         TEXT PRIMARY KEY,
      company_name TEXT,
      exchange     TEXT,
      domain       TEXT
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
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// /set_position — parse and dispatch
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1071 — /set_position handler", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("buy: creates new position, reply contains 'Mua'", async () => {
    const result = await handleTelegramCommand(makeUpdate("/set_position FPT 80300 5100"), db);
    expect(result).not.toBeNull();
    expect(result!.chatId).toBe(12345);
    expect(result!.text).toContain("Mua");
    // positionStore messages don't embed the ticker — just check action keyword
  });

  it("buy: reply contains computed avg cost after second buy", async () => {
    // First buy: 1000 @ 75000
    await handleTelegramCommand(makeUpdate("/set_position VCB 75000 1000"), db);
    // Second buy: 500 @ 78000 → new avg = (1000*75000 + 500*78000) / 1500 = 76000
    const result = await handleTelegramCommand(makeUpdate("/set_position VCB 78000 500"), db);
    expect(result!.text).toContain("avg cost");
    // 76000 appears in the message
    expect(result!.text).toContain("76000");
  });

  it("sell: partial sell, reply contains 'Bán' and 'còn lại'", async () => {
    await handleTelegramCommand(makeUpdate("/set_position FPT 80000 5000"), db);
    const result = await handleTelegramCommand(makeUpdate("/set_position FPT 84000 -1500"), db);
    expect(result!.text).toContain("Bán");
    expect(result!.text).toContain("còn lại");
  });

  it("sell: qty=-1500 is treated as sell (negative qty parsed correctly)", async () => {
    await handleTelegramCommand(makeUpdate("/set_position FPT 80000 5000"), db);
    const result = await handleTelegramCommand(makeUpdate("/set_position FPT 84000 -1500"), db);
    expect(result).not.toBeNull();
    expect(result!.text).not.toContain("Lỗi");
    expect(result!.text).not.toContain("Không hợp lệ");
  });

  it("clear: price=0 qty=0 removes position, reply contains 'xóa'", async () => {
    await handleTelegramCommand(makeUpdate("/set_position VCB 75000 1000"), db);
    const result = await handleTelegramCommand(makeUpdate("/set_position VCB 0 0"), db);
    expect(result!.text.toLowerCase()).toContain("xóa");
    expect(result!.text).toContain("VCB");
  });

  it("error: no args → usage hint shown", async () => {
    const result = await handleTelegramCommand(makeUpdate("/set_position"), db);
    expect(result!.text).toContain("/set_position");
    // Must contain an example showing TICKER PRICE QTY
    expect(result!.text).toContain("VCB");
  });

  it("error: only 2 args → usage hint shown", async () => {
    const result = await handleTelegramCommand(makeUpdate("/set_position VCB 75000"), db);
    expect(result!.text).toContain("/set_position");
  });

  it("error: non-alpha ticker → rejected with error message", async () => {
    const result = await handleTelegramCommand(makeUpdate("/set_position 123INVALID 75000 1000"), db);
    expect(result!.text).toContain("ticker");
  });

  it("error: non-numeric price → rejected with error message", async () => {
    const result = await handleTelegramCommand(makeUpdate("/set_position VCB abc 1000"), db);
    expect(result!.text).toContain("price");
  });

  it("error: non-numeric qty → rejected with error message", async () => {
    const result = await handleTelegramCommand(makeUpdate("/set_position VCB 75000 abc"), db);
    expect(result!.text).toContain("qty");
  });

  it("sell clamped: selling more than holdings shows clamp message", async () => {
    await handleTelegramCommand(makeUpdate("/set_position FPT 80000 100"), db);
    const result = await handleTelegramCommand(makeUpdate("/set_position FPT 84000 -9999"), db);
    expect(result!.text).toContain("100");
    // Clamped message from sellPosition
    expect(result!.text.toLowerCase()).toContain("thanh lý");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /check_position — list holdings
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1071 — /check_position handler", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("empty positions → 'Bạn chưa có vị thế nào'", async () => {
    const result = await handleTelegramCommand(makeUpdate("/check_position"), db);
    expect(result!.text).toContain("Bạn chưa có vị thế nào");
  });

  it("shows VCB in reply when VCB position exists", async () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });
    const result = await handleTelegramCommand(makeUpdate("/check_position"), db);
    expect(result!.text).toContain("VCB");
  });

  it("shows avg price formatted with thousand separators", async () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });
    const result = await handleTelegramCommand(makeUpdate("/check_position"), db);
    // 75000 formatted as "75.000" (Vietnamese locale)
    expect(result!.text).toContain("75.000");
  });

  it("shows P/L percentage when market price available (+6.7%)", async () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });
    db.prepare("INSERT INTO market_prices (code, price) VALUES (?, ?)").run("VCB", 80000);
    const result = await handleTelegramCommand(makeUpdate("/check_position"), db);
    // (80000-75000)/75000 * 100 = 6.67% → rounds to 6,7 in vi-VN locale (1 decimal)
    expect(result!.text).toContain("+6,7"); // Vietnamese locale: comma decimal
    expect(result!.text).toContain("%");
  });

  it("shows stop-loss floor = round(avgCost * 0.93)", async () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });
    const result = await handleTelegramCommand(makeUpdate("/check_position"), db);
    // 75000 * 0.93 = 69750
    expect(result!.text).toContain("69.750");
  });

  it("shows TP1 = round(avgCost * 1.10)", async () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });
    const result = await handleTelegramCommand(makeUpdate("/check_position"), db);
    // 75000 * 1.10 = 82500
    expect(result!.text).toContain("82.500");
  });

  it("shows multiple positions when multiple exist", async () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });
    upsertPosition(db, { code: "FPT", shares: 500, avgPrice: 80000 });
    const result = await handleTelegramCommand(makeUpdate("/check_position"), db);
    expect(result!.text).toContain("VCB");
    expect(result!.text).toContain("FPT");
  });

  it("shows 'Chưa có giá' when no market price available", async () => {
    upsertPosition(db, { code: "VEA", shares: 2000, avgPrice: 20000 });
    const result = await handleTelegramCommand(makeUpdate("/check_position"), db);
    expect(result!.text).toContain("VEA");
    // No market price → show placeholder
    expect(result!.text).toContain("Chưa có giá");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HELP_TEXT
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1071 — /help updated", () => {
  it("help text includes /set_position", async () => {
    const db = makeDb();
    const result = await handleTelegramCommand(makeUpdate("/help"), db);
    expect(result!.text).toContain("/set_position");
  });

  it("help text includes /check_position", async () => {
    const db = makeDb();
    const result = await handleTelegramCommand(makeUpdate("/help"), db);
    expect(result!.text).toContain("/check_position");
  });
});
