/**
 * Task 1215 — Bug report deduplication in send_telegram(channel="bug")
 *
 * Tests for:
 *   1. extractCategoryFromText parses emoji-prefixed category line
 *   2. isDuplicateReport returns false when no open reports exist
 *   3. isDuplicateReport returns true when same category has a new report within cooldown
 *   4. isDuplicateReport returns false when existing report is processed (not new)
 *   5. isDuplicateReport returns false when same category report is older than cooldown
 *   6. isDuplicateReport returns false when category is null (uncategorised message)
 */

Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  extractCategoryFromText,
  isDuplicateReport,
  insertReport,
  markProcessed,
} from "../infrastructure/db/telegramReportStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create an in-memory DB with the minimal DDL needed for telegram_reports. */
function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_reports (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL DEFAULT 0,
      text       TEXT    NOT NULL,
      from_agent TEXT    NOT NULL DEFAULT 'unknown',
      priority   TEXT    NOT NULL DEFAULT 'normal',
      status     TEXT    NOT NULL DEFAULT 'new',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      claimed_by TEXT,
      claimed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_reports_status  ON telegram_reports(status);
    CREATE INDEX IF NOT EXISTS idx_telegram_reports_created ON telegram_reports(created_at);
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

function bugText(category: string, body = "Some detail about the bug."): string {
  return `🔴 [HIGH] @dev\n📋 ${category}\nFrom: test-agent\n${body}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1215 — Bug report deduplication", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  // ── Test 1: extractCategoryFromText ────────────────────────────────────────
  it("extractCategoryFromText returns the category from a standard bug message", () => {
    const text = bugText("data_extraction_error");
    expect(extractCategoryFromText(text)).toBe("data_extraction_error");
  });

  it("extractCategoryFromText returns null for messages with no category line", () => {
    const text = "Just a plain message with no category marker";
    expect(extractCategoryFromText(text)).toBeNull();
  });

  // ── Test 2: no duplicate when table is empty ───────────────────────────────
  it("isDuplicateReport returns false when no reports exist", () => {
    const text = bugText("cascade_rule_gap");
    expect(isDuplicateReport(db, text)).toBe(false);
  });

  // ── Test 3: duplicate detected within cooldown window ─────────────────────
  it("isDuplicateReport returns true when same category has a new report within cooldown", () => {
    const text = bugText("cascade_rule_gap");
    insertReport(db, text, "analysis-agent", 100, "normal");
    // Second report for same category
    const text2 = bugText("cascade_rule_gap", "Slightly different wording but same category.");
    expect(isDuplicateReport(db, text2)).toBe(true);
  });

  // ── Test 4: no duplicate when existing report is processed ────────────────
  it("isDuplicateReport returns false when existing report is processed (already handled)", () => {
    const text = bugText("cascade_rule_gap");
    const id = insertReport(db, text, "analysis-agent", 101, "normal");
    markProcessed(db, id);
    // Same category but already processed — should NOT suppress the new report
    const text2 = bugText("cascade_rule_gap", "New occurrence of the same bug.");
    expect(isDuplicateReport(db, text2)).toBe(false);
  });

  // ── Test 5: no duplicate when existing report is older than cooldown ──────
  it("isDuplicateReport returns false when existing report is older than cooldown", () => {
    const db2 = makeDb();
    const category = "performance_issue";
    const oldText = bugText(category);
    // Insert a row with created_at in the past (5 hours ago > default 4h cooldown)
    const fiveHoursAgo = Math.floor(Date.now() / 1000) - 5 * 3600;
    db2
      .prepare(
        `INSERT INTO telegram_reports (text, from_agent, message_id, priority, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(oldText, "analysis-agent", 102, "normal", fiveHoursAgo);
    const newText = bugText(category, "New occurrence after cooldown expired.");
    expect(isDuplicateReport(db2, newText)).toBe(false);
  });

  // ── Test 6: no dedup for uncategorised messages ───────────────────────────
  it("isDuplicateReport returns false when message has no category (no 📋 line)", () => {
    // First insert a plain message
    const plain = "Something happened but no category marker present";
    insertReport(db, plain, "analysis-agent", 103, "normal");
    // Second plain message — should NOT be suppressed (category = null)
    expect(isDuplicateReport(db, "Another plain message, also no category.")).toBe(false);
  });
});
