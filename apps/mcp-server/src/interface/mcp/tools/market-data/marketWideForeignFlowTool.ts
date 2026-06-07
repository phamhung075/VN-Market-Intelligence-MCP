/**
 * MSG-1 — get_market_foreign_flow MCP Tool
 *
 * Provides the `get_market_foreign_flow` tool for reading market-wide
 * aggregated foreign investor flow from the daily_ohlcv table.
 *
 * Data source: daily_ohlcv rows where foreign_buy_vol / foreign_sell_vol /
 * foreign_net_vol are populated (written by the VPS push-foreign-flow pipeline
 * via ohlcvForeignFlowStore). SUM across all tickers on a given trading date
 * yields the market-wide aggregate.
 *
 * Limitation note (honest): daily_ohlcv only contains foreign flow data for
 * tickers that the push-foreign-flow pipeline has processed (currently the
 * watchlist set). It is NOT a full-exchange aggregate. The tool declares this
 * clearly in its output so callers can reason about coverage.
 *
 * DDD layer: interface/mcp/tools — may import infrastructure and domain.
 *
 * @module interface/mcp/tools/market-data/marketWideForeignFlowTool
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface DailyAggrRow {
  date: string;
  total_buy: number;
  total_sell: number;
  total_net: number;
  ticker_count: number;
}

interface TickerFlowRow {
  code: string;
  date: string;
  foreign_buy_vol: number;
  foreign_sell_vol: number;
  foreign_net_vol: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format volume as human-readable string (millions or thousands of shares).
 */
function fmtVol(vol: number): string {
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}k`;
  return String(Math.round(vol));
}

/**
 * Format net volume with sign prefix. Uses absolute value for fmtVol
 * so that negative volumes format correctly (e.g. -100_000 → "-100.0k").
 */
function fmtNet(vol: number): string {
  return `${vol >= 0 ? "+" : "-"}${fmtVol(Math.abs(vol))}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core query functions (exported for testability)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query market-wide foreign flow aggregates for the last N trading dates
 * that have foreign flow data.
 *
 * @param db   - Database instance
 * @param days - Number of trading dates to return (default 1 = latest session only)
 * @returns    - Array of daily aggregate rows, most-recent first
 */
export function queryMarketWideForeignFlow(
  db: Database,
  days = 1,
): DailyAggrRow[] {
  const rows = db
    .prepare<DailyAggrRow, [number]>(
      `SELECT
         date,
         COALESCE(SUM(foreign_buy_vol),  0) AS total_buy,
         COALESCE(SUM(foreign_sell_vol), 0) AS total_sell,
         COALESCE(SUM(foreign_net_vol),  0) AS total_net,
         COUNT(*)                           AS ticker_count
       FROM daily_ohlcv
       WHERE foreign_net_vol IS NOT NULL
       GROUP BY date
       HAVING COUNT(*) > 0
       ORDER BY date DESC
       LIMIT ?`,
    )
    .all(days);

  return rows;
}

/**
 * Query top-N net buyers and sellers for a given trading date.
 *
 * @param db      - Database instance
 * @param date    - Trading date string (YYYY-MM-DD)
 * @param topN    - How many tickers to return per side (default 5)
 * @returns       - { topBuyers, topSellers }
 */
export function queryTopFlowTickers(
  db: Database,
  date: string,
  topN = 5,
): { topBuyers: TickerFlowRow[]; topSellers: TickerFlowRow[] } {
  const topBuyers = db
    .prepare<TickerFlowRow, [string, number]>(
      `SELECT code, date,
              COALESCE(foreign_buy_vol,  0) AS foreign_buy_vol,
              COALESCE(foreign_sell_vol, 0) AS foreign_sell_vol,
              COALESCE(foreign_net_vol,  0) AS foreign_net_vol
       FROM daily_ohlcv
       WHERE date = ? AND foreign_net_vol IS NOT NULL
       ORDER BY foreign_net_vol DESC
       LIMIT ?`,
    )
    .all(date, topN);

  const topSellers = db
    .prepare<TickerFlowRow, [string, number]>(
      `SELECT code, date,
              COALESCE(foreign_buy_vol,  0) AS foreign_buy_vol,
              COALESCE(foreign_sell_vol, 0) AS foreign_sell_vol,
              COALESCE(foreign_net_vol,  0) AS foreign_net_vol
       FROM daily_ohlcv
       WHERE date = ? AND foreign_net_vol IS NOT NULL
       ORDER BY foreign_net_vol ASC
       LIMIT ?`,
    )
    .all(date, topN);

  return { topBuyers, topSellers };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the get_market_foreign_flow tool on an McpServer instance.
 *
 * @param server - The McpServer instance to register tools on.
 * @param db     - Optional database injection (defaults to getDb() for production).
 */
export function registerMarketWideForeignFlowTool(
  server: McpServer,
  db?: Database,
): void {
  server.tool(
    "get_market_foreign_flow",
    "Market-wide foreign flow aggregate (SUM across all tracked tickers from daily_ohlcv). " +
      "Distinct from get_foreign_flow which returns per-ticker foreign flow from vnstock_trading_stats. " +
      "Source tier: 2 (aggregator — SUM of foreign_buy_vol/sell_vol/net_vol from daily_ohlcv, " +
      "written by the VPS push-foreign-flow pipeline). " +
      "COVERAGE NOTE: Only covers tickers in the watchlist set (not full exchange) — " +
      "ticker_count per session is returned so callers can evaluate coverage. " +
      "Returns the latest N trading sessions (default 1 = latest only) plus top-N net buyers/sellers. " +
      "Package destination: market-analyst or ops. " +
      "If no foreign flow data has been ingested yet, returns a clear no-data message.",
    {
      days: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .default(1)
        .describe("Number of most-recent trading sessions to aggregate (1–30, default 1 = latest only)"),
      top_n: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .default(5)
        .describe("Number of top net-buyer and net-seller tickers to include for the latest session (1–20, default 5)"),
    },
    async ({ days, top_n }) => {
      try {
        const resolvedDb = db ?? getDb();
        const resolvedDays = days ?? 1;
        const resolvedTopN = top_n ?? 5;

        // ── Query aggregate rows ──────────────────────────────────────────────
        const aggRows = queryMarketWideForeignFlow(resolvedDb, resolvedDays);

        if (aggRows.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                source_tier: 2,
                coverage_note: "Covers watchlist tickers only — not full exchange.",
                note:
                  "No foreign flow data available. " +
                  "Data is populated by the VPS push-foreign-flow pipeline. " +
                  "Check back after the pipeline has run at least one trading session.",
              }, null, 2),
            }],
          };
        }

        // ── Query top-N tickers for the most-recent session ───────────────────
        const latestDate = aggRows[0]!.date;
        const { topBuyers, topSellers } = queryTopFlowTickers(resolvedDb, latestDate, resolvedTopN);

        // ── Build output lines ────────────────────────────────────────────────
        const lines: string[] = [];
        lines.push("Market-Wide Foreign Flow Summary");
        lines.push("================================");
        lines.push(`Coverage: watchlist tickers only (not full exchange) — ticker_count per session shown`);
        lines.push("");

        for (const row of aggRows) {
          const netLabel = row.total_net >= 0 ? "NET BUY" : "NET SELL";
          lines.push(`Date: ${row.date}  (${row.ticker_count} tickers)`);
          lines.push(`  Foreign Buy:  ${fmtVol(row.total_buy)}`);
          lines.push(`  Foreign Sell: ${fmtVol(row.total_sell)}`);
          lines.push(`  Net:          ${fmtNet(row.total_net)}  → ${netLabel}`);
          lines.push("");
        }

        // Top-N for latest session
        if (topBuyers.length > 0 || topSellers.length > 0) {
          lines.push(`Top ${resolvedTopN} Net Buyers — ${latestDate}`);
          if (topBuyers.length === 0) {
            lines.push("  (no data)");
          } else {
            for (const t of topBuyers) {
              lines.push(`  ${t.code.padEnd(8)} net: ${fmtNet(t.foreign_net_vol)}  buy: ${fmtVol(t.foreign_buy_vol)}  sell: ${fmtVol(t.foreign_sell_vol)}`);
            }
          }
          lines.push("");

          lines.push(`Top ${resolvedTopN} Net Sellers — ${latestDate}`);
          if (topSellers.length === 0) {
            lines.push("  (no data)");
          } else {
            for (const t of topSellers) {
              lines.push(`  ${t.code.padEnd(8)} net: ${fmtNet(t.foreign_net_vol)}  buy: ${fmtVol(t.foreign_buy_vol)}  sell: ${fmtVol(t.foreign_sell_vol)}`);
            }
          }
        }

        const result = {
          source_tier: 2,
          coverage_note: "Covers watchlist tickers only — not full exchange.",
          text: lines.join("\n"),
          latest_date: latestDate,
          sessions_returned: aggRows.length,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[get_market_foreign_flow] Error:", msg);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              source_tier: 2,
              coverage_note: "Covers watchlist tickers only — not full exchange.",
              error: `Error retrieving market-wide foreign flow: ${msg}`,
            }, null, 2),
          }],
        };
      }
    },
  );
}
