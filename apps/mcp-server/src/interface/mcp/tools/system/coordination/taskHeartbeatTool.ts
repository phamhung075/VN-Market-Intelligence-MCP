/**
 * task_heartbeat — Coordination Tools (Task-Lock System Phase 1, tool 2/6)
 *
 * Split out of coordinationTools.ts (FIX-CI-SIZELINT-COORDINATIONTOOLS-TS-457L) purely to
 * satisfy size-lint — zero logic change. Full family doc (session identity model, security
 * note) lives in the sibling module header: ../coordinationTools.ts.
 *
 * @module interface/mcp/tools/system/coordination/taskHeartbeatTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { heartbeatTask } from "../../../../../infrastructure/db/coordinationStore.js";

/**
 * Register task_heartbeat on the MCP server.
 *
 * @param server The McpServer instance to register the tool on.
 */
export function registerTaskHeartbeatTool(server: McpServer): void {
  server.tool(
    "task_heartbeat",
    "Renew a held lock to prove the owning agent is still alive. " +
      "Call every 5 minutes during long-running tasks. " +
      "A missed heartbeat after ttl_seconds allows the next claimer to steal the lock. " +
      "Returns ok=false if the lock was not found, already expired, or was stolen by another session (crash recovery). " +
      "If ok=false mid-task: commit safe partial state, send BUG telegram, EXIT — do not fight the steal. " +
      "P1-FINAL (TASK_1980): default (Rung A) match is SOLELY on owner_client_session (per-session UUID). " +
      "Fallback rungs removed from Rung A — wrong session cannot renew another session's lock via owner_client_session alone. " +
      "FR-2 (FIX-ORPHAN-FR1-FR2-INFRA-HEARTBEAT-LADDER): an ADDITIVE Rung B null-session ladder exists for " +
      "orphan-signal rows only — see owner_agent/original_owner_client_session below.",
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
      ttl_seconds: z
        .number()
        .int()
        .min(60)
        .max(691200)
        .optional()
        .describe(
          "FR-1 (FIX-ORPHAN-FR1-FR2-INFRA-HEARTBEAT-LADDER): optional new TTL to persist on this " +
            "renewal, same bounds as task_claim (min 60, max 691200). Omit to reuse the lock's existing " +
            "ttl_seconds column unchanged — fully backward compatible.",
        ),
      payload_patch: z
        .union([z.string(), z.record(z.unknown())])
        .optional()
        .describe(
          "FR-1: optional patch shallow-merged into the lock's existing payload JSON on this " +
            "renewal (unpatched fields survive) — EITHER a JSON string OR a plain object, both " +
            "accepted (FIX-DISPATCHCLAIM-CARD-PAYLOAD-OBJECT-REJECTED-AND-PHASEA-OMITS-OWNER-AGENT, " +
            "family consistency with task_claim.payload). Malformed or absent existing payload is " +
            "handled non-fatally (patch alone becomes the new payload). Omit for no payload change.",
        ),
      owner_agent: z
        .string()
        .optional()
        .describe(
          "FR-2 null-session orphan-signal ladder ONLY — do NOT set for normal live-session heartbeats. " +
            "Live-session locks (owner_client_session NOT NULL) always renew via owner_client_session " +
            "alone and never consult this field. Supply together with original_owner_client_session to " +
            "renew an orphan-signal:* row (owner_client_session column is NULL on those rows by design, " +
            "server-reaper-owned) — must equal the row's own owner_agent.",
        ),
      original_owner_client_session: z
        .string()
        .optional()
        .describe(
          "FR-2 null-session orphan-signal ladder ONLY — do NOT set for normal live-session heartbeats. " +
            "Supply together with owner_agent; must echo payload.original_owner_client_session recorded " +
            "on the orphan-signal row (read via the read-only task_list_held probe). Ignored for any row " +
            "whose own owner_client_session column is NOT NULL — cannot be used to bypass Rung A anti-theft.",
        ),
    },
    async ({ task_id, owner_client_session, ttl_seconds, payload_patch, owner_agent, original_owner_client_session }) => {
      const result = heartbeatTask(task_id, owner_client_session, {
        ...(ttl_seconds !== undefined ? { ttl_seconds } : {}),
        // Union accepts a JSON string (status quo) OR a plain object (new) — normalize to the
        // TEXT-column storage format here, same boundary pattern as task_claim's payload.
        ...(payload_patch !== undefined
          ? { payload_patch: typeof payload_patch === "string" ? payload_patch : JSON.stringify(payload_patch) }
          : {}),
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
