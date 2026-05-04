/**
 * backtestTools.ts — Task 1842d / Task 1844a
 *
 * MCP tool #120: run_backtest
 * MCP tool #121: get_backtest_runs
 * MCP tool #122: get_backtest_run
 *
 * Registers backtest tools on an McpServer instance.
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

const STRATEGY_VALUES = [
  "kinh-dich-high-confidence",
  "kinh-dich-all",
  "combined-high-confidence",
] as const;

export function registerBacktestTools(server: McpServer): void {
  server.tool(
    "run_backtest",
    "Replay historical trading signals against actual OHLCV prices to compute strategy performance metrics. " +
      "Returns portfolio return, max drawdown, Sharpe ratio, win rate, and a per-ticker breakdown. " +
      "Requires at least 6 months of OHLCV data for statistically meaningful results — run ohlcv_backfill first if data is sparse. " +
      "Only 1 backtest can run at a time per server instance.",
    {
      strategy: z
        .enum(STRATEGY_VALUES)
        .describe(
          "Strategy ID to backtest. " +
            "'kinh-dich-high-confidence' = Kinh Dich BUY/SELL signals with confidence >= 0.7. " +
            "'kinh-dich-all' = all Kinh Dich BUY/SELL signals regardless of confidence. " +
            "'combined-high-confidence' = Kinh Dich high-confidence signals confirmed by TA direction (EMA-12/26 cross + RSI-14). BUY only when TA is BULLISH; SELL only when TA is BEARISH.",
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

export function registerBacktestQueryTools(server: McpServer): void {
  // Tool #121: get_backtest_runs — list recent backtest runs (summaries, no result_json)
  server.tool(
    "get_backtest_runs",
    "List recent backtest runs stored in the database. " +
      "Returns run summaries (id, strategy, dates, metrics) without the full result JSON. " +
      "Filter by strategy or retrieve all strategies. Sorted most-recent-first.",
    {
      strategy: z
        .enum(STRATEGY_VALUES)
        .optional()
        .describe(
          "Optional strategy filter. If omitted, returns runs for all strategies.",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Maximum number of runs to return (1–50). Default: 10."),
    },
    async ({ strategy, limit }) => {
      try {
        const db = getDb();
        const repo = new SqliteBacktestResultRepository(db);

        const runs = strategy
          ? repo.getRunsByStrategy(strategy, limit)
          : repo.getAllRuns(limit);

        if (runs.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "No backtest runs found" }, null, 2),
              },
            ],
          };
        }

        // Omit resultJson — too large for a listing view
        const summaries = runs.map(({ resultJson: _omit, ...summary }) => summary);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(summaries, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }, null, 2),
            },
          ],
        };
      }
    },
  );

  // Tool #122: get_backtest_run — retrieve a single run by ID (full record including result_json)
  server.tool(
    "get_backtest_run",
    "Retrieve a single backtest run by its UUID, including the full result JSON with per-trade detail. " +
      "Use get_backtest_runs first to discover run IDs.",
    {
      id: z
        .string()
        .min(1)
        .describe("UUID of the backtest run to retrieve."),
    },
    async ({ id }) => {
      try {
        const db = getDb();
        const repo = new SqliteBacktestResultRepository(db);

        const run = repo.getRunById(id);

        if (!run) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: `Backtest run not found: ${id}` }, null, 2),
              },
            ],
          };
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(run, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }, null, 2),
            },
          ],
        };
      }
    },
  );
}
