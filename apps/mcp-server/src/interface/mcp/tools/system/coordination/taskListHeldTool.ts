/**
 * task_list_held — Coordination Tools (Task-Lock System Phase 1, tool 4/6)
 *
 * Split out of coordinationTools.ts (FIX-CI-SIZELINT-COORDINATIONTOOLS-TS-457L) purely to
 * satisfy size-lint — zero logic change. Full family doc (session identity model, security
 * note) lives in the sibling module header: ../coordinationTools.ts.
 *
 * @module interface/mcp/tools/system/coordination/taskListHeldTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listHeldTasks } from "../../../../../infrastructure/db/coordinationStore.js";

/**
 * Register task_list_held on the MCP server.
 *
 * @param server The McpServer instance to register the tool on.
 */
export function registerTaskListHeldTool(server: McpServer): void {
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
      //
      // P1.5-MCP-4 (TASK_1985): add `created_at` alias for `claimed_at` so adopters
      // reading orphan-signal rows get the expected field name from the AC output spec.
      // `claimed_at` kept for backward compat; `created_at` is an additive alias.
      // `redispatch_count` is already present via `...lock` spread (LockRow column).
      const normalizedLocks = result.locks.map((lock) => ({
        ...lock,
        owner: lock.owner_agent,
        created_at: lock.claimed_at, // alias: same value as claimed_at (epoch seconds)
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
}
