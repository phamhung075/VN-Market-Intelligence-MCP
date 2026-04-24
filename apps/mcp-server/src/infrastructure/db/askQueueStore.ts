/**
 * Task 1072 — ask_queue CRUD helpers
 *
 * Provides FIFO question-queue operations for the /ask Telegram command.
 * The `ask_queue` table is separate from `user_requests` — different schema,
 * different purpose. See TECH_054 section 4.2 for rationale.
 *
 * All SQL uses parameterized bindings only. No string interpolation in queries.
 *
 * @module infrastructure/db/askQueueStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Valid status values for an ask_queue row. */
export type AskStatus =
  | "pending"
  | "processing"
  | "answered"
  | "failed"
  | "escalated";

/** Full raw SQLite row from the ask_queue table. */
export interface AskQueueRow {
  id: number;
  user_id: string;
  message: string;
  received_at: string;
  status: AskStatus;
  answered_at: string | null;
  answer_text: string | null;
  processing_started_at: string | null;
}

/** Maximum message length stored in DB (per TECH_054 section 4.3). */
const MAX_MESSAGE_LENGTH = 2000;

/** Default staleness threshold in minutes for processing recovery. */
const DEFAULT_STALE_MINUTES = 20;

// ─────────────────────────────────────────────────────────────────────────────
// insertAskQuestion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new question into the ask_queue.
 *
 * Truncates message to 2000 chars if needed.
 * Returns the inserted row id.
 *
 * @param db       Database connection
 * @param message  The user's question text
 * @param userId   Optional user identifier (defaults to 'default')
 * @returns        The new row's integer id
 */
export function insertAskQuestion(
  db: Database,
  message: string,
  userId?: string,
): number {
  const truncated =
    message.length > MAX_MESSAGE_LENGTH
      ? message.slice(0, MAX_MESSAGE_LENGTH)
      : message;

  const result = db
    .prepare(
      `INSERT INTO ask_queue (user_id, message, received_at, status)
       VALUES (?, ?, datetime('now'), 'pending')`,
    )
    .run(userId ?? "default", truncated);

  return Number(result.lastInsertRowid);
}

// ─────────────────────────────────────────────────────────────────────────────
// getPendingAskQuestions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return pending questions in FIFO order (received_at ASC).
 *
 * Only rows with status='pending' are returned.
 * Default limit = 10.
 *
 * @param db     Database connection
 * @param limit  Maximum number of rows to return (default: 10)
 */
export function getPendingAskQuestions(
  db: Database,
  limit = 10,
): Pick<AskQueueRow, "id" | "message" | "received_at">[] {
  return db
    .prepare<
      Pick<AskQueueRow, "id" | "message" | "received_at">,
      [number]
    >(
      `SELECT id, message, received_at
       FROM ask_queue
       WHERE status = 'pending'
       ORDER BY received_at ASC
       LIMIT ?`,
    )
    .all(limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// markAskProcessing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transition a row from pending → processing.
 *
 * Sets processing_started_at = datetime('now').
 * No-op if the row does not exist or is already in a terminal state.
 *
 * @param db  Database connection
 * @param id  Row id to update
 */
export function markAskProcessing(db: Database, id: number): void {
  db.prepare(
    `UPDATE ask_queue
     SET status                = 'processing',
         processing_started_at = datetime('now')
     WHERE id = ?`,
  ).run(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// answerAskQuestion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record the answer and set the final status.
 *
 * Sets answered_at = datetime('now'), answer_text, and the given status.
 * Accepts 'answered', 'escalated', or 'failed'.
 *
 * @param db         Database connection
 * @param id         Row id to update
 * @param answerText The answer or escalation note
 * @param status     Final status: 'answered' | 'escalated' | 'failed'
 */
export function answerAskQuestion(
  db: Database,
  id: number,
  answerText: string,
  status: "answered" | "escalated" | "failed",
): void {
  db.prepare(
    `UPDATE ask_queue
     SET status      = ?,
         answer_text = ?,
         answered_at = datetime('now')
     WHERE id = ?`,
  ).run(status, answerText, id);
}

// ─────────────────────────────────────────────────────────────────────────────
// recoverStaleProcessing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reset rows stuck in 'processing' for longer than `maxAgeMinutes` back to 'pending'.
 *
 * Called at the start of askQueueCheckJob to enable automatic crash recovery.
 * Clears processing_started_at so the row looks fresh on the next pick-up.
 *
 * @param db             Database connection
 * @param maxAgeMinutes  Staleness threshold in minutes (default: 20)
 * @returns              Number of rows recovered
 */
export function recoverStaleProcessing(
  db: Database,
  maxAgeMinutes = DEFAULT_STALE_MINUTES,
): number {
  const result = db
    .prepare(
      `UPDATE ask_queue
       SET status                = 'pending',
           processing_started_at = NULL
       WHERE status = 'processing'
         AND processing_started_at <= datetime('now', ? || ' minutes')`,
    )
    .run(`-${maxAgeMinutes}`);

  return result.changes;
}
