/**
 * task_release — Coordination Tools (Task-Lock System Phase 1, tool 3/6)
 *
 * Split out of coordinationTools.ts (FIX-CI-SIZELINT-COORDINATIONTOOLS-TS-457L) purely to
 * satisfy size-lint — zero logic change. Full family doc (session identity model, security
 * note) lives in the sibling module header: ../coordinationTools.ts.
 *
 * @module interface/mcp/tools/system/coordination/taskReleaseTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { releaseTask } from "../../../../../infrastructure/db/coordinationStore.js";

/**
 * Register task_release on the MCP server.
 *
 * @param server The McpServer instance to register the tool on.
 */
export function registerTaskReleaseTool(server: McpServer): void {
  server.tool(
    "task_release",
    "Release a coordination lock on task completion. " +
      "Default (Rung A) scoped solely to owner_client_session — cannot release another session's lock. " +
      "P1-FINAL (TASK_1980): returns {ok:true, released:1} on success; {ok:true, released:0} when the lock " +
      "was not found, wrong owner, or already expired/stolen (clean no-op, NOT an error — " +
      "TTL expiry is the fallback recovery). {ok:false} only on DB error. Safe to call in finally blocks. " +
      "FR-2 (FIX-ORPHAN-FR1-FR2-INFRA-HEARTBEAT-LADDER): an ADDITIVE Rung B null-session ladder exists for " +
      "orphan-signal rows only — see owner_agent/original_owner_client_session below.",
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
      owner_agent: z
        .string()
        .optional()
        .describe(
          "FR-2 null-session orphan-signal ladder ONLY — do NOT set for normal live-session releases. " +
            "Live-session locks (owner_client_session NOT NULL) always release via owner_client_session " +
            "alone and never consult this field. Supply together with original_owner_client_session to " +
            "release an orphan-signal:* row (owner_client_session column is NULL on those rows by design, " +
            "server-reaper-owned) — must equal the row's own owner_agent.",
        ),
      original_owner_client_session: z
        .string()
        .optional()
        .describe(
          "FR-2 null-session orphan-signal ladder ONLY — do NOT set for normal live-session releases. " +
            "Supply together with owner_agent; must echo payload.original_owner_client_session recorded " +
            "on the orphan-signal row (read via the read-only task_list_held probe). Ignored for any row " +
            "whose own owner_client_session column is NOT NULL — cannot be used to bypass Rung A anti-theft.",
        ),
    },
    async ({ task_id, owner_client_session, owner_agent, original_owner_client_session }) => {
      const result = releaseTask(task_id, owner_client_session, {
        ...(owner_agent !== undefined ? { owner_agent } : {}),
        ...(original_owner_client_session !== undefined ? { original_owner_client_session } : {}),
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
