/**
 * Coordination Tools — Task-Lock System Phase 1
 *
 * 5 MCP tools for cross-session agent coordination:
 *   1. task_claim              — Claim a lock before exclusive work
 *   2. task_heartbeat          — Renew a held lock (prove-alive)
 *   3. task_release            — Release a lock on completion
 *   4. task_list_held          — List current locks for debugging
 *   5. task_force_release_orphan — Release a stale orphaned lock
 *
 * Session identity model (P1-MCP-2 / P1-MCP-3, CROSS-SESSION-MULTI-TEAM-ORCH):
 *   owner_client_session (AUTHORITATIVE): per-CLAUDE_CODE_SESSION_ID UUID.
 *     Supplied by the CALLER via the tool input field; NOT injected server-side.
 *     This is the ownership discriminator that makes cross-session collision prevention
 *     work correctly when multiple Claude Code terminals run the same logical agent.
 *
 *   owner_session (DIAGNOSTIC): server-side process discriminator (pid + boot timestamp).
 *     Server-injected for diagnostics only. MUST NOT be used as the ownership key.
 *
 * Security note:
 *   owner_client_session is a coordination PARAMETER agreed to among cooperative
 *   internal agents. It is NEVER logged or echoed as a credential.
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
import {
  getISOWeekPeriod,
  buildWeeklyPublishMarkerKey,
} from "../../../../domain/services/isoWeek.js";

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
      "the claim succeeded and, on failure, who currently holds the lock (including " +
      "their owner_client_session for cross-session diagnosis). " +
      "Use before any work that must not run concurrently across multiple Claude Code sessions. " +
      "Kinds: cowork-slot (15-min scheduler slots), sprint-task (orch-state.json .task_board rows), " +
      "dashboard-row (orch-state.json .signal_queue rows), " +
      "commit-mutex (fleet-wide git index critical section — task_id='commit-mutex:main', ttl_seconds=60), " +
      "intent (router pre-claim gate — CLAUDE.md step 2.5 dispatch-claim SKILL), " +
      "orphan-signal (P1.5 reaper — emit only, no manual caller), " +
      "session-presence (P2 roster liveness probe — inert, no caller yet). " +
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
        .enum(["cowork-slot", "sprint-task", "dashboard-row", "commit-mutex", "intent", "orphan-signal", "session-presence"])
        .describe(
          "Lock category. One of: cowork-slot | sprint-task | dashboard-row | commit-mutex | " +
            "intent | orphan-signal | session-presence. " +
            "intent = router pre-claim gate (CLAUDE.md step 2.5); " +
            "orphan-signal = P1.5 reaper (no manual caller); " +
            "session-presence = P2 liveness probe (inert, no caller yet).",
        ),
      owner_agent: z
        .string()
        .min(1)
        .describe(
          "Agent name claiming this lock, e.g. 'cowork-team', 'dev-mcp-server', 'alert-commander'",
        ),
      owner_client_session: z
        .string()
        .describe(
          "P1-FINAL (TASK_1980): REQUIRED. CLAUDE_CODE_SESSION_ID of the calling terminal. " +
            "SOLE ownership discriminator — pass $CLAUDE_CODE_SESSION_ID. " +
            "Enables per-session collision prevention across parallel terminals running the same agent.",
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
    async ({ task_id, task_kind, owner_agent, owner_client_session, ttl_seconds, payload }) => {
      const result = claimTask({
        task_id,
        task_kind: task_kind as TaskKind,
        owner_session: SERVER_SESSION_ID,   // diagnostic only — NOT the ownership key
        owner_agent,
        owner_client_session,              // REQUIRED (P1-FINAL) — Zod validates presence
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
      "Returns ok=false if the lock was not found, already expired, or was stolen by another session (crash recovery). " +
      "If ok=false mid-task: commit safe partial state, send BUG telegram, EXIT — do not fight the steal. " +
      "P1-FINAL (TASK_1980): match is SOLELY on owner_client_session (per-session UUID). " +
      "Fallback rungs removed — wrong session cannot renew another session's lock.",
    {
      task_id: z
        .string()
        .min(1)
        .describe("The task_id of the lock to heartbeat. Must match what was passed to task_claim."),
      owner_client_session: z
        .string()
        .describe(
          "P1-FINAL (TASK_1980): REQUIRED. CLAUDE_CODE_SESSION_ID of the calling terminal. " +
            "Must match the value passed to task_claim. " +
            "Wrong session returns ok=false (anti-theft).",
        ),
    },
    async ({ task_id, owner_client_session }) => {
      const result = heartbeatTask(task_id, owner_client_session);
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
      "Scoped solely to owner_client_session — cannot release another session's lock. " +
      "P1-FINAL (TASK_1980): returns {ok:true, released:1} on success; {ok:true, released:0} when the lock " +
      "was not found, wrong owner, or already expired/stolen (clean no-op, NOT an error — " +
      "TTL expiry is the fallback recovery). {ok:false} only on DB error. Safe to call in finally blocks.",
    {
      task_id: z
        .string()
        .min(1)
        .describe("The task_id of the lock to release. Must match what was passed to task_claim."),
      owner_client_session: z
        .string()
        .describe(
          "P1-FINAL (TASK_1980): REQUIRED. CLAUDE_CODE_SESSION_ID of the calling terminal. " +
            "Must match the value passed to task_claim. " +
            "Wrong session returns {ok:true, released:0} (no-op, anti-theft).",
        ),
    },
    async ({ task_id, owner_client_session }) => {
      const result = releaseTask(task_id, owner_client_session);
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
        .enum(["cowork-slot", "sprint-task", "dashboard-row", "commit-mutex", "intent", "orphan-signal", "session-presence"])
        .optional()
        .describe("Filter by task_kind. Omit to return all kinds (7 total)."),
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

      // AC-FUNC-02 FIX: normalize field names to contract spec.
      // Contract expects `owner` (alias of owner_agent) and `expires_at` as ISO string.
      // Keep owner_agent for backward compat; add owner alongside.
      // expires_at in DB is Unix epoch (integer seconds) — convert to ISO-8601 string.
      const normalizedLocks = result.locks.map((lock) => ({
        ...lock,
        owner: lock.owner_agent,
        expires_at: new Date(lock.expires_at * 1000).toISOString(),
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ locks: normalizedLocks, count: result.count }),
          },
        ],
      };
    },
  );

  // ── task_force_release_orphan ────────────────────────────────────────────
  server.tool(
    "task_force_release_orphan",
    "Force-release a coordination lock whose heartbeat has gone stale (process died without releasing). " +
      "P1-FINAL (TASK_1980): ownership is checked SOLELY via owner_client_session. " +
      "Safe to call when heartbeat_at is stale — the call is a no-op when a live session " +
      "holds the lock (fresh heartbeat ≤ orphan_threshold_seconds old). " +
      "SAFETY: only releases when ownership matches AND heartbeat_at is older than the threshold. " +
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
      owner_client_session: z
        .string()
        .describe(
          "P1-FINAL (TASK_1980): REQUIRED. CLAUDE_CODE_SESSION_ID that originally claimed the lock. " +
            "SOLE ownership match — must match the value from the original task_claim call.",
        ),
      owner_agent: z
        .string()
        .min(1)
        .optional()
        .describe(
          "DEPRECATED (P1-FINAL): ignored by the store; accepted for backward compat only. " +
            "Ownership is now discriminated solely by owner_client_session.",
        ),
      orphan_threshold_seconds: z
        .number()
        .int()
        .min(120)
        .optional()
        .describe(
          "Heartbeat age in seconds above which a lock is considered orphaned. " +
            "Default: 600 (10 min). Minimum: 120 (enforced server-side). " +
            "Locks with heartbeat_age ≤ threshold are NOT released (live-session safety).",
        ),
    },
    async ({ task_id, owner_client_session, orphan_threshold_seconds }) => {
      const result = releaseOrphanTask(
        task_id,
        owner_client_session,
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

  // ── get_week_period ──────────────────────────────────────────────────────
  // FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP (2026-06-14):
  // ONE canonical ISO-week source for ALL guaranteed weekly slot publish-gate
  // paths.  Both the CLI dispatcher and RemoteTrigger backstop MUST call this
  // tool to obtain the week period before building the published-marker key.
  // Keying on periodKey (date-range) not weekLabel prevents dedup failure when
  // two paths compute divergent week-label strings for the same Sunday.
  server.tool(
    "get_week_period",
    "Return the ISO-8601 week period for a given UTC instant (defaults to now). " +
      "FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP: ALL guaranteed weekly slot publish-gate paths " +
      "MUST obtain the week period from this single tool — never compute it locally. " +
      "Use `periodKey` (date-range format YYYY-MM-DD/YYYY-MM-DD) as the published-marker " +
      "task_id suffix, NOT `weekLabel`.  A one-label divergence between two dispatch paths " +
      "(e.g. W24 vs W25 for the same Sunday) cannot defeat dedup when both paths key on " +
      "the same period date-range.\n\n" +
      "Example: published:digest-sunday:2026-06-08/2026-06-14\n\n" +
      "weekLabel is provided for human-readable logging only.",
    {
      iso_timestamp: z
        .string()
        .optional()
        .describe(
          "UTC timestamp in ISO-8601 format (e.g. '2026-06-14T13:47:00Z'). " +
            "Defaults to the current server time. " +
            "Inject a fixed timestamp in tests for deterministic results.",
        ),
    },
    async ({ iso_timestamp }) => {
      const date = iso_timestamp ? new Date(iso_timestamp) : new Date();
      const period = getISOWeekPeriod(date);

      // Include the ready-made publish-marker key suffix for convenience.
      // Agents still build the full task_id as:
      //   "published:" + slotId + ":" + period.periodKey
      // but we also return the helper output for callers that pass a slot_id.
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              ...period,
              _note:
                "Use periodKey as the published-marker task_id suffix (not weekLabel). " +
                "e.g. task_id: 'published:digest-sunday:' + periodKey",
            }),
          },
        ],
      };
    },
  );
}
