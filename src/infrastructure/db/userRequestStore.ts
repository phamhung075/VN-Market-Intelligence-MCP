/**
 * User Request Store — Task 238
 *
 * SQLite CRUD helpers for the `user_requests` table.
 *
 * Supports the async AI question-answering flow:
 *   1. Telegram /ask or /why command → insertUserRequest (status='pending')
 *   2. Intelligence cycle step F picks up pending rows → processes
 *   3. markAnswered → sets status='done', response, answered_at
 *
 * Table schema:
 *   CREATE TABLE IF NOT EXISTS user_requests (
 *     id          INTEGER PRIMARY KEY AUTOINCREMENT,
 *     command     TEXT NOT NULL,
 *     payload     TEXT NOT NULL,
 *     status      TEXT NOT NULL DEFAULT 'pending',
 *     response    TEXT,
 *     created_at  TEXT NOT NULL DEFAULT (datetime('now')),
 *     answered_at TEXT
 *   )
 *
 * All functions accept an explicit `db` parameter so they can be used in
 * tests with an in-memory database.
 *
 * @module infrastructure/db/userRequestStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// DDL
// ─────────────────────────────────────────────────────────────────────────────

const USER_REQUESTS_DDL = `
  CREATE TABLE IF NOT EXISTS user_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    command     TEXT NOT NULL,
    payload     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    response    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    answered_at TEXT
  )
`;

/**
 * Ensure the `user_requests` table and index exist.
 * Idempotent — safe to call multiple times.
 *
 * @param db - SQLite database instance
 */
export function ensureUserRequestsTable(db: Database): void {
  db.exec(USER_REQUESTS_DDL);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_user_requests_status ON user_requests(status)`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Full row as returned from the `user_requests` table. */
export interface UserRequest {
  id: number;
  command: string;
  payload: string;
  status: string;
  response: string | null;
  created_at: string;
  answered_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new user request with status='pending'.
 *
 * @param db      - SQLite database instance
 * @param command - Command type (e.g. "ask")
 * @param payload - The question or payload text
 * @returns       - Auto-increment ID of the inserted row
 */
export function insertUserRequest(
  db: Database,
  command: string,
  payload: string,
): number {
  const result = db
    .prepare(
      `INSERT INTO user_requests (command, payload, status, created_at)
       VALUES (?, ?, 'pending', datetime('now'))`,
    )
    .run(command, payload);

  return result.lastInsertRowid as number;
}

/**
 * Retrieve pending user requests ordered by created_at ASC (FIFO).
 *
 * @param db    - SQLite database instance
 * @param limit - Maximum rows to return (default 3)
 * @returns     - Array of pending UserRequest rows
 */
export function getPendingRequests(
  db: Database,
  limit: number = 3,
): UserRequest[] {
  return db
    .prepare<UserRequest, [number]>(
      `SELECT id, command, payload, status, response, created_at, answered_at
       FROM user_requests
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .all(limit);
}

/**
 * Mark a pending request as answered.
 *
 * Sets status='done', persists the response text, and records answered_at
 * as the current UTC datetime.
 *
 * @param db       - SQLite database instance
 * @param id       - Row ID to update
 * @param response - Answer text to persist
 */
export function markAnswered(
  db: Database,
  id: number,
  response: string,
): void {
  db.prepare(
    `UPDATE user_requests
     SET status = 'done', response = ?, answered_at = datetime('now')
     WHERE id = ?`,
  ).run(response, id);
}
