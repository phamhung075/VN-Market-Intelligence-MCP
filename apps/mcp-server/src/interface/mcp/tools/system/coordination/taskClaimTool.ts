/**
 * task_claim — Coordination Tools (Task-Lock System Phase 1, tool 1/6)
 *
 * Split out of coordinationTools.ts (FIX-CI-SIZELINT-COORDINATIONTOOLS-TS-457L) purely to
 * satisfy size-lint — zero logic change. Full family doc (session identity model, security
 * note) lives in the sibling module header: ../coordinationTools.ts.
 *
 * @module interface/mcp/tools/system/coordination/taskClaimTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  claimTask,
  type TaskKind,
} from "../../../../../infrastructure/db/coordinationStore.js";

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

/**
 * Register task_claim on the MCP server.
 *
 * @param server The McpServer instance to register the tool on.
 */
export function registerTaskClaimTool(server: McpServer): void {
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
        .union([z.string(), z.record(z.unknown())])
        .optional()
        .describe(
          "Optional context: {slot_id?, task_title?, row_hash?, notes?} — JSON string OR object, both accepted.",
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
        payload: typeof payload === "string" ? payload : payload === undefined ? null : JSON.stringify(payload), // union → TEXT
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
}
