/**
 * Task 1102 — get_cron_health MCP tool
 *
 * Registers one MCP tool:
 *   1. get_cron_health — per-job cron health summary for the past N days
 *
 * Delegates to `getCronJobHealthSummary` from cronJobRunStore (Task 1100).
 * Follows DDD layering: interface layer imports only from infrastructure/.
 *
 * @module interface/mcp/tools/cronHealthTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Database } from "bun:sqlite";

import {
  getCronJobHealthSummary,
  type CronJobHealthSummary,
} from "../../../../infrastructure/db/cronJobRunStore.js";
import { getDb } from "../../../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a single CronJobHealthSummary into a human-readable block.
 *
 * Example output:
 *   pollNewsJob
 *     last_run:      2026-04-11T08:32:00
 *     last_status:   success
 *     success_rate:  0.87 (87%)
 *     total_runs:    23
 *     avg_duration:  412 ms
 */
function formatJobHealth(h: CronJobHealthSummary): string {
  const successPct = (h.success_rate_7d * 100).toFixed(1);
  const lines: string[] = [
    h.job_name,
    `  last_run:      ${h.last_run}`,
    `  last_status:   ${h.last_status}`,
    `  last_error:    ${h.last_error ?? "(none)"}`,
    `  success_rate:  ${h.success_rate_7d.toFixed(2)} (${successPct}%)`,
    `  total_runs:    ${h.total_runs_7d}`,
    `  avg_duration:  ${Math.round(h.avg_duration_ms)} ms`,
  ];
  return lines.join("\n");
}

/**
 * Format the full health report text for one or more jobs.
 *
 * @param summaries  Array returned by getCronJobHealthSummary
 * @param days       Window used (for the header)
 * @returns          Plain-text formatted report
 */
function formatHealthReport(
  summaries: CronJobHealthSummary[],
  days: number,
): string {
  if (summaries.length === 0) {
    return `No cron job data found in the last ${days} day(s).`;
  }

  const header = `=== CRON JOB HEALTH (last ${days} day(s)) ===`;
  const body = summaries.map(formatJobHealth).join("\n\n");
  return `${header}\n\n${body}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register cron health MCP tools.
 *
 * Registers: get_cron_health
 *
 * @param server  The McpServer instance to register tools on.
 * @param _db     Optional Database override (used in tests for in-memory DB).
 *                When omitted, the production DB from getDb() is used.
 */
export function registerCronHealthTools(
  server: McpServer,
  _db?: Database,
): void {
  // ── get_cron_health ───────────────────────────────────────────────────────
  server.tool(
    "get_cron_health",
    "Returns per-job health summary: success rate, total runs, avg duration, last status " +
      "for the past N days. Use job_name to filter to a single job.",
    {
      days: z
        .number()
        .int()
        .min(1)
        .max(90)
        .default(7)
        .describe(
          "Rolling window in days to aggregate stats over (default: 7, max: 90)",
        ),
      job_name: z
        .string()
        .optional()
        .describe(
          "Filter to a single job by its canonical scheduler name " +
            "(e.g. 'pollNewsJob'). Omit to return all jobs.",
        ),
    },
    async ({ days, job_name }) => {
      try {
        const db = _db ?? getDb();
        const resolvedDays = days ?? 7;

        const summaries = getCronJobHealthSummary(
          db,
          resolvedDays,
          job_name,
        );

        const text = formatHealthReport(summaries, resolvedDays);

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        console.error("[get_cron_health] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `get_cron_health failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
