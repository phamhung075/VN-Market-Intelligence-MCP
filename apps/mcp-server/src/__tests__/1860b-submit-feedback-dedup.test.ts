/**
 * Task 1860b — submit_feedback deduplication
 *
 * Tests for insertReportDeduped() in telegramReportStore.ts:
 *   1. First report inserts normally — returns { inserted: true, id }
 *   2. Same agent + same title prefix within 4h → suppressed — returns { inserted: false, ... }
 *   3. Same agent + same title prefix after 4h → allowed (inserts)
 *   4. Different agent + same title → allowed (inserts)
 *   5. Same agent + different title → allowed (inserts)
 *   6. DEDUP_WINDOW_SECONDS constant is exported and equals 4 * 3600
 */

Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  insertReportDeduped,
  DEDUP_WINDOW_SECONDS,
  insertReport,
} from "../infrastructure/db/telegramReportStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
      claimed_at TEXT,
      resolution TEXT    NOT NULL DEFAULT 'none',
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_reports_status  ON telegram_reports(status);
    CREATE INDEX IF NOT EXISTS idx_telegram_reports_created ON telegram_reports(created_at);
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1860b — submit_feedback deduplication", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  // ── Constant ──────────────────────────────────────────────────────────────
  it("DEDUP_WINDOW_SECONDS is exported and equals 4 hours", () => {
    expect(DEDUP_WINDOW_SECONDS).toBe(4 * 3600);
  });

  // ── Test 1: first report inserts normally ─────────────────────────────────
  it("first report inserts and returns inserted=true with a positive id", () => {
    const result = insertReportDeduped(
      db,
      "pollNews all-dark: no sources returned",
      "news-scout",
      0,
      "normal",
    );
    expect(result.inserted).toBe(true);
    expect(result.id).toBeGreaterThan(0);
    expect(result.suppressedBy).toBeUndefined();
  });

  // ── Test 2: same agent + same title within 4h → suppressed ───────────────
  it("same agent + same title prefix within 4h returns inserted=false", () => {
    // Both texts share the same first 50 chars; trailing content differs
    const prefix50 = "pollNews all-dark: no sources returned in cycle XX";
    const text = prefix50 + " — first occurrence details";
    insertReportDeduped(db, text, "news-scout", 0, "normal");

    const text2 = prefix50 + " — second occurrence details";
    const result = insertReportDeduped(db, text2, "news-scout", 0, "normal");

    expect(result.inserted).toBe(false);
    expect(result.suppressedBy).toBeGreaterThan(0);
    expect(typeof result.suppressedAt).toBe("string");
  });

  // ── Test 3: same agent + same title prefix after 4h → allowed ────────────
  it("same agent + same title prefix after 4h window inserts normally", () => {
    const db2 = makeDb();
    const agent = "news-scout";
    const prefix50 = "pollNews all-dark: no sources returned in cycle XX";

    // Insert a row with created_at 5 hours ago (past the 4h window)
    const fiveHoursAgo = Math.floor(Date.now() / 1000) - 5 * 3600;
    db2
      .prepare(
        `INSERT INTO telegram_reports (text, from_agent, message_id, priority, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(prefix50 + " — old text", agent, 0, "normal", fiveHoursAgo);

    const text2 = prefix50 + " — new occurrence";
    const result = insertReportDeduped(db2, text2, agent, 0, "normal");
    expect(result.inserted).toBe(true);
    expect(result.id).toBeGreaterThan(0);
  });

  // ── Test 4: different agent + same title → allowed ────────────────────────
  it("different agent with same title prefix inserts normally", () => {
    const text = "alert precision 0%: no alerts fired this cycle";
    insertReportDeduped(db, text, "market-watcher", 0, "normal");

    const result = insertReportDeduped(db, text, "alert-commander", 0, "normal");
    expect(result.inserted).toBe(true);
    expect(result.id).toBeGreaterThan(0);
  });

  // ── Test 5: same agent + different title → allowed ────────────────────────
  it("same agent with different title prefix inserts normally", () => {
    const text1 = "pollNews all-dark: no sources returned";
    const text2 = "alert precision 0%: completely different issue";
    insertReportDeduped(db, text1, "news-scout", 0, "normal");

    const result = insertReportDeduped(db, text2, "news-scout", 0, "normal");
    expect(result.inserted).toBe(true);
    expect(result.id).toBeGreaterThan(0);
  });

  // ── Test 6: suppression message includes existing report id and time ───────
  it("suppressed result carries suppressedBy id and suppressedAt ISO string", () => {
    const text = "FII outflow: heavy selling detected";
    const first = insertReportDeduped(db, text, "market-watcher", 0, "normal");
    expect(first.inserted).toBe(true);

    const second = insertReportDeduped(db, text, "market-watcher", 0, "normal");
    expect(second.inserted).toBe(false);
    expect(second.suppressedBy).toBe(first.id);
    expect(second.suppressedAt).toBeDefined();
    // suppressedAt must be a parseable ISO string
    expect(isNaN(Date.parse(second.suppressedAt!))).toBe(false);
  });

  // ── Test 7: title key is first 50 chars (longer titles still match) ───────
  it("uses first 50 chars of text as match key — longer titles still deduplicate", () => {
    const prefix = "alert precision 0%: no alerts fired this cycle XX"; // exactly 50 chars
    const text1 = prefix + " — with some extra trailing content that differs";
    const text2 = prefix + " — entirely different trailing part";
    insertReportDeduped(db, text1, "alert-commander", 0, "normal");

    const result = insertReportDeduped(db, text2, "alert-commander", 0, "normal");
    expect(result.inserted).toBe(false);
  });

  // ── Test 8: short text (< 50 chars) uses full text as key ────────────────
  it("short text (less than 50 chars) uses full text as dedup key", () => {
    const shortText = "Pivot failed";
    insertReportDeduped(db, shortText, "ba", 0, "normal");

    const result = insertReportDeduped(db, shortText, "ba", 0, "normal");
    expect(result.inserted).toBe(false);
  });
});
