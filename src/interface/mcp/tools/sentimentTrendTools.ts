/**
 * Task 225 — Sentiment Trend MCP Tool
 *
 * Interface layer: registers the `get_sentiment_trend` tool on a McpServer.
 *
 * The tool:
 *   1. Queries `rag_analyses` WHERE affected_actions LIKE '%stock_code%'
 *      AND created_at >= N days ago.
 *   2. Calls `computeSentimentTrend` (domain service) with the results.
 *   3. Returns a formatted Vietnamese plain-text output.
 *
 * Supports `_testDb` injection for in-memory SQLite in tests — no network or
 * filesystem access is required during the test suite.
 *
 * @module interface/mcp/tools/sentimentTrendTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Database } from "bun:sqlite";

import { computeSentimentTrend } from "../../../domain/services/sentimentTrend.js";
import { getDb } from "../../../infrastructure/db/schema.js";
import { logger } from "../../../infrastructure/logger.js";

// ─── Internal DB row type ────────────────────────────────────────────────────

interface RagRow {
  sentiment: string | null;
  created_at: string;
}

// ─── Helper: query rag_analyses for a stock ──────────────────────────────────

/**
 * Fetches all sentiment entries for `stockCode` within the last `windowDays`
 * calendar days from the `rag_analyses` table.
 *
 * Uses LIKE '%code%' on `affected_actions` (JSON string array stored as TEXT).
 * Parameterised query — no SQL injection risk.
 *
 * Returns an empty array on any error (table missing in fresh DBs, etc.).
 */
function fetchSentimentEntries(
  db: Database,
  stockCode: string,
  windowDays: number,
): Array<{ sentiment: string; createdAt: string }> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (windowDays - 1));
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  try {
    const rows = db
      .query<RagRow, [string, string]>(
        `SELECT sentiment, created_at
         FROM   rag_analyses
         WHERE  affected_actions LIKE ?
           AND  created_at >= ?
         ORDER BY created_at ASC`,
      )
      .all(`%${stockCode}%`, cutoffStr);

    return rows.map((r) => ({
      sentiment: r.sentiment ?? "neutral",
      createdAt: r.created_at,
    }));
  } catch (err) {
    logger.warn("[sentimentTrendTools] DB query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ─── Formatter ───────────────────────────────────────────────────────────────

/**
 * Renders the SentimentTrend as the Vietnamese plain-text table shown in the
 * task specification:
 *
 * ```
 * Xu huong tam ly VNM (7 ngay)
 *
 * Ngay  | Tin | Tich cuc | Tieu cuc | Trung lap | Diem
 * 01/04 | 5   | 60%      | 20%      | 20%       | +2
 * ...
 *
 * Xu huong: DANG CAI THIEN (slope: +0.42)
 * Tom tat: VNM co xu huong tich cuc ...
 * ```
 */
function formatTrendOutput(
  trend: ReturnType<typeof computeSentimentTrend>,
): string {
  const lines: string[] = [];

  lines.push(`Xu huong tam ly ${trend.code} (${trend.windowDays} ngay)`);
  lines.push("");

  if (trend.dailyBreakdown.length === 0) {
    lines.push(`Khong co du lieu cam tinh cho ${trend.code} trong ${trend.windowDays} ngay qua.`);
    lines.push("");
    lines.push(`Tom tat: ${trend.summary}`);
    return lines.join("\n");
  }

  // Header
  lines.push("Ngay   | Tin  | Tich cuc | Tieu cuc | Trung lap | Diem");
  lines.push("-------|------|----------|----------|-----------|-----");

  for (const day of trend.dailyBreakdown) {
    // Format date as DD/MM
    const [year, month, dom] = day.date.split("-");
    const dateFmt = `${dom}/${month}`;

    const pctBullish = day.total > 0 ? Math.round((day.bullish / day.total) * 100) : 0;
    const pctBearish = day.total > 0 ? Math.round((day.bearish / day.total) * 100) : 0;
    const pctNeutral = day.total > 0 ? Math.round((day.neutral / day.total) * 100) : 0;
    const scoreStr = day.netScore >= 0 ? `+${day.netScore}` : `${day.netScore}`;

    lines.push(
      `${dateFmt.padEnd(6)} | ${String(day.total).padEnd(4)} | ` +
        `${(pctBullish + "%").padEnd(8)} | ` +
        `${(pctBearish + "%").padEnd(8)} | ` +
        `${(pctNeutral + "%").padEnd(9)} | ${scoreStr}`,
    );
    void year; // suppress unused-var lint — year extracted for destructuring but unused
  }

  lines.push("");

  // Trend direction label
  const dirLabel =
    trend.trendDirection === "improving"
      ? "DANG CAI THIEN"
      : trend.trendDirection === "deteriorating"
        ? "DANG XAU DI"
        : "ON DINH";

  const slopeSign = trend.slope >= 0 ? "+" : "";
  lines.push(`Xu huong: ${dirLabel} (slope: ${slopeSign}${trend.slope.toFixed(2)})`);
  lines.push(`Tom tat: ${trend.summary}`);

  return lines.join("\n");
}

// ─── Tool registration ────────────────────────────────────────────────────────

/**
 * Registers the `get_sentiment_trend` MCP tool on `server`.
 *
 * @param server  - The McpServer instance to register on.
 * @param _testDb - Optional injected Database for tests (bypasses `getDb()`).
 */
export function registerSentimentTrendTools(
  server: McpServer,
  _testDb?: Database,
): void {
  server.tool(
    "get_sentiment_trend",
    "Show sentiment trend for a stock over N days based on past analyses",
    {
      stock_code: z.string().optional().describe("Stock code (e.g. 'VNM'). Alias: 'symbol'."),
      symbol: z.string().optional().describe("Stock code alias for stock_code (cross-tool consistency)."),
      window_days: z.coerce
        .number()
        .min(1)
        .max(30)
        .optional()
        .default(7)
        .describe("Rolling window in calendar days (1–30, default 7)"),
    },
    async ({ stock_code, symbol, window_days }) => {
      const db = _testDb ?? getDb();
      const windowDays = window_days ?? 7;
      const raw = stock_code ?? symbol;
      if (!raw) {
        return {
          content: [{ type: "text" as const, text: "Error: stock_code (or symbol) is required" }],
        };
      }
      const code = raw.toUpperCase().trim();

      try {
        const entries = fetchSentimentEntries(db, code, windowDays);
        const trend = computeSentimentTrend(entries, code, windowDays);
        const text = formatTrendOutput(trend);

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        logger.error("[get_sentiment_trend] Failed", {
          code,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error computing sentiment trend for ${code}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
