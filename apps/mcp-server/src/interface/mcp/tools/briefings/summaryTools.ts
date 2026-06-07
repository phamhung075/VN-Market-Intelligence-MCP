/**
 * Task 130 — Market Summary MCP Tools
 *
 * Interface layer: registers two MCP tools on a McpServer instance.
 *
 * Tools registered:
 *   1. get_market_summary      — retrieve a stored summary for a given period
 *   2. generate_market_summary — force-generate (and store) a fresh summary
 *
 * @module interface/mcp/tools/summaryTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { initDatabase } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";
import {
  generatePeriodicSummary,
  type PeriodType,
} from "../../../../application/usecases/generatePeriodicSummary.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD_TYPES = ["daily", "weekly", "monthly", "quarterly", "yearly"] as const;

/**
 * Parse an optional date string into a Date object.
 * Accepts ISO 8601 strings or YYYY-MM-DD. Defaults to now.
 */
function parseDate(dateStr?: string): Date {
  if (!dateStr) return new Date();
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return new Date();
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register market summary MCP tools: get_market_summary, generate_market_summary.
 *
 * @param server - The McpServer instance to register tools on.
 */
export function registerSummaryTools(server: McpServer): void {

  // ── 1. get_market_summary ──────────────────────────────────────────────────
  server.tool(
    "get_market_summary",
    "Read-cache-first periodic market intelligence summary — returns existing cached summary if present, " +
      "falls back to generation only when no cached record exists. " +
      "Caching semantics: cache-first (reuses generated summary across requests for the same period). " +
      "Consumer: digest-predict daily flows that value cached consistency over fresh regeneration. " +
      "Distinct from generate_market_summary which always force-regenerates (bypass cache). " +
      "Period types: daily/weekly/monthly/quarterly/yearly.",
    {
      period: z
        .enum(PERIOD_TYPES)
        .describe("Period granularity: 'daily', 'weekly', 'monthly', 'quarterly', or 'yearly'"),
      date: z
        .string()
        .optional()
        .describe(
          "ISO date string (e.g. '2026-03-15') for any day within the desired period. " +
            "Defaults to today.",
        ),
    },
    async ({ period, date }) => {
      try {
        await initDatabase();

        const { getDb } = await import("../../../../infrastructure/db/schema.js");
        const db = getDb();
        const refDate = parseDate(date);

        // Compute period_start to look up cached record
        const { getPeriodDateRange } = await import(
          "../../../../application/usecases/generatePeriodicSummary.js"
        );
        const range = getPeriodDateRange(period as PeriodType, refDate);

        // Check for existing stored summary
        interface StoredRow {
          summary_text: string;
          period_type: string;
          period_start: string;
          period_end: string;
          news_count: number;
          alert_count: number;
          report_count: number;
          updated_at: string;
        }

        const stored = db
          .query<StoredRow, [string, string]>(
            `SELECT summary_text, period_type, period_start, period_end,
                    news_count, alert_count, report_count, updated_at
             FROM market_summaries
             WHERE period_type = ? AND period_start = ?`,
          )
          .get(period, range.start);

        if (stored) {
          const lines = [
            stored.summary_text,
            "",
            `[Cached — last updated: ${stored.updated_at}]`,
          ];
          return {
            content: [{ type: "text" as const, text: lines.join("\n") }],
          };
        }

        // No cached record — generate now
        logger.info("[get_market_summary] no cached summary, generating", { period, date: range.start });
        const summary = await generatePeriodicSummary(period as PeriodType, refDate, db);

        return {
          content: [{ type: "text" as const, text: summary.summaryText }],
        };
      } catch (err) {
        logger.error("[get_market_summary] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving market summary: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 2. generate_market_summary ─────────────────────────────────────────────
  server.tool(
    "generate_market_summary",
    "Force-regenerate market summary — always regenerates fresh (bypasses cache). " +
      "Does not read existing cached summary; always generates new analysis and overwrites the stored record. " +
      "Consumer: digest-predict weekly flows that require fresh analysis over cached data. " +
      "Distinct from get_market_summary which is cache-first (returns cached if present). " +
      "Returns the newly generated plain-language summary text.",
    {
      period: z
        .enum(PERIOD_TYPES)
        .describe("Period granularity: 'daily', 'weekly', 'monthly', 'quarterly', or 'yearly'"),
      date: z
        .string()
        .optional()
        .describe(
          "ISO date string (e.g. '2026-03-15') for any day within the desired period. " +
            "Defaults to today.",
        ),
    },
    async ({ period, date }) => {
      try {
        await initDatabase();

        const { getDb } = await import("../../../../infrastructure/db/schema.js");
        const db = getDb();
        const refDate = parseDate(date);

        logger.info("[generate_market_summary] generating", { period, refDate: refDate.toISOString() });

        const summary = await generatePeriodicSummary(period as PeriodType, refDate, db);

        const lines = [
          summary.summaryText,
          "",
          `[Generated: ${new Date().toISOString()}]`,
        ];

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[generate_market_summary] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error generating market summary: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
