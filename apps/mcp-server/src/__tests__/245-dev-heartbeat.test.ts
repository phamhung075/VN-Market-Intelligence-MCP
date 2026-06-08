/**
 * Task 245 — Dev Team Weekly Heartbeat Job
 *
 * Tests for runDevTeamHeartbeat():
 *   1. HOẠT ĐỘNG when all reports processed
 *   2. HOẠT ĐỘNG when no reports at all (total == 0)
 *   3. CẢNH BÁO when any unprocessed report > 24h old
 *   4. NGỪNG when any unprocessed report > 72h old
 *   5. Correct fix count from system_changelog last 7 days
 *   6. Handles empty tables without error
 *   7. Message includes processed/total counts
 *   8. Message includes "Dev Team" header text
 *   9. Zero fix count when changelog is empty
 *  10. Only counts changelog entries within last 7 days
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Test DB setup helpers
// ─────────────────────────────────────────────────────────────────────────────

function setupDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");

  // telegram_reports table (mirrors telegramReportStore DDL)
  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_reports (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id  INTEGER NOT NULL DEFAULT 0,
      text        TEXT    NOT NULL,
      from_agent  TEXT    NOT NULL DEFAULT 'unknown',
      priority    TEXT    NOT NULL DEFAULT 'normal',
      status      TEXT    NOT NULL DEFAULT 'new',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      claimed_by  TEXT,
      claimed_at  TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_telegram_reports_status  ON telegram_reports(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_telegram_reports_created ON telegram_reports(created_at)`);

  // system_changelog table (mirrors changelogStore DDL)
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_changelog (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      fix_type            TEXT    NOT NULL DEFAULT 'bugfix',
      title               TEXT    NOT NULL,
      detail              TEXT    NOT NULL DEFAULT '',
      files               TEXT    NOT NULL DEFAULT '[]',
      commit_hash         TEXT,
      fixed_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      related_feedback_id INTEGER
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_changelog_fixed_at ON system_changelog(fixed_at)`);

  return db;
}

/** Unix timestamp N hours ago */
function hoursAgo(h: number): number {
  return Math.floor(Date.now() / 1000) - h * 3600;
}

/** ISO datetime N days ago (for changelog fixed_at) */
function daysAgoIso(d: number): string {
  const dt = new Date(Date.now() - d * 24 * 3600 * 1000);
  return dt.toISOString().replace("T", " ").slice(0, 19);
}

function insertReport(
  db: Database,
  status: "new" | "processed",
  createdAtUnix: number,
): void {
  db.prepare(
    `INSERT INTO telegram_reports (text, status, created_at) VALUES (?, ?, ?)`,
  ).run("test report", status, createdAtUnix);
}

function insertChangelog(db: Database, fixedAt: string): void {
  db.prepare(
    `INSERT INTO system_changelog (title, fixed_at) VALUES (?, ?)`,
  ).run("Fix something", fixedAt);
}

// ─────────────────────────────────────────────────────────────────────────────
// Import the module under test
// ─────────────────────────────────────────────────────────────────────────────

async function importHeartbeat() {
  const mod = await import("../scheduler/system/devTeamHeartbeatJob.js");
  return mod;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 245 — Dev Team Weekly Heartbeat", () => {
  let db: Database;

  beforeEach(() => {
    db = setupDb();
  });

  // 1. HOẠT ĐỘNG when all reports processed
  it("returns HOẠT ĐỘNG when all reports are processed", async () => {
    insertReport(db, "processed", hoursAgo(2));
    insertReport(db, "processed", hoursAgo(5));

    const { runDevTeamHeartbeat } = await importHeartbeat();
    let sentText = "";
    const fakeSend = async (text: string) => {
      sentText = text;
      return true;
    };

    await runDevTeamHeartbeat(db, fakeSend);
    expect(sentText).toContain("HOẠT ĐỘNG");
  });

  // 2. HOẠT ĐỘNG when no reports at all
  it("returns HOẠT ĐỘNG when there are no reports at all", async () => {
    const { runDevTeamHeartbeat } = await importHeartbeat();
    let sentText = "";
    const fakeSend = async (text: string) => {
      sentText = text;
      return true;
    };

    await runDevTeamHeartbeat(db, fakeSend);
    expect(sentText).toContain("HOẠT ĐỘNG");
  });

  // 3. CẢNH BÁO when unprocessed report > 24h old
  it("returns CẢNH BÁO when a new report is 30h old", async () => {
    insertReport(db, "new", hoursAgo(30));

    const { runDevTeamHeartbeat } = await importHeartbeat();
    let sentText = "";
    const fakeSend = async (text: string) => {
      sentText = text;
      return true;
    };

    await runDevTeamHeartbeat(db, fakeSend);
    expect(sentText).toContain("CẢNH BÁO");
  });

  // 4. NGỪNG when unprocessed report > 72h old
  it("returns NGỪNG when a new report is 80h old", async () => {
    insertReport(db, "new", hoursAgo(80));

    const { runDevTeamHeartbeat } = await importHeartbeat();
    let sentText = "";
    const fakeSend = async (text: string) => {
      sentText = text;
      return true;
    };

    await runDevTeamHeartbeat(db, fakeSend);
    expect(sentText).toContain("NGỪNG");
  });

  // 5. Correct fix count from changelog
  it("counts fixes from system_changelog in last 7 days", async () => {
    insertChangelog(db, daysAgoIso(1));
    insertChangelog(db, daysAgoIso(3));
    insertChangelog(db, daysAgoIso(6));

    const { runDevTeamHeartbeat } = await importHeartbeat();
    let sentText = "";
    const fakeSend = async (text: string) => {
      sentText = text;
      return true;
    };

    await runDevTeamHeartbeat(db, fakeSend);
    expect(sentText).toContain("3");
  });

  // 6. Handles empty tables without error
  it("does not throw when both tables are empty", async () => {
    const { runDevTeamHeartbeat } = await importHeartbeat();
    const fakeSend = async (_text: string) => true;

    let threw = false;
    try {
      await runDevTeamHeartbeat(db, fakeSend);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  // 7. Message includes processed/total counts
  it("includes processed/total fraction in message", async () => {
    insertReport(db, "processed", hoursAgo(10));
    insertReport(db, "new", hoursAgo(5));

    const { runDevTeamHeartbeat } = await importHeartbeat();
    let sentText = "";
    const fakeSend = async (text: string) => {
      sentText = text;
      return true;
    };

    await runDevTeamHeartbeat(db, fakeSend);
    // 1 processed out of 2 total
    expect(sentText).toContain("1/2");
  });

  // 8. Message includes "Dev Team" header text
  it("message contains Dev Team label", async () => {
    const { runDevTeamHeartbeat } = await importHeartbeat();
    let sentText = "";
    const fakeSend = async (text: string) => {
      sentText = text;
      return true;
    };

    await runDevTeamHeartbeat(db, fakeSend);
    expect(sentText).toContain("Dev Team");
  });

  // 9. Zero fix count when changelog is empty
  it("reports 0 fixes when changelog is empty", async () => {
    const { runDevTeamHeartbeat } = await importHeartbeat();
    let sentText = "";
    const fakeSend = async (text: string) => {
      sentText = text;
      return true;
    };

    await runDevTeamHeartbeat(db, fakeSend);
    // The fix line should mention 0
    expect(sentText).toMatch(/Fix.*0/);
  });

  // 10. Only counts changelog entries within last 7 days
  it("excludes changelog entries older than 7 days", async () => {
    insertChangelog(db, daysAgoIso(8));   // too old — excluded
    insertChangelog(db, daysAgoIso(6));   // included
    insertChangelog(db, daysAgoIso(1));   // included

    const { runDevTeamHeartbeat } = await importHeartbeat();
    let sentText = "";
    const fakeSend = async (text: string) => {
      sentText = text;
      return true;
    };

    await runDevTeamHeartbeat(db, fakeSend);
    // Should count 2 (not 3)
    expect(sentText).toMatch(/Fix.*2/);
  });
});
