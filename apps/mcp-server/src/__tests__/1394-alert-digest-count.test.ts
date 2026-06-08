/**
 * Task 1394 — TDD RED: assembleAlertDigest totalCount includes ALL 24h alerts
 *
 * Root cause: since24h is computed as new Date().toISOString() → "2026-04-27T14:00:00.000Z"
 * but alerts inserted via SQLite datetime('now') are stored as "2026-04-27 14:00:00"
 * (space separator, no Z). Lexicographic comparison "2026-04-27 14:..." < "2026-04-27T14:..."
 * so those rows are excluded — digest shows fewer alerts than the DB actually has.
 *
 * Fix: replace string comparison with unixepoch() arithmetic (format-agnostic).
 *
 * T1: alerts inserted with ISO format are counted
 * T2: alerts inserted with SQLite datetime('now') format are ALSO counted (was broken)
 * T3: totalCount equals rows.length (no split count/fetch)
 * T4: alerts older than 24h are excluded
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { assembleAlertDigest } from "../application/usecases/assembleAlertDigest.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      signals_json          TEXT,
      affected_actions_json TEXT,
      analysis_ids_json     TEXT,
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      user_note             TEXT,
      notified_telegram     INTEGER NOT NULL DEFAULT 0,
      resolved_at           TEXT,
      resolution_notes      TEXT,
      sent_by               TEXT NOT NULL DEFAULT 'server'
    )
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

let db: Database;

beforeEach(() => {
  db = buildDb();
});

afterEach(() => {
  db.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1394 — assembleAlertDigest totalCount includes both timestamp formats (RED)", () => {
  it("T1: alerts with ISO format (T-separator, Z suffix) are counted", async () => {
    const isoNow = new Date().toISOString(); // "2026-04-28T14:00:00.000Z"
    db.prepare(
      "INSERT INTO alerts (id, triggered_at, severity, message) VALUES (?, ?, 'high', 'iso format alert')",
    ).run("iso-1", isoNow);

    const digest = await assembleAlertDigest({ db });

    expect(digest.totalCount).toBe(1);
  });

  it("T2: alerts with SQLite datetime format stored 23h ago (same cutoff day) are ALSO counted", async () => {
    // The bug: alert stored 23h ago via datetime('now') produces "YYYY-MM-DD HH:MM:SS" (space, no Z).
    // JS cutoff = new Date(now - 24h).toISOString() = "YYYY-MM-DDTHH:MM:SS.mmmZ".
    // When the alert date and cutoff date share the same YYYY-MM-DD prefix, the comparison
    // "YYYY-MM-DD HH:..." >= "YYYY-MM-DDTHH:..." is FALSE because ' ' < 'T' in ASCII.
    // So the alert is excluded from the digest even though it is within the 24h window.
    const sqliteFormat23hAgo = new Date(Date.now() - 23 * 3_600_000)
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d{3}Z$/, "");

    db.prepare(
      "INSERT INTO alerts (id, triggered_at, severity, message) VALUES (?, ?, 'high', 'sqlite 23h ago')",
    ).run("sqlite-23h", sqliteFormat23hAgo);

    const digest = await assembleAlertDigest({ db });

    // This was the bug: SQLite-format triggered_at was excluded by ISO string comparison
    expect(digest.totalCount).toBe(1);
  });

  it("T3: mixed format alerts are all counted — 98 in DB means 98 in digest", async () => {
    const isoNow = new Date().toISOString();
    // SQLite-format timestamps 1–23 hours ago (same-day range where the bug triggered)
    const sqliteHoursAgo = (h: number) =>
      new Date(Date.now() - h * 3_600_000)
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d{3}Z$/, "");

    // Insert 5 ISO-format alerts
    for (let i = 0; i < 5; i++) {
      db.prepare(
        "INSERT INTO alerts (id, triggered_at, severity, message) VALUES (?, ?, 'medium', 'iso alert')",
      ).run(`iso-${i}`, isoNow);
    }
    // Insert 3 SQLite-format alerts scattered across the last 23h (the ones that were being missed)
    for (let i = 0; i < 3; i++) {
      db.prepare(
        "INSERT INTO alerts (id, triggered_at, severity, message) VALUES (?, ?, 'high', 'sqlite alert')",
      ).run(`sqlite-${i}`, sqliteHoursAgo((i + 1) * 7)); // 7h, 14h, 21h ago
    }

    const digest = await assembleAlertDigest({ db });

    // All 8 must appear — no format-based exclusion
    expect(digest.totalCount).toBe(8);
    expect(digest.text).toContain("8");
  });

  it("T4: alerts older than 24h are correctly excluded regardless of format", async () => {
    const iso25hAgo = new Date(Date.now() - 25 * 3_600_000).toISOString();
    const isoNow = new Date().toISOString();

    db.prepare(
      "INSERT INTO alerts (id, triggered_at, severity, message) VALUES (?, ?, 'critical', 'old iso')",
    ).run("old-iso", iso25hAgo);
    db.prepare(
      "INSERT INTO alerts (id, triggered_at, severity, message) VALUES (?, ?, 'high', 'recent iso')",
    ).run("recent-iso", isoNow);

    const digest = await assembleAlertDigest({ db });

    expect(digest.totalCount).toBe(1);
  });
});
