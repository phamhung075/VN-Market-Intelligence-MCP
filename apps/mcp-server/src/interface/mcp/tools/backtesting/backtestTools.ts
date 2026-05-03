/**
 * backtestTools.ts — Task 1842d
 *
 * MCP tool #120: run_backtest
 *
 * Registers the run_backtest tool on an McpServer instance.
 * Tool slot #120 — confirmed unregistered before this task.
 *
 * Layer: interface/mcp/tools — imports application use case + infrastructure impls.
 * Must NOT import infrastructure directly for domain logic; delegates to runBacktest.
 *
 * @module interface/mcp/tools/backtesting/backtestTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { SqliteBacktestSignalRepository } from "../../../../infrastructure/db/backtestSignalRepo.js";
import { SqliteBacktestPriceRepository } from "../../../../infrastructure/db/backtestPriceRepo.js";
import { SqliteBacktestResultRepository } from "../../../../infrastructure/db/backtestResultRepo.js";
import { runBacktest } from "../../../../application/usecases/runBacktest.js";
import { BacktestStrategyNotFoundError } from "../../../../domain/backtesting/strategyRegistry.js";

export function registerBacktestTools(server: McpServer): void {
  server.tool(
    "run_backtest",
    "Replay historical trading signals against actual OHLCV prices to compute strategy performance metrics. " +
      "Returns portfolio return, max drawdown, Sharpe ratio, win rate, and a per-ticker breakdown. " +
      "Requires at least 6 months of OHLCV data for statistically meaningful results — run ohlcv_backfill first if data is sparse. " +
      "Only 1 backtest can run at a time per server instance.",
    {
      strategy: z
        .enum([
          "kinh-dich-high-confidence",
          "kinh-dich-all",
          "combined-high-confidence",
        ])
        .describe(
          "Strategy ID to backtest. " +
            "'kinh-dich-high-confidence' = Kinh Dich BUY/SELL signals with confidence >= 0.7. " +
            "'kinh-dich-all' = all Kinh Dich BUY/SELL signals regardless of confidence. " +
            "'combined-high-confidence' = Kinh Dich + TA confirmation (Phase 3, currently alias for high-confidence).",
        ),
      start_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Backtest start date in YYYY-MM-DD format (inclusive)."),
      end_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Backtest end date in YYYY-MM-DD format (inclusive)."),
      tickers: z
        .array(z.string().min(2).max(10))
        .optional()
        .describe(
          "Optional list of ticker codes to restrict the backtest to (e.g. [\"VCB\", \"HPG\"]). " +
            "Defaults to all tickers present in the signal data for the requested date range.",
        ),
    },
    async ({ strategy, start_date, end_date, tickers }) => {
      try {
        const db = getDb();
        const signalRepo = new SqliteBacktestSignalRepository(db);
        const priceRepo = new SqliteBacktestPriceRepository(db);
        const resultRepo = new SqliteBacktestResultRepository(db);

        const params = {
          strategy,
          startDate: start_date,
          endDate: end_date,
          ...(tickers !== undefined ? { tickers } : {}),
        };

        const result = await runBacktest(params, { signalRepo, priceRepo, resultRepo });

        // Mutex busy — string return
        if (typeof result === "string") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: result }, null, 2),
              },
            ],
          };
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        if (err instanceof BacktestStrategyNotFoundError) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: err.message }, null, 2),
              },
            ],
          };
        }
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: `Backtest failed: ${message}` }, null, 2),
            },
          ],
        };
      }
    },
  );
}
