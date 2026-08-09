/**
 * task_force_release_orphan — Coordination Tools (Task-Lock System Phase 1, tool 5/6)
 *
 * Split out of coordinationTools.ts (FIX-CI-SIZELINT-COORDINATIONTOOLS-TS-457L) purely to
 * satisfy size-lint — zero logic change. Full family doc (session identity model, security
 * note) lives in the sibling module header: ../coordinationTools.ts.
 *
 * @module interface/mcp/tools/system/coordination/taskForceReleaseOrphanTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { releaseOrphanTask } from "../../../../../infrastructure/db/coordinationStore.js";

/**
 * Register task_force_release_orphan on the MCP server.
 *
 * @param server The McpServer instance to register the tool on.
 */
export function registerTaskForceReleaseOrphanTool(server: McpServer): void {
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
}
