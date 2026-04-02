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

import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import {
  computeRebalancing,
  formatRebalancingReport,
  type Position,
} from "../../../domain/services/rebalancingCalculator.js";
import { logger } from "../../../infrastructure/logger.js";

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
        .describe(
          'Target weights by stock code (must sum to 100). ' +
          'Example: {"VCB": 40, "FPT": 30, "HPG": 30}',
        ),
    },
    async ({ targets }) => {
      try {
        await initDatabase();
        const db = getDb();

        // ── 1. Load current positions ────────────────────────────────────────
        let positionRows: PositionRow[] = [];
        try {
          positionRows = db
            .query<PositionRow, []>(
              "SELECT code, shares, avg_cost_vnd FROM portfolio_positions WHERE shares > 0",
            )
            .all();
        } catch {
          // portfolio_positions table may not exist (task 179 not yet deployed)
          // Return a helpful message rather than crashing
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Khong tim thay bang portfolio_positions. " +
                  "Vui long them vi tri (task 179) truoc khi su dung cong cu nay.\n\n" +
                  "Tip: dung add_position de them co phieu vao danh muc.",
              },
            ],
          };
        }

        if (positionRows.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Danh muc trong. Vui long them vi tri truoc khi tai can bang.",
              },
            ],
          };
        }

        // ── 2. Fetch live prices from market_prices cache ────────────────────
        const codes = positionRows.map((r) => r.code);
        const priceMap = new Map<string, number>();

        try {
          const placeholders = codes.map(() => "?").join(", ");
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
          Object.entries(targets).map(([code, weight]) => [
            code.toUpperCase(),
            weight,
          ]),
        );

        // ── 6. Validate weights sum to ~100 ───────────────────────────────────
        const weightSum = Object.values(targets).reduce((s, w) => s + w, 0);
        const weightWarning =
          Math.abs(weightSum - 100) > 1
            ? `\nCANH BAO: Tong trong so = ${weightSum.toFixed(2)}% (nen bang 100%)\n`
            : "";

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
        const priceNote =
          missingPriceCodes.length > 0
            ? `\nLuu y: Gia uoc tinh (dung gia von trung binh) cho: ${missingPriceCodes.join(", ")}\n`
            : "";

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
              text: `Loi khi tinh toan tai can bang: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
