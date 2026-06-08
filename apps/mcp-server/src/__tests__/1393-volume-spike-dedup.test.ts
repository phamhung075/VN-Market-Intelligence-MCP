/**
 * Task 1393 — volume_spike dedup: push-prices handler must not re-send
 * an already-notified alert on every subsequent VPS price push.
 *
 * Root cause: server.ts push-prices inline alert path calls sendTelegramWork
 * for every generated alert regardless of whether the alert row was already
 * in the DB (INSERT OR IGNORE silences the duplicate) and regardless of
 * notified_telegram state. VPS pushes every ~65 s → 21 identical sends in 23 min.
 *
 * Fix contract (shouldSkipAlreadyNotifiedAlert):
 *   Given an alert ID that is already stored with notified_telegram=1,
 *   the helper returns true → the send is skipped.
 *
 *   Given an alert ID that is freshly inserted (notified_telegram=0),
 *   the helper returns false → the send proceeds.
 *
 *   Given an alert ID not present in the DB at all,
 *   the helper returns false → the send proceeds (new alert, not yet stored).
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { shouldSkipAlreadyNotifiedAlert } from "../infrastructure/db/alertStore.js";

// ─── Minimal in-memory DB fixture ───────────────────────────────────────────

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      signals_json TEXT,
      affected_actions_json TEXT,
      analysis_ids_json TEXT,
      message TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      user_note TEXT,
      sent_by TEXT,
      confidence_score REAL,
      validated_at TEXT,
      notified_telegram INTEGER NOT NULL DEFAULT 0
    )
  `);
  return db;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Task 1393 — shouldSkipAlreadyNotifiedAlert", () => {
  let db: Database;

  beforeEach(() => {
    db = buildDb();
  });

  it("returns false when alert ID not found in DB (new alert — send it)", () => {
    const result = shouldSkipAlreadyNotifiedAlert("alert-VRE-volume_spike-2026-04-2804", db);
    expect(result).toBe(false);
  });

  it("returns false when alert exists with notified_telegram=0 (first attempt — send it)", () => {
    db.exec(`
      INSERT INTO alerts (id, triggered_at, severity, message, notified_telegram)
      VALUES ('alert-VRE-volume_spike-2026-04-2804', '2026-04-28T04:00:00.000Z', 'high', 'VRE spike', 0)
    `);
    const result = shouldSkipAlreadyNotifiedAlert("alert-VRE-volume_spike-2026-04-2804", db);
    expect(result).toBe(false);
  });

  it("returns true when alert exists with notified_telegram=1 (already sent — skip re-send)", () => {
    db.exec(`
      INSERT INTO alerts (id, triggered_at, severity, message, notified_telegram)
      VALUES ('alert-VRE-volume_spike-2026-04-2804', '2026-04-28T04:00:00.000Z', 'high', 'VRE spike', 1)
    `);
    const result = shouldSkipAlreadyNotifiedAlert("alert-VRE-volume_spike-2026-04-2804", db);
    expect(result).toBe(true);
  });

  it("returns true for a second push with same deterministic ID after first send succeeded", () => {
    // Simulate first push: alert inserted + marked notified
    db.exec(`
      INSERT INTO alerts (id, triggered_at, severity, message, notified_telegram)
      VALUES ('alert-VRE-volume_spike-2026-04-2804', '2026-04-28T04:01:00.000Z', 'high', 'VRE spike 3.2x', 1)
    `);
    // Second push 65s later — same ID, INSERT OR IGNORE already skipped
    // The in-memory generated alert still has same ID → helper must suppress
    expect(shouldSkipAlreadyNotifiedAlert("alert-VRE-volume_spike-2026-04-2804", db)).toBe(true);
  });

  it("returns false for a different ticker — does not cross-contaminate", () => {
    db.exec(`
      INSERT INTO alerts (id, triggered_at, severity, message, notified_telegram)
      VALUES ('alert-HPG-volume_spike-2026-04-2804', '2026-04-28T04:00:00.000Z', 'high', 'HPG spike', 1)
    `);
    // VRE alert was never inserted → should send
    expect(shouldSkipAlreadyNotifiedAlert("alert-VRE-volume_spike-2026-04-2804", db)).toBe(false);
  });
});
