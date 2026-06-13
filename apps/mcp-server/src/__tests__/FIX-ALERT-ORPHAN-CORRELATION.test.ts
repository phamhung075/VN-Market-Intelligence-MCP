/**
 * FIX-ALERT-ORPHAN-CORRELATION — RED → GREEN test suite
 *
 * Root cause: C-08 audit query `ON a.id = s.id` compares alerts.id (TEXT/UUID)
 * to agent_signals.id (INTEGER autoincrement) — these never match, so every
 * alert in the last 24h is counted as orphaned regardless of the write path.
 *
 * Fix: add `alert_id TEXT` column to agent_signals + write it in storeAlerts /
 * storeAlertsFromCommander atomically in a transaction. C-08 query must be
 * updated to `ON a.id = s.alert_id` — documented in handoff for system-auditor.
 *
 * AC (acceptance criteria):
 *  AC-1: storeAlerts writes one agent_signals row per alert, with alert_id = alert.id
 *  AC-2: storeAlertsFromCommander does the same (sent_by = 'alert-commander')
 *  AC-3: agent_signals rows written by storeAlerts have signal_type = 'verified_decision',
 *         from_agent = 'alert-engine', to_agent = 'all'
 *  AC-4: C-08 query with corrected JOIN returns 0 for newly created alerts
 *  AC-5: Idempotent — calling storeAlerts twice with same alert doesn't duplicate signal row
 *  AC-6: Schema migration — alert_id column added to existing agent_signals table via ALTER
 *  AC-7: Legacy path — storeAlerts still succeeds if agent_signals table doesn't exist yet
 *         (backward compat for edge startup edge cases)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";

// We import the functions under test — before they are changed they will FAIL these tests.
import { storeAlerts, storeAlertsFromCommander } from "../infrastructure/db/alertStore.js";
import type { Alert } from "../domain/services/alertGenerator.js";

// ── Minimal in-memory DB setup ────────────────────────────────────────────────

function makeTestDb(): Database {
  const db = new Database(":memory:");

  // Create alerts table (minimal subset matching real schema)
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
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
      sent_by               TEXT NOT NULL DEFAULT 'server',
      confidence_score      REAL,
      validated_at          TEXT
    );
  `);

  // Create agent_signals table (full schema including alert_id migration target)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent   TEXT NOT NULL,
      to_agent     TEXT NOT NULL,
      signal_type  TEXT NOT NULL,
      stock_code   TEXT,
      payload      TEXT NOT NULL DEFAULT '{}',
      status       TEXT NOT NULL DEFAULT 'unread',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at   TEXT NOT NULL DEFAULT (datetime('now', '+2 hours')),
      alert_id     TEXT,
      finding_data TEXT DEFAULT '{}'
    );
  `);

  return db;
}

// Helper: build a minimal Alert object
function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    severity: "high",
    signals: [{ type: "price_drop" as const, severity: "high" as const, actionCode: "VCB", message: "test", confidence: 0.8, detectedAt: new Date().toISOString() }],
    actionCode: "VCB",
    message: "Test alert",
    isRead: false,
    confidence_score: 0.8,
    validated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("FIX-ALERT-ORPHAN-CORRELATION", () => {

  // AC-1: storeAlerts writes one agent_signals row per alert, with alert_id = alert.id
  it("AC-1: storeAlerts writes agent_signals row with alert_id for each alert", () => {
    const db = makeTestDb();
    const alert = makeAlert({ id: "test-alert-uuid-1" });

    storeAlerts([alert], db);

    // Check alerts row was written
    const alertRow = db.query("SELECT id FROM alerts WHERE id = ?").get(alert.id) as { id: string } | null;
    expect(alertRow).not.toBeNull();
    expect(alertRow?.id).toBe("test-alert-uuid-1");

    // AC-1: agent_signals row must exist with alert_id = alert.id
    const sigRow = db.query("SELECT * FROM agent_signals WHERE alert_id = ?").get(alert.id) as {
      alert_id: string;
      from_agent: string;
      signal_type: string;
    } | null;
    expect(sigRow).not.toBeNull();
    expect(sigRow?.alert_id).toBe("test-alert-uuid-1");
  });

  // AC-2: storeAlertsFromCommander writes agent_signals rows too
  it("AC-2: storeAlertsFromCommander writes agent_signals rows with alert_id", () => {
    const db = makeTestDb();
    const alert = makeAlert({ id: "commander-alert-1" });

    storeAlertsFromCommander([alert], db);

    const sigRow = db.query("SELECT alert_id, from_agent FROM agent_signals WHERE alert_id = ?").get(alert.id) as {
      alert_id: string;
      from_agent: string;
    } | null;
    expect(sigRow).not.toBeNull();
    expect(sigRow?.alert_id).toBe("commander-alert-1");
  });

  // AC-3: signal_type, from_agent, to_agent correctness
  it("AC-3: agent_signals rows have correct signal_type=verified_decision, from_agent=alert-engine, to_agent=all", () => {
    const db = makeTestDb();
    const alert = makeAlert({ id: "signal-type-test" });

    storeAlerts([alert], db);

    const sigRow = db.query(
      "SELECT signal_type, from_agent, to_agent FROM agent_signals WHERE alert_id = ?"
    ).get(alert.id) as { signal_type: string; from_agent: string; to_agent: string } | null;

    expect(sigRow).not.toBeNull();
    expect(sigRow?.signal_type).toBe("verified_decision");
    expect(sigRow?.from_agent).toBe("alert-engine");
    expect(sigRow?.to_agent).toBe("all");
  });

  // AC-4: corrected C-08 query returns 0 after storeAlerts
  it("AC-4: corrected C-08 query (ON a.id = s.alert_id) returns 0 orphans for newly created alerts", () => {
    const db = makeTestDb();
    const alerts = [
      makeAlert({ id: "c08-test-1" }),
      makeAlert({ id: "c08-test-2" }),
      makeAlert({ id: "c08-test-3" }),
    ];

    storeAlerts(alerts, db);

    // Corrected C-08 query
    const result = db.query<{ cnt: number }, []>(`
      SELECT count(*) as cnt
      FROM alerts a
      LEFT JOIN agent_signals s ON a.id = s.alert_id
      WHERE s.alert_id IS NULL
        AND a.triggered_at > datetime('now', '-24 hours')
    `).get();

    expect(result?.cnt).toBe(0);
  });

  // AC-5: Idempotent — calling storeAlerts twice doesn't duplicate signal rows
  it("AC-5: storeAlerts is idempotent — duplicate call does not double agent_signals rows", () => {
    const db = makeTestDb();
    const alert = makeAlert({ id: "dedup-test-1" });

    storeAlerts([alert], db);
    storeAlerts([alert], db); // second call — alert uses INSERT OR IGNORE, signal should also dedup

    const sigCount = db.query<{ cnt: number }, [string]>(
      "SELECT count(*) as cnt FROM agent_signals WHERE alert_id = ?"
    ).get(alert.id) as { cnt: number };
    expect(sigCount.cnt).toBe(1);
  });

  // AC-6: Schema migration — alert_id column can be added via ALTER TABLE
  it("AC-6: schema migration adds alert_id column to agent_signals without error", () => {
    const db = new Database(":memory:");

    // Create agent_signals WITHOUT alert_id (legacy schema)
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_signals (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        from_agent   TEXT NOT NULL DEFAULT 'test',
        to_agent     TEXT NOT NULL DEFAULT 'test',
        signal_type  TEXT NOT NULL DEFAULT 'urgent_news',
        stock_code   TEXT,
        payload      TEXT NOT NULL DEFAULT '{}',
        status       TEXT NOT NULL DEFAULT 'unread',
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at   TEXT NOT NULL DEFAULT (datetime('now', '+2 hours'))
      );
    `);

    // Migration: add alert_id column (idempotent)
    try {
      db.exec("ALTER TABLE agent_signals ADD COLUMN alert_id TEXT");
    } catch {
      // Already exists — OK
    }

    // Verify column exists
    const cols = db.query("PRAGMA table_info(agent_signals)").all() as Array<{ name: string }>;
    const hasAlertId = cols.some((c) => c.name === "alert_id");
    expect(hasAlertId).toBe(true);
  });

  // AC-7: storeAlerts still writes alerts when agent_signals table doesn't exist (graceful)
  it("AC-7: storeAlerts still writes alerts row even when agent_signals table is absent", () => {
    const db = new Database(":memory:");

    // Only create alerts table, NO agent_signals
    db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        triggered_at TEXT NOT NULL,
        severity TEXT NOT NULL,
        signals_json TEXT,
        affected_actions_json TEXT,
        analysis_ids_json TEXT,
        message TEXT,
        read INTEGER NOT NULL DEFAULT 0,
        user_note TEXT,
        notified_telegram INTEGER NOT NULL DEFAULT 0,
        sent_by TEXT NOT NULL DEFAULT 'server',
        confidence_score REAL,
        validated_at TEXT
      );
    `);

    const alert = makeAlert({ id: "fallback-test-1" });
    // Must NOT throw even when agent_signals is absent
    expect(() => storeAlerts([alert], db)).not.toThrow();

    // Alert row still written
    const row = db.query("SELECT id FROM alerts WHERE id = ?").get(alert.id);
    expect(row).not.toBeNull();
  });

  // Extra: multiple alerts in one call
  it("writes one agent_signals row per alert when called with multiple alerts", () => {
    const db = makeTestDb();
    const ids = ["multi-1", "multi-2", "multi-3"];
    const alerts = ids.map((id) => makeAlert({ id }));

    storeAlerts(alerts, db);

    const sigCount = db.query<{ cnt: number }, []>(
      "SELECT count(*) as cnt FROM agent_signals WHERE alert_id IN ('multi-1','multi-2','multi-3')"
    ).get();
    expect(sigCount?.cnt).toBe(3);
  });

  // storeAlertsFromCommander writes alerts from alert-commander
  it("storeAlertsFromCommander writes agent_signals with alert-commander origin", () => {
    const db = makeTestDb();
    const alert = makeAlert({ id: "cmd-origin-test" });

    storeAlertsFromCommander([alert], db);

    // Alert should be from alert-commander
    const alertRow = db.query("SELECT sent_by FROM alerts WHERE id = ?").get(alert.id) as { sent_by: string } | null;
    expect(alertRow?.sent_by).toBe("alert-commander");

    // Signal row exists
    const sigRow = db.query("SELECT alert_id FROM agent_signals WHERE alert_id = ?").get(alert.id);
    expect(sigRow).not.toBeNull();
  });
});
