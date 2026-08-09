/**
 * get_week_period — Coordination Tools (Task-Lock System Phase 1, tool 6/6)
 *
 * Split out of coordinationTools.ts (FIX-CI-SIZELINT-COORDINATIONTOOLS-TS-457L) purely to
 * satisfy size-lint — zero logic change. Grouped with the task-lock tools historically
 * because it shares the "coordination" registration entry point, not a task-lock behavior.
 *
 * @module interface/mcp/tools/system/coordination/weekPeriodTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getISOWeekPeriod } from "../../../../../domain/services/isoWeek.js";

// FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP (2026-06-14):
// ONE canonical ISO-week source for ALL guaranteed weekly slot publish-gate
// paths.  Both the CLI dispatcher and RemoteTrigger backstop MUST call this
// tool to obtain the week period before building the published-marker key.
// Keying on periodKey (date-range) not weekLabel prevents dedup failure when
// two paths compute divergent week-label strings for the same Sunday.

/**
 * Register get_week_period on the MCP server.
 *
 * @param server The McpServer instance to register the tool on.
 */
export function registerWeekPeriodTool(server: McpServer): void {
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
