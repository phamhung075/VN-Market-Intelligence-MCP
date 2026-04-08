/**
 * Infrastructure — System Changelog Store (Task 233)
 *
 * CRUD helpers for the `system_changelog` SQLite table.
 * Used by the Dev Team to log fixes so the Analysis Team can check before
 * re-reporting an already-fixed issue (Gap 2 communication fix).
 *
 * Design rules:
 *   - All functions accept an explicit `db` parameter (no global singleton)
 *     so they can be used in tests with an in-memory database.
 *   - `files` is stored as a JSON string and parsed back to string[] on read.
 *   - Never throws — callers should wrap in try/catch and log on failure.
 *
 * @module infrastructure/db/changelogStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A row from the `system_changelog` table (files already parsed from JSON). */
export interface ChangelogEntry {
  id: number;
  fix_type: string;
  title: string;
  detail: string;
  /** Parsed from the JSON string stored in the `files` column. */
  files: string[];
  commit_hash: string | null;
  fixed_at: string;
  related_feedback_id: number | null;
}

/** Raw DB row before files JSON parsing. */
interface ChangelogRow {
  id: number;
  fix_type: string;
  title: string;
  detail: string;
  files: string;
  commit_hash: string | null;
  fixed_at: string;
  related_feedback_id: number | null;
}

/** Input for insertChangelog. */
export interface InsertChangelogInput {
  fixType: string;
  title: string;
  detail: string;
  files: string[];
  commitHash?: string | undefined;
  relatedFeedbackId?: number | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// DDL note (Task 1034)
// ─────────────────────────────────────────────────────────────────────────────
//
// The `system_changelog` table is created exclusively by `initDatabase()` in
// `src/infrastructure/db/schema.ts:608`. The previous local helper
// `ensureChangelogTable()` was removed because it duplicated that DDL and
// drifted from the canonical schema. Callers must ensure `initDatabase()` has
// run before invoking the CRUD helpers below.
//
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseRow(row: ChangelogRow): ChangelogEntry {
  let files: string[] = [];
  try {
    const parsed = JSON.parse(row.files);
    if (Array.isArray(parsed)) files = parsed as string[];
  } catch {
    files = [];
  }
  return { ...row, files };
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inserts a new changelog entry.
 *
 * @param db    - SQLite database instance
 * @param input - Changelog fields to store
 * @returns Inserted row id
 */
export function insertChangelog(
  db: Database,
  input: InsertChangelogInput,
): number {
  const stmt = db.prepare(`
    INSERT INTO system_changelog
      (fix_type, title, detail, files, commit_hash, related_feedback_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    input.fixType,
    input.title,
    input.detail,
    JSON.stringify(input.files),
    input.commitHash ?? null,
    input.relatedFeedbackId ?? null,
  );
  return Number(result.lastInsertRowid);
}

/**
 * Returns the most recent changelog entries, newest first.
 *
 * @param db    - SQLite database instance
 * @param limit - Max number of rows to return (default 10)
 * @returns Array of ChangelogEntry with files already parsed
 */
export function getRecentChangelogs(
  db: Database,
  limit = 10,
): ChangelogEntry[] {
  const rows = db
    .query<ChangelogRow, [number]>(
      `SELECT id, fix_type, title, detail, files, commit_hash, fixed_at, related_feedback_id
       FROM system_changelog
       ORDER BY fixed_at DESC
       LIMIT ?`,
    )
    .all(limit);
  return rows.map(parseRow);
}
