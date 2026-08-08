/**
 * Scheduled Task Store — ST-3 (Deferred Task Scheduler)
 * size-justification: 259L — 10 single-purpose CRUD functions over one
 * `scheduled_tasks` table (ST-3 query/mutation surface); each function is a
 * single prepared statement + try/catch, further split fragments one
 * cohesive table-access module for no benefit.
 *
 * DB-backed query/mutation surface for the `scheduled_tasks` table
 * (coordination.db). Split out of coordinationStore.ts
 * (FIX-CI-SIZELINT-COORDINATIONSTORE-BASELINE-1388L, 2026-08-08) as a
 * cohesive module: every function below operates on an already-open
 * `Database` handle passed in by the caller — none of them touch
 * coordinationStore's private task_locks singleton — so the scheduled_tasks
 * access layer was always structurally independent of the task_locks
 * coordination logic; it was only ever co-located historically.
 *
 * Table DDL (CREATE TABLE scheduled_tasks + indexes) still lives in
 * coordinationStore.ts's ensureCoordinationTable() — both tables share one
 * coordination.db and one startup migration pass, so splitting the DDL out
 * would fragment a single-transaction startup contract for no benefit. This
 * file is ONLY the query/mutation surface (ST-3).
 *
 * These are internal helpers (NOT registered as MCP tools directly) —
 * called by the gateway-registered MCP tool wrappers in
 * scheduledTaskTools.ts (which ARE registered — see scheduledTaskTools.ts
 * § Privileged Gateway Tools).
 *
 * Re-exported from coordinationStore.ts (`export * from "./scheduledTaskStore.js"`)
 * so existing call sites (scheduledTaskTools.ts, scheduledTasks.test.ts,
 * coordinationStore.test.ts) that import scheduled-task functions from
 * coordinationStore.js keep working unchanged.
 *
 * Layer: infrastructure/db — SQLite access only, no domain imports.
 */

import { Database } from "bun:sqlite";

/** Scheduled task row shape returned from queries. */
export interface ScheduledTaskRow {
  id: string;
  agent: string;
  team: string;
  intent: string;
  prompt: string;
  fire_at: number;
  deadline_at: number | null;
  dedup_key: string | null;
  reason: string;
  origin_ref: string | null;
  max_attempts: number;
  attempts: number;
  status: string;
  created_at: number;
  fired_at: number | null;
  sweep_tick: string | null;
  error: string | null;
}

/**
 * ST-3: Atomic pending→firing flip for all due rows.
 *
 * Single-statement UPDATE...RETURNING — atomic on WAL-mode SQLite.
 * SCAR AC-1: nowEpoch MUST be a bound INTEGER parameter (Math.floor(Date.now()/1000)).
 *            NEVER use datetime() or string comparison.
 * SCAR AC-3: After this call, callers MUST check deadline_at before routing
 *            (deadline check done by the MCP tool wrapper or sweeper Step 0b.3).
 *
 * Returns only rows that were just claimed (status flipped from pending→firing).
 * Each row can only be claimed once (status='pending' is the exclusive gate).
 */
export function claimDueScheduledTasks(
  db: Database,
  nowEpoch: number,
): ScheduledTaskRow[] {
  try {
    const rows = db
      .prepare(
        `UPDATE scheduled_tasks
           SET status   = 'firing',
               fired_at = ?,
               attempts = attempts + 1
         WHERE status = 'pending'
           AND fire_at <= ?
         RETURNING id, agent, team, intent, prompt, fire_at, deadline_at, dedup_key,
                   reason, origin_ref, max_attempts, attempts, status, created_at,
                   fired_at, sweep_tick, error`,
      )
      .all(nowEpoch, nowEpoch) as ScheduledTaskRow[];
    return rows;
  } catch (err) {
    console.error("[scheduledTaskStore] claimDueScheduledTasks error", err);
    return [];
  }
}

/**
 * ST-3: Mark a scheduled task as fired (success path).
 * Terminal state for MVP (D1: done is reserved for Phase-2 confirmation callback).
 */
export function completeScheduledTask(
  db: Database,
  id: string,
  status: "fired" | "done",
  sweepTick?: string,
): void {
  try {
    db.prepare(
      `UPDATE scheduled_tasks SET status = ?, sweep_tick = ? WHERE id = ?`,
    ).run(status, sweepTick ?? null, id);
  } catch (err) {
    console.error("[scheduledTaskStore] completeScheduledTask error", err);
  }
}

/**
 * ST-3: Mark a scheduled task as expired (deadline gate).
 */
export function expireScheduledTask(db: Database, id: string, sweepTick?: string): void {
  try {
    db.prepare(
      `UPDATE scheduled_tasks SET status = 'expired', sweep_tick = ? WHERE id = ?`,
    ).run(sweepTick ?? null, id);
  } catch (err) {
    console.error("[scheduledTaskStore] expireScheduledTask error", err);
  }
}

/**
 * ST-3: Mark a scheduled task as failed (routing error path).
 */
export function failScheduledTask(
  db: Database,
  id: string,
  error: string,
  sweepTick?: string,
): void {
  try {
    db.prepare(
      `UPDATE scheduled_tasks SET status = 'failed', error = ?, sweep_tick = ? WHERE id = ?`,
    ).run(error, sweepTick ?? null, id);
  } catch (err) {
    console.error("[scheduledTaskStore] failScheduledTask error", err);
  }
}

/**
 * ST-3: Cancel a scheduled task by id (status → 'cancelled').
 * Returns true if a row was actually updated.
 */
export function cancelScheduledTaskById(db: Database, id: string): boolean {
  try {
    const result = db.prepare(
      `UPDATE scheduled_tasks
         SET status = 'cancelled'
       WHERE id = ?
         AND status IN ('pending','firing')`,
    ).run(id);
    return result.changes === 1;
  } catch (err) {
    console.error("[scheduledTaskStore] cancelScheduledTaskById error", err);
    return false;
  }
}

/**
 * Get the current status + id of a scheduled task by dedup_key.
 * Returns null if not found.
 */
export function getScheduledTaskByDedupKey(
  db: Database,
  dedupKey: string,
): Pick<ScheduledTaskRow, "id" | "status"> | null {
  try {
    return db
      .prepare(`SELECT id, status FROM scheduled_tasks WHERE dedup_key = ?`)
      .get(dedupKey) as Pick<ScheduledTaskRow, "id" | "status"> | null;
  } catch (err) {
    console.error("[scheduledTaskStore] getScheduledTaskByDedupKey error", err);
    return null;
  }
}

/**
 * Get a scheduled task row by id.
 * Returns null if not found.
 */
export function getScheduledTaskById(
  db: Database,
  id: string,
): ScheduledTaskRow | null {
  try {
    return db
      .prepare(`SELECT * FROM scheduled_tasks WHERE id = ?`)
      .get(id) as ScheduledTaskRow | null;
  } catch (err) {
    console.error("[scheduledTaskStore] getScheduledTaskById error", err);
    return null;
  }
}

/** Insert a new scheduled task row (used by schedule_task MCP tool). */
export function insertScheduledTask(
  db: Database,
  row: Omit<ScheduledTaskRow, "attempts" | "status" | "fired_at" | "sweep_tick" | "error">,
): void {
  db.prepare(`
    INSERT INTO scheduled_tasks
      (id, agent, team, intent, prompt, fire_at, deadline_at, dedup_key,
       reason, origin_ref, max_attempts, attempts, status, created_at,
       fired_at, sweep_tick, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?, NULL, NULL, NULL)
  `).run(
    row.id, row.agent, row.team, row.intent, row.prompt,
    row.fire_at, row.deadline_at ?? null, row.dedup_key ?? null,
    row.reason, row.origin_ref ?? null, row.max_attempts, row.created_at,
  );
}

/** List scheduled tasks with optional filters (AC-10 audit). */
export function listScheduledTasksDb(
  db: Database,
  filter?: {
    status?: string;
    team?: string;
    due_before?: number;
    limit?: number;
  },
): ScheduledTaskRow[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter?.status) {
    conditions.push("status = ?");
    params.push(filter.status);
  }
  if (filter?.team) {
    conditions.push("team = ?");
    params.push(filter.team);
  }
  if (filter?.due_before !== undefined) {
    conditions.push("fire_at <= ?");
    params.push(filter.due_before);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitVal = Math.min(filter?.limit ?? 50, 500);

  return db
    .prepare(`
      SELECT id, agent, team, intent, prompt, fire_at, deadline_at, dedup_key,
             reason, origin_ref, max_attempts, attempts, status, created_at,
             fired_at, sweep_tick, error
      FROM scheduled_tasks
      ${where}
      ORDER BY fire_at ASC
      LIMIT ?
    `)
    .all(...params, limitVal) as ScheduledTaskRow[];
}
