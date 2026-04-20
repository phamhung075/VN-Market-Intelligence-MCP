/**
 * schema-alerts.ts — Sprint 209 schema decomposition
 *
 * Tables:
 *   - alerts              — triggered alert records
 *   - alert_mutes         — per-ticker mute periods
 *   - custom_alert_rules  — user-defined alert rules (Task 219)
 *   - price_alerts        — stop-loss / take-profit thresholds (Task 206)
 *   - broker_sanctions    — SSC broker sanction registry (Task 915)
 */

import type { Database } from "bun:sqlite";

export function initAlertsTables(db: Database): void {
  // ── Alerts ─────────────────────────────────────────────────────────────────
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
      resolved_at           TEXT,
      resolution_notes      TEXT,
      sent_by               TEXT NOT NULL DEFAULT 'server'
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_triggered ON alerts(triggered_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_read      ON alerts(read);
    CREATE INDEX IF NOT EXISTS idx_alerts_severity  ON alerts(severity);
    CREATE INDEX IF NOT EXISTS idx_alerts_notified  ON alerts(notified_telegram, severity);
  `);

  // Idempotent migrations for columns not in original CREATE TABLE (legacy prod DBs)
  for (const [col, ddl] of [
    ["notified_telegram", "INTEGER NOT NULL DEFAULT 0"],
    ["resolved_at",       "TEXT"],
    ["resolution_notes",  "TEXT"],
    ["sent_by",           "TEXT NOT NULL DEFAULT 'server'"],
  ] as const) {
    try {
      db.exec(`ALTER TABLE alerts ADD COLUMN ${col} ${ddl}`);
    } catch {}
  }

  // ── Custom Alert Rules (Task 219) ─────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_alert_rules (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT NOT NULL,
      predicate    TEXT NOT NULL,
      threshold    REAL NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      triggered_at TEXT,
      notes        TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_custom_alert_rules_code ON custom_alert_rules(code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_custom_alert_rules_status ON custom_alert_rules(status)`);

  // ── Alert Mutes (Task 222) ────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_mutes (
      code        TEXT PRIMARY KEY,
      muted_until TEXT NOT NULL,
      reason      TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_alert_mutes_until ON alert_mutes(muted_until)`);

  // ── Price Alerts (Task 206) ────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_alerts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT NOT NULL,
      alert_type   TEXT NOT NULL,
      threshold    REAL NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      triggered_at TEXT,
      notes        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_price_alerts_code   ON price_alerts(code);
    CREATE INDEX IF NOT EXISTS idx_price_alerts_status ON price_alerts(status);
  `);

  // ── Broker Sanctions (Task 915) ────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS broker_sanctions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      broker_name    TEXT NOT NULL,
      sanction_start TEXT NOT NULL,
      sanction_end   TEXT,
      severity       TEXT NOT NULL CHECK (severity IN ('warning','suspension')),
      source         TEXT,
      created_at     TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_broker_sanctions_name ON broker_sanctions(broker_name);
    CREATE INDEX IF NOT EXISTS idx_broker_sanctions_start ON broker_sanctions(sanction_start);
  `);
}
