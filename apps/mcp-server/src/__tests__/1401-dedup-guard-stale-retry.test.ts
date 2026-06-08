/**
 * Task 1401 — Dedup guard: allow retry when prior run used stale vnIndex data.
 *
 * alreadySentToday() must return false (allow retry) when the stored evening-summary
 * message content contains the stale marker " (cũ)" — meaning the prior run built
 * the report with a vnIndex that was >25h old at generation time.
 *
 * alreadySentToday() must return true (block retry) when the stored message content
 * does NOT contain the stale marker — i.e. the prior run used fresh data.
 *
 * Layer: interface/scheduler — tested via exported alreadySentToday
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  alreadySentTodayForTest,
  resetEveningSummaryGuard,
} from "../scheduler/briefings/eveningSummaryJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal market_messages table — only the columns alreadySentToday needs.
 */
function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE IF NOT EXISTS market_messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent   TEXT    NOT NULL,
      message_type TEXT    NOT NULL,
      ticker       TEXT,
      content      TEXT    NOT NULL,
      sent_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

/**
 * Insert a fake evening-summary row with the given content, sent today (UTC).
 */
function insertTodayRow(db: Database, content: string): void {
  db.run(
    `INSERT INTO market_messages (from_agent, message_type, content, sent_at)
     VALUES ('evening-summary', 'evening_summary', ?, datetime('now'))`,
    [content],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1401 — alreadySentToday dedup guard staleness check", () => {
  beforeEach(() => {
    resetEveningSummaryGuard();
  });

  it("returns false (allow retry) when stored message contains stale marker (cũ)", () => {
    const db = makeTestDb();
    // Simulate a prior run that used stale vnIndex data — message contains " (cũ)"
    insertTodayRow(
      db,
      "TÓM TẮT BUỔI TỐI 2026-04-28\nVN-Index: 1.300 (+0 / +0.00%) (cũ)\n",
    );

    // Should be false: prior run was stale, retry is allowed
    expect(alreadySentTodayForTest(db)).toBe(false);
  });

  it("returns true (block retry) when stored message has fresh vnIndex (no stale marker)", () => {
    const db = makeTestDb();
    // Simulate a prior run that used fresh vnIndex data — no " (cũ)" suffix
    insertTodayRow(
      db,
      "TÓM TẮT BUỔI TỐI 2026-04-28\nVN-Index: 1.875 (+5 / +0.27%)\n",
    );

    // Should be true: prior run was fresh, block retry
    expect(alreadySentTodayForTest(db)).toBe(true);
  });

  it("returns false when no row exists today (first run of the day)", () => {
    const db = makeTestDb();
    // No rows inserted — first run of the day
    expect(alreadySentTodayForTest(db)).toBe(false);
  });

  it("returns false when DB has a row from a different agent (not evening-summary)", () => {
    const db = makeTestDb();
    // A morning-briefing row does not count as an evening-summary dedup
    db.run(
      `INSERT INTO market_messages (from_agent, message_type, content, sent_at)
       VALUES ('morning-briefing', 'morning_briefing', 'Chao buoi sang', datetime('now'))`,
    );
    expect(alreadySentTodayForTest(db)).toBe(false);
  });
});
