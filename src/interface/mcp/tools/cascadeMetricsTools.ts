/**
 * Cascade Metrics MCP Tool — Task 247
 *
 * Exposes cascade rule hit rate data so the analysis team can see which
 * sector rules are firing (and which are dead / never triggered).
 *
 * Tool: get_cascade_metrics
 *   Params: days (number, default 30)
 *   Returns: formatted table of rule_key | hits | last_hit
 *            + "Dead rules" section listing rules with 0 hits
 *
 * Layer: interface/mcp/tools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../infrastructure/db/schema.js";
import { getHitMetrics, getDeadRules } from "../../../infrastructure/db/cascadeHitStore.js";

// ─── Known rule keys (derived from SECTOR_RULES in cascadeEngine.ts) ──────────
// Format: {domain}_{direction} — first matching rule per domain wins.
// Update this list when new rules are added to SECTOR_RULES.
export const KNOWN_CASCADE_RULE_KEYS: string[] = [
  "oil_gas_up",
  "oil_gas_down",
  "aviation_down",
  "banking_up",
  "real_estate_down",
  "banking_neutral",
  "real_estate_up",
  "steel_up",
  "steel_down",
  "securities_up",
  "securities_down",
];

// ─── Format helper ─────────────────────────────────────────────────────────────

/**
 * Format the cascade metrics as a plain-text table with a dead-rules section.
 */
export function formatCascadeMetrics(
  metrics: { ruleKey: string; hitCount: number; lastHit: string }[],
  deadRules: string[],
  days: number,
): string {
  const lines: string[] = [];

  lines.push(`Cascade Rule Metrics — Last ${days} days\n`);

  if (metrics.length === 0) {
    lines.push("No rule hits recorded in this window.");
  } else {
    lines.push(`${"Rule Key".padEnd(40)} ${"Hits".padStart(6)}  Last Hit`);
    lines.push("─".repeat(72));
    for (const m of metrics) {
      lines.push(
        `${m.ruleKey.padEnd(40)} ${String(m.hitCount).padStart(6)}  ${m.lastHit}`,
      );
    }
  }

  lines.push("");
  if (deadRules.length === 0) {
    lines.push(`Dead rules (0 hits in ${days} days): none`);
  } else {
    lines.push(`Dead rules (0 hits in ${days} days): ${deadRules.join(", ")}`);
  }

  return lines.join("\n");
}

// ─── Tool registration ─────────────────────────────────────────────────────────

/**
 * Register the get_cascade_metrics MCP tool.
 *
 * @param server - McpServer instance to register the tool on
 */
export function registerCascadeMetricsTools(server: McpServer): void {
  server.tool(
    "get_cascade_metrics",
    "Get cascade rule hit metrics: which sector rules fired and which are dead (never triggered). Useful for tuning the cascade engine.",
    {
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .default(30)
        .describe("Look-back window in days (default 30)"),
    },
    async ({ days }) => {
      try {
        const db = getDb();
        const metrics = getHitMetrics(db, days);
        const deadRules = getDeadRules(db, KNOWN_CASCADE_RULE_KEYS, days);
        const text = formatCascadeMetrics(metrics, deadRules, days);

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[get_cascade_metrics] Error:", msg);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching cascade metrics: ${msg}`,
            },
          ],
        };
      }
    },
  );
}
