/**
 * backtestLifecycleTools.ts — Task 1846b
 *
 * MCP lifecycle tools for backtest run management:
 *   #123: delete_backtest_run
 *   #124: export_backtest_run_csv
 *   #125: compare_backtest_runs
 *
 * Layer: interface/mcp/tools — imports infrastructure impls + domain types.
 * getDb() is always called inside handler body (U-4 pattern) — never at module scope.
 *
 * @module interface/mcp/tools/backtesting/backtestLifecycleTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { SqliteBacktestResultRepository } from "../../../../infrastructure/db/backtestResultRepo.js";

interface TradeEntry {
  ticker?: string;
  direction?: string;
  entryDate?: string;
  exitDate?: string;
  entryPrice?: number;
  exitPrice?: number;
  returnPct?: number;
  positionWeight?: number;
}

interface BacktestResultJson {
  trades?: TradeEntry[];
  equityCurve?: number[];
}

export function registerBacktestLifecycleTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // Tool #123: delete_backtest_run
  // -------------------------------------------------------------------------
  server.tool(
    "delete_backtest_run",
    "Permanently delete a backtest run by its UUID. " +
      "Returns { deleted: true, id } on success, or an error object if the run does not exist. " +
      "This operation is irreversible.",
    {
      id: z.string().uuid().describe("UUID of the backtest run to delete."),
    },
    async ({ id }) => {
      const db = getDb();
      const repo = new SqliteBacktestResultRepository(db);
      const deleted = repo.deleteRun(id);

      if (!deleted) {
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
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ deleted: true, id }, null, 2),
          },
        ],
      };
    },
  );

  // -------------------------------------------------------------------------
  // Tool #124: export_backtest_run_csv
  // -------------------------------------------------------------------------
  server.tool(
    "export_backtest_run_csv",
    "Export a backtest run's trade list as a CSV string. " +
      "Header: date,ticker,direction,entryPrice,exitPrice,returnPct,positionWeight,holdDays. " +
      "Rows are sorted by exitDate ASC. " +
      "When includeEquityCurve=true, appends a blank line, an 'equity_curve' label, " +
      "an 'index,equityValue' header, and one row per equity snapshot starting from 1.0.",
    {
      id: z.string().uuid().describe("UUID of the backtest run to export."),
      includeEquityCurve: z
        .boolean()
        .default(false)
        .describe("When true, appends equity curve section after the trade rows."),
    },
    async ({ id, includeEquityCurve }) => {
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

      let parsed: BacktestResultJson;
      try {
        parsed = JSON.parse(run.resultJson) as BacktestResultJson;
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: `resultJson parse failed for run ${id}` }, null, 2),
            },
          ],
        };
      }

      const trades: TradeEntry[] = parsed.trades ?? [];

      // Sort by exitDate ASC
      const sorted = [...trades].sort((a, b) => {
        const aDate = a.exitDate ?? "";
        const bDate = b.exitDate ?? "";
        return aDate.localeCompare(bDate);
      });

      const header = "date,ticker,direction,entryPrice,exitPrice,returnPct,positionWeight,holdDays";

      const rows = sorted.map((t) => {
        const exitDate = t.exitDate ?? "";
        const ticker = t.ticker ?? "";
        const direction = t.direction ?? "";
        const entryPrice = (t.entryPrice ?? 0).toFixed(2);
        const exitPrice = (t.exitPrice ?? 0).toFixed(2);
        const returnPct = (t.returnPct ?? 0).toFixed(6);
        const positionWeight = (t.positionWeight ?? 0).toFixed(6);
        const holdDays = Math.max(
          0,
          Math.round(
            (new Date(t.exitDate ?? "").getTime() - new Date(t.entryDate ?? "").getTime()) /
              86_400_000,
          ),
        );
        return `${exitDate},${ticker},${direction},${entryPrice},${exitPrice},${returnPct},${positionWeight},${holdDays}`;
      });

      let csvString = [header, ...rows].join("\n");

      if (includeEquityCurve) {
        // Option C: recompute equity curve from trades
        const equityCurveValues: number[] = [1.0];
        let equity = 1.0;
        for (const t of sorted) {
          equity *= 1 + (t.positionWeight ?? 0) * (t.returnPct ?? 0);
          equityCurveValues.push(equity);
        }

        const equityHeader = "index,equityValue";
        const equityRows = equityCurveValues.map((v, i) => `${i},${v.toFixed(6)}`);
        csvString += "\n\nequity_curve\n" + equityHeader + "\n" + equityRows.join("\n");
      }

      // Return raw CSV text — NOT JSON.stringify (per AC-csv-raw)
      return {
        content: [{ type: "text" as const, text: csvString }],
      };
    },
  );

  // -------------------------------------------------------------------------
  // Tool #125: compare_backtest_runs
  // -------------------------------------------------------------------------
  server.tool(
    "compare_backtest_runs",
    "Compare 2–5 backtest runs side-by-side. " +
      "Returns a JSON object with a 'runs' array, each entry containing 11 summary fields " +
      "(id, strategy, startDate, endDate, runAt, totalReturn, benchmarkReturn, maxDrawdown, sharpeRatio, winRate, tradeCount). " +
      "Duplicate IDs are deduplicated. If any ID is not found, returns an error with all missing IDs.",
    {
      ids: z
        .array(z.string().uuid())
        .min(2)
        .max(5)
        .describe("Array of 2–5 backtest run UUIDs to compare."),
    },
    async ({ ids }) => {
      const db = getDb();
      const repo = new SqliteBacktestResultRepository(db);

      // Deduplicate while preserving input order
      const uniqueIds = [...new Set(ids)];

      const runs = uniqueIds.map((id) => ({ id, record: repo.getRunById(id) }));
      const missingIds = runs.filter((r) => r.record === null).map((r) => r.id);

      if (missingIds.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: `Backtest runs not found: ${missingIds.join(", ")}` },
                null,
                2,
              ),
            },
          ],
        };
      }

      const comparison = runs.map(({ record }) => {
        const r = record!;
        return {
          id: r.id,
          strategy: r.strategy,
          startDate: r.startDate,
          endDate: r.endDate,
          runAt: r.runAt,
          totalReturn: r.totalReturn,
          benchmarkReturn: r.benchmarkReturn ?? null,
          maxDrawdown: r.maxDrawdown,
          sharpeRatio: r.sharpeRatio ?? null,
          winRate: r.winRate,
          tradeCount: r.tradeCount,
        };
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ runs: comparison }, null, 2),
          },
        ],
      };
    },
  );
}
