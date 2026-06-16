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
    ["confidence_score",  "REAL"],
    ["validated_at",      "TEXT"],
    // Task 1847d-A: outcome scoring columns
    ["outcome",           "TEXT"],
    ["outcome_at",        "TEXT"],
    ["outcome_detail",    "TEXT"],
    // FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS: composite dedup key for scan jobs.
    // UNIQUE enforced at DB level — INSERT OR IGNORE on duplicate fingerprint is
    // a silent no-op, making the gate structurally unbypassable across parallel jobs.
    ["fingerprint",       "TEXT UNIQUE"],
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
  // Task 1920d: UNIQUE(broker_name, sanction_start) added to support INSERT OR IGNORE
  // deduplication in the quarterly sweep job (brokerSanctionsJob.ts). The constraint
  // is idempotent on fresh DBs (part of CREATE TABLE). Existing production DBs without
  // the constraint are handled by the migration block below.
  db.exec(`
    CREATE TABLE IF NOT EXISTS broker_sanctions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      broker_name    TEXT NOT NULL,
      sanction_start TEXT NOT NULL,
      sanction_end   TEXT,
      severity       TEXT NOT NULL CHECK (severity IN ('warning','suspension')),
      source         TEXT,
      created_at     TEXT NOT NULL,
      UNIQUE(broker_name, sanction_start)
    );

    CREATE INDEX IF NOT EXISTS idx_broker_sanctions_name ON broker_sanctions(broker_name);
    CREATE INDEX IF NOT EXISTS idx_broker_sanctions_start ON broker_sanctions(sanction_start);
  `);

  // Task 1920d — idempotent migration for existing production DBs created before the
  // UNIQUE constraint was added. SQLite does not support ALTER TABLE ADD CONSTRAINT,
  // so we use the recreate-and-rename pattern only when the constraint is absent.
  // Detection: if sqlite_master has no unique index for (broker_name, sanction_start),
  // recreate the table with the constraint and copy existing data.
  {
    const hasUnique = db
      .prepare(
        `SELECT COUNT(*) as n FROM sqlite_master
         WHERE type='table'
           AND name='broker_sanctions'
           AND sql LIKE '%UNIQUE(broker_name, sanction_start)%'`,
      )
      .get() as { n: number };

    if (hasUnique.n === 0) {
      // Only runs on legacy DBs where the table exists without the constraint.
      // The inner CREATE TABLE IF NOT EXISTS is a no-op — the real work is the
      // ALTER-by-rename sequence below when the constraint is absent.
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS broker_sanctions_new (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            broker_name    TEXT NOT NULL,
            sanction_start TEXT NOT NULL,
            sanction_end   TEXT,
            severity       TEXT NOT NULL CHECK (severity IN ('warning','suspension')),
            source         TEXT,
            created_at     TEXT NOT NULL,
            UNIQUE(broker_name, sanction_start)
          );
          INSERT OR IGNORE INTO broker_sanctions_new
            (id, broker_name, sanction_start, sanction_end, severity, source, created_at)
          SELECT id, broker_name, sanction_start, sanction_end, severity, source, created_at
          FROM broker_sanctions;
          DROP TABLE broker_sanctions;
          ALTER TABLE broker_sanctions_new RENAME TO broker_sanctions;
          CREATE INDEX IF NOT EXISTS idx_broker_sanctions_name ON broker_sanctions(broker_name);
          CREATE INDEX IF NOT EXISTS idx_broker_sanctions_start ON broker_sanctions(sanction_start);
        `);
      } catch {
        // Migration already ran or table genuinely missing — safe to ignore.
      }
    }
  }
}
