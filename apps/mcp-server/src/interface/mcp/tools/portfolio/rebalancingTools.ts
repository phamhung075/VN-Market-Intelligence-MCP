/**
 * Task 195 — Portfolio Rebalancing MCP Tool
 *
 * Interface layer: registers the `get_rebalancing_signals` tool.
 *
 * The tool reads the investor's current positions from the `portfolio_positions`
 * table (task 179), fetches live prices from market_prices (populated by the
 * market scan job), then delegates to the pure-domain `computeRebalancing()`
 * service.
 *
 * If market_prices is empty or a stock is missing a price, the tool falls back
 * to the stored avg_cost_vnd as an approximation so the calculator always has
 * something to work with.
 *
 * @module interface/mcp/tools/rebalancing
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { sqlInClause } from "../../../../infrastructure/db/sqlHelpers.js";
import {
  computeRebalancing,
  formatRebalancingReport,
  type Position,
} from "../../../../domain/services/rebalancingCalculator.js";
import { getTargetWeights } from "../../../../infrastructure/db/targetAllocationStore.js";
import { logger } from "../../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal DB row shapes
// ─────────────────────────────────────────────────────────────────────────────

interface PositionRow {
  code: string;
  shares: number;
  avg_cost_vnd: number;
}

interface PriceRow {
  code: string;
  price: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatter (exported for testability — task 1411)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format rebalancing warnings and price-estimate notes.
 *
 * @param weightSum    - Sum of all target weights
 * @param missingCodes - Codes with no live price (fallback to avg cost)
 */
export function formatRebalancingWarnings(
  weightSum: number,
  missingCodes: string[],
): { warn: string; note: string } {
  const warn =
    Math.abs(weightSum - 100) > 1
      ? `\nCẢNH BÁO: Tổng trọng số = ${weightSum.toFixed(2)}% (nên bằng 100%)\n`
      : "";
  const note =
    missingCodes.length > 0
      ? `\nLưu ý: Giá ước tính (dùng giá vốn trung bình) cho: ${missingCodes.join(", ")}\n`
      : "";
  return { warn, note };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the get_rebalancing_signals MCP tool.
 *
 * @param server - The McpServer instance to register the tool on.
 */
export function registerRebalancingTools(server: McpServer): void {
  server.tool(
    "get_rebalancing_signals",
    "Calculate buy/sell quantities to reach target allocation weights. " +
      "Reads current positions from the portfolio, fetches live prices, and " +
      "returns exact share counts to trade per stock to hit your target weights.",
    {
      targets: z
        .record(z.number().min(0).max(100))
        .optional()
        .describe(
          'Target weights by stock code (must sum to 100). ' +
          'Example: {"VCB": 40, "FPT": 30, "HPG": 30}. ' +
          'Omit to auto-load saved targets from portfolio_targets.',
        ),
    },
    async ({ targets }) => {
      try {
        await initDatabase();
        const db = getDb();

        // ── 0. Auto-load targets from DB if not provided ──────────────────────
        let resolvedTargets: Record<string, number>;
        if (targets == null || Object.keys(targets).length === 0) {
          const savedRows = await getTargetWeights();
          if (savedRows.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text:
                    "Không có mục tiêu phân bổ.\n" +
                    "Vui lòng cung cấp tham số targets hoặc đặt mục tiêu trước qua analyst workflow.",
                },
              ],
            };
          }
          resolvedTargets = Object.fromEntries(
            savedRows.map((r) => [r.code, r.target_weight]),
          );
        } else {
          resolvedTargets = targets as Record<string, number>;
        }

        // ── 1. Load current positions ────────────────────────────────────────
        let positionRows: PositionRow[] = [];
        try {
          positionRows = db
            .query<PositionRow, []>(
              "SELECT code, shares, avg_price AS avg_cost_vnd FROM positions WHERE closed_at IS NULL",
            )
            .all();
        } catch {
          // positions table may not exist yet
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Không tìm thấy vị trí nào trong danh mục.\n" +
                  "Vui lòng thêm vị trí bằng set_position trước khi sử dụng công cụ này.",
              },
            ],
          };
        }

        if (positionRows.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Danh mục trống. Vui lòng thêm vị trí trước khi tái cân bằng.",
              },
            ],
          };
        }

        // ── 2. Fetch live prices from market_prices cache ────────────────────
        const codes = positionRows.map((r) => r.code);
        const priceMap = new Map<string, number>();

        try {
          const placeholders = sqlInClause(codes.length);
          const priceRows = db
            .query<PriceRow, string[]>(
              `SELECT code, price FROM market_prices WHERE code IN (${placeholders})`,
            )
            .all(...codes);
          for (const row of priceRows) {
            if (row.price > 0) priceMap.set(row.code, row.price);
          }
        } catch {
          // market_prices may be empty — will use avg_cost_vnd fallback below
        }

        // ── 3. Build Position objects ─────────────────────────────────────────
        const positions: Position[] = positionRows.map((row) => ({
          code: row.code,
          shares: row.shares,
          // Use live price if available, otherwise fall back to avg cost
          currentPrice: priceMap.get(row.code) ?? row.avg_cost_vnd,
        }));

        // ── 4. Compute total portfolio value ──────────────────────────────────
        const totalPortfolioValue = positions.reduce(
          (sum, p) => sum + p.shares * p.currentPrice,
          0,
        );

        // ── 5. Build target weights map ───────────────────────────────────────
        const targetWeights = new Map<string, number>(
          Object.entries(resolvedTargets).map(([code, weight]) => [
            code.toUpperCase(),
            weight,
          ]),
        );

        // ── 6. Validate weights sum to ~100 ───────────────────────────────────
        const weightSum = Object.values(resolvedTargets).reduce((s, w) => s + w, 0);

        // ── 7. Compute rebalancing ────────────────────────────────────────────
        const actions = computeRebalancing(
          positions,
          targetWeights,
          totalPortfolioValue,
        );

        // ── 8. Note which prices are estimated (fallback) ─────────────────────
        const missingPriceCodes = positions
          .filter((p) => !priceMap.has(p.code))
          .map((p) => p.code);
        const { warn: weightWarning, note: priceNote } = formatRebalancingWarnings(weightSum, missingPriceCodes);

        // ── 9. Format output ──────────────────────────────────────────────────
        const report = formatRebalancingReport(actions, totalPortfolioValue);

        return {
          content: [
            {
              type: "text" as const,
              text: weightWarning + priceNote + report,
            },
          ],
        };
      } catch (err) {
        logger.error("[get_rebalancing_signals] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi khi tính toán tái cân bằng: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
