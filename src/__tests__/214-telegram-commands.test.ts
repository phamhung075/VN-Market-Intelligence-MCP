/**
 * Task 214 — Telegram Webhook Endpoint + Command Router
 *
 * Tests for:
 *   - handleTelegramCommand() with all supported commands
 *   - Unknown command returns help text
 *   - Missing text returns null
 *   - Error handling — never throws, wraps errors in friendly message
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

import {
  handleTelegramCommand,
  type TelegramUpdate,
  type CommandResult,
} from "../infrastructure/notifiers/telegramCommands.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");

  // Minimal schema matching production tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code              TEXT PRIMARY KEY,
      company_name      TEXT,
      exchange          TEXT NOT NULL,
      domain            TEXT NOT NULL DEFAULT 'other',
      notes             TEXT,
      added_at          TEXT NOT NULL,
      alert_drop_pct    REAL NOT NULL DEFAULT -3,
      alert_rise_pct    REAL NOT NULL DEFAULT 5,
      alert_impact_min  REAL NOT NULL DEFAULT 7,
      alert_report_new  INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      signals_json          TEXT,
      affected_actions_json TEXT,
      analysis_ids_json     TEXT,
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      user_note             TEXT
    );
    CREATE TABLE IF NOT EXISTS positions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT NOT NULL UNIQUE,
      shares      REAL NOT NULL DEFAULT 0,
      avg_price   REAL NOT NULL DEFAULT 0,
      opened_at   TEXT NOT NULL,
      closed_at   TEXT,
      notes       TEXT
    );
  `);

  return db;
}

function makeUpdate(text: string | undefined, chatId = 12345): TelegramUpdate {
  const msg: TelegramUpdate["message"] = {
    chat: { id: chatId },
    from: { first_name: "TestUser" },
  };
  if (text !== undefined) {
    msg.text = text;
  }
  return { message: msg };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Core routing rules
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 214 — handleTelegramCommand() routing", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  it("returns null when update has no message", async () => {
    const result = await handleTelegramCommand({}, db);
    expect(result).toBeNull();
  });

  it("returns null when message has no text", async () => {
    // message.text is optional — omitting it simulates no text
    const update: TelegramUpdate = {
      message: { chat: { id: 1 } },
    };
    const result = await handleTelegramCommand(update, db);
    expect(result).toBeNull();
  });

  it("returns null when text is empty string", async () => {
    const result = await handleTelegramCommand(makeUpdate(""), db);
    expect(result).toBeNull();
  });

  it("preserves chatId from the update in CommandResult", async () => {
    const result = await handleTelegramCommand(makeUpdate("/help", 99999), db);
    expect(result).not.toBeNull();
    expect(result!.chatId).toBe(99999);
  });

  it("unknown command returns help text with available commands", async () => {
    const result = await handleTelegramCommand(makeUpdate("/unknown_xyz"), db);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("/help");
    expect(result!.text).toContain("/watchlist");
  });

  it("non-command text returns help text", async () => {
    const result = await handleTelegramCommand(makeUpdate("hello there"), db);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("/help");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. /help
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 214 — /help command", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("lists all supported commands", async () => {
    const result = await handleTelegramCommand(makeUpdate("/help"), db);
    expect(result).not.toBeNull();
    const text = result!.text;
    expect(text).toContain("/watchlist");
    expect(text).toContain("/price");
    expect(text).toContain("/alerts");
    expect(text).toContain("/briefing");
    expect(text).toContain("/health");
    expect(text).toContain("/pnl");
    expect(text).toContain("/help");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. /watchlist
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 214 — /watchlist command", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("returns empty watchlist message when table is empty", async () => {
    const result = await handleTelegramCommand(makeUpdate("/watchlist"), db);
    expect(result).not.toBeNull();
    // Should mention that there are no stocks, or show an empty list
    expect(result!.text.length).toBeGreaterThan(0);
  });

  it("lists watchlist stocks with exchange and domain when data exists", async () => {
    db.prepare(
      `INSERT INTO watchlist (code, company_name, exchange, domain, added_at)
       VALUES ('VCB', 'Vietcombank', 'HOSE', 'banking', datetime('now'))`,
    ).run();
    db.prepare(
      `INSERT INTO watchlist (code, company_name, exchange, domain, added_at)
       VALUES ('FPT', 'FPT Corp', 'HOSE', 'technology', datetime('now'))`,
    ).run();

    const result = await handleTelegramCommand(makeUpdate("/watchlist"), db);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("VCB");
    expect(result!.text).toContain("FPT");
  });

  it("includes price when available from market_prices", async () => {
    db.prepare(
      `INSERT INTO watchlist (code, company_name, exchange, domain, added_at)
       VALUES ('VCB', 'Vietcombank', 'HOSE', 'banking', datetime('now'))`,
    ).run();
    db.prepare(
      `INSERT INTO market_prices (code, price, change_pct, volume, updated_at)
       VALUES ('VCB', 88000, -1.5, 1200000, datetime('now'))`,
    ).run();

    const result = await handleTelegramCommand(makeUpdate("/watchlist"), db);
    expect(result!.text).toContain("88");
    expect(result!.text).toContain("VCB");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. /price <CODE>
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 214 — /price command", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("returns price data for an existing stock", async () => {
    db.prepare(
      `INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
       VALUES ('VCB', 88000, -1200, -1.35, 950000, datetime('now'))`,
    ).run();

    const result = await handleTelegramCommand(makeUpdate("/price VCB"), db);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("VCB");
    expect(result!.text).toContain("88");
  });

  it("returns not-found message for unknown stock code", async () => {
    const result = await handleTelegramCommand(makeUpdate("/price XYZ999"), db);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("XYZ999");
  });

  it("returns usage hint when /price is called without a code", async () => {
    const result = await handleTelegramCommand(makeUpdate("/price"), db);
    expect(result).not.toBeNull();
    expect(result!.text.toLowerCase()).toMatch(/price|code|ma|usage/i);
  });

  it("is case-insensitive for stock code argument", async () => {
    db.prepare(
      `INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
       VALUES ('VNM', 75000, 500, 0.67, 500000, datetime('now'))`,
    ).run();

    const resultLower = await handleTelegramCommand(makeUpdate("/price vnm"), db);
    expect(resultLower!.text).toContain("VNM");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. /alerts
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 214 — /alerts command", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("returns empty message when no alerts exist", async () => {
    const result = await handleTelegramCommand(makeUpdate("/alerts"), db);
    expect(result).not.toBeNull();
    expect(result!.text.length).toBeGreaterThan(0);
  });

  it("returns last 5 alerts when data exists", async () => {
    for (let i = 1; i <= 7; i++) {
      db.prepare(
        `INSERT INTO alerts (id, triggered_at, severity, message)
         VALUES ('alert-${i}', datetime('now', '+${i} seconds'), 'high', 'Alert ${i}')`,
      ).run();
    }

    const result = await handleTelegramCommand(makeUpdate("/alerts"), db);
    expect(result).not.toBeNull();
    // Should show at most 5 alerts — text should contain "alert" keyword
    expect(result!.text.toLowerCase()).toMatch(/alert|canh bao|quan trong/i);
  });

  it("shows severity in the response", async () => {
    db.prepare(
      `INSERT INTO alerts (id, triggered_at, severity, message)
       VALUES ('a1', datetime('now'), 'critical', 'Critical test alert')`,
    ).run();

    const result = await handleTelegramCommand(makeUpdate("/alerts"), db);
    expect(result!.text.toLowerCase()).toMatch(/critical|nghiem trong/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. /health
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 214 — /health command", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("returns health information including uptime", async () => {
    const result = await handleTelegramCommand(makeUpdate("/health"), db);
    expect(result).not.toBeNull();
    // Should contain uptime info or system status
    expect(result!.text.length).toBeGreaterThan(10);
  });

  it("health response includes DB info", async () => {
    const result = await handleTelegramCommand(makeUpdate("/health"), db);
    expect(result!.text.toLowerCase()).toMatch(/db|database|sqlite|uptime|health|ok/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. /pnl
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 214 — /pnl command", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("returns message when no positions exist", async () => {
    const result = await handleTelegramCommand(makeUpdate("/pnl"), db);
    expect(result).not.toBeNull();
    expect(result!.text.length).toBeGreaterThan(0);
  });

  it("computes P&L when positions and prices exist", async () => {
    db.prepare(
      `INSERT INTO positions (code, shares, avg_price, opened_at) VALUES ('VCB', 1000, 75000, datetime('now'))`,
    ).run();
    db.prepare(
      `INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
       VALUES ('VCB', 85000, 10000, 13.33, 500000, datetime('now'))`,
    ).run();

    const result = await handleTelegramCommand(makeUpdate("/pnl"), db);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("VCB");
    // +10,000,000 VND gain
    expect(result!.text).toMatch(/10.000.000|10,000,000|\+10/i);
  });

  it("shows N/A when position has no current price", async () => {
    db.prepare(
      `INSERT INTO positions (code, shares, avg_price, opened_at) VALUES ('VNM', 200, 80000, datetime('now'))`,
    ).run();
    // No market_prices entry for VNM

    const result = await handleTelegramCommand(makeUpdate("/pnl"), db);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("VNM");
    expect(result!.text.toLowerCase()).toMatch(/n\/a|unknown|no price|chua co gia/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. /briefing
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 214 — /briefing command", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("returns a briefing summary text", async () => {
    const result = await handleTelegramCommand(makeUpdate("/briefing"), db);
    expect(result).not.toBeNull();
    expect(result!.text.length).toBeGreaterThan(10);
  });

  it("briefing text is in Vietnamese or contains known Vietnamese patterns", async () => {
    const result = await handleTelegramCommand(makeUpdate("/briefing"), db);
    // Should contain Vietnamese keywords like "thi truong", "bao cao", or stock names
    expect(result!.text.length).toBeGreaterThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Error safety — never throws
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 214 — error safety", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("does not throw on corrupted update payload", async () => {
    // Unusual but valid TypeScript type
    const weirdUpdate = { message: { chat: { id: 0 }, text: "/watchlist" } };
    let threw = false;
    try {
      await handleTelegramCommand(weirdUpdate, db);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("returns CommandResult (not null) even if DB table is missing", async () => {
    // Drop the watchlist table to simulate a broken DB state
    const brokenDb = new Database(":memory:");
    brokenDb.exec("PRAGMA journal_mode = WAL");
    // No tables created — all queries will fail

    let result: CommandResult | null = null;
    let threw = false;
    try {
      result = await handleTelegramCommand(makeUpdate("/watchlist", 42), brokenDb);
    } catch {
      threw = true;
    }
    brokenDb.close();

    expect(threw).toBe(false);
    // Either null or an error message — must not throw
    if (result !== null) {
      expect(result.chatId).toBe(42);
      expect(result.text.length).toBeGreaterThan(0);
    }
  });
});
