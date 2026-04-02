/**
 * Alert Mute Store — Task 222
 *
 * SQLite CRUD helpers for the `alert_mutes` table.
 *
 * Table schema:
 *   CREATE TABLE IF NOT EXISTS alert_mutes (
 *     code        TEXT PRIMARY KEY,
 *     muted_until TEXT NOT NULL,   -- ISO 8601
 *     reason      TEXT
 *   )
 *
 * All functions accept an explicit `db` parameter so they can be used in
 * tests with an in-memory database.
 *
 * @module infrastructure/db/alertMuteStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// DDL
// ─────────────────────────────────────────────────────────────────────────────

const ALERT_MUTES_DDL = `
  CREATE TABLE IF NOT EXISTS alert_mutes (
    code        TEXT PRIMARY KEY,
    muted_until TEXT NOT NULL,
    reason      TEXT
  )
`;

/**
 * Ensure the `alert_mutes` table exists.
 * Idempotent — safe to call multiple times.
 */
export function ensureAlertMutesTable(db: Database): void {
  db.exec(ALERT_MUTES_DDL);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_alert_mutes_until ON alert_mutes(muted_until)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Full row as returned from the `alert_mutes` table. */
export interface AlertMuteRow {
  code: string;
  muted_until: string;
  reason: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mute alerts for a stock for `hours` hours from now.
 * Uses INSERT OR REPLACE so repeated calls update the expiry (upsert).
 *
 * @param db     - SQLite database instance
 * @param code   - Stock ticker (e.g. "VCB")
 * @param hours  - Duration in hours (default 24)
 * @param reason - Optional human-readable reason
 */
export function muteStock(
  db: Database,
  code: string,
  hours: number = 24,
  reason?: string,
): void {
  const until = new Date(Date.now() + hours * 3_600_000).toISOString();
  db.prepare(
    "INSERT OR REPLACE INTO alert_mutes (code, muted_until, reason) VALUES (?, ?, ?)",
  ).run(code, until, reason ?? null);
}

/**
 * Remove the mute for a stock.
 * No-op if the stock is not currently muted.
 *
 * @param db   - SQLite database instance
 * @param code - Stock ticker
 */
export function unmuteStock(db: Database, code: string): void {
  db.prepare("DELETE FROM alert_mutes WHERE code = ?").run(code);
}

/**
 * Return all mute rows (active and expired) ordered by code.
 *
 * @param db - SQLite database instance
 */
export function listMutes(db: Database): AlertMuteRow[] {
  return db.query<AlertMuteRow, []>(
    "SELECT code, muted_until, reason FROM alert_mutes ORDER BY code",
  ).all();
}

/**
 * Load all currently-active mutes into a `Map<code, expiryDate>`.
 * Expired rows are included so callers can decide their own cut-off;
 * `isStockMuted` from the domain layer handles the expiry check.
 *
 * @param db - SQLite database instance
 */
export function loadMutesMap(db: Database): Map<string, Date> {
  const rows = listMutes(db);
  const map = new Map<string, Date>();
  for (const row of rows) {
    map.set(row.code, new Date(row.muted_until));
  }
  return map;
}
