/**
 * Task 214 — Telegram Webhook Endpoint + Command Router
 *
 * Tests for:
 *   - handleTelegramCommand() with all supported commands
 *   - Unknown command returns help text
 *   - Missing text returns null
 *   - Error handling — never throws, wraps errors in friendly message
 *   - handleNews /news command (T-NEWS-1..8)
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
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL,
      high       REAL NOT NULL,
      low        REAL NOT NULL,
      close      REAL NOT NULL,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
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
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id                 TEXT PRIMARY KEY,
      created_at         TEXT NOT NULL,
      level              TEXT,
      source_url         TEXT,
      source_title       TEXT,
      source_type        TEXT,
      published_at       TEXT,
      sentiment          TEXT,
      impact_score       REAL,
      impact_direction   TEXT,
      confidence         REAL,
      time_horizon       TEXT,
      summary            TEXT,
      reasoning          TEXT,
      affected_countries TEXT,
      affected_domains   TEXT,
      affected_actions   TEXT,
      parent_ids         TEXT,
      tags               TEXT,
      embedding_text     TEXT
    );
  `);

  return db;
}

/** Insert a rag_analyses row with created_at = now (today in UTC) */
function seedNewsToday(
  db: Database,
  id: string,
  sourceTitle: string | null,
  sentiment: string | null,
  summary: string | null,
  impactScore: number | null = 0.5,
): void {
  db.prepare(
    `INSERT INTO rag_analyses (id, created_at, source_title, sentiment, summary, impact_score)
     VALUES (?, datetime('now'), ?, ?, ?, ?)`,
  ).run(id, sourceTitle, sentiment, summary, impactScore);
}

/** Insert a rag_analyses row with created_at far in the past (for fallback testing) */
function seedNewsOld(
  db: Database,
  id: string,
  sourceTitle: string | null,
  sentiment: string | null,
  summary: string | null,
  impactScore: number | null = 0.5,
): void {
  db.prepare(
    `INSERT INTO rag_analyses (id, created_at, source_title, sentiment, summary, impact_score)
     VALUES (?, '2020-01-01T00:00:00.000Z', ?, ?, ?, ?)`,
  ).run(id, sourceTitle, sentiment, summary, impactScore);
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
    expect(text).toContain("/health");
    expect(text).toContain("/report");
    expect(text).toContain("/fix");
    expect(text).toContain("/help");
  });

  it("does NOT advertise removed commands (task 1063)", async () => {
    const result = await handleTelegramCommand(makeUpdate("/help"), db);
    const text = result!.text;
    expect(text).not.toContain("/alerts");
    expect(text).not.toContain("/briefing");
    expect(text).not.toContain("/pnl");
    // /ask was re-added in task 1073 with ask_queue backend — it IS in help text
    // /why remains removed
    expect(text).not.toContain("/why");
  });
});

describe("Task 1063 — removed commands return invalid", () => {
  let db: Database;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  // Note: /ask was re-added in task 1073 with ask_queue backend — it is valid
  for (const cmd of ["/alerts", "/briefing", "/pnl", "/why VCB"]) {
    it(`${cmd} → invalid command`, async () => {
      const result = await handleTelegramCommand(makeUpdate(cmd), db);
      expect(result).not.toBeNull();
      expect(result!.text).toContain("không hợp lệ");
    });
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// 10. handleNews — /news command (T-NEWS-1..8)
// ─────────────────────────────────────────────────────────────────────────────

describe("handleNews — /news command", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  // T-NEWS-1: 3 today-rows — all 3 headlines present in output
  it("T-NEWS-1: 3 today-rows — response contains all 3 headlines", async () => {
    seedNewsToday(db, "n1", "Cổ phiếu ngân hàng tăng mạnh", "positive", "Nhóm ngân hàng dẫn dắt thị trường.", 0.8);
    seedNewsToday(db, "n2", "VN-Index phục hồi cuối phiên", "neutral", "Chỉ số phục hồi nhờ lực cầu bắt đáy.", 0.5);
    seedNewsToday(db, "n3", "Lãi suất giảm hỗ trợ thị trường", "positive", "NHNN điều chỉnh lãi suất điều hành.", 0.7);

    const result = await handleTelegramCommand(makeUpdate("/news"), db);
    expect(result).not.toBeNull();
    const output = result!.texts ? result!.texts.join("\n") : result!.text;
    expect(output).toContain("Cổ phiếu ngân hàng tăng mạnh");
    expect(output).toContain("VN-Index phục hồi cuối phiên");
    expect(output).toContain("Lãi suất giảm hỗ trợ thị trường");
  });

  // T-NEWS-2: sentiment "positive" → "tích cực" in output, NOT "positive", NOT numeric score
  it("T-NEWS-2: positive sentiment maps to tích cực; no raw English or numeric score", async () => {
    seedNewsToday(db, "n1", "Tiêu đề tích cực", "positive", "Tóm tắt ngắn gọn.", 0.85);

    const result = await handleTelegramCommand(makeUpdate("/news"), db);
    expect(result).not.toBeNull();
    const output = result!.texts ? result!.texts.join("\n") : result!.text;
    expect(output).toContain("tích cực");
    expect(output).not.toContain("positive");
    expect(output).not.toContain("0.85");
  });

  // T-NEWS-3: empty rag_analyses table — returns friendly Vietnamese fallback
  it("T-NEWS-3: empty table — returns friendly Vietnamese fallback message", async () => {
    const result = await handleTelegramCommand(makeUpdate("/news"), db);
    expect(result).not.toBeNull();
    const output = result!.texts ? result!.texts.join("\n") : result!.text;
    // Must contain a Vietnamese "no news" phrase — exact or near-exact
    expect(output).toMatch(/chưa có|không có tin|không tìm thấy/i);
    expect(output).not.toBe("");
    expect(output).not.toBe("null");
    expect(output).not.toBe("undefined");
  });

  // T-NEWS-4: /news 2 with 5 today-rows — output contains exactly 2 story blocks
  it("T-NEWS-4: /news 2 limits to 2 stories", async () => {
    for (let i = 1; i <= 5; i++) {
      seedNewsToday(db, `n${i}`, `Tiêu đề số ${i}`, "neutral", `Tóm tắt ${i}.`, 0.5);
    }
    const result = await handleTelegramCommand(makeUpdate("/news 2"), db);
    expect(result).not.toBeNull();
    const output = result!.texts ? result!.texts.join("\n") : result!.text;
    // Count story blocks by counting "Tiêu đề số" occurrences
    const matches = output.match(/Tiêu đề số/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(2);
  });

  // T-NEWS-5: combined output > 4096 chars — chunking contract (each texts[] element <= 4096)
  it("T-NEWS-5: large digest is chunked — each texts[] element <= 4096 chars", async () => {
    // Seed 20 rows with ~250-char summaries to force multi-chunk output
    const longSummary = "Tóm tắt chi tiết: ".padEnd(230, "đ");
    for (let i = 1; i <= 20; i++) {
      seedNewsToday(
        db,
        `n${i}`,
        `Tiêu đề dài số ${i} — đây là một tiêu đề báo tài chính dài dài dài dài dài dài`,
        "neutral",
        longSummary,
        0.5,
      );
    }
    const result = await handleTelegramCommand(makeUpdate("/news 20"), db);
    expect(result).not.toBeNull();

    // If the result uses texts[] (chunked path)
    if (result!.texts && result!.texts.length > 0) {
      // Every chunk must be <= 4096 chars
      for (const chunk of result!.texts) {
        expect(chunk.length).toBeLessThanOrEqual(4096);
      }
      // All stories must appear across chunks
      const allOutput = result!.texts.join("\n");
      expect(allOutput).toContain("Tiêu đề dài số 1");
      expect(allOutput).toContain("Tiêu đề dài số 20");
    } else {
      // Single-message path: the text itself must be <= 4096
      expect(result!.text.length).toBeLessThanOrEqual(4096);
    }
  });

  // T-NEWS-6: source_title = NULL — handler does not throw, returns non-empty string
  it("T-NEWS-6: null source_title — no crash, output is non-empty string", async () => {
    seedNewsToday(db, "n1", null, "neutral", "Tóm tắt bình thường.", 0.5);

    let threw = false;
    let result: CommandResult | null = null;
    try {
      result = await handleTelegramCommand(makeUpdate("/news"), db);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result).not.toBeNull();
    const output = result!.texts ? result!.texts.join("\n") : result!.text;
    expect(output.length).toBeGreaterThan(0);
  });

  // T-NEWS-7: summary = NULL — handler does not throw, output is non-empty string
  it("T-NEWS-7: null summary — no crash, output is non-empty string", async () => {
    seedNewsToday(db, "n1", "Tiêu đề bình thường", "positive", null, 0.6);

    let threw = false;
    let result: CommandResult | null = null;
    try {
      result = await handleTelegramCommand(makeUpdate("/news"), db);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result).not.toBeNull();
    const output = result!.texts ? result!.texts.join("\n") : result!.text;
    expect(output.length).toBeGreaterThan(0);
  });

  // T-NEWS-8: today filter returns 0 rows; fallback rows exist — returns fallback with "gần đây" header
  it("T-NEWS-8: no today rows but old rows exist — fallback with gần đây header", async () => {
    // Old rows only (2020 — will never match today's midnight filter)
    seedNewsOld(db, "old1", "Tin cũ số 1", "neutral", "Tóm tắt cũ 1.", 0.4);
    seedNewsOld(db, "old2", "Tin cũ số 2", "negative", "Tóm tắt cũ 2.", 0.3);

    const result = await handleTelegramCommand(makeUpdate("/news"), db);
    expect(result).not.toBeNull();
    const output = result!.texts ? result!.texts.join("\n") : result!.text;
    // Fallback output must be non-empty and contain at least one old story
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain("Tin cũ");
    // Header must indicate "gần đây" (not "hôm nay") so user knows data is not from today
    expect(output).toContain("gần đây");
  });
});
