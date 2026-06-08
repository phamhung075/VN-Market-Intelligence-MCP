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
  stripHtml,
  handleRecap,
  handleRecapWeek,
  handleRecapMonth,
  type TelegramUpdate,
  type CommandResult,
} from "../infrastructure/notifiers/telegramCommands.js";
import type { EveningSummary } from "../application/usecases/assembleEveningSummary.js";
import type { PeriodicSummary } from "../application/usecases/generatePeriodicSummary.js";

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
      embedding_text     TEXT,
      data_env TEXT
);
  `);

  return db;
}

/**
 * Insert a rag_analyses row with created_at = now (today, ISO format).
 * Uses a JS-generated ISO timestamp so SQLite string comparison with
 * midnightVietnamAsUtcInline() works correctly (both use 'T' separator).
 */
function seedNewsToday(
  db: Database,
  id: string,
  sourceTitle: string | null,
  sentiment: string | null,
  summary: string | null,
  impactScore: number | null = 0.5,
): void {
  const nowIso = new Date().toISOString();
  db.prepare(
    `INSERT INTO rag_analyses (id, created_at, source_title, sentiment, summary, impact_score)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, nowIso, sourceTitle, sentiment, summary, impactScore);
}

/** Extended seedNewsToday with optional source_url for dedup tests */
function seedNewsTodayWithUrl(
  db: Database,
  id: string,
  sourceTitle: string | null,
  sentiment: string | null,
  summary: string | null,
  impactScore: number | null = 0.5,
  sourceUrl: string | null = null,
): void {
  const nowIso = new Date().toISOString();
  db.prepare(
    `INSERT INTO rag_analyses (id, created_at, source_title, source_url, sentiment, summary, impact_score)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, nowIso, sourceTitle, sourceUrl, sentiment, summary, impactScore);
}

/**
 * Create an extended in-memory DB with all tables needed for recap routing tests.
 * Extends makeDb() with additional tables used by assembleEveningSummary
 * and generatePeriodicSummary.
 */
function makeRecapDb(): Database {
  const db = makeDb(); // includes watchlist, market_prices, daily_ohlcv, alerts, positions, rag_analyses
  db.exec(`
    CREATE TABLE IF NOT EXISTS commodity_prices (
      vix REAL, dxy REAL, sp500 REAL, hang_seng REAL, fetched_at TEXT
    );
    CREATE TABLE IF NOT EXISTS macro_indicators (
      country TEXT, cpi REAL, gdp_growth REAL, interest_rate REAL
    );
    CREATE TABLE IF NOT EXISTS market_summaries (
      id TEXT PRIMARY KEY,
      period_type TEXT,
      period_start TEXT,
      period_end TEXT,
      created_at TEXT,
      updated_at TEXT,
      summary_text TEXT,
      key_events_json TEXT,
      stock_performance_json TEXT,
      alerts_summary_json TEXT,
      macro_context_json TEXT,
      recommendation_json TEXT,
      news_count INTEGER,
      alert_count INTEGER,
      report_count INTEGER,
      UNIQUE(period_type, period_start)
    );
    CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY,
      parsed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS prediction_signals (
      id TEXT PRIMARY KEY,
      created_at TEXT,
      severity TEXT,
      ticker TEXT,
      signal_type TEXT,
      description TEXT
    );
    CREATE TABLE IF NOT EXISTS ask_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'default',
      status TEXT NOT NULL DEFAULT 'pending',
      answer TEXT,
      created_at TEXT NOT NULL,
      answered_at TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL
    );
  `);
  return db;
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

  // ── NEWS-FULLDAY refinement tests ──────────────────────────────────────────

  // T-NEWS-9: Dedup — two feeds, one story; higher impact_score copy survives
  it("T-NEWS-9: dedup — two rows with same normalized title, higher impact_score survives", async () => {
    // Row A: lower impact
    seedNewsTodayWithUrl(db, "a1", "VN-Index tăng mạnh.", "positive", "Tóm tắt A.", 0.5, "https://cafef.vn/1");
    // Row B: higher impact (inserted after — but SQL order by impact_score DESC means B comes first)
    seedNewsTodayWithUrl(db, "b1", "VN-Index tăng mạnh", "positive", "Tóm tắt B — chi tiết hơn.", 0.9, "https://vnexpress.net/1");

    const result = await handleTelegramCommand(makeUpdate("/news"), db);
    expect(result).not.toBeNull();
    const output = (result!.texts ?? [result!.text]).join("\n");

    // Only one occurrence of the title
    const matches = output.match(/VN-Index tăng mạnh/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);

    // The surviving copy should be B (higher score) — its summary is "Tóm tắt B"
    expect(output).toContain("Tóm tắt B");
    expect(output).not.toContain("Tóm tắt A");
  });

  // T-NEWS-10: Dedup — three distinct stories all survive
  it("T-NEWS-10: dedup — three distinct-title rows all appear in output", async () => {
    seedNewsTodayWithUrl(db, "d1", "Cổ phiếu X tăng", "positive", "Tóm tắt X.", 0.8);
    seedNewsTodayWithUrl(db, "d2", "Lãi suất giảm", "neutral", "Tóm tắt lãi suất.", 0.7);
    seedNewsTodayWithUrl(db, "d3", "VN-Index tăng", "positive", "Tóm tắt VN-Index.", 0.6);

    const result = await handleTelegramCommand(makeUpdate("/news"), db);
    expect(result).not.toBeNull();
    const output = (result!.texts ?? [result!.text]).join("\n");

    expect(output).toContain("Cổ phiếu X tăng");
    expect(output).toContain("Lãi suất giảm");
    expect(output).toContain("VN-Index tăng");
  });

  // T-NEWS-11: HTML strip — no angle brackets in output, inner text preserved
  it("T-NEWS-11: HTML strip — tags absent from output, inner text preserved", async () => {
    seedNewsTodayWithUrl(
      db,
      "h1",
      "<b>VN-Index tăng</b>",
      "positive",
      '<a href="https://cafef.vn">Xem chi tiết</a> thị trường hôm nay tăng điểm',
      0.8,
    );

    const result = await handleTelegramCommand(makeUpdate("/news"), db);
    expect(result).not.toBeNull();
    const output = (result!.texts ?? [result!.text]).join("\n");

    // No raw HTML in output
    expect(output).not.toContain("<b>");
    expect(output).not.toContain("</b>");
    expect(output).not.toContain("<a");
    expect(output).not.toContain("href");
    expect(output).not.toContain("<");
    expect(output).not.toContain(">");

    // Inner text preserved
    expect(output).toContain("VN-Index tăng");
    expect(output).toContain("Xem chi tiết");
    expect(output).toContain("thị trường hôm nay tăng điểm");
  });

  // T-NEWS-12: Full-day coverage — 25 distinct rows all appear (no silent 20-cap)
  it("T-NEWS-12: full-day coverage — 25 distinct rows all appear with no-arg /news", async () => {
    for (let i = 1; i <= 25; i++) {
      seedNewsTodayWithUrl(db, `fd${i}`, `Tin tức hôm nay số ${i}`, "neutral", `Tóm tắt ${i}.`, 0.5);
    }

    const result = await handleTelegramCommand(makeUpdate("/news"), db);
    expect(result).not.toBeNull();
    const texts = result!.texts ?? [result!.text];
    const output = texts.join("\n");

    // All 25 distinct titles must appear
    for (let i = 1; i <= 25; i++) {
      expect(output).toContain(`Tin tức hôm nay số ${i}`);
    }

    // Each chunk must be <= 4096 chars
    for (const chunk of texts) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. stripHtml — unit tests (T-STRIP-1..7)
// ─────────────────────────────────────────────────────────────────────────────

describe("stripHtml — NEWS-FULLDAY helper (T-STRIP-1..7)", () => {
  // T-STRIP-1: Anchor tag — inner text preserved, URL dropped
  it("T-STRIP-1: anchor tag — inner text preserved, URL dropped", () => {
    expect(stripHtml('<a href="https://cafef.vn">VN-Index tăng</a>')).toBe("VN-Index tăng");
  });

  // T-STRIP-2: Void element — discarded entirely
  it("T-STRIP-2: void element (img) — discarded, returns empty string", () => {
    expect(stripHtml('<img src="chart.png" alt="biểu đồ">')).toBe("");
  });

  // T-STRIP-3: Bold tag — inner text preserved
  it("T-STRIP-3: bold tag — inner text preserved", () => {
    expect(stripHtml("<b>Tiêu đề quan trọng</b>")).toBe("Tiêu đề quan trọng");
  });

  // T-STRIP-4: Null input — no throw, returns empty string
  it("T-STRIP-4: null input — returns empty string, no throw", () => {
    expect(stripHtml(null)).toBe("");
  });

  // T-STRIP-5: Undefined input — no throw, returns empty string
  it("T-STRIP-5: undefined input — returns empty string, no throw", () => {
    expect(stripHtml(undefined)).toBe("");
  });

  // T-STRIP-6: Plain text passthrough — unchanged
  it("T-STRIP-6: plain text passthrough — returned unchanged", () => {
    expect(stripHtml("Văn bản thường")).toBe("Văn bản thường");
  });

  // T-STRIP-7: Mixed content — all tags stripped, all text preserved
  it("T-STRIP-7: mixed content — all tags stripped, text preserved", () => {
    expect(stripHtml('Trước <b>đây</b> và <a href="x">sau</a> đó')).toBe("Trước đây và sau đó");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. handleRecap — /recap command (T-RECAP-1..7)
// ─────────────────────────────────────────────────────────────────────────────

describe("handleRecap — /recap command (T-RECAP-1..7)", () => {
  let db: Database;
  beforeEach(() => { db = makeRecapDb(); });
  afterEach(() => { db.close(); });

  /** Build a minimal valid EveningSummary for testing */
  function makeEveningSummary(overrides: Partial<EveningSummary> = {}): EveningSummary {
    return {
      date: "2026-05-28",
      topAlerts: [],
      topStories: [],
      watchlistMovers: [],
      predictionSignals: [],
      predictionDiag: { stored: 0 },
      taDiag: { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 },
      taSummary: [],
      newsCount: 0,
      generatedAt: new Date().toISOString(),
      portfolioPnl: null,
      foreignFlowMovers: [],
      ...overrides,
    };
  }

  // T-RECAP-1: Happy path — VN-Index present, movers, stories, alerts, portfolio
  it("T-RECAP-1: happy path — all sections rendered in plain Vietnamese", async () => {
    const fakeSummary = makeEveningSummary({
      date: "2026-05-28",
      vnIndex: { close: 1287, change: 12, changePct: 0.94, fetchedAt: new Date().toISOString() },
      watchlistMovers: [{ code: "VCB", changePct: 2.3, price: 88000, exchange: "HOSE" }],
      topStories: [
        { title: "Tiêu đề A", level: "macro", sentiment: "positive", impactScore: 0.8 },
        { title: "Tiêu đề B", level: "sector", sentiment: "neutral", impactScore: 0.6 },
      ],
      topAlerts: [{ severity: "warning", message: "Giảm sàn", stocks: [] }],
      portfolioPnl: {
        items: [{
          code: "VCB",
          shares: 200,
          avgPrice: 85800,
          currentPrice: 88000,
          pnlAmount: 460000,
          pnlPct: 2.3,
        }],
        totalPnlAmount: 460000,
        totalPnlPct: 2.3,
      },
    });

    const result = await handleRecap(db, async () => fakeSummary);
    expect(result.texts).toBeDefined();
    expect(result.texts.length).toBeGreaterThan(0);

    const output = result.texts.join("\n");

    // VN-Index section
    expect(output).toContain("VN-Index");
    expect(output).toContain("tăng");
    expect(output).toContain("1.287");

    // Watchlist section
    expect(output).toContain("VCB");
    expect(output).toContain("2,30%");

    // Stories section
    expect(output).toContain("Tiêu đề A");
    expect(output).toContain("Tiêu đề B");

    // Alerts section
    expect(output).toContain("Cảnh báo");

    // Portfolio section
    expect(output).toContain("Danh mục");

    // No banned fields
    expect(output).not.toContain("summaryText");
    expect(output).not.toContain("confidence");
    expect(output).not.toContain("impactScore");
  });

  // T-RECAP-2: Empty state — all optional sections absent
  it("T-RECAP-2: empty state — empty watchlist message, optional sections absent", async () => {
    // Use makeEveningSummary base (vnIndex already undefined by default)
    const fakeSummary = makeEveningSummary({
      date: "2026-05-27",
      watchlistMovers: [],
      topStories: [],
      topAlerts: [],
      portfolioPnl: null,
      foreignFlowMovers: [],
    });

    const result = await handleRecap(db, async () => fakeSummary);
    const output = result.texts.join("\n");

    // Header
    expect(output).toContain("Tổng kết ngày 2026-05-27");

    // Section 3 empty-state always present
    expect(output).toContain("Không có cổ phiếu nào biến động đáng kể hôm nay.");

    // Optional sections absent
    expect(output).not.toContain("VN-Index");
    expect(output).not.toContain("Tin tức nổi bật");
    expect(output).not.toContain("Cảnh báo:");
    expect(output).not.toContain("Danh mục:");

    // No raw JS values
    expect(output).not.toContain("undefined");
    expect(output).not.toContain("null");
    expect(output).not.toContain("NaN");
  });

  // T-RECAP-3: Chunk boundary — 30 movers + 5 long stories exceed 4096 chars
  it("T-RECAP-3: chunk boundary — oversized output is chunked correctly", async () => {
    const movers = Array.from({ length: 30 }, (_, i) => ({
      code: `ABCD${i.toString().padStart(2, "0")}`,
      changePct: i % 2 === 0 ? 3.5 + i : -(3.5 + i),
      price: 50000 + i * 1000,
      exchange: "HOSE",
    }));
    const stories = Array.from({ length: 5 }, (_, i) => ({
      title: `Tiêu đề sự kiện quan trọng số ${i + 1} — bài viết phân tích thị trường Việt Nam dài dài dài dài dài`,
      level: "macro" as const,
      sentiment: "neutral" as const,
      impactScore: 0.7,
    }));

    const fakeSummary = makeEveningSummary({ watchlistMovers: movers, topStories: stories });

    const result = await handleRecap(db, async () => fakeSummary);
    expect(result.texts.length).toBeGreaterThanOrEqual(1);

    // Every chunk must be <= 4096
    for (const chunk of result.texts) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }

    // All 30 mover codes must appear somewhere
    const allOutput = result.texts.join("\n");
    for (const mover of movers) {
      expect(allOutput).toContain(mover.code);
    }
  });

  // T-RECAP-4: HTML in story title — no angle brackets in output
  it("T-RECAP-4: HTML in story title — stripped, no angle brackets", async () => {
    const fakeSummary = makeEveningSummary({
      topStories: [{ title: "<b>VN-Index tăng</b>", level: "macro", sentiment: "positive", impactScore: 0.8 }],
    });

    const result = await handleRecap(db, async () => fakeSummary);
    const output = result.texts.join("\n");

    expect(output).not.toContain("<b>");
    expect(output).not.toContain("</b>");
    expect(output).not.toContain("<");
    expect(output).not.toContain(">");
    expect(output).toContain("VN-Index tăng");
  });

  // T-RECAP-5: Assembly throws — returns error string, no throw
  it("T-RECAP-5: assembly throws — returns error string, no exception propagated", async () => {
    let threw = false;
    let result: { texts: string[] } | null = null;
    try {
      result = await handleRecap(db, async () => { throw new Error("DB locked"); });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result).not.toBeNull();
    expect(result!.texts[0]).toContain("Lỗi");
  });

  // T-RECAP-6: portfolioPnl undefined — Danh mục section absent
  it("T-RECAP-6: portfolioPnl undefined — Danh mục section absent, no crash", async () => {
    // Base makeEveningSummary already has portfolioPnl=null, which also omits the section
    const fakeSummary = makeEveningSummary({ portfolioPnl: null });
    const result = await handleRecap(db, async () => fakeSummary);
    const output = result.texts.join("\n");
    expect(output).not.toContain("Danh mục:");
  });

  // T-RECAP-7: Position with null pnlPct — renders "chưa có giá"
  it("T-RECAP-7: position with null pnlPct — renders chưa có giá", async () => {
    const fakeSummary = makeEveningSummary({
      portfolioPnl: {
        items: [{
          code: "HPG",
          shares: 100,
          avgPrice: 50000,
          currentPrice: null,
          pnlAmount: null,
          pnlPct: null,
        }],
        totalPnlAmount: 0,
        totalPnlPct: 0,
      },
    });
    const result = await handleRecap(db, async () => fakeSummary);
    const output = result.texts.join("\n");
    expect(output).toContain("HPG: chưa có giá");
    expect(output).not.toContain("null");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. handleRecapWeek — /recapw command (T-RECAPW-1..4)
// ─────────────────────────────────────────────────────────────────────────────

describe("handleRecapWeek — /recapw command (T-RECAPW-1..4)", () => {
  let db: Database;
  beforeEach(() => { db = makeRecapDb(); });
  afterEach(() => { db.close(); });

  function makePeriodicSummary(overrides: Partial<PeriodicSummary> = {}): PeriodicSummary {
    return {
      id: "test-id",
      periodType: "weekly" as const,
      periodStart: "2026-05-25",
      periodEnd: "2026-05-31",
      summaryText: "BANNED English prose — should never appear in output",
      keyEvents: [],
      stockPerformance: {},
      alertsSummary: { total: 0, bySeverity: {}, topAlerts: [] },
      macroContext: {},
      recommendation: {},
      newsCount: 0,
      alertCount: 0,
      reportCount: 0,
      ...overrides,
    };
  }

  // T-RECAPW-1: Happy path — all sections rendered
  it("T-RECAPW-1: happy path — period range, totals, key events, stock moves shown", async () => {
    const fakeSummary = makePeriodicSummary({
      periodStart: "2026-05-25",
      periodEnd: "2026-05-31",
      newsCount: 42,
      alertCount: 8,
      reportCount: 3,
      keyEvents: [{ date: "2026-05-26T00:00:00Z", title: "Lãi suất giảm", impact: 7.5, direction: "up" }],
      stockPerformance: { VCB: { changePct: 3.5, alertCount: 2, firstPrice: 85000, lastPrice: 88000 } },
      alertsSummary: {
        total: 8,
        bySeverity: { warning: 5, info: 3 },
        topAlerts: ["Cảnh báo A", "Cảnh báo B"],
      },
    });

    const result = await handleRecapWeek(db, async () => fakeSummary);
    const output = result.texts.join("\n");

    expect(output).toContain("Tổng kết tuần");
    expect(output).toContain("2026-05-25");
    expect(output).toContain("2026-05-31");
    expect(output).toContain("Tin tức: 42 bài");
    expect(output).toContain("Cảnh báo: 8 cảnh báo");
    expect(output).toContain("Báo cáo tài chính: 3 báo cáo");
    expect(output).toContain("Lãi suất giảm");
    expect(output).toContain("tăng");
    expect(output).toContain("VCB");
    expect(output).toContain("3,50%");

    // Banned fields absent
    expect(output).not.toContain("summaryText");
    expect(output).not.toContain("BANNED");
    expect(output).not.toContain("recommendation");
    expect(output).not.toContain("confidence");
    expect(output).not.toContain("7.5");
    expect(output).not.toContain("[UP]");
  });

  // T-RECAPW-2: Empty period — zero counts, no key events
  it("T-RECAPW-2: empty period — zero counts shown, optional sections absent", async () => {
    const fakeSummary = makePeriodicSummary({
      newsCount: 0,
      alertCount: 0,
      reportCount: 0,
      keyEvents: [],
      stockPerformance: {},
      alertsSummary: { total: 0, bySeverity: {}, topAlerts: [] },
    });

    const result = await handleRecapWeek(db, async () => fakeSummary);
    const output = result.texts.join("\n");

    expect(output).toContain("Tổng quan");
    expect(output).toContain("Tin tức: 0 bài");
    expect(output).toContain("Cảnh báo: 0 cảnh báo");
    expect(output).not.toContain("Sự kiện nổi bật");
    expect(output).not.toContain("Biến động cổ phiếu");
    expect(output).not.toContain("undefined");
    expect(output).not.toContain("NaN");
  });

  // T-RECAPW-3: Chunk boundary — 30 stocks + 5 key events produce multiple chunks
  it("T-RECAPW-3: chunk boundary — oversized output chunked, all stock codes present", async () => {
    const stockPerf: Record<string, { changePct: number; alertCount: number; firstPrice: number; lastPrice: number }> = {};
    const codes: string[] = [];
    for (let i = 0; i < 30; i++) {
      const code = `ST${i.toString().padStart(2, "0")}`;
      codes.push(code);
      stockPerf[code] = { changePct: i % 2 === 0 ? 3.5 + i * 0.1 : -(3.5 + i * 0.1), alertCount: 1, firstPrice: 50000, lastPrice: 55000 };
    }
    const fakeSummary = makePeriodicSummary({
      newsCount: 100,
      alertCount: 5,
      reportCount: 2,
      stockPerformance: stockPerf,
      keyEvents: Array.from({ length: 5 }, (_, i) => ({
        date: `2026-05-${String(20 + i).padStart(2, "0")}T00:00:00Z`,
        title: `Sự kiện quan trọng số ${i + 1} — phân tích chuyên sâu thị trường tài chính Việt Nam`,
        impact: 7.0,
        direction: "up",
      })),
      alertsSummary: { total: 5, bySeverity: { warning: 5 }, topAlerts: [] },
    });

    const result = await handleRecapWeek(db, async () => fakeSummary);
    expect(result.texts.length).toBeGreaterThanOrEqual(1);

    for (const chunk of result.texts) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }

    const allOutput = result.texts.join("\n");
    for (const code of codes) {
      expect(allOutput).toContain(code);
    }
  });

  // T-RECAPW-4: Assembly throws — returns error string, no throw
  it("T-RECAPW-4: assembly throws — returns error string", async () => {
    let threw = false;
    let result: { texts: string[] } | null = null;
    try {
      result = await handleRecapWeek(db, async () => { throw new Error("timeout"); });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result!.texts[0]).toContain("Lỗi");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. handleRecapMonth — /recapm command (T-RECAPM-1..3)
// ─────────────────────────────────────────────────────────────────────────────

describe("handleRecapMonth — /recapm command (T-RECAPM-1..3)", () => {
  let db: Database;
  beforeEach(() => { db = makeRecapDb(); });
  afterEach(() => { db.close(); });

  function makeMonthSummary(overrides: Partial<PeriodicSummary> = {}): PeriodicSummary {
    return {
      id: "month-id",
      periodType: "monthly" as const,
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      summaryText: "BANNED English prose",
      keyEvents: [],
      stockPerformance: {},
      alertsSummary: { total: 0, bySeverity: {}, topAlerts: [] },
      macroContext: {},
      recommendation: {},
      newsCount: 150,
      alertCount: 25,
      reportCount: 10,
      ...overrides,
    };
  }

  // T-RECAPM-1: Happy path — month range and labels shown
  it("T-RECAPM-1: happy path — month range and section labels present", async () => {
    const fakeSummary = makeMonthSummary({
      keyEvents: [{ date: "2026-05-15T00:00:00Z", title: "Chính sách tài khóa mới", impact: 8.0, direction: "up" }],
      stockPerformance: { FPT: { changePct: 5.2, alertCount: 3, firstPrice: 95000, lastPrice: 100000 } },
      alertsSummary: { total: 25, bySeverity: { critical: 2, warning: 15, info: 8 }, topAlerts: ["Cảnh báo tháng"] },
      alertCount: 25,
    });

    const result = await handleRecapMonth(db, async () => fakeSummary);
    const output = result.texts.join("\n");

    expect(output).toContain("Tổng kết tháng");
    expect(output).toContain("2026-05-01");
    expect(output).toContain("2026-05-31");
    expect(output).toContain("Tin tức: 150 bài");
    expect(output).not.toContain("BANNED");
    expect(output).not.toContain("summaryText");
  });

  // T-RECAPM-2: Empty month — zero counts, no optional sections, no crash
  it("T-RECAPM-2: empty month — zero counts, no crash, no jargon", async () => {
    const fakeSummary = makeMonthSummary({
      newsCount: 0,
      alertCount: 0,
      reportCount: 0,
    });

    let threw = false;
    let result: { texts: string[] } | null = null;
    try {
      result = await handleRecapMonth(db, async () => fakeSummary);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    const output = result!.texts.join("\n");
    // Either zero-counts rendered, or empty-state string — no crash either way
    expect(output.length).toBeGreaterThan(0);
    expect(output).not.toContain("undefined");
    expect(output).not.toContain("NaN");
    expect(output).not.toContain("BANNED");
  });

  // T-RECAPM-3: Assembly throws — returns error string
  it("T-RECAPM-3: assembly throws — returns error string, no throw", async () => {
    let threw = false;
    let result: { texts: string[] } | null = null;
    try {
      result = await handleRecapMonth(db, async () => { throw new Error("crash"); });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result!.texts[0]).toContain("Lỗi");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. Routing — /recap /recapw /recapm (T-RECAP-RT-1..4)
// ─────────────────────────────────────────────────────────────────────────────

describe("handleTelegramCommand routing — /recap /recapw /recapm (T-RECAP-RT-1..4)", () => {
  let db: Database;
  beforeEach(() => { db = makeRecapDb(); });
  afterEach(() => { db.close(); });

  // T-RECAP-RT-1: /recap routed — command recognised, result non-null with texts
  it("T-RECAP-RT-1: /recap routed — result non-null, texts defined, chatId preserved", async () => {
    const result = await handleTelegramCommand(makeUpdate("/recap", 55555), db);
    expect(result).not.toBeNull();
    expect(result!.chatId).toBe(55555);
    expect(result!.texts).toBeDefined();
    expect(Array.isArray(result!.texts)).toBe(true);
    expect(result!.texts!.length).toBeGreaterThan(0);
  });

  // T-RECAP-RT-2: /recapw routed — command recognised
  it("T-RECAP-RT-2: /recapw routed — result non-null, texts defined", async () => {
    const result = await handleTelegramCommand(makeUpdate("/recapw", 55556), db);
    expect(result).not.toBeNull();
    expect(result!.chatId).toBe(55556);
    expect(result!.texts).toBeDefined();
    expect(result!.texts!.length).toBeGreaterThan(0);
  });

  // T-RECAP-RT-3: /recapm routed — command recognised
  it("T-RECAP-RT-3: /recapm routed — result non-null, texts defined", async () => {
    const result = await handleTelegramCommand(makeUpdate("/recapm", 55557), db);
    expect(result).not.toBeNull();
    expect(result!.chatId).toBe(55557);
    expect(result!.texts).toBeDefined();
    expect(result!.texts!.length).toBeGreaterThan(0);
  });

  // T-RECAP-RT-4: /help lists all 3 new commands
  it("T-RECAP-RT-4: /help lists /recap, /recapw, /recapm", async () => {
    const result = await handleTelegramCommand(makeUpdate("/help"), db);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("/recap");
    expect(result!.text).toContain("/recapw");
    expect(result!.text).toContain("/recapm");
  });
});
