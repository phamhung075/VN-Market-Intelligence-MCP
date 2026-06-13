/**
 * Alert Store — Task 064 + Task 153
 *
 * Infrastructure adapter that persists Alert records to the SQLite `alerts`
 * table.  This function lives in infrastructure (not domain) so that the
 * domain layer remains pure and free of any I/O.
 *
 * Also provides `isDocAlreadyProcessed` (task 153) for SSC scan deduplication:
 * a fast index lookup against `financial_reports.ssc_doc_id` that prevents
 * re-processing the same SSC document on every 15-minute cycle.
 *
 * Usage:
 *   import { storeAlerts, isDocAlreadyProcessed } from "../infrastructure/db/alertStore.js";
 *   import { getDb } from "../infrastructure/db/schema.js";
 *
 *   const alerts = generateAlerts(signals, watchlist);
 *   storeAlerts(alerts, getDb());
 *
 *   if (isDocAlreadyProcessed(docId, getDb())) { ... }
 */

import type { Database } from "bun:sqlite";
import type { Alert } from "../../domain/services/alertGenerator.js";
import { getDb } from "./schema.js";

/**
 * Check whether a document identified by `ssc_doc_id` has already been
 * processed and stored in the `financial_reports` table.
 *
 * Uses a partial index on `ssc_doc_id` for O(log n) performance.
 * After the first full scan, 51 lookups complete in < 1 ms in total.
 *
 * @param docId - The unique SSC document identifier (typically the PDF URL).
 * @param db    - Active bun:sqlite Database connection (injected by caller).
 * @returns `true` when the document is already in `financial_reports`.
 */
export function isDocAlreadyProcessed(docId: string, db: Database): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM financial_reports WHERE ssc_doc_id = ? LIMIT 1`,
    )
    .get(docId);
  return row !== null && row !== undefined;
}

// ── alert_id column probe (cached per DB connection) ─────────────────────────
// FIX-ALERT-ORPHAN-CORRELATION: check whether agent_signals has the alert_id
// column. Uses try/catch on a LIMIT-0 probe so legacy DBs (pre-migration) are
// handled gracefully — the alert row is still written; only the signal row is
// skipped when the column is absent.
function hasAgentSignalsAlertIdColumn(db: Database): boolean {
  try {
    db.prepare("SELECT alert_id FROM agent_signals LIMIT 0").all();
    return true;
  } catch {
    return false;
  }
}

// ── hasAgentSignalsTable ────────────────────────────────────────────────────
// AC-7: gracefully skip signal write if agent_signals table doesn't exist yet.
function hasAgentSignalsTable(db: Database): boolean {
  try {
    db.prepare("SELECT 1 FROM agent_signals LIMIT 0").all();
    return true;
  } catch {
    return false;
  }
}

/**
 * Persist alert records to the SQLite `alerts` table.
 *
 * Uses INSERT OR IGNORE so calling this multiple times with the same Alert
 * objects is idempotent — duplicate IDs are silently skipped.
 *
 * Sets `sent_by = 'server'` to indicate the alert originated from the server
 * scheduler (Step E rule-based alerts).
 *
 * FIX-ALERT-ORPHAN-CORRELATION: also writes one `agent_signals` row per alert
 * (signal_type='verified_decision', from_agent='alert-engine', to_agent='all',
 * alert_id=alert.id) inside the same transaction. This fixes the C-08 audit
 * check whose JOIN `ON a.id = s.id` was comparing TEXT to INTEGER (always NULL).
 * The corrected C-08 query uses `ON a.id = s.alert_id` instead.
 *
 * @param alerts - Array of Alert objects returned by `generateAlerts`
 * @param db     - Active bun:sqlite Database connection (injected by caller)
 */
export function storeAlerts(alerts: Alert[], db: Database): void {
  if (alerts.length === 0) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO alerts
      (id, triggered_at, severity, signals_json, affected_actions_json,
       analysis_ids_json, message, read, user_note, sent_by, confidence_score, validated_at)
    VALUES
      (?, ?, ?, ?, ?, NULL, ?, 0, NULL, 'server', ?, ?)
  `);

  // FIX-ALERT-ORPHAN-CORRELATION: co-write agent_signals row for C-08 correlation.
  // Guarded: skip gracefully when alert_id column or agent_signals table is absent.
  const writeSignal = hasAgentSignalsTable(db) && hasAgentSignalsAlertIdColumn(db);
  const insertSignal = writeSignal
    ? db.prepare(`
        INSERT OR IGNORE INTO agent_signals
          (from_agent, to_agent, signal_type, stock_code, payload, status,
           created_at, expires_at, alert_id)
        VALUES
          ('alert-engine', 'all', 'verified_decision', ?, '{}', 'unread',
           ?, datetime(?, '+2 hours'), ?)
      `)
    : null;

  // Dedup guard: skip signal write if a row with this alert_id already exists.
  const checkSignal = writeSignal
    ? db.prepare("SELECT 1 FROM agent_signals WHERE alert_id = ? LIMIT 1")
    : null;

  const insertMany = db.transaction((rows: Alert[]) => {
    for (const alert of rows) {
      insert.run(
        alert.id,
        alert.createdAt,
        alert.severity,
        JSON.stringify(alert.signals),
        JSON.stringify([{ code: alert.actionCode }]),
        alert.message,
        alert.confidence_score ?? null,
        alert.validated_at ?? null,
      );
      // Co-write agent_signals correlation row (fail-loud if insert throws)
      if (insertSignal && checkSignal) {
        const existing = checkSignal.get(alert.id);
        if (!existing) {
          const stockCode = alert.actionCode === "MACRO" ? null : (alert.actionCode || null);
          insertSignal.run(
            stockCode,
            alert.createdAt,
            alert.createdAt,
            alert.id,
          );
        }
      }
    }
  });

  insertMany(alerts);
}

/**
 * Persist alert records originated from the Alert Commander Cowork agent.
 *
 * Identical to `storeAlerts` but sets `sent_by = 'alert-commander'`, which
 * allows the `get_alerts` tool and scheduler to distinguish reasoning-based
 * alerts (Commander) from rule-based alerts (server Step E).
 *
 * Uses INSERT OR IGNORE so the function is idempotent.
 *
 * FIX-ALERT-ORPHAN-CORRELATION: same co-write logic as storeAlerts — writes
 * one agent_signals row per alert with alert_id = alert.id.
 *
 * @param alerts - Array of Alert objects produced by the Alert Commander
 * @param db     - Active bun:sqlite Database connection (injected by caller)
 */
export function storeAlertsFromCommander(alerts: Alert[], db: Database): void {
  if (alerts.length === 0) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO alerts
      (id, triggered_at, severity, signals_json, affected_actions_json,
       analysis_ids_json, message, read, user_note, sent_by, confidence_score, validated_at)
    VALUES
      (?, ?, ?, ?, ?, NULL, ?, 0, NULL, 'alert-commander', ?, ?)
  `);

  // FIX-ALERT-ORPHAN-CORRELATION: co-write agent_signals row for C-08 correlation.
  const writeSignal = hasAgentSignalsTable(db) && hasAgentSignalsAlertIdColumn(db);
  const insertSignal = writeSignal
    ? db.prepare(`
        INSERT OR IGNORE INTO agent_signals
          (from_agent, to_agent, signal_type, stock_code, payload, status,
           created_at, expires_at, alert_id)
        VALUES
          ('alert-engine', 'all', 'verified_decision', ?, '{}', 'unread',
           ?, datetime(?, '+2 hours'), ?)
      `)
    : null;

  // Dedup guard: skip signal write if a row with this alert_id already exists.
  const checkSignal = writeSignal
    ? db.prepare("SELECT 1 FROM agent_signals WHERE alert_id = ? LIMIT 1")
    : null;

  const insertMany = db.transaction((rows: Alert[]) => {
    for (const alert of rows) {
      insert.run(
        alert.id,
        alert.createdAt,
        alert.severity,
        JSON.stringify(alert.signals),
        JSON.stringify([{ code: alert.actionCode }]),
        alert.message,
        alert.confidence_score ?? null,
        alert.validated_at ?? null,
      );
      if (insertSignal && checkSignal) {
        const existing = checkSignal.get(alert.id);
        if (!existing) {
          const stockCode = alert.actionCode === "MACRO" ? null : (alert.actionCode || null);
          insertSignal.run(
            stockCode,
            alert.createdAt,
            alert.createdAt,
            alert.id,
          );
        }
      }
    }
  });

  insertMany(alerts);
}

/**
 * Row shape returned from the `alerts` table for unnotified queries.
 * We map it back to a minimal Alert-compatible object.
 */
interface AlertRow {
  id: string;
  triggered_at: string;
  severity: string;
  signals_json: string | null;
  affected_actions_json: string | null;
  analysis_ids_json: string | null;
  message: string | null;
  read: number;
  user_note: string | null;
  notified_telegram: number;
}

/**
 * Read all HIGH/CRITICAL alerts that have not yet been sent to Telegram,
 * constrained to the given rolling time window.
 *
 * The window prevents re-sending old alerts on server restart: only alerts
 * created within the last `windowMinutes` minutes are considered.
 *
 * The 16-minute default matches the 15-minute intelligence cycle with 1-minute
 * overlap to absorb clock drift.
 *
 * @param windowMinutes - Look-back window in minutes (e.g. 16 for 16 min)
 * @param db            - SQLite Database connection (defaults to singleton `getDb()`)
 * @returns Alert array sorted oldest-first (triggered_at ASC)
 */
export function readUnnotifiedAlerts(
  windowMinutes: number,
  db: Database = getDb(),
): Alert[] {
  // Use unixepoch arithmetic so the comparison works regardless of whether
  // triggered_at is stored as ISO 8601 (e.g. "2026-03-30T14:00:00.000Z")
  // or as SQLite datetime string (e.g. "2026-03-30 14:00:00").
  const windowSeconds = Math.round(windowMinutes * 60);
  const rows = db
    .prepare(
      `SELECT * FROM alerts
       WHERE severity IN ('high', 'critical', 'medium')
         AND notified_telegram = 0
         AND unixepoch(triggered_at) >= unixepoch('now') - ?
       ORDER BY triggered_at ASC`,
    )
    .all(windowSeconds) as AlertRow[];

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.triggered_at,
    severity: row.severity as Alert["severity"],
    signals: row.signals_json ? (JSON.parse(row.signals_json) as Alert["signals"]) : [],
    actionCode:
      row.affected_actions_json
        ? (JSON.parse(row.affected_actions_json) as Array<{ code: string }>)[0]?.code ?? ""
        : "",
    message: row.message ?? "",
    isRead: row.read === 1,
  }));
}

/**
 * Mark a single alert as successfully sent to Telegram.
 *
 * Sets `notified_telegram = 1` for the given alert ID. This prevents the next
 * cycle from re-sending the same alert. Call this only after a confirmed
 * successful Telegram send (i.e. `notifyTelegramAlert` returned `true`).
 *
 * @param alertId - The `id` field of the alert to mark
 * @param db      - SQLite Database connection (defaults to singleton `getDb()`)
 */
export function markAlertNotified(alertId: string, db: Database = getDb()): void {
  db.prepare("UPDATE alerts SET notified_telegram = 1 WHERE id = ?").run(alertId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 1847d-A — Outcome scoring store methods
// ─────────────────────────────────────────────────────────────────────────────

/** Valid outcome values for alert scoring */
export type AlertOutcome = "HIT" | "MISS" | "UNKNOWN";

/** Minimal shape for outcome-pending alerts */
export interface PendingOutcomeAlert {
  id: string;
  triggered_at: string;
  severity: string;
  signals_json: string | null;
  affected_actions_json: string | null;
  alert_type: string | null;
}

/**
 * Read alerts that have no outcome scored yet (outcome IS NULL).
 * Used by the outcome-scoring job and by `get_alert_accuracy` fallback path.
 *
 * @param windowDays - Only look back this many days (default: 30)
 * @param db         - SQLite Database connection (defaults to singleton)
 * @returns Array of alerts without outcomes, oldest-first
 */
export function readPendingOutcomeAlerts(
  windowDays = 30,
  db: Database = getDb(),
): PendingOutcomeAlert[] {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  return db
    .prepare<PendingOutcomeAlert, [string]>(
      `SELECT id, triggered_at, severity, signals_json, affected_actions_json,
              NULL as alert_type
       FROM alerts
       WHERE outcome IS NULL
         AND triggered_at >= ?
       ORDER BY triggered_at ASC`,
    )
    .all(since);
}

/**
 * Write an outcome to a single alert row.
 *
 * Idempotent via UPDATE — calling twice with the same values is safe.
 * Returns false (already-scored) when outcome column is already non-null
 * with a DIFFERENT value, but still writes — caller decides policy.
 *
 * @param alertId - The alert `id` to update
 * @param outcome - 'HIT' | 'MISS' | 'UNKNOWN'
 * @param detail  - Optional free-text explanation
 * @param db      - SQLite Database connection (defaults to singleton)
 * @returns `{ found: true, alreadyScored: boolean }` or `{ found: false }`
 */
export function writeAlertOutcome(
  alertId: string,
  outcome: AlertOutcome,
  detail?: string,
  db: Database = getDb(),
): { found: boolean; alreadyScored: boolean } {
  const existing = db
    .prepare<{ outcome: string | null }, [string]>(
      "SELECT outcome FROM alerts WHERE id = ? LIMIT 1",
    )
    .get(alertId);

  if (!existing) return { found: false, alreadyScored: false };

  const alreadyScored = existing.outcome !== null;

  db.prepare(
    `UPDATE alerts
     SET outcome        = ?,
         outcome_at     = datetime('now'),
         outcome_detail = ?
     WHERE id = ?`,
  ).run(outcome, detail ?? null, alertId);

  return { found: true, alreadyScored };
}

/**
 * Returns true when the alert with `alertId` already exists in the DB AND has
 * `notified_telegram = 1`. Use this in push-prices and similar inline send
 * paths to guard against re-sending on every VPS push (~65 s cadence).
 *
 * Background: `storeAlerts` uses INSERT OR IGNORE so duplicate rows are
 * silently skipped at the DB layer, but the in-memory Alert object is still
 * returned by `generateAlerts` and would be re-sent on every push without
 * this guard. Task 1393.
 *
 * @param alertId - The deterministic ID from `alertGenerator.chooseAlertId`
 * @param db      - SQLite Database connection (defaults to singleton `getDb()`)
 * @returns `true` → skip send; `false` → proceed with send
 */
export function shouldSkipAlreadyNotifiedAlert(
  alertId: string,
  db: Database = getDb(),
): boolean {
  const row = db
    .prepare<{ notified_telegram: number }, [string]>(
      "SELECT notified_telegram FROM alerts WHERE id = ? LIMIT 1",
    )
    .get(alertId);
  return row !== null && row !== undefined && row.notified_telegram === 1;
}
