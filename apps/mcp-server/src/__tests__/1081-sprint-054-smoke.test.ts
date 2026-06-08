Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1081 — Sprint 054 End-to-End Smoke Test
 *
 * Single integration test exercising the full Sprint 054 happy path:
 *   Scenario 1: Position command roundtrip (buy/buy-more/partial-sell/clear)  [1070+1071]
 *   Scenario 2: /check_position formatting                                    [1071]
 *   Scenario 3: /ask queue flow (enqueue → cron signal → MCP answer)         [1072+1073+1074+1078]
 *   Scenario 4: Alert policy evaluation (3-AND danger + 4-AND opportunity)   [1075]
 *   Scenario 5: Kinh Dich wrapper — appendKinhDich                           [1077]
 *   Scenario 6: get_user_positions_for_analysis MCP tool                     [1079]
 *
 * All in-memory: no real Telegram HTTP, no launchctl, no network.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Domain / infrastructure
import {
  applyPositionCommand,
  listOpenPositions,
  upsertPosition,
} from "../infrastructure/db/positionStore.js";
import {
  insertAskQuestion,
  getPendingAskQuestions,
  answerAskQuestion,
} from "../infrastructure/db/askQueueStore.js";
import { runAskQueueCheck } from "../scheduler/system/askQueueCheckJob.js";
import {
  checkPositionDanger,
  checkWatchlistOpportunity,
} from "../domain/services/alertPolicyChecker.js";
// DEPRECATED-TEST: testing the deprecated wrapper — import path updated post-G5a move
import { appendKinhDich } from "../infrastructure/_deprecated/kinhDichWrapper.js";

// Interface layer
import { handleTelegramCommand, type TelegramUpdate } from "../infrastructure/notifiers/telegramCommands.js";
import { registerAskQueueTools } from "../interface/mcp/tools/system/askQueueTools.js";
import { registerPositionTools } from "../interface/mcp/tools/portfolio/positionTools.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared DB factory: creates all tables needed across the full sprint surface
// ─────────────────────────────────────────────────────────────────────────────

function makeFullDb(): Database {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT    NOT NULL UNIQUE,
      shares      INTEGER NOT NULL DEFAULT 0,
      avg_price   REAL    NOT NULL DEFAULT 0,
      opened_at   TEXT    NOT NULL DEFAULT (datetime('now')),
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

    CREATE INDEX IF NOT EXISTS idx_ask_queue_status   ON ask_queue(status);
    CREATE INDEX IF NOT EXISTS idx_ask_queue_received ON ask_queue(received_at);

    CREATE TABLE IF NOT EXISTS agent_signals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent   TEXT    NOT NULL,
      to_agent     TEXT    NOT NULL,
      signal_type  TEXT    NOT NULL,
      stock_code   TEXT,
      payload      TEXT    NOT NULL DEFAULT '{}',
      status       TEXT    NOT NULL DEFAULT 'unread',
      created_at   DATETIME NOT NULL DEFAULT (datetime('now')),
      expires_at   DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kinhdich_readings (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code         TEXT    NOT NULL,
      hexagram_number    INTEGER NOT NULL,
      ho_que_number      INTEGER NOT NULL,
      bien_que_number    INTEGER NOT NULL,
      hao_states         TEXT    NOT NULL DEFAULT '[]',
      raw_scores         TEXT    NOT NULL DEFAULT '[]',
      ngu_hanh_dynamic   TEXT    NOT NULL DEFAULT '',
      trading_signal     TEXT,
      confidence         REAL,
      action_note        TEXT,
      timestamp          TEXT    NOT NULL DEFAULT (datetime('now'))
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
  `);

  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

function makeUpdate(text: string, userId?: number): TelegramUpdate {
  return {
    message: {
      chat: { id: 12345 },
      text,
      from: { first_name: "Test", id: userId ?? 99999 },
    },
  };
}

/** Call a registered MCP tool handler directly (bypasses transport). */
async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = (server as any)._registeredTools as Record<
    string,
    { handler: (args: Record<string, unknown>) => Promise<unknown> }
  >;
  const tool = handlers?.[toolName];
  if (!tool) throw new Error(`Tool '${toolName}' not found on server`);
  return tool.handler(args);
}

function parseToolResponse(res: unknown): unknown {
  const r = res as { content: Array<{ type: string; text: string }> };
  return JSON.parse(r.content[0]!.text);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 054 Smoke Test
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1081 — Sprint 054 Smoke Test", () => {
  let db: Database;

  beforeEach(() => {
    db = makeFullDb();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 1: Position command roundtrip  [1070 + 1071]
  // ──────────────────────────────────────────────────────────────────────────

  it("Scenario 1: position command roundtrip via applyPositionCommand", () => {
    // Step 1a: /set_position FPT 80300 5100  (first buy @ 80.3k)
    const buy1 = applyPositionCommand(db, { ticker: "FPT", price: 80300, qty: 5100 });
    expect(buy1.ok).toBe(true);

    const after1 = listOpenPositions(db);
    const fpt1 = after1.find((p) => p.code === "FPT");
    expect(fpt1).toBeDefined();
    expect(fpt1!.shares).toBe(5100);
    expect(fpt1!.avgPrice).toBe(80300);

    // Step 1b: /set_position FPT 82000 2000  (buy more — weighted avg)
    const buy2 = applyPositionCommand(db, { ticker: "FPT", price: 82000, qty: 2000 });
    expect(buy2.ok).toBe(true);

    const after2 = listOpenPositions(db);
    const fpt2 = after2.find((p) => p.code === "FPT");
    expect(fpt2).toBeDefined();
    expect(fpt2!.shares).toBe(7100);
    // Weighted avg = (5100*80300 + 2000*82000) / 7100
    const expectedAvg = Math.round((5100 * 80300 + 2000 * 82000) / 7100);
    expect(fpt2!.avgPrice).toBe(expectedAvg);
    // 80.77k range (actual: 80790)
    expect(fpt2!.avgPrice).toBeGreaterThan(80300);
    expect(fpt2!.avgPrice).toBeLessThan(82000);

    // Step 1c: /set_position FPT 84000 -1500  (partial sell — avg unchanged)
    const sell = applyPositionCommand(db, { ticker: "FPT", price: 84000, qty: -1500 });
    expect(sell.ok).toBe(true);
    expect(sell.message).toContain("còn lại");

    const after3 = listOpenPositions(db);
    const fpt3 = after3.find((p) => p.code === "FPT");
    expect(fpt3).toBeDefined();
    expect(fpt3!.shares).toBe(5600);
    expect(fpt3!.avgPrice).toBe(expectedAvg); // avg UNCHANGED on partial sell

    // Step 1d: /set_position FPT 0 0  (clear)
    const clear = applyPositionCommand(db, { ticker: "FPT", price: 0, qty: 0 });
    expect(clear.ok).toBe(true);
    expect(clear.message).toBe("Đã xóa toàn bộ vị thế FPT");

    const after4 = listOpenPositions(db);
    expect(after4.find((p) => p.code === "FPT")).toBeUndefined();
  });

  it("Scenario 1b: /set_position roundtrip via handleTelegramCommand", async () => {
    // Buy
    const r1 = await handleTelegramCommand(makeUpdate("/set_position FPT 80300 5100"), db);
    expect(r1).not.toBeNull();
    expect(r1!.text).toContain("Mua");

    // Buy more
    const r2 = await handleTelegramCommand(makeUpdate("/set_position FPT 82000 2000"), db);
    expect(r2!.text).toContain("avg cost");

    // Partial sell
    const r3 = await handleTelegramCommand(makeUpdate("/set_position FPT 84000 -1500"), db);
    expect(r3!.text).toContain("Bán");
    expect(r3!.text).toContain("còn lại");

    // Clear
    const r4 = await handleTelegramCommand(makeUpdate("/set_position FPT 0 0"), db);
    expect(r4!.text.toLowerCase()).toContain("xóa");
    expect(r4!.text).toContain("FPT");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 2: /check_position  [1071]
  // ──────────────────────────────────────────────────────────────────────────

  it("Scenario 2: /check_position returns formatted string with P/L, stop-loss floor, TP ladder", async () => {
    // Seed a FPT position and market price
    upsertPosition(db, { code: "FPT", shares: 5000, avgPrice: 80000 });
    db.prepare("INSERT INTO market_prices (code, price) VALUES (?, ?)").run("FPT", 88000);

    const result = await handleTelegramCommand(makeUpdate("/check_position"), db);
    expect(result).not.toBeNull();

    const text = result!.text;

    // Code appears
    expect(text).toContain("FPT");

    // P/L: (88000-80000)/80000 = 10% → displayed as +10%
    expect(text).toContain("+10");
    expect(text).toContain("%");

    // Stop-loss floor = Math.round(80000 * 0.93) = 74400
    expect(text).toContain("74.400");

    // TP1 = Math.round(80000 * 1.10) = 88000
    expect(text).toContain("88.000");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 3: /ask queue flow  [1072 + 1073 + 1074 + 1078]
  // ──────────────────────────────────────────────────────────────────────────

  it("Scenario 3a: /ask enqueues a pending row", async () => {
    // [1073] Simulate /ask FPT có nên mua không?
    const r = await handleTelegramCommand(
      makeUpdate("/ask FPT có nên mua không?"),
      db,
    );
    expect(r).not.toBeNull();
    expect(r!.text).toMatch(/Câu hỏi đã ghi nhận \(#[0-9]+\)/);

    // [1072] ask_queue has 1 pending row
    const pending = getPendingAskQuestions(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.message).toBe("FPT có nên mua không?");
    // getPendingAskQuestions returns only pending rows (status filter is internal)
  });

  it("Scenario 3b: runAskQueueCheck signals when pending questions exist", () => {
    // [1072] Seed ask_queue directly
    insertAskQuestion(db, "Nên mua VCB không?");
    insertAskQuestion(db, "FPT có tốt không?");

    // [1074] runAskQueueCheck → signaled=true, count=2
    const check1 = runAskQueueCheck(db);
    expect(check1.signaled).toBe(true);
    expect(check1.count).toBe(2);

    // Verify agent_signals row written for 07-qa-responder
    const signal = db
      .query<{ to_agent: string; signal_type: string; payload: string }, []>(
        "SELECT to_agent, signal_type, payload FROM agent_signals WHERE to_agent = '07-qa-responder' LIMIT 1",
      )
      .get();
    expect(signal).not.toBeNull();
    expect(signal!.to_agent).toBe("07-qa-responder");
    expect(signal!.signal_type).toBe("pending_questions");
    const parsed = JSON.parse(signal!.payload) as { count: number };
    expect(parsed.count).toBe(2);
  });

  it("Scenario 3c: MCP tools get_pending_ask_questions + answer_ask_question", async () => {
    // [1078] Register ask queue MCP tools
    const server = new McpServer(
      { name: "test-smoke", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerAskQueueTools(server, db);

    // Seed a pending question
    const qId = insertAskQuestion(db, "FPT có nên mua không?");

    // get_pending_ask_questions → returns the question
    const pendingResult = await callTool(server, "get_pending_ask_questions");
    const pendingList = parseToolResponse(pendingResult) as Array<{
      id: number;
      message: string;
      received_at: string;
    }>;
    expect(pendingList).toHaveLength(1);
    expect(pendingList[0]!.id).toBe(qId);
    expect(pendingList[0]!.message).toBe("FPT có nên mua không?");

    // answer_ask_question with status='answered'
    const answerResult = await callTool(server, "answer_ask_question", {
      id: qId,
      answer_text: "FPT có triển vọng tốt trong Q2/2026.",
      status: "answered",
    });
    const answerParsed = parseToolResponse(answerResult) as {
      success: boolean;
      id: number;
      newStatus: string;
    };
    expect(answerParsed.success).toBe(true);
    expect(answerParsed.id).toBe(qId);
    expect(answerParsed.newStatus).toBe("answered");

    // Verify persistence in DB
    const row = db
      .query<{ status: string; answer_text: string }, [number]>(
        "SELECT status, answer_text FROM ask_queue WHERE id = ?",
      )
      .get(qId);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("answered");
    expect(row!.answer_text).toBe("FPT có triển vọng tốt trong Q2/2026.");
  });

  it("Scenario 3d: runAskQueueCheck returns signaled=false after all questions answered", () => {
    // Seed and answer immediately
    const id = insertAskQuestion(db, "Câu hỏi đã trả lời");
    answerAskQuestion(db, id, "Đã trả lời rồi nhé.", "answered");

    // No pending questions → no signal
    const check = runAskQueueCheck(db);
    expect(check.signaled).toBe(false);
    expect(check.count).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 4: Alert policy evaluation  [1075]
  // ──────────────────────────────────────────────────────────────────────────

  it("Scenario 4a: checkPositionDanger — all 3 conditions met → fires=true", () => {
    const result = checkPositionDanger({
      stopLossHit: true,
      singleDayDropPct: 5.5,
      newsSentiment: -0.7,
      thresholds: { singleDayDropPct: 5.0, newsSentimentThreshold: -0.5 },
    });
    expect(result.fire).toBe(true);
    expect(typeof result.reason).toBe("string");
  });

  it("Scenario 4b: checkPositionDanger — missing 1 condition → fires=false", () => {
    // stopLossHit=false → does not fire even with big drop
    const result = checkPositionDanger({
      stopLossHit: false,
      singleDayDropPct: 8.0,
      newsSentiment: -0.9,
      thresholds: { singleDayDropPct: 5.0, newsSentimentThreshold: -0.5 },
    });
    expect(result.fire).toBe(false);
  });

  it("Scenario 4c: checkWatchlistOpportunity — all 4 conditions met → fires=true", () => {
    const result = checkWatchlistOpportunity({
      kinhDichConfidence: 80,
      kinhDichSignal: "BUY",
      newsSentiment: 0.5,
      agentSignalsMajority: "BUY",
      thresholds: { kinhDichConfidenceMin: 70, newsSentimentMin: 0.3 },
    });
    expect(result.fire).toBe(true);
    expect(typeof result.reason).toBe("string");
  });

  it("Scenario 4d: checkWatchlistOpportunity — kinhDich=NEUTRAL → fires=false", () => {
    const result = checkWatchlistOpportunity({
      kinhDichConfidence: 85,
      kinhDichSignal: "NEUTRAL",
      newsSentiment: 0.6,
      agentSignalsMajority: "BUY",
      thresholds: { kinhDichConfidenceMin: 70, newsSentimentMin: 0.3 },
    });
    expect(result.fire).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 5: Kinh Dich wrapper  [1077]
  // ──────────────────────────────────────────────────────────────────────────

  it("Scenario 5: appendKinhDich appends hexagram block to base analysis", async () => {
    // Seed kinhdich_readings with FPT data
    db.prepare(`
      INSERT INTO kinhdich_readings
        (stock_code, hexagram_number, ho_que_number, bien_que_number,
         hao_states, raw_scores, ngu_hanh_dynamic, trading_signal,
         confidence, action_note, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "FPT", 11, 54, 26,
      "[]", "[0.2,0.2,0.2,0.2,0.2,0.2]", "Tho",
      "MUA (tich cuc)", 0.82,
      "KHUYEN NGHI: MUA",
      new Date().toISOString(),
    );

    const base = "Phân tích cơ bản FPT: kết quả tốt.";
    const result = await appendKinhDich("FPT", base, db);

    // Must preserve base
    expect(result).toContain(base);
    // Must contain Kinh Dich block markers
    expect(result).toContain("Kinh Dịch:");
    expect(result).toContain("Biến quẻ:");
    expect(result).toContain("---");
    // Confidence rendered as %
    expect(result).toContain("82%");
  });

  it("Scenario 5b: appendKinhDich returns fallback when no data for ticker", async () => {
    // kinhdich_readings is empty in this test
    const result = await appendKinhDich("XYZ", "base output", db);
    expect(result).toBe("base output\n---\nKinh Dịch: Chưa đủ dữ liệu để tính quẻ.");
  });

  it("Scenario 5c: appendKinhDich never throws", async () => {
    let threw = false;
    try {
      // Empty db (no kinhdich_readings table at all in brokenDb)
      const brokenDb = new Database(":memory:");
      initNewsTables(brokenDb);
      initMarketDataTables(brokenDb);
      initSystemTables(brokenDb);
      await appendKinhDich("FPT", "base", brokenDb);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 6: get_user_positions_for_analysis MCP tool  [1079]
  // ──────────────────────────────────────────────────────────────────────────

  it("Scenario 6: get_user_positions_for_analysis returns enriched position with FPT", async () => {
    // Seed FPT position and live market price
    upsertPosition(db, { code: "FPT", shares: 5000, avgPrice: 80000 });
    db.prepare("INSERT INTO market_prices (code, price) VALUES (?, ?)").run("FPT", 88000);

    const server = new McpServer({ name: "test-smoke", version: "1.0.0" });
    registerPositionTools(server, db);

    const res = await callTool(server, "get_user_positions_for_analysis");
    const data = parseToolResponse(res) as Array<Record<string, unknown>>;

    expect(data).toHaveLength(1);
    const fpt = data[0]!;

    // Core fields
    expect(fpt["code"]).toBe("FPT");
    expect(fpt["shares"]).toBe(5000);
    expect(fpt["avgPrice"]).toBe(80000);

    // Live price
    expect(fpt["currentPrice"]).toBe(88000);

    // Stop-loss floor = Math.round(80000 * 0.93) = 74400
    expect(fpt["stopLossFloor"]).toBe(74400);

    // TP ladder
    expect(fpt["tp1"]).toBe(88000);  // +10%
    expect(fpt["tp2"]).toBe(96000);  // +20%
    expect(fpt["tp3"]).toBe(104000); // +30%

    // P/L fields
    expect(typeof fpt["unrealizedPnl"]).toBe("number");
    expect(typeof fpt["unrealizedPnlPct"]).toBe("number");
  });

  it("Scenario 6b: get_user_positions_for_analysis with ticker filter", async () => {
    upsertPosition(db, { code: "FPT", shares: 5000, avgPrice: 80000 });
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });

    const server = new McpServer({ name: "test-smoke", version: "1.0.0" });
    registerPositionTools(server, db);

    const res = await callTool(server, "get_user_positions_for_analysis", {
      ticker: "VCB",
    });
    const data = parseToolResponse(res) as Array<{ code: string }>;

    expect(data).toHaveLength(1);
    expect(data[0]!.code).toBe("VCB");
  });

  it("Scenario 6c: get_user_positions_for_analysis handles missing market price gracefully", async () => {
    upsertPosition(db, { code: "HPG", shares: 2000, avgPrice: 25000 });
    // No market_prices row for HPG

    const server = new McpServer({ name: "test-smoke", version: "1.0.0" });
    registerPositionTools(server, db);

    const res = await callTool(server, "get_user_positions_for_analysis");
    const data = parseToolResponse(res) as Array<{
      code: string;
      currentPrice: null;
      unrealizedPnl: null;
      unrealizedPnlPct: null;
    }>;

    const hpg = data.find((p) => p.code === "HPG")!;
    expect(hpg.currentPrice).toBeNull();
    expect(hpg.unrealizedPnl).toBeNull();
    expect(hpg.unrealizedPnlPct).toBeNull();
  });
});
