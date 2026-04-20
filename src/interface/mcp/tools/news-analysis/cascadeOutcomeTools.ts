/**
 * Cascade Outcome MCP Tool — Task 1504
 *
 * Exposes cascade rule hit outcome data for signal quality review.
 * Outcome columns (price_impact_3d/7d, outcome_correct) are populated
 * asynchronously by the Sprint 192 backtest cron — NULL means pending.
 *
 * Tool: get_cascade_outcomes
 *   Params: days (1–90, default 30), ticker (optional string filter)
 *   Returns: formatted table + JSON rows ordered by hit_at DESC, max 200 rows
 *
 * Layer: interface/mcp/tools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "bun:sqlite";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CascadeOutcomeRow {
  id: number;
  ruleKey: string;
  hitAt: string;
  ticker: string | null;
  priceImpact3d: number | null;
  priceImpact7d: number | null;
  outcomeCorrect: 0 | 1 | null;
  confidence: number | null;
  sourceRagId: string | null;
}

// ─── Query helper (exported for unit tests) ────────────────────────────────────

export function queryCascadeOutcomes(
  db: Database,
  params: { days: number; ticker?: string },
): CascadeOutcomeRow[] {
  const { days, ticker } = params;

  let sql = `
    SELECT
      id,
      rule_key,
      hit_at,
      affected_stocks,
      price_impact_3d,
      price_impact_7d,
      outcome_correct,
      confidence,
      source_rag_id
    FROM cascade_rule_hits
    WHERE hit_at >= datetime('now', '-' || ? || ' days')
  `;
  const bindings: (number | string)[] = [days];

  if (ticker) {
    sql += ` AND affected_stocks LIKE ?`;
    bindings.push(`%${ticker}%`);
  }

  sql += ` ORDER BY hit_at DESC LIMIT 200`;

  const rows = db.prepare(sql).all(...bindings) as {
    id: number;
    rule_key: string;
    hit_at: string;
    affected_stocks: string | null;
    price_impact_3d: number | null;
    price_impact_7d: number | null;
    outcome_correct: 0 | 1 | null;
    confidence: number | null;
    source_rag_id: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    ruleKey: r.rule_key,
    hitAt: r.hit_at,
    ticker: r.affected_stocks,
    priceImpact3d: r.price_impact_3d,
    priceImpact7d: r.price_impact_7d,
    outcomeCorrect: r.outcome_correct,
    confidence: r.confidence,
    sourceRagId: r.source_rag_id,
  }));
}

// ─── Format helper ─────────────────────────────────────────────────────────────

export function formatCascadeOutcomes(rows: CascadeOutcomeRow[], days: number): string {
  const lines: string[] = [];
  lines.push(`Cascade Outcomes — Last ${days} days\n`);

  if (rows.length === 0) {
    lines.push("No cascade hits recorded in this window.");
    return lines.join("\n");
  }

  const hdr = [
    "ID".padEnd(6),
    "Rule".padEnd(24),
    "Hit At".padEnd(20),
    "Ticker".padEnd(16),
    "Impact 3d".padStart(10),
    "Impact 7d".padStart(10),
    "Correct".padStart(8),
    "Conf%".padStart(7),
  ].join(" ");
  lines.push(hdr);
  lines.push("─".repeat(hdr.length));

  for (const r of rows) {
    lines.push(
      [
        String(r.id).padEnd(6),
        r.ruleKey.padEnd(24),
        r.hitAt.padEnd(20),
        (r.ticker ?? "—").padEnd(16),
        (r.priceImpact3d !== null ? `${r.priceImpact3d.toFixed(2)}%` : "pending").padStart(10),
        (r.priceImpact7d !== null ? `${r.priceImpact7d.toFixed(2)}%` : "pending").padStart(10),
        (r.outcomeCorrect !== null ? (r.outcomeCorrect === 1 ? "yes" : "no") : "pending").padStart(8),
        (r.confidence !== null ? `${(r.confidence * 100).toFixed(0)}%` : "—").padStart(7),
      ].join(" "),
    );
  }

  return lines.join("\n");
}

// ─── Tool registration ─────────────────────────────────────────────────────────

export function registerCascadeOutcomeTools(server: McpServer): void {
  server.tool(
    "get_cascade_outcomes",
    "Get cascade rule hits with outcome data (price impact 3d/7d, correct/wrong). NULL outcome = pending backtest. Use for signal quality review.",
    {
      days: z.coerce
        .number()
        .int()
        .min(1)
        .max(90)
        .default(30)
        .describe("Look-back window in days (default 30)"),
      ticker: z
        .string()
        .optional()
        .describe("Filter by ticker code (matches affected_stocks LIKE %ticker%)"),
    },
    async ({ days, ticker }) => {
      try {
        const db = getDb();
        const queryParams: { days: number; ticker?: string } = { days };
        if (ticker !== undefined) queryParams.ticker = ticker;
        const rows = queryCascadeOutcomes(db, queryParams);
        const text = formatCascadeOutcomes(rows, days);

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[get_cascade_outcomes] Error:", msg);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching cascade outcomes: ${msg}`,
            },
          ],
        };
      }
    },
  );
}
