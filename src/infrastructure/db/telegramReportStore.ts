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
