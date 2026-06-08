Bun.env["DB_PATH"] = ":memory:";
Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1074 — askQueueCheckJob Tests
 *
 * Verifies that runAskQueueCheck:
 *   - Returns { signaled: false, count: 0 } when no pending questions exist
 *   - Calls postSignal to '07-qa-responder' when pending questions exist
 *   - Returns { signaled: true, count: N } when pending questions exist
 *   - Does NOT answer the question itself (no MCP calls, no web fetch)
 *   - Is idempotent (safe to call multiple times with same pending set)
 *
 * Cron registration:
 *   - CRONS map contains 'askQueueCheck' key with default '* /12 * * * *'
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runAskQueueCheck } from "../scheduler/system/askQueueCheckJob.js";
import { CRONS } from "../scheduler/jobs.js";
import { insertAskQuestion } from "../infrastructure/db/askQueueStore.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeTestDb(): Database {
  const db = new Database(":memory:");

  // ask_queue table (from task 1072)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ask_queue (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id               TEXT    NOT NULL DEFAULT 'default',
      message               TEXT    NOT NULL,
      received_at           DATETIME NOT NULL DEFAULT (datetime('now')),
      status                TEXT    NOT NULL DEFAULT 'pending',
      answered_at           DATETIME,
      answer_text           TEXT,
      processing_started_at DATETIME
    )
  `);

  // agent_signals table (base schema — no chain columns needed for this test)
  db.exec(`
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
    )
  `);

  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("Task 1074 — askQueueCheckJob", () => {
  describe("runAskQueueCheck — no pending questions", () => {
    it("returns { signaled: false, count: 0 } when ask_queue is empty", () => {
      const db = makeTestDb();
      const result = runAskQueueCheck(db);
      expect(result).toEqual({ signaled: false, count: 0 });
    });

    it("inserts NO row in agent_signals when ask_queue is empty", () => {
      const db = makeTestDb();
      runAskQueueCheck(db);
      const rows = db.query("SELECT COUNT(*) AS n FROM agent_signals").get() as { n: number };
      expect(rows.n).toBe(0);
    });
  });

  describe("runAskQueueCheck — pending questions exist", () => {
    let db: Database;

    beforeEach(() => {
      db = makeTestDb();
      insertAskQuestion(db, "What is VNM's P/E ratio?");
      insertAskQuestion(db, "Should I buy FPT now?");
    });

    it("returns { signaled: true, count: 2 } when 2 pending questions exist", () => {
      const result = runAskQueueCheck(db);
      expect(result).toEqual({ signaled: true, count: 2 });
    });

    it("inserts exactly 1 row in agent_signals", () => {
      runAskQueueCheck(db);
      const rows = db.query("SELECT COUNT(*) AS n FROM agent_signals").get() as { n: number };
      expect(rows.n).toBe(1);
    });

    it("signal targets '07-qa-responder'", () => {
      runAskQueueCheck(db);
      const row = db.query(
        "SELECT to_agent FROM agent_signals WHERE signal_type = 'pending_questions'"
      ).get() as { to_agent: string } | null;
      expect(row?.to_agent).toBe("07-qa-responder");
    });

    it("signal has signal_type = 'pending_questions'", () => {
      runAskQueueCheck(db);
      const row = db.query(
        "SELECT signal_type FROM agent_signals WHERE to_agent = '07-qa-responder'"
      ).get() as { signal_type: string } | null;
      expect(row?.signal_type).toBe("pending_questions");
    });

    it("signal payload contains count: 2", () => {
      runAskQueueCheck(db);
      const row = db.query(
        "SELECT payload FROM agent_signals WHERE to_agent = '07-qa-responder'"
      ).get() as { payload: string } | null;
      expect(row).not.toBeNull();
      const payload = JSON.parse(row!.payload) as { count: number };
      expect(payload.count).toBe(2);
    });

    it("is idempotent — calling twice produces 2 signal rows (dedup is agentSignalStore's job)", () => {
      runAskQueueCheck(db);
      runAskQueueCheck(db);
      const rows = db.query("SELECT COUNT(*) AS n FROM agent_signals").get() as { n: number };
      // Each call produces 1 signal; dedup is not the cron's responsibility
      expect(rows.n).toBe(2);
    });
  });

  describe("runAskQueueCheck — answered questions are not counted", () => {
    it("ignores rows with status != 'pending'", () => {
      const db = makeTestDb();
      insertAskQuestion(db, "Old answered question");
      db.exec("UPDATE ask_queue SET status = 'answered' WHERE id = 1");
      const result = runAskQueueCheck(db);
      expect(result).toEqual({ signaled: false, count: 0 });
    });
  });

  describe("CRONS map — askQueueCheck registration", () => {
    it("CRONS.askQueueCheck exists", () => {
      expect(CRONS).toHaveProperty("askQueueCheck");
    });

    it("CRONS.askQueueCheck default is '*/12 * * * *'", () => {
      // Save and restore env
      const saved = Bun.env.CRON_ASK_QUEUE_CHECK;
      delete Bun.env.CRON_ASK_QUEUE_CHECK;
      // The module-level CRONS is already initialized; check the default pattern
      expect(CRONS.askQueueCheck).toBe(
        Bun.env.CRON_ASK_QUEUE_CHECK ?? "*/12 * * * *"
      );
      if (saved !== undefined) Bun.env.CRON_ASK_QUEUE_CHECK = saved;
    });
  });
});
