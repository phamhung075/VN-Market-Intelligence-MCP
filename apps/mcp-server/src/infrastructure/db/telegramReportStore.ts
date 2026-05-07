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

/** Resolution state of a report row (Task 1849a). */
export type ResolutionStatus = "none" | "fixed" | "wontfix" | "duplicate" | "monitoring";

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
  resolution: ResolutionStatus;
  resolved_at: string | null;
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
// DDL note (Task 1035)
// ─────────────────────────────────────────────────────────────────────────────
//
// The `telegram_reports` table (plus its indexes and the Task 231 claimed_by /
// claimed_at columns) is created exclusively by `initDatabase()` in
// `src/infrastructure/db/schema.ts:587`. The previous local helper
// `ensureTelegramReportsTable()` was removed because it duplicated that DDL
// and drifted from the canonical schema. Callers must ensure `initDatabase()`
// has run before invoking the CRUD helpers below.
//
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
  return db
    .query<TelegramReport, []>(
      `SELECT id, message_id, text, from_agent, priority, status,
              created_at, claimed_by, claimed_at, resolution, resolved_at
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
  return db
    .query<TelegramReport, [number]>(
      `SELECT id, message_id, text, from_agent, priority, status,
              created_at, claimed_by, claimed_at, resolution, resolved_at
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
  return (
    db
      .query<TelegramReport, [number]>(
        `SELECT id, message_id, text, from_agent, priority, status,
                created_at, claimed_by, claimed_at, resolution, resolved_at
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

// ─────────────────────────────────────────────────────────────────────────────
// Deduplication helpers (Task 1215)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts the category tag from a bug report message.
 *
 * Expected format: `📋 <category>\n` somewhere in the text.
 * Returns the category string (e.g. "data_extraction_error") or null
 * when no category marker is present.
 */
export function extractCategoryFromText(text: string): string | null {
  // Match the clipboard emoji followed by optional whitespace and a word token.
  // Works for both the Unicode emoji (📋, U+1F4CB) and plain ASCII fallback.
  const match = text.match(/\u{1F4CB}\s*(\S+)/u);
  return match?.[1] ?? null;
}

/**
 * Returns true when an open (`status = 'new'`) report that shares the same
 * category as `text` was created within the last `cooldownSeconds` seconds.
 *
 * Agents should call this before firing `send_telegram(channel="bug")` to
 * avoid flooding the BUG channel with duplicate reports for the same issue.
 *
 * When `text` has no recognisable category marker, the check is skipped and
 * the function returns false (no suppression for uncategorised messages).
 *
 * @param db              - SQLite database instance
 * @param text            - Full text of the report about to be sent
 * @param cooldownSeconds - Suppression window in seconds (default: 4 h)
 */
export function isDuplicateReport(
  db: Database,
  text: string,
  cooldownSeconds: number = 4 * 3600,
): boolean {
  const category = extractCategoryFromText(text);
  if (!category) return false;

  const cutoff = Math.floor(Date.now() / 1000) - cooldownSeconds;
  const row = db
    .query<{ id: number }, [string, number]>(
      `SELECT id FROM telegram_reports
       WHERE status = 'new'
         AND instr(text, ?) > 0
         AND created_at >= ?
       LIMIT 1`,
    )
    .get(category, cutoff);

  return row !== null;
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
  return db
    .query<TelegramReport, []>(
      `SELECT id, message_id, text, from_agent, priority, status,
              created_at, claimed_by, claimed_at, resolution, resolved_at
       FROM telegram_reports
       WHERE status = 'new' AND claimed_by IS NULL
       ORDER BY created_at ASC`,
    )
    .all();
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution tracking helpers (Task 1849a)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Atomically sets the resolution and resolved_at timestamp on a report row.
 *
 * Idempotent — calling twice with the same id is safe (no error if row missing).
 *
 * @param db         - SQLite database instance
 * @param id         - Primary key of the row to resolve
 * @param resolution - Resolution status (one of the 5 allowed values)
 * @param resolvedAt - ISO-8601 timestamp (defaults to current time)
 */
export function markResolved(
  db: Database,
  id: number,
  resolution: ResolutionStatus,
  resolvedAt?: string,
): void {
  db.prepare(
    `UPDATE telegram_reports SET resolution = ?, resolved_at = ? WHERE id = ?`,
  ).run(resolution, resolvedAt ?? new Date().toISOString(), id);
}

/**
 * Returns all reports that are not yet terminally resolved.
 *
 * Includes rows with resolution = 'none' or 'monitoring'.
 * Excludes rows with status = 'processed' (already handled).
 * Ordered by created_at ASC (oldest first).
 *
 * @param db - SQLite database instance
 */
export function listUnresolvedReports(db: Database): TelegramReport[] {
  return db
    .query<TelegramReport, []>(
      `SELECT id, message_id, text, from_agent, priority, status,
              created_at, claimed_by, claimed_at, resolution, resolved_at
       FROM telegram_reports
       WHERE resolution NOT IN ('fixed', 'wontfix', 'duplicate')
         AND status != 'processed'
       ORDER BY created_at ASC`,
    )
    .all();
}

/**
 * Returns all reports that have been terminally resolved.
 *
 * Includes rows with resolution IN ('fixed', 'wontfix', 'duplicate').
 * Useful for audit and archival queries.
 *
 * @param db    - SQLite database instance
 * @param limit - Optional max rows to return (default: no limit)
 */
export function listResolvedReports(db: Database, limit?: number): TelegramReport[] {
  if (limit !== undefined) {
    return db
      .query<TelegramReport, [number]>(
        `SELECT id, message_id, text, from_agent, priority, status,
                created_at, claimed_by, claimed_at, resolution, resolved_at
         FROM telegram_reports
         WHERE resolution IN ('fixed', 'wontfix', 'duplicate')
         ORDER BY resolved_at DESC
         LIMIT ?`,
      )
      .all(limit);
  }
  return db
    .query<TelegramReport, []>(
      `SELECT id, message_id, text, from_agent, priority, status,
              created_at, claimed_by, claimed_at, resolution, resolved_at
       FROM telegram_reports
       WHERE resolution IN ('fixed', 'wontfix', 'duplicate')
       ORDER BY resolved_at DESC`,
    )
    .all();
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialization helpers (Task 1849b — C-2 constraint)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a Unix timestamp (seconds) to an ISO 8601 date string.
 */
function toIsoString(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Serialize a TelegramReport row for MCP tool output.
 *
 * Includes all 11 fields (C-2 constraint):
 *   id, message_id, text, from_agent, priority, status,
 *   created_at (as ISO string), claimed_by, claimed_at,
 *   resolution, resolved_at
 *
 * @param row - A TelegramReport row from the database
 * @returns   Plain object suitable for JSON.stringify
 */
export function serializeReport(row: TelegramReport): Record<string, unknown> {
  return {
    id: row.id,
    message_id: row.message_id,
    text: row.text,
    from_agent: row.from_agent,
    priority: row.priority,
    status: row.status,
    created_at: toIsoString(row.created_at),
    claimed_by: row.claimed_by ?? null,
    claimed_at: row.claimed_at ?? null,
    resolution: row.resolution ?? "none",
    resolved_at: row.resolved_at ?? null,
  };
}

/**
 * Deletes telegram_reports rows older than `olderThanHours` hours.
 * Removes both 'new' and 'processed' rows — old reports have no value.
 *
 * @param db             - SQLite database instance
 * @param olderThanHours - Age threshold in hours (default: 48)
 * @returns              Number of rows deleted
 */
export function deleteOldReports(db: Database, olderThanHours = 48): number {
  const cutoff = Math.floor(Date.now() / 1000) - olderThanHours * 3600;
  const result = db
    .prepare(`DELETE FROM telegram_reports WHERE created_at < ?`)
    .run(cutoff);
  return result.changes;
}
