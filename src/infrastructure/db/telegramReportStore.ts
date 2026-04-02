/**
 * Infrastructure — Telegram Report Store (Task 226)
 *
 * CRUD helpers for the `telegram_reports` SQLite table.
 * Stores all inbound and outbound Report Channel messages for
 * the Dev Team autonomous loop.
 *
 * Design rules:
 *   - All functions accept an explicit `db` parameter (no global singleton)
 *     so they can be used in tests with an in-memory database.
 *   - Never throws — callers should wrap in try/catch and log on failure.
 *
 * @module infrastructure/db/telegramReportStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Priority level of a report message. */
export type ReportPriority = "critical" | "high" | "normal" | "monitor";

/** Status of a report row. */
export type ReportStatus = "new" | "processed";

/** A row from the `telegram_reports` table. */
export interface TelegramReport {
  id: number;
  message_id: number;
  text: string;
  from_agent: string;
  priority: ReportPriority;
  status: ReportStatus;
  created_at: number;
  claimed_by: string | null;
  claimed_at: string | null;
}

/** Result returned by {@link claimReport}. */
export interface ClaimResult {
  /** True if this call successfully claimed the report. */
  success: boolean;
  /**
   * The claimant that already holds the lock.
   * Only populated when `success` is false and the row exists.
   */
  claimedBy?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DDL
// ─────────────────────────────────────────────────────────────────────────────

/** Creates the `telegram_reports` table + indexes if they do not exist. */
export function ensureTelegramReportsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_reports (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id  INTEGER NOT NULL DEFAULT 0,
      text        TEXT    NOT NULL,
      from_agent  TEXT    NOT NULL DEFAULT 'unknown',
      priority    TEXT    NOT NULL DEFAULT 'normal',
      status      TEXT    NOT NULL DEFAULT 'new',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_telegram_reports_status  ON telegram_reports(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_telegram_reports_created ON telegram_reports(created_at)`);

  // Task 231 — ownership lock columns (idempotent ALTER TABLE)
  try { db.exec(`ALTER TABLE telegram_reports ADD COLUMN claimed_by TEXT`); } catch (_) { /* already exists */ }
  try { db.exec(`ALTER TABLE telegram_reports ADD COLUMN claimed_at TEXT`); } catch (_) { /* already exists */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inserts a new report row.
 *
 * @param db         - SQLite database instance
 * @param text       - Message text
 * @param fromAgent  - Sender label (e.g. "human", "analysis-agent")
 * @param messageId  - Telegram message_id (0 if not posted via Telegram)
 * @param priority   - Urgency level (default "normal")
 * @returns Inserted row id
 */
export function insertReport(
  db: Database,
  text: string,
  fromAgent: string = "unknown",
  messageId: number = 0,
  priority: ReportPriority = "normal",
): number {
  ensureTelegramReportsTable(db);
  const stmt = db.prepare(
    `INSERT INTO telegram_reports (text, from_agent, message_id, priority)
     VALUES (?, ?, ?, ?)`,
  );
  const result = stmt.run(text, fromAgent, messageId, priority);
  return Number(result.lastInsertRowid);
}

/**
 * Returns all reports with status = "new", ordered by created_at ASC.
 *
 * @param db - SQLite database instance
 */
export function listNewReports(db: Database): TelegramReport[] {
  ensureTelegramReportsTable(db);
  return db
    .query<TelegramReport, []>(
      `SELECT id, message_id, text, from_agent, priority, status, created_at
       FROM telegram_reports
       WHERE status = 'new'
       ORDER BY created_at ASC`,
    )
    .all();
}

/**
 * Returns all reports (any status), ordered by created_at ASC.
 *
 * @param db    - SQLite database instance
 * @param limit - Max rows to return (default 50)
 */
export function listAllReports(db: Database, limit = 50): TelegramReport[] {
  ensureTelegramReportsTable(db);
  return db
    .query<TelegramReport, [number]>(
      `SELECT id, message_id, text, from_agent, priority, status, created_at
       FROM telegram_reports
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .all(limit);
}

/**
 * Fetches a single report by id.
 *
 * @param db - SQLite database instance
 * @param id - Primary key
 * @returns The report row, or null if not found
 */
export function getReport(db: Database, id: number): TelegramReport | null {
  ensureTelegramReportsTable(db);
  return (
    db
      .query<TelegramReport, [number]>(
        `SELECT id, message_id, text, from_agent, priority, status, created_at
         FROM telegram_reports WHERE id = ?`,
      )
      .get(id) ?? null
  );
}

/**
 * Marks a report row as processed.
 *
 * @param db - SQLite database instance
 * @param id - Primary key of the row to mark
 */
export function markProcessed(db: Database, id: number): void {
  ensureTelegramReportsTable(db);
  db.prepare(
    `UPDATE telegram_reports SET status = 'processed' WHERE id = ?`,
  ).run(id);
}

/**
 * Atomically claims ownership of a report for a given claimant.
 *
 * Uses `WHERE claimed_by IS NULL` so only the first writer wins — SQLite's
 * serialised write lock guarantees atomicity without an explicit transaction.
 *
 * @param db       - SQLite database instance
 * @param id       - Primary key of the row to claim
 * @param claimant - Identifier of the agent claiming the report (e.g. "dev-team")
 * @returns        `{ success: true }` if the claim was granted,
 *                 `{ success: false, claimedBy: "<existing owner>" }` if already claimed
 */
export function claimReport(db: Database, id: number, claimant: string): ClaimResult {
  ensureTelegramReportsTable(db);

  const stmt = db.prepare(
    `UPDATE telegram_reports
     SET claimed_by = ?, claimed_at = datetime('now')
     WHERE id = ? AND claimed_by IS NULL`,
  );
  const result = stmt.run(claimant, id);

  if (result.changes > 0) {
    return { success: true };
  }

  // No rows changed — either already claimed or id doesn't exist
  const existing = db
    .query<{ claimed_by: string | null }, [number]>(
      `SELECT claimed_by FROM telegram_reports WHERE id = ?`,
    )
    .get(id);

  if (existing === null) {
    // Row not found
    return { success: false };
  }

  const claimedBy = existing.claimed_by;
  if (claimedBy !== null) {
    return { success: false, claimedBy };
  }
  // Row exists but claimed_by is NULL — this shouldn't happen (UPDATE changed 0 rows
  // but claimed_by is null), treat as failure without a known claimant.
  return { success: false };
}

/**
 * Returns all reports that are both `status = 'new'` and unclaimed
 * (`claimed_by IS NULL`), ordered oldest-first.
 *
 * Used by agents that want to process only uncontested reports.
 *
 * @param db - SQLite database instance
 */
export function listNewReportsUnclaimed(db: Database): TelegramReport[] {
  ensureTelegramReportsTable(db);
  return db
    .query<TelegramReport, []>(
      `SELECT id, message_id, text, from_agent, priority, status, created_at, claimed_by, claimed_at
       FROM telegram_reports
       WHERE status = 'new' AND claimed_by IS NULL
       ORDER BY created_at ASC`,
    )
    .all();
}
