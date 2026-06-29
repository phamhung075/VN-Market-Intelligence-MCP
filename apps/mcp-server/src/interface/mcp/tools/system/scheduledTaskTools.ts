/**
 * Scheduled Task MCP Tools — ST-2 (DEFERRED-TASK-SCHEDULER-MVP)
 *
 * Public surface (3 tools — registered in SKILL_MANIFEST public packages):
 *   schedule_task            — create a deferred one-shot task
 *   cancel_scheduled_task    — cancel a pending/firing task
 *   list_scheduled_tasks     — audit / query scheduled tasks (AC-10)
 *
 * Privileged gateway-only tools (4 helpers — registered in server but NOT in
 * public skill packages; accessible via gateway call_tool only — D2 mechanism):
 *   claim_due_scheduled_tasks  — atomic pending→firing sweep (cowork-team Step 0b.3)
 *   complete_scheduled_task    — mark fired/done after successful routing
 *   expire_scheduled_task      — mark expired after deadline gate
 *   fail_scheduled_task        — mark failed after routing error
 *
 * AC-9 HONEST CAVEAT (embedded in schedule_task description):
 *   "One-shots fire only while the cowork-team every-15-min loop is live (same
 *    property as all fleet crons today). Set deadline_at to bound staleness after
 *    downtime. True 24/7 headless firing is Phase-2."
 *
 * AC-12: schedule_task writes ONLY scheduled_tasks in coordination.db.
 *        NEVER touches orch-state.json at insert time.
 *
 * Layer: interface/mcp — NO domain imports. Uses infrastructure/db directly.
 */

import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ScheduledTaskRow } from "../../../../infrastructure/db/coordinationStore.js";
import {
  getCoordinationDbForScheduler,
  claimDueScheduledTasks,
  completeScheduledTask,
  expireScheduledTask,
  failScheduledTask,
  cancelScheduledTaskById,
  getScheduledTaskByDedupKey,
  getScheduledTaskById,
  insertScheduledTask,
  listScheduledTasksDb,
} from "../../../../infrastructure/db/coordinationStore.js";
import { resolveAgentTeam } from "./agentTeamMap.js";

// ─────────────────────────────────────────────────────────────────────────────
// Terminal states (D1 BINDING: 'fired' is the MVP terminal success state)
// 'done' stays in CHECK enum but is reserved for Phase-2 confirmation callback.
// ─────────────────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(["done", "failed", "expired", "cancelled", "fired"]);

// ─────────────────────────────────────────────────────────────────────────────
// Tool 1 (PUBLIC): schedule_task
// ─────────────────────────────────────────────────────────────────────────────

export function registerScheduleTaskTool(server: McpServer): void {
  server.tool(
    "schedule_task",
    `Schedule a one-shot deferred task to fire at a future time.

The task will be routed to the target agent's intake at or after fire_at:
  - COWORK agents → spawned by cowork-team Step 0b.3 sweeper (PRE-CLAIM intent gate)
  - DEV agents    → signal row emitted into orch-state signal_queue via orch-apply.sh

HONEST CAVEAT (AC-9): One-shots fire only while the cowork-team */15 loop is live
(same property as all fleet crons today). Set deadline_at to bound staleness after
downtime. True 24/7 headless firing is Phase-2.

Provide either fire_at (epoch-seconds UTC) or delay_seconds (shorthand). Not both.
Returns existing task id if dedup_key already exists for a non-terminal row (idempotent).`,
    {
      fire_at: z
        .number()
        .int()
        .optional()
        .describe("Epoch-seconds UTC when to fire (mutually exclusive with delay_seconds)"),
      delay_seconds: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Shorthand: fire_at = now + delay_seconds (mutually exclusive with fire_at)"),
      agent: z
        .string()
        .describe("Target agent id — must be a known agent in the roster"),
      intent: z
        .string()
        .max(80)
        .describe("Short snake_case label, ≤80 chars"),
      prompt: z
        .string()
        .describe("Full prompt/payload for spawn (COWORK) or signal body (DEV)"),
      deadline_at: z
        .number()
        .int()
        .optional()
        .describe("Epoch-seconds UTC hard cutoff — task expires if now > deadline_at at sweep time"),
      dedup_key: z
        .string()
        .optional()
        .describe("Idempotency key — collision returns existing row id with dedup_existed=true"),
      reason: z
        .string()
        .min(10)
        .describe("Human rationale ≥10 chars (audit log)"),
      origin_ref: z
        .string()
        .optional()
        .describe("Back-ref to triggering task/signal id (optional)"),
      max_attempts: z
        .number()
        .int()
        .positive()
        .optional()
        .default(1)
        .describe("Max sweep attempts (default 1; >1 reserved for Phase-2)"),
    },
    async ({
      fire_at,
      delay_seconds,
      agent,
      intent,
      prompt,
      deadline_at,
      dedup_key,
      reason,
      origin_ref,
      max_attempts = 1,
    }) => {
      const db = getCoordinationDbForScheduler();
      if (!db) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "db_unavailable" }) }],
          isError: true,
        };
      }

      const nowEpoch = Math.floor(Date.now() / 1000);

      // Validate fire_at XOR delay_seconds
      if (fire_at === undefined && delay_seconds === undefined) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "provide fire_at or delay_seconds" }) }],
          isError: true,
        };
      }
      if (fire_at !== undefined && delay_seconds !== undefined) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "provide fire_at OR delay_seconds, not both" }) }],
          isError: true,
        };
      }

      // Resolve fire_at
      const resolvedFireAt = fire_at ?? nowEpoch + delay_seconds!;

      // Reject past fire_at (>60s grace)
      if (resolvedFireAt < nowEpoch - 60) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "fire_at is in the past (>60s grace exceeded)" }) }],
          isError: true,
        };
      }

      // Validate agent (AC-8 fail-loud)
      const team = resolveAgentTeam(agent);
      if (!team) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: `unknown agent: ${agent}` }) }],
          isError: true,
        };
      }

      // Validate deadline_at > fire_at
      if (deadline_at !== undefined && deadline_at < resolvedFireAt) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "deadline_at must be after fire_at" }) }],
          isError: true,
        };
      }

      // Dedup check — return existing row if non-terminal (AC idempotency)
      if (dedup_key) {
        const existing = getScheduledTaskByDedupKey(db, dedup_key);
        if (existing && !TERMINAL_STATUSES.has(existing.status)) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                id: existing.id,
                status: existing.status,
                fire_at: resolvedFireAt,
                team,
                dedup_existed: true,
              }),
            }],
          };
        }
      }

      // Insert new row (AC-12: ONLY writes scheduled_tasks — never orch-state.json)
      const id = randomUUID();
      try {
        insertScheduledTask(db, {
          id,
          agent,
          team,
          intent: intent.slice(0, 80),
          prompt,
          fire_at: resolvedFireAt,
          deadline_at: deadline_at ?? null,
          dedup_key: dedup_key ?? null,
          reason,
          origin_ref: origin_ref ?? null,
          max_attempts,
          created_at: nowEpoch,
        });
      } catch (err) {
        console.error("[scheduledTaskTools] insertScheduledTask error", err);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "insert_failed", detail: String(err) }) }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            id,
            status: "pending",
            fire_at: resolvedFireAt,
            team,
            dedup_existed: false,
          }),
        }],
      };
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool 2 (PUBLIC): cancel_scheduled_task
// ─────────────────────────────────────────────────────────────────────────────

export function registerCancelScheduledTaskTool(server: McpServer): void {
  server.tool(
    "cancel_scheduled_task",
    "Cancel a pending or firing scheduled task by id or dedup_key. Terminal rows (done/failed/expired/cancelled/fired) cannot be cancelled.",
    {
      id: z.string().optional().describe("scheduled_tasks.id (UUID)"),
      dedup_key: z.string().optional().describe("Alternative lookup by dedup_key"),
    },
    async ({ id, dedup_key }) => {
      if (!id && !dedup_key) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, status: "missing_id_or_dedup_key" }) }],
          isError: true,
        };
      }

      const db = getCoordinationDbForScheduler();
      if (!db) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "db_unavailable" }) }],
          isError: true,
        };
      }

      // Resolve id from dedup_key if needed
      let resolvedId = id;
      if (!resolvedId && dedup_key) {
        const row = getScheduledTaskByDedupKey(db, dedup_key);
        if (!row) {
          return {
            content: [{ type: "text", text: JSON.stringify({ ok: false, status: "not_found" }) }],
          };
        }
        resolvedId = row.id;
        // Check terminal
        if (TERMINAL_STATUSES.has(row.status)) {
          return {
            content: [{ type: "text", text: JSON.stringify({ ok: false, status: "already_terminal" }) }],
          };
        }
      }

      // Verify row exists and status
      if (!resolvedId) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, status: "not_found" }) }],
        };
      }

      const existing = getScheduledTaskById(db, resolvedId);
      if (!existing) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, status: "not_found" }) }],
        };
      }
      if (TERMINAL_STATUSES.has(existing.status)) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, status: "already_terminal" }) }],
        };
      }

      const cancelled = cancelScheduledTaskById(db, resolvedId);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            cancelled
              ? { ok: true, status: "cancelled", id: resolvedId }
              : { ok: false, status: "not_found" },
          ),
        }],
      };
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool 3 (PUBLIC): list_scheduled_tasks
// AC-10: must return sweep_tick, fired_at, error, status for terminal rows
// ─────────────────────────────────────────────────────────────────────────────

export function registerListScheduledTasksTool(server: McpServer): void {
  server.tool(
    "list_scheduled_tasks",
    `List and audit scheduled tasks. Mirrors get_cron_health audit pattern.

Use list_scheduled_tasks({status: "fired"}) after a one-shot fires to verify it ran
(fired_at will be non-null). Use {status: "firing"} to find stuck rows for ops triage.
All time fields (fire_at, deadline_at, fired_at, created_at) are INTEGER epoch-seconds UTC.`,
    {
      status: z
        .enum(["pending", "firing", "fired", "done", "failed", "expired", "cancelled"])
        .optional()
        .describe("Filter by status"),
      team: z
        .enum(["COWORK", "DEV"])
        .optional()
        .describe("Filter by team"),
      due_before: z
        .number()
        .int()
        .optional()
        .describe("Filter: fire_at <= due_before (epoch-seconds UTC)"),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .default(50)
        .describe("Max rows to return (default 50, max 500)"),
    },
    async ({ status, team, due_before, limit = 50 }) => {
      const db = getCoordinationDbForScheduler();
      if (!db) {
        return {
          content: [{ type: "text", text: JSON.stringify({ tasks: [], count: 0, error: "db_unavailable" }) }],
        };
      }

      // Build filter omitting undefined values (exactOptionalPropertyTypes compat)
      const filter: { status?: string; team?: string; due_before?: number; limit?: number } = { limit };
      if (status !== undefined) filter.status = status;
      if (team !== undefined) filter.team = team;
      if (due_before !== undefined) filter.due_before = due_before;
      const rows = listScheduledTasksDb(db, filter);

      // Shape output per AC-10 (sweep_tick, fired_at, error, status required)
      const tasks = rows.map((r: ScheduledTaskRow) => ({
        id: r.id,
        agent: r.agent,
        team: r.team,
        intent: r.intent,
        status: r.status,
        fire_at: r.fire_at,
        deadline_at: r.deadline_at,
        fired_at: r.fired_at,
        sweep_tick: r.sweep_tick,
        attempts: r.attempts,
        error: r.error,
        reason: r.reason,
        origin_ref: r.origin_ref,
        created_at: r.created_at,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify({ tasks, count: tasks.length }) }],
      };
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Privileged gateway-only tools (D2 mechanism: registered in server, NOT in
// public skill packages — gateway call_tool bypasses skill filtering).
// Called by cowork-team Step 0b.3 sweeper via call_tool(server="vn-market", tool=<name>).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PRIVILEGED: claim_due_scheduled_tasks
 * Atomic pending→firing flip for all due rows. Called ONLY by cowork-team sweeper.
 * Returns claimed rows for routing in Step 0b.3.
 */
export function registerClaimDueScheduledTasksTool(server: McpServer): void {
  server.tool(
    "claim_due_scheduled_tasks",
    "[PRIVILEGED — cowork-team sweeper only] Atomic pending→firing claim for all due rows. Returns rows to route. NOT for public agent use.",
    {
      sweep_tick: z
        .string()
        .optional()
        .describe("Tick label for audit (e.g. '2026-07-30T18:15Z')"),
    },
    async ({ sweep_tick }) => {
      const db = getCoordinationDbForScheduler();
      if (!db) {
        return {
          content: [{ type: "text", text: JSON.stringify({ tasks: [], error: "db_unavailable" }) }],
        };
      }

      const nowEpoch = Math.floor(Date.now() / 1000);
      const rows = claimDueScheduledTasks(db, nowEpoch);

      // Annotate sweep_tick on claimed rows if provided (best-effort — main status
      // update happens via complete/expire/fail calls)
      if (sweep_tick && rows.length > 0) {
        const ids = rows.map((r) => r.id);
        for (const id of ids) {
          try {
            db.prepare(`UPDATE scheduled_tasks SET sweep_tick = ? WHERE id = ?`).run(sweep_tick, id);
          } catch { /* non-fatal */ }
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ tasks: rows, now_epoch: nowEpoch }) }],
      };
    },
  );
}

/**
 * PRIVILEGED: complete_scheduled_task
 * Mark a task as fired (success) or done (Phase-2). Called by sweeper after routing.
 * D1 BINDING: MVP success terminal = 'fired'. 'done' reserved for Phase-2.
 */
export function registerCompleteScheduledTaskTool(server: McpServer): void {
  server.tool(
    "complete_scheduled_task",
    "[PRIVILEGED — cowork-team sweeper only] Mark a scheduled task as fired or done after successful routing. NOT for public agent use.",
    {
      id: z.string().describe("scheduled_tasks.id (UUID)"),
      status: z
        .enum(["fired", "done"])
        .describe("Terminal status: 'fired' for MVP success (D1); 'done' reserved Phase-2"),
      sweep_tick: z.string().optional().describe("Tick label for audit"),
    },
    async ({ id, status, sweep_tick }) => {
      const db = getCoordinationDbForScheduler();
      if (!db) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "db_unavailable" }) }],
        };
      }
      completeScheduledTask(db, id, status, sweep_tick);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, id, status }) }] };
    },
  );
}

/**
 * PRIVILEGED: expire_scheduled_task
 * Mark a task as expired (deadline gate). Called by sweeper when deadline_at has passed.
 */
export function registerExpireScheduledTaskTool(server: McpServer): void {
  server.tool(
    "expire_scheduled_task",
    "[PRIVILEGED — cowork-team sweeper only] Mark a scheduled task as expired (deadline_at past). NOT for public agent use.",
    {
      id: z.string().describe("scheduled_tasks.id (UUID)"),
      sweep_tick: z.string().optional().describe("Tick label for audit"),
    },
    async ({ id, sweep_tick }) => {
      const db = getCoordinationDbForScheduler();
      if (!db) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "db_unavailable" }) }],
        };
      }
      expireScheduledTask(db, id, sweep_tick);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, id, status: "expired" }) }] };
    },
  );
}

/**
 * PRIVILEGED: fail_scheduled_task
 * Mark a task as failed (routing error). Called by sweeper catch block.
 */
export function registerFailScheduledTaskTool(server: McpServer): void {
  server.tool(
    "fail_scheduled_task",
    "[PRIVILEGED — cowork-team sweeper only] Mark a scheduled task as failed after routing error. NOT for public agent use.",
    {
      id: z.string().describe("scheduled_tasks.id (UUID)"),
      error: z.string().describe("Error message from routing failure"),
      sweep_tick: z.string().optional().describe("Tick label for audit"),
    },
    async ({ id, error, sweep_tick }) => {
      const db = getCoordinationDbForScheduler();
      if (!db) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "db_unavailable" }) }],
        };
      }
      failScheduledTask(db, id, error, sweep_tick);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, id, status: "failed" }) }] };
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined registrar for ALL scheduled task tools (public + privileged)
// Used in registry.ts — one entry for the full tool set.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register ALL 7 scheduled task tools (3 public + 4 privileged helpers).
 * Public tools (schedule_task, cancel_scheduled_task, list_scheduled_tasks)
 * are added to SKILL_MANIFEST packages in agentBootstrap.ts.
 * Privileged helpers (claim_due, complete, expire, fail) are NOT in any
 * skill package — reachable only via gateway call_tool wrapper (D2).
 */
export function registerScheduledTaskTools(server: McpServer): void {
  // Public tools
  registerScheduleTaskTool(server);
  registerCancelScheduledTaskTool(server);
  registerListScheduledTasksTool(server);
  // Privileged gateway-only helpers
  registerClaimDueScheduledTasksTool(server);
  registerCompleteScheduledTaskTool(server);
  registerExpireScheduledTaskTool(server);
  registerFailScheduledTaskTool(server);
}
