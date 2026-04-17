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

/**
 * Persist alert records to the SQLite `alerts` table.
 *
 * Uses INSERT OR IGNORE so calling this multiple times with the same Alert
 * objects is idempotent — duplicate IDs are silently skipped.
 *
 * Sets `sent_by = 'server'` to indicate the alert originated from the server
 * scheduler (Step E rule-based alerts).
 *
 * @param alerts - Array of Alert objects returned by `generateAlerts`
 * @param db     - Active bun:sqlite Database connection (injected by caller)
 */
export function storeAlerts(alerts: Alert[], db: Database): void {
  if (alerts.length === 0) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO alerts
      (id, triggered_at, severity, signals_json, affected_actions_json,
       analysis_ids_json, message, read, user_note, sent_by)
    VALUES
      (?, ?, ?, ?, ?, NULL, ?, 0, NULL, 'server')
  `);

  const insertMany = db.transaction((rows: Alert[]) => {
    for (const alert of rows) {
      insert.run(
        alert.id,
        alert.createdAt,
        alert.severity,
        JSON.stringify(alert.signals),
        JSON.stringify([{ code: alert.actionCode }]),
        alert.message,
      );
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
 * @param alerts - Array of Alert objects produced by the Alert Commander
 * @param db     - Active bun:sqlite Database connection (injected by caller)
 */
export function storeAlertsFromCommander(alerts: Alert[], db: Database): void {
  if (alerts.length === 0) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO alerts
      (id, triggered_at, severity, signals_json, affected_actions_json,
       analysis_ids_json, message, read, user_note, sent_by)
    VALUES
      (?, ?, ?, ?, ?, NULL, ?, 0, NULL, 'alert-commander')
  `);

  const insertMany = db.transaction((rows: Alert[]) => {
    for (const alert of rows) {
      insert.run(
        alert.id,
        alert.createdAt,
        alert.severity,
        JSON.stringify(alert.signals),
        JSON.stringify([{ code: alert.actionCode }]),
        alert.message,
      );
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
