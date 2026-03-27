/**
 * Alert Store — Task 064
 *
 * Infrastructure adapter that persists Alert records to the SQLite `alerts`
 * table.  This function lives in infrastructure (not domain) so that the
 * domain layer remains pure and free of any I/O.
 *
 * Usage:
 *   import { storeAlerts } from "../infrastructure/db/alertStore.js";
 *   import { getDb } from "../infrastructure/db/schema.js";
 *
 *   const alerts = generateAlerts(signals, watchlist);
 *   storeAlerts(alerts, getDb());
 */

import type { Database } from "bun:sqlite";
import type { Alert } from "../../domain/services/alertGenerator.js";

/**
 * Persist alert records to the SQLite `alerts` table.
 *
 * Uses INSERT OR IGNORE so calling this multiple times with the same Alert
 * objects is idempotent — duplicate IDs are silently skipped.
 *
 * @param alerts - Array of Alert objects returned by `generateAlerts`
 * @param db     - Active bun:sqlite Database connection (injected by caller)
 */
export function storeAlerts(alerts: Alert[], db: Database): void {
  if (alerts.length === 0) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO alerts
      (id, triggered_at, severity, signals_json, affected_actions_json,
       analysis_ids_json, message, read, user_note)
    VALUES
      (?, ?, ?, ?, ?, NULL, ?, 0, NULL)
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
