/**
 * Task 227 — Webhook for Report Channel
 *
 * Tests the dispatch logic added to the POST /webhook handler:
 *   - Messages from TELEGRAM_REPORT_BUG_CHANNEL_ID are stored in telegram_reports and
 *     the handler returns 200 without calling the command router.
 *   - Messages from TELEGRAM_INFO_MARKET_GROUP_ID (or any other chat) continue to be
 *     routed to the existing command dispatcher.
 *
 * Strategy: unit-test the store + dispatch logic directly against an
 * in-memory SQLite database, without starting a real HTTP server.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  insertReport,
  listNewReports,
  type TelegramReport,
} from "../infrastructure/db/telegramReportStore.js";
import { ensureTelegramReportsTable } from "./helpers/telegramReportsTestDdl.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — simulate the webhook dispatch logic in isolation
// ─────────────────────────────────────────────────────────────────────────────

interface FakeTelegramUpdate {
  message?: {
    chat?: { id?: number };
    text?: string;
  };
}

/**
 * Mirrors the Report Channel branch implemented in server.ts.
 * Returns "report" if the message was stored, "command" if it was routed
 * to the command dispatcher, or "no-message" if the update had no message.
 */
function dispatchUpdate(
  db: Database,
  update: FakeTelegramUpdate,
  reportChatId: string,
  commandChatId: string,
): "report" | "command" | "no-message" {
  if (!update.message) return "no-message";

  const incomingChatId = String(update.message.chat?.id ?? "");

  if (reportChatId && incomingChatId === reportChatId) {
    const text = update.message.text ?? "";
    insertReport(db, text, "human", 0, "normal");
    return "report";
  }

  // Simulate command routing — just return "command" for testing purposes
  void commandChatId; // acknowledged but not used in this unit test
  return "command";
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 227 — Webhook Report Channel dispatch", () => {
  let db: Database;
  const REPORT_CHAT_ID = "99999";
  const COMMAND_CHAT_ID = "11111";

  beforeEach(() => {
    db = new Database(":memory:");
    ensureTelegramReportsTable(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Routing decisions ────────────────────────────────────────────────────

  it("routes to report branch when chat.id matches TELEGRAM_REPORT_BUG_CHANNEL_ID", () => {
    const update: FakeTelegramUpdate = {
      message: { chat: { id: 99999 }, text: "VCB tests are failing" },
    };
    const result = dispatchUpdate(db, update, REPORT_CHAT_ID, COMMAND_CHAT_ID);
    expect(result).toBe("report");
  });

  it("routes to command branch when chat.id matches TELEGRAM_INFO_MARKET_GROUP_ID", () => {
    const update: FakeTelegramUpdate = {
      message: { chat: { id: 11111 }, text: "/alerts" },
    };
    const result = dispatchUpdate(db, update, REPORT_CHAT_ID, COMMAND_CHAT_ID);
    expect(result).toBe("command");
  });

  it("routes to command branch when chat.id does not match either known id", () => {
    const update: FakeTelegramUpdate = {
      message: { chat: { id: 55555 }, text: "hello" },
    };
    const result = dispatchUpdate(db, update, REPORT_CHAT_ID, COMMAND_CHAT_ID);
    expect(result).toBe("command");
  });

  it("returns no-message when update has no message field", () => {
    const update: FakeTelegramUpdate = {};
    const result = dispatchUpdate(db, update, REPORT_CHAT_ID, COMMAND_CHAT_ID);
    expect(result).toBe("no-message");
  });

  it("routes to command branch when TELEGRAM_REPORT_BUG_CHANNEL_ID is empty string (not configured)", () => {
    const update: FakeTelegramUpdate = {
      message: { chat: { id: 99999 }, text: "some text" },
    };
    // Empty REPORT_CHAT_ID means the feature is disabled — fall through to command
    const result = dispatchUpdate(db, update, "", COMMAND_CHAT_ID);
    expect(result).toBe("command");
  });

  // ── Persistence ──────────────────────────────────────────────────────────

  it("inserts a row in telegram_reports when Report Channel message arrives", () => {
    const update: FakeTelegramUpdate = {
      message: { chat: { id: 99999 }, text: "Critical: FPT price feed down" },
    };
    dispatchUpdate(db, update, REPORT_CHAT_ID, COMMAND_CHAT_ID);

    const rows = listNewReports(db);
    expect(rows.length).toBe(1);
    expect(rows[0]!.text).toBe("Critical: FPT price feed down");
  });

  it("stores from_agent as 'human' for webhook-originated messages", () => {
    const update: FakeTelegramUpdate = {
      message: { chat: { id: 99999 }, text: "check VNM" },
    };
    dispatchUpdate(db, update, REPORT_CHAT_ID, COMMAND_CHAT_ID);

    const rows = listNewReports(db);
    expect(rows[0]!.from_agent).toBe("human");
  });

  it("stores message_id as 0 for webhook-originated messages (no Telegram API call)", () => {
    const update: FakeTelegramUpdate = {
      message: { chat: { id: 99999 }, text: "ping" },
    };
    dispatchUpdate(db, update, REPORT_CHAT_ID, COMMAND_CHAT_ID);

    const rows = listNewReports(db);
    expect(rows[0]!.message_id).toBe(0);
  });

  it("stores status as 'new' for a freshly inserted report", () => {
    const update: FakeTelegramUpdate = {
      message: { chat: { id: 99999 }, text: "new issue" },
    };
    dispatchUpdate(db, update, REPORT_CHAT_ID, COMMAND_CHAT_ID);

    const rows = listNewReports(db);
    expect(rows[0]!.status).toBe("new");
  });

  it("stores priority as 'normal' for webhook-originated messages", () => {
    const update: FakeTelegramUpdate = {
      message: { chat: { id: 99999 }, text: "test" },
    };
    dispatchUpdate(db, update, REPORT_CHAT_ID, COMMAND_CHAT_ID);

    const rows = listNewReports(db);
    expect(rows[0]!.priority).toBe("normal");
  });

  it("does NOT insert a row when message goes to command branch", () => {
    const update: FakeTelegramUpdate = {
      message: { chat: { id: 11111 }, text: "/watchlist" },
    };
    dispatchUpdate(db, update, REPORT_CHAT_ID, COMMAND_CHAT_ID);

    const rows = listNewReports(db);
    expect(rows.length).toBe(0);
  });

  it("handles empty text gracefully — inserts row with empty string", () => {
    const update: FakeTelegramUpdate = {
      message: { chat: { id: 99999 } }, // no text field
    };
    dispatchUpdate(db, update, REPORT_CHAT_ID, COMMAND_CHAT_ID);

    const rows = listNewReports(db);
    expect(rows.length).toBe(1);
    expect(rows[0]!.text).toBe("");
  });

  it("inserts multiple rows from multiple Report Channel messages", () => {
    const messages = ["issue 1", "issue 2", "issue 3"];
    for (const text of messages) {
      const update: FakeTelegramUpdate = {
        message: { chat: { id: 99999 }, text },
      };
      dispatchUpdate(db, update, REPORT_CHAT_ID, COMMAND_CHAT_ID);
    }

    const rows = listNewReports(db);
    expect(rows.length).toBe(3);
    expect(rows.map((r: TelegramReport) => r.text)).toEqual(messages);
  });

  it("rows are returned in ascending created_at order", () => {
    insertReport(db, "first", "human", 0, "normal");
    insertReport(db, "second", "human", 0, "normal");
    insertReport(db, "third", "human", 0, "normal");

    const rows = listNewReports(db);
    expect(rows[0]!.text).toBe("first");
    expect(rows[1]!.text).toBe("second");
    expect(rows[2]!.text).toBe("third");
  });

  // ── String vs number chat ID comparison ──────────────────────────────────

  it("correctly compares numeric chat.id to string TELEGRAM_REPORT_BUG_CHANNEL_ID", () => {
    // TELEGRAM_REPORT_BUG_CHANNEL_ID env var is always a string; chat.id from Telegram is a number
    const update: FakeTelegramUpdate = {
      message: { chat: { id: 99999 }, text: "numeric id test" },
    };
    // "99999" (string) should match 99999 (number) after String() conversion
    const result = dispatchUpdate(db, update, "99999", COMMAND_CHAT_ID);
    expect(result).toBe("report");
  });

  it("does not match when TELEGRAM_REPORT_BUG_CHANNEL_ID has leading/trailing spaces (strict equality)", () => {
    const update: FakeTelegramUpdate = {
      message: { chat: { id: 99999 }, text: "test" },
    };
    // Env var with accidental whitespace — should NOT match
    const result = dispatchUpdate(db, update, " 99999 ", COMMAND_CHAT_ID);
    expect(result).toBe("command");
  });
});
