/**
 * Task 182 — Portfolio Risk MCP Tool
 *
 * Interface layer: registers `get_portfolio_risk` on a McpServer instance.
 *
 * Computes VaR 95%, max drawdown, and per-stock heat-map from:
 *   - positions table (open positions via positionStore)
 *   - market_prices_history table (daily price history)
 *
 * Output is Vietnamese-language plain text (no Markdown formatting).
 *
 * @module interface/mcp/tools/portfolioRiskTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import {
  computePortfolioRisk,
  type PortfolioRiskResult,
  type PositionSnapshot,
  type DailyPriceRow,
} from "../../../domain/services/portfolioRiskCalculator.js";
import { currentPriceQuery } from "../../../infrastructure/db/priceQueries.js";
import { logger } from "../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// SQLite row types
// ─────────────────────────────────────────────────────────────────────────────

interface PositionRow {
  code: string;
  shares: number;
  avg_price: number;
  current_price: number | null;
}

interface PriceHistoryRow {
  code: string;
  price: number;
  fetched_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Format a VND amount with thousand-separator (e.g. 3,450,000). */
function fmtVnd(amount: number): string {
  return Math.abs(Math.round(amount)).toLocaleString("en-US");
}

/** Format a percentage to 1 decimal place with sign (e.g. -2.3%). */
function fmtPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output formatter (exported for testability — task 1411)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format portfolio risk metrics as plain Vietnamese text.
 *
 * @param result - Computed risk result from computePortfolioRisk
 * @param days   - Lookback period in days (for header)
 */
export function formatPortfolioRiskOutput(
  result: PortfolioRiskResult,
  days: number,
): string {
  const lines: string[] = [];
  lines.push(`Rủi ro danh mục (${days} ngày)`);
  lines.push("");
  lines.push(
    `VaR (95%): ${fmtPct(result.var95Pct)} (${result.var95Vnd < 0 ? "-" : ""}${fmtVnd(result.var95Vnd)} VND)`,
  );
  if (result.maxDrawdownPct < 0) {
    const startStr = result.maxDrawdownStart?.slice(0, 10) ?? "?";
    const endStr = result.maxDrawdownEnd?.slice(0, 10) ?? "?";
    lines.push(`Max Drawdown: ${fmtPct(result.maxDrawdownPct)} (${startStr} -> ${endStr})`);
  } else {
    lines.push("Max Drawdown: Không có (giá tăng liên tục trong kỳ)");
  }
  lines.push("");
  lines.push("Heat Map:");
  lines.push(
    `${"Mã".padEnd(6)} | ${"Tỷ trọng".padEnd(8)} | ${"Vol".padEnd(6)} | ${"VaR".padEnd(7)} | Trạng thái`,
  );
  lines.push("-".repeat(55));
  for (const row of result.heatMap) {
    lines.push(
      `${row.code.padEnd(6)} | ${(row.weightPct.toFixed(0) + "%").padEnd(8)} | ${(row.volPct.toFixed(1) + "%").padEnd(6)} | ${(row.var95Pct.toFixed(1) + "%").padEnd(7)} | ${row.status}`,
    );
  }
  lines.push("");
  lines.push(`Tổng giá trị: ${fmtVnd(result.totalValue)} VND`);
  lines.push(`Tính đến: ${new Date().toISOString().slice(0, 16).replace("T", " ")} (UTC)`);
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `get_portfolio_risk` MCP tool.
 *
 * @param server The McpServer instance to register on.
 */
export function registerPortfolioRiskTool(server: McpServer): void {
  server.tool(
    "get_portfolio_risk",
    "Portfolio risk metrics: VaR 95%, max drawdown, and per-stock heat map. " +
      "Uses historical price simulation over the specified lookback period.",
    {
      days: z.coerce
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .default(30)
        .describe("Lookback period in days for risk calculation (default: 30)"),
    },
    async ({ days: daysRaw }) => {
      const days = daysRaw ?? 30;

      try {
        await initDatabase();
        const db = getDb();

        // ── 1. Load open positions ─────────────────────────────────────────────
        // Use currentPriceQuery to COALESCE market_prices → daily_ohlcv so that
        // off-hours / VPS-gap periods still return a valid price (bug 1224).
        let positionRows: PositionRow[] = [];
        try {
          positionRows = db
            .query<PositionRow, []>(
              `SELECT p.code, p.shares, p.avg_price,
                      ${currentPriceQuery("p.code")} AS current_price
               FROM positions p
               WHERE p.closed_at IS NULL
               ORDER BY p.opened_at ASC`,
            )
            .all();
        } catch {
          // positions table might not exist yet (task 179 not merged)
          return {
            content: [
              {
                type: "text" as const,
                text: "Không có vị trí nào. Hãy thêm vị trí bằng công cụ quản lý vị thế.",
              },
            ],
          };
        }

        if (positionRows.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Không có vị trí mở nào trong danh mục.",
              },
            ],
          };
        }

        // ── 2. Build PositionSnapshot array ───────────────────────────────────
        const positions: PositionSnapshot[] = positionRows.map((r) => {
          const currentPrice = r.current_price ?? null;
          const costBasis = r.shares * r.avg_price;
          const currentValue = currentPrice != null ? r.shares * currentPrice : 0;
          return {
            code: r.code,
            shares: r.shares,
            avgPrice: r.avg_price,
            currentPrice,
            costBasis,
            currentValue,
          };
        });

        // ── 3. Load price history for each position ───────────────────────────
        const codes = positions.map((p) => p.code);
        const placeholders = codes.map(() => "?").join(", ");
        const cutoffDate = new Date(
          Date.now() - days * 24 * 60 * 60 * 1000,
        ).toISOString();

        let historyRows: PriceHistoryRow[] = [];
        try {
          historyRows = db
            .query<PriceHistoryRow, string[]>(
              `SELECT code, price, fetched_at
               FROM market_prices_history
               WHERE code IN (${placeholders})
                 AND fetched_at >= ?
               ORDER BY code, fetched_at ASC`,
            )
            .all(...codes, cutoffDate);
        } catch {
          // market_prices_history may be empty — proceed with empty history
        }

        // Group history by code
        const priceHistory: Record<string, DailyPriceRow[]> = {};
        for (const row of historyRows) {
          if (!priceHistory[row.code]) priceHistory[row.code] = [];
          const bucket = priceHistory[row.code];
          if (bucket) {
            bucket.push({
              code: row.code,
              price: row.price,
              fetched_at: row.fetched_at,
            });
          }
        }

        // ── 4. Compute risk metrics ────────────────────────────────────────────
        const result = computePortfolioRisk(positions, priceHistory, days);

        // ── 5. Format Vietnamese output ────────────────────────────────────────
        return {
          content: [{ type: "text" as const, text: formatPortfolioRiskOutput(result, days) }],
        };
      } catch (err) {
        logger.error("[get_portfolio_risk] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi tính rủi ro danh mục: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
