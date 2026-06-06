/**
 * Coordination Tools — Task-Lock System Phase 1
 *
 * 4 MCP tools for cross-session agent coordination:
 *   1. task_claim        — Claim a lock before exclusive work
 *   2. task_heartbeat    — Renew a held lock (prove-alive)
 *   3. task_release      — Release a lock on completion
 *   4. task_list_held    — List current locks for debugging
 *
 * Session UUID injection:
 *   owner_session is stamped server-side from the MCP transport session context.
 *   Agents pass owner_agent (their name); the server adds owner_session.
 *
 *   The McpServer SDK does not expose a stable per-call session ID via
 *   RequestHandlerExtra in the current version. As a safe fallback, we derive
 *   a stable discriminator from process.pid + server startup timestamp.
 *   This correctly discriminates between different OS processes (terminal sessions)
 *   while being deterministic within a single process lifetime.
 *
 *   Phase 2: when the SDK exposes sessionId on RequestHandlerExtra, replace
 *   SERVER_SESSION_ID with the per-request transport session UUID.
 *
 * Security note (brief §6):
 *   owner_session is NEVER taken from caller input — always server-injected.
 *   Callers pass owner_agent only. This prevents session spoofing.
 *
 * @module interface/mcp/tools/system/coordinationTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  claimTask,
  heartbeatTask,
  releaseTask,
  listHeldTasks,
  releaseOrphanTask,
  type TaskKind,
} from "../../../../infrastructure/db/coordinationStore.js";

// ---------------------------------------------------------------------------
// Server-side session discriminator
//
// Stable within this process; distinct from other OS processes (sessions).
// A new Claude Code terminal = new process = new pid = different discriminator.
// ---------------------------------------------------------------------------

const SERVER_SESSION_ID: string = (() => {
  const pid = process.pid;
  const startMs = Date.now();
  // Format: "pid-<pid>-ts-<startupTimestamp>" — human-readable for BUG logs
  return `pid-${pid}-ts-${startMs}`;
})();

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register all 5 coordination tools on the MCP server.
 *
 * @param server The McpServer instance to register tools on.
 */
export function registerCoordinationTools(server: McpServer): void {

  // ── task_claim ──────────────────────────────────────────────────────────
  server.tool(
    "task_claim",
    "Claim a coordination lock before starting exclusive work. Returns whether " +
      "the claim succeeded and, on failure, who currently holds the lock. " +
      "Use before any work that must not run concurrently across multiple Claude Code sessions: " +
      "cowork-slot (15-min scheduler slots), sprint-task (orch-state.json .task_board rows), dashboard-row (orch-state.json .signal_queue rows), " +
      "commit-mutex (fleet-wide git index critical section — task_id must be 'commit-mutex:main', ttl_seconds=60). " +
      "Call task_release when work completes. Call task_heartbeat every 5 min for long tasks.",
    {
      task_id: z
        .string()
        .min(1)
        .describe(
          "Globally unique lock ID. Format per §1: cowork-slot:<slot_id>:<nominal_tick>, " +
            "task:<task_id>, dash:<recipient>:<row_id>",
        ),
      task_kind: z
        .enum(["cowork-slot", "sprint-task", "dashboard-row", "commit-mutex"])
        .describe("Lock category. One of: cowork-slot | sprint-task | dashboard-row | commit-mutex"),
      owner_agent: z
        .string()
        .min(1)
        .describe(
          "Agent name claiming this lock, e.g. 'cowork-team', 'dev-mcp-server', 'alert-commander'",
        ),
      ttl_seconds: z
        .number()
        .int()
        .min(60)
        .max(691200)
        .optional()
        .describe(
          "Lock TTL in seconds. Default: 3600 (1h). Min: 60. Max: 691200 (8 days for weekly published markers). " +
            "Use 900 for cowork-slot (one scheduler cycle), 3600 for sprint-task.",
        ),
      payload: z
        .string()
        .optional()
        .describe(
          "Optional JSON string with context: {slot_id?, task_title?, row_hash?, notes?}",
        ),
    },
    async ({ task_id, task_kind, owner_agent, ttl_seconds, payload }) => {
      const result = claimTask({
        task_id,
        task_kind: task_kind as TaskKind,
        owner_session: SERVER_SESSION_ID,
        owner_agent,
        ...(ttl_seconds !== undefined ? { ttl_seconds } : {}),
        payload: payload ?? null,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  // ── task_heartbeat ──────────────────────────────────────────────────────
  server.tool(
    "task_heartbeat",
    "Renew a held lock to prove the owning agent is still alive. " +
      "Call every 5 minutes during long-running tasks. " +
      "A missed heartbeat after ttl_seconds allows the next claimer to steal the lock. " +
      "Returns ok=false if the lock was not found, already expired, or was stolen by another agent (crash recovery). " +
      "If ok=false mid-task: commit safe partial state, send BUG telegram, EXIT — do not fight the steal. " +
      "FIX-CWK-LEADER-LOCK-REBIND: match is now on owner_agent (stable across server restarts) not server session id.",
    {
      task_id: z
        .string()
        .min(1)
        .describe("The task_id of the lock to heartbeat. Must match what was passed to task_claim."),
      owner_agent: z
        .string()
        .min(1)
        .optional()
        .describe(
          "RECOMMENDED — pass your agent name to survive server restarts. " +
            "Legacy calls without it match on the claim-time server session and go zombie after a restart " +
            "(deprecated migration path). Must match the owner_agent from the original task_claim call.",
        ),
    },
    async ({ task_id, owner_agent }) => {
      // New path: owner_agent provided → stable across server restarts.
      // Legacy path: absent → fall back to this process's SERVER_SESSION_ID (zombie after restart).
      const result = heartbeatTask(task_id, owner_agent, SERVER_SESSION_ID);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  // ── task_release ────────────────────────────────────────────────────────
  server.tool(
    "task_release",
    "Release a coordination lock on task completion. " +
      "Scoped to the calling owner_agent — cannot release another agent's lock. " +
      "Returns ok=false if the lock was not found or already expired/stolen (not an error — " +
      "TTL expiry is the fallback recovery). Safe to call in finally blocks. " +
      "FIX-CWK-LEADER-LOCK-REBIND: match is now on owner_agent (stable across server restarts) not server session id.",
    {
      task_id: z
        .string()
        .min(1)
        .describe("The task_id of the lock to release. Must match what was passed to task_claim."),
      owner_agent: z
        .string()
        .min(1)
        .optional()
        .describe(
          "RECOMMENDED — pass your agent name to survive server restarts. " +
            "Legacy calls without it match on the claim-time server session and go zombie after a restart " +
            "(deprecated migration path). Must match the owner_agent from the original task_claim call.",
        ),
    },
    async ({ task_id, owner_agent }) => {
      // New path: owner_agent provided → stable across server restarts.
      // Legacy path: absent → fall back to this process's SERVER_SESSION_ID (zombie after restart).
      const result = releaseTask(task_id, owner_agent, SERVER_SESSION_ID);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  // ── task_list_held ──────────────────────────────────────────────────────
  server.tool(
    "task_list_held",
    "List currently held task locks. For debugging, auditing, and stale-lock monitoring. " +
      "Does not modify any locks. Use to inspect which sessions are active and what work is claimed.",
    {
      kind: z
        .enum(["cowork-slot", "sprint-task", "dashboard-row", "commit-mutex"])
        .optional()
        .describe("Filter by task_kind. Omit to return all kinds."),
      owner_agent: z
        .string()
        .optional()
        .describe("Filter by owner_agent name. Omit to return all agents."),
      expired: z
        .boolean()
        .optional()
        .describe(
          "If true, return only locks where expires_at < now (stale locks). " +
            "If false, return only active locks. Omit to return all.",
        ),
    },
    async ({ kind, owner_agent, expired }) => {
      const result = listHeldTasks({
        ...(kind !== undefined ? { kind } : {}),
        ...(owner_agent !== undefined ? { owner_agent } : {}),
        ...(expired !== undefined ? { expired } : {}),
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  // ── task_force_release_orphan ────────────────────────────────────────────
  server.tool(
    "task_force_release_orphan",
    "Force-release a coordination lock whose heartbeat has gone stale (process died without releasing). " +
      "Intended for the leader-lock orphan-steal recovery path: after a mcp-server restart, " +
      "the new process cannot heartbeat the old process's lock because SERVER_SESSION_ID changed. " +
      "Safe to call when heartbeat_at is stale — the call is a no-op when a live session " +
      "holds the lock (fresh heartbeat ≤ orphan_threshold_seconds old). " +
      "SAFETY: only releases when owner_agent matches AND heartbeat_at is older than the threshold. " +
      "A live concurrent session always heartbeats within the threshold window and is never stolen from. " +
      "After a successful release (released:true), re-claim normally with task_claim.",
    {
      task_id: z
        .string()
        .min(1)
        .describe(
          "The task_id of the lock to release if orphaned. " +
            "Typically 'cowork-leader' for the leader-lock recovery path.",
        ),
      owner_agent: z
        .string()
        .min(1)
        .describe(
          "Agent name that originally claimed the lock. " +
            "Only locks with a matching owner_agent are eligible for orphan-release " +
            "(prevents cross-agent theft).",
        ),
      orphan_threshold_seconds: z
        .number()
        .int()
        .min(120)
        .optional()
        .describe(
          "Heartbeat age in seconds above which a lock is considered orphaned. " +
            "Default: 600 (10 min). Minimum: 120 (enforced server-side). " +
            "A lock whose heartbeat_at is older than this threshold and whose " +
            "owner_agent matches will be deleted. " +
            "Locks with heartbeat_age ≤ threshold are NOT released (live-session safety).",
        ),
    },
    async ({ task_id, owner_agent, orphan_threshold_seconds }) => {
      const result = releaseOrphanTask(
        task_id,
        owner_agent,
        orphan_threshold_seconds ?? 600,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );
}
