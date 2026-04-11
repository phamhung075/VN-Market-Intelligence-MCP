/**
 * Task 1108 — agent_work_log store
 *
 * CRUD helpers for the `agent_work_log` table.
 *
 * The table records agent session lifecycle events: when a session starts
 * (status='running'), what it found, what actions it took, and whether it
 * finished cleanly (status='completed') or crashed (status='error').
 *
 * All SQL uses parameterized bindings only. No string interpolation in queries.
 *
 * @module infrastructure/db/agentWorkLogStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Valid terminal status values for an agent_work_log row. */
export type AgentWorkStatus = "running" | "completed" | "error";

/** Full raw SQLite row from the agent_work_log table. */
export interface AgentWorkLogEntry {
  id: number;
  agent_name: string;
  session_id: string | null;
  /** ISO 8601 datetime stored as TEXT */
  started_at: string;
  /** ISO 8601 datetime stored as TEXT, NULL while running */
  finished_at: string | null;
  summary: string | null;
  findings: string | null;
  /** JSON-serialised array of actions taken, or NULL */
  actions_json: string | null;
  status: AgentWorkStatus;
}

/** Options for getAgentWorkLog queries. */
export interface GetAgentWorkLogOptions {
  /** Filter to a specific agent_name. */
  agentName?: string;
  /** Return only rows started within the last N calendar days. */
  days?: number;
  /** Maximum number of rows to return (default: 100). */
  limit?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// logAgentWorkStart
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new agent work session row with status='running'.
 *
 * started_at defaults to the current UTC datetime via SQLite's `datetime('now')`.
 *
 * @param db         Database connection
 * @param agentName  The name of the agent starting the session
 * @param sessionId  Optional caller-supplied session identifier (e.g. cron run id)
 * @returns          The new row's integer id
 */
export function logAgentWorkStart(
  db: Database,
  agentName: string,
  sessionId?: string,
): number {
  const result = db
    .prepare(
      `INSERT INTO agent_work_log (agent_name, session_id, status)
       VALUES (?, ?, 'running')`,
    )
    .run(agentName, sessionId ?? null);

  return Number(result.lastInsertRowid);
}

// ─────────────────────────────────────────────────────────────────────────────
// logAgentWorkEnd
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update an existing agent work session with its outcome.
 *
 * Sets finished_at = current UTC datetime and writes summary, findings,
 * actions_json, and the final status. No-op if the row does not exist.
 *
 * @param db          Database connection
 * @param id          Row id returned from logAgentWorkStart
 * @param summary     Short one-line description of what the session did
 * @param findings    Free-form notes on what was found (signals, alerts, issues)
 * @param actionsJson JSON-serialised array of actions taken, or null
 * @param status      Terminal status: 'completed' | 'error'
 */
export function logAgentWorkEnd(
  db: Database,
  id: number,
  summary: string | null,
  findings: string | null,
  actionsJson: string | null,
  status: "completed" | "error",
): void {
  db.prepare(
    `UPDATE agent_work_log
     SET finished_at  = datetime('now'),
         summary      = ?,
         findings     = ?,
         actions_json = ?,
         status       = ?
     WHERE id = ?`,
  ).run(summary, findings, actionsJson, status, id);
}

// ─────────────────────────────────────────────────────────────────────────────
// getAgentWorkLog
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query agent work log entries, ordered by started_at DESC (most recent first).
 *
 * All filter parameters are optional and combinable.
 *
 * @param db       Database connection
 * @param options  Optional filters: agentName, days (recency window), limit
 * @returns        Array of AgentWorkLogEntry rows, most recent first
 */
export function getAgentWorkLog(
  db: Database,
  options: GetAgentWorkLogOptions = {},
): AgentWorkLogEntry[] {
  const { agentName, days, limit = 100 } = options;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (agentName !== undefined) {
    conditions.push("agent_name = ?");
    params.push(agentName);
  }

  if (days !== undefined && days > 0) {
    conditions.push("started_at >= datetime('now', ? || ' days')");
    params.push(`-${days}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `
    SELECT id, agent_name, session_id, started_at, finished_at,
           summary, findings, actions_json, status
    FROM agent_work_log
    ${where}
    ORDER BY started_at DESC, id DESC
    LIMIT ?
  `;
  params.push(limit);

  return db
    .prepare<AgentWorkLogEntry, (string | number)[]>(sql)
    .all(...params);
}

// ─────────────────────────────────────────────────────────────────────────────
// purgeOldAgentWorkLogs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete agent work log rows older than `retentionDays` calendar days.
 *
 * Uses a strict less-than comparison: rows started exactly `retentionDays`
 * ago are kept. Only rows started before that threshold are removed.
 *
 * Intended to be called from a scheduled maintenance job to prevent unbounded
 * table growth.
 *
 * @param db            Database connection
 * @param retentionDays Number of days to retain (rows older than this are deleted)
 * @returns             Number of rows deleted
 */
export function purgeOldAgentWorkLogs(
  db: Database,
  retentionDays: number,
): number {
  const result = db
    .prepare(
      `DELETE FROM agent_work_log
       WHERE started_at < datetime('now', ? || ' days')`,
    )
    .run(`-${retentionDays}`);

  return result.changes;
}
