/**
 * improveCheckStore.ts — Data-access layer for improve_check_log table
 *
 * Sprint SELF-IMPROVE-GATE Phase 2 lane-B substrate.
 *
 * All functions accept an injectable `db: Database` parameter — ZERO calls
 * to getDb() inside this module. This makes every function trivially testable
 * with a :memory: database and satisfies the DDD infrastructure layer rule:
 * no side effects at module load time.
 *
 * DDD layer: Infrastructure / DB
 * Zero imports from domain/ or application/ layers.
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DispatchStatus =
  | "shadow"
  | "dispatched"
  | "deferred_wip_cap"
  | "improvement_confirmed"
  | "no_improvement"
  | "worsened";

const VALID_DISPATCH_STATUSES: DispatchStatus[] = [
  "shadow",
  "dispatched",
  "deferred_wip_cap",
  "improvement_confirmed",
  "no_improvement",
  "worsened",
];

export interface ImproveCheckRow {
  id: number;
  signal_type: string;
  window_7d_rate: number | null;
  window_30d_rate: number | null;
  sample_count_7d: number | null;
  sample_count_30d: number | null;
  hypothesis: string | null;
  dispatch_status: DispatchStatus;
  fix_signal_id: string | null;
  checked_at: string; // ISO-8601 UTC
  rechecked_at: string | null;
}

export interface ImproveCheckInsert {
  signal_type: string;
  window_7d_rate?: number | null;
  window_30d_rate?: number | null;
  sample_count_7d?: number | null;
  sample_count_30d?: number | null;
  hypothesis?: string | null;
  dispatch_status?: DispatchStatus; // default 'shadow'
  fix_signal_id?: string | null;
}

export interface GetBaselineOpts {
  /** Look-back window in days for checked_at filter. Default: 7. */
  withinDays?: number;
}

export interface UpdateDispatchOpts {
  rechecked_at?: string;
  fix_signal_id?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CoverageGapFinding (also used by orchestrator)
// ─────────────────────────────────────────────────────────────────────────────

export interface CoverageGapFinding {
  stock_code: string;
  agent_signals_count: number; // >= 1
  last_signal_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// insertImproveCheckSnapshot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new improve_check_log row with dispatch_status='shadow' by default.
 * Throws if signal_type is empty or blank (fail-loud per fail-loud-protocol.md).
 * Throws if dispatch_status is not a valid DispatchStatus value.
 * Returns the new row id.
 */
export function insertImproveCheckSnapshot(
  db: Database,
  row: ImproveCheckInsert,
): number {
  if (!row.signal_type || row.signal_type.trim() === "") {
    throw new Error(
      "[improveCheckStore] invalid signal_type: empty string — signal_type is required",
    );
  }

  const status = row.dispatch_status ?? "shadow";
  if (!VALID_DISPATCH_STATUSES.includes(status)) {
    throw new Error(
      `[improveCheckStore] invalid dispatch_status: '${status}' — must be one of ${VALID_DISPATCH_STATUSES.join(", ")}`,
    );
  }

  const stmt = db.prepare(`
    INSERT INTO improve_check_log
      (signal_type, window_7d_rate, window_30d_rate, sample_count_7d,
       sample_count_30d, hypothesis, dispatch_status, fix_signal_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    row.signal_type,
    row.window_7d_rate ?? null,
    row.window_30d_rate ?? null,
    row.sample_count_7d ?? null,
    row.sample_count_30d ?? null,
    row.hypothesis ?? null,
    status,
    row.fix_signal_id ?? null,
  );

  const last = db.prepare("SELECT last_insert_rowid() AS id").get() as {
    id: number;
  };
  return last.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// getBaselineForSignalType
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve the most recent row for a given signal_type within the lookback window.
 * Returns null if no row found or if the table does not exist.
 * Null-safe: never throws on missing table (AC-T1-3).
 */
export function getBaselineForSignalType(
  db: Database,
  signal_type: string,
  opts?: GetBaselineOpts,
): ImproveCheckRow | null {
  const withinDays = opts?.withinDays ?? 7;
  try {
    const row = db
      .prepare<ImproveCheckRow, [string, number]>(
        `SELECT id, signal_type, window_7d_rate, window_30d_rate,
                sample_count_7d, sample_count_30d, hypothesis,
                dispatch_status, fix_signal_id, checked_at, rechecked_at
         FROM improve_check_log
         WHERE signal_type = ?
           AND checked_at >= datetime('now', ? || ' days')
         ORDER BY checked_at DESC
         LIMIT 1`,
      )
      .get(signal_type, -withinDays);
    return row ?? null;
  } catch {
    // Table may not exist (before initSystemTables()) — return null, do not throw
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getPendingRecheckRows
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve all rows with dispatch_status='dispatched' and checked_at older
 * than 7 days, where rechecked_at is null (pending recheck).
 *
 * Used by future Phase 3 recheck loop; function exists but is not called
 * by Phase 2. Returns empty array if table does not exist.
 */
export function getPendingRecheckRows(db: Database): ImproveCheckRow[] {
  try {
    return db
      .prepare<ImproveCheckRow, []>(
        `SELECT id, signal_type, window_7d_rate, window_30d_rate,
                sample_count_7d, sample_count_30d, hypothesis,
                dispatch_status, fix_signal_id, checked_at, rechecked_at
         FROM improve_check_log
         WHERE dispatch_status = 'dispatched'
           AND checked_at < datetime('now', '-7 days')
           AND rechecked_at IS NULL
         ORDER BY checked_at ASC`,
      )
      .all();
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// updateDispatchStatus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update dispatch_status and optional fields for an existing row.
 * Called by orchestrator to transition 'shadow' → 'dispatched' (when
 * kill-switch is true), and by future recheck step.
 */
export function updateDispatchStatus(
  db: Database,
  id: number,
  status: DispatchStatus,
  opts?: UpdateDispatchOpts,
): void {
  if (!VALID_DISPATCH_STATUSES.includes(status)) {
    throw new Error(
      `[improveCheckStore] invalid dispatch_status: '${status}'`,
    );
  }

  const setClauses: string[] = ["dispatch_status = ?"];
  const params: (string | number | null)[] = [status];

  if (opts?.rechecked_at !== undefined) {
    setClauses.push("rechecked_at = ?");
    params.push(opts.rechecked_at);
  }
  if (opts?.fix_signal_id !== undefined) {
    setClauses.push("fix_signal_id = ?");
    params.push(opts.fix_signal_id);
  }

  params.push(id);

  db.prepare(
    `UPDATE improve_check_log SET ${setClauses.join(", ")} WHERE id = ?`,
  ).run(...(params as Parameters<ReturnType<Database["prepare"]>["run"]>));
}

// ─────────────────────────────────────────────────────────────────────────────
// queryCoverageGaps
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query watchlist stocks with ≥1 agent_signals row but 0 resolved
 * signal_outcomes rows in the last 30 days.
 *
 * Returns array of CoverageGapFinding. Returns empty array if any required
 * table does not exist (null-safe, non-fatal).
 *
 * Placement in improveCheckStore.ts per architect blueprint §3: operationally
 * related to improve_check pipeline; shares injectable db pattern.
 */
export function queryCoverageGaps(db: Database): CoverageGapFinding[] {
  try {
    return db
      .prepare<CoverageGapFinding, []>(
        `SELECT
           w.stock_code,
           COUNT(DISTINCT ags.id) AS agent_signals_count,
           MAX(ags.created_at)    AS last_signal_at
         FROM watchlist w
         JOIN agent_signals ags ON ags.stock_code = w.stock_code
         WHERE NOT EXISTS (
           SELECT 1 FROM signal_outcomes so
           WHERE so.stock_code = w.stock_code
             AND so.created_at >= datetime('now', '-30 days')
         )
         GROUP BY w.stock_code
         HAVING agent_signals_count >= 1`,
      )
      .all();
  } catch {
    return [];
  }
}
