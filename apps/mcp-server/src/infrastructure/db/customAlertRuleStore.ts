/**
 * Task 219 — Custom Alert Rule Store (Infrastructure)
 *
 * SQLite CRUD helpers for the `custom_alert_rules` table.
 * All functions accept an explicit `db` parameter so they can be used in
 * tests with an in-memory database.
 *
 * @module infrastructure/db/customAlertRuleStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Full row as stored in the custom_alert_rules table */
export interface CustomAlertRuleRow {
  id: number;
  code: string;
  predicate: string;
  threshold: number;
  status: string;
  created_at: string;
  triggered_at: string | null;
  notes: string | null;
}

/** Payload required to insert a new rule */
export interface InsertCustomAlertRulePayload {
  code: string;
  predicate: string;
  threshold: number;
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new custom alert rule.
 *
 * @param payload - Rule definition (code, predicate, threshold, optional notes)
 * @param db      - Open SQLite connection
 * @returns The auto-incremented row ID of the new rule
 */
export function insertCustomAlertRule(
  payload: InsertCustomAlertRulePayload,
  db: Database,
): number {
  const stmt = db.prepare(`
    INSERT INTO custom_alert_rules (code, predicate, threshold, notes)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(
    payload.code.toUpperCase(),
    payload.predicate,
    payload.threshold,
    payload.notes ?? null,
  );
  return Number(result.lastInsertRowid);
}

/**
 * List all rules ordered by creation date (oldest first).
 *
 * @param db - Open SQLite connection
 */
export function listCustomAlertRules(db: Database): CustomAlertRuleRow[] {
  return db
    .query<CustomAlertRuleRow, []>(
      `SELECT id, code, predicate, threshold, status, created_at, triggered_at, notes
       FROM custom_alert_rules
       ORDER BY id ASC`,
    )
    .all();
}

/**
 * List only active (non-triggered, non-disabled) rules.
 * Used by the intelligence cycle evaluator.
 *
 * @param db - Open SQLite connection
 */
export function listActiveCustomAlertRules(db: Database): CustomAlertRuleRow[] {
  return db
    .query<CustomAlertRuleRow, [string]>(
      `SELECT id, code, predicate, threshold, status, created_at, triggered_at, notes
       FROM custom_alert_rules
       WHERE status = ?
       ORDER BY id ASC`,
    )
    .all("active");
}

/**
 * Delete a rule by its ID.
 *
 * @param id - Rule ID to delete
 * @param db - Open SQLite connection
 * @returns true if a row was deleted, false if no row matched
 */
export function deleteCustomAlertRule(id: number, db: Database): boolean {
  const result = db.prepare(`DELETE FROM custom_alert_rules WHERE id = ?`).run(id);
  return result.changes > 0;
}

/**
 * Mark a rule as triggered (sets status = 'triggered' and triggered_at = now).
 *
 * @param id - Rule ID to mark
 * @param db - Open SQLite connection
 */
export function markCustomAlertRuleTriggered(id: number, db: Database): void {
  db.prepare(
    `UPDATE custom_alert_rules
     SET status = 'triggered', triggered_at = datetime('now')
     WHERE id = ?`,
  ).run(id);
}
