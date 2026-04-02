/**
 * Task 179 — Position Tracking MCP Tools
 *
 * Interface layer: registers three MCP tools for investor position management.
 *
 * Tools registered:
 *   1. set_position   — Record or update a stock position (upsert)
 *   2. get_positions  — List all open positions with live P&L in Vietnamese format
 *   3. close_position — Mark a position as closed
 *
 * All prices are in VND (Vietnamese Dong), not million VND.
 *
 * @module interface/mcp/tools/positionTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import {
  upsertPosition,
  listOpenPositions,
  closePosition,
  type PositionWithPnl,
} from "../../../infrastructure/db/positionStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a VND amount with thousand-separators.
 * e.g. 85000 → "85,000"
 */
function fmtVnd(amount: number): string {
  return amount.toLocaleString("vi-VN");
}

/**
 * Format a P&L amount with sign, thousand-separators, and "VND" suffix.
 * e.g. 10000000 → "+10,000,000 VND"
 */
function fmtPnl(amount: number): string {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}${fmtVnd(amount)} VND`;
}

/**
 * Format a percentage with sign and 1 decimal place.
 * e.g. 13.333 → "+13.3%"
 */
function fmtPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * Build the Vietnamese-format portfolio table for get_positions.
 *
 * Output example:
 *   Danh muc dau tu (3 vi the)
 *
 *   Ma    | SL      | Gia TB    | Gia hien tai | Lai/Lo
 *   VCB   | 1,000   | 75,000    | 85,000       | +13.3% (+10,000,000 VND)
 *   ...
 *
 *   Tong gia tri: 142,500,000 VND | Tong lai/lo: +7,500,000 VND (+5.6%)
 */
function buildPortfolioText(positions: PositionWithPnl[]): string {
  if (positions.length === 0) {
    return "Danh muc dau tu trong. Dung set_position de them vi the moi.";
  }

  const lines: string[] = [
    `Danh muc dau tu (${positions.length} vi the)`,
    "",
    "Ma     | So luong | Gia TB         | Gia hien tai   | Lai/Lo",
    "-------|----------|----------------|----------------|-----------------------------",
  ];

  let totalCost = 0;
  let totalValue = 0;
  let totalPnl = 0;

  for (const p of positions) {
    const priceStr = p.currentPrice != null ? fmtVnd(p.currentPrice) : "N/A";
    const pnlStr =
      p.currentPrice != null
        ? `${fmtPct(p.unrealizedPnlPct)} (${fmtPnl(p.unrealizedPnl)})`
        : "N/A";

    lines.push(
      `${p.code.padEnd(6)} | ${fmtVnd(p.shares).padEnd(8)} | ${fmtVnd(p.avgPrice).padEnd(14)} | ${priceStr.padEnd(14)} | ${pnlStr}`,
    );

    totalCost += p.costBasis;
    totalValue += p.currentValue;
    totalPnl += p.unrealizedPnl;
  }

  lines.push("");

  if (totalCost > 0 && totalValue > 0) {
    const totalPnlPct = (totalPnl / totalCost) * 100;
    lines.push(
      `Tong gia tri: ${fmtVnd(totalValue)} VND | Tong lai/lo: ${fmtPnl(totalPnl)} (${fmtPct(totalPnlPct)})`,
    );
  } else {
    lines.push(`Tong gia von: ${fmtVnd(totalCost)} VND | Chua co gia thi truong`);
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the three position tracking tools on an McpServer instance.
 *
 * @param server - The McpServer instance to register tools on.
 */
export function registerPositionTools(server: McpServer): void {

  // ── 1. set_position ──────────────────────────────────────────────────────
  server.tool(
    "set_position",
    "Record or update an investor position for a Vietnamese stock. " +
      "If a position already exists for the stock code, it is updated (upsert). " +
      "Use close_position to exit a position.",
    {
      actionCode: z
        .string()
        .min(2)
        .max(10)
        .toUpperCase()
        .describe("Stock ticker code (e.g. VCB, HPG, FPT)"),
      shares: z
        .number()
        .int()
        .positive()
        .describe("Number of shares held"),
      avgPrice: z
        .number()
        .positive()
        .describe("Average purchase price in VND (e.g. 75000 for 75,000 VND)"),
      notes: z
        .string()
        .max(500)
        .optional()
        .describe("Optional notes about this position"),
    },
    async ({ actionCode, shares, avgPrice, notes }) => {
      try {
        await initDatabase();
        const db = getDb();

        upsertPosition(db, { code: actionCode, shares, avgPrice, ...(notes !== undefined ? { notes } : {}) });

        const costBasis = shares * avgPrice;
        return {
          content: [
            {
              type: "text" as const,
              text:
                `Vi the ${actionCode} da duoc luu:\n` +
                `  So luong: ${fmtVnd(shares)} co phieu\n` +
                `  Gia trung binh: ${fmtVnd(avgPrice)} VND\n` +
                `  Von dau tu: ${fmtVnd(costBasis)} VND` +
                (notes ? `\n  Ghi chu: ${notes}` : ""),
            },
          ],
        };
      } catch (err) {
        console.error("[set_position] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 2. get_positions ──────────────────────────────────────────────────────
  server.tool(
    "get_positions",
    "List all open stock positions with live P&L computed from latest market prices. " +
      "Displays cost basis, current value, unrealized profit/loss (amount and %) for each position, " +
      "plus aggregate totals. Prices from the market_prices table (updated by the intelligence cycle).",
    {},
    async () => {
      try {
        await initDatabase();
        const db = getDb();

        const positions = listOpenPositions(db);
        const text = buildPortfolioText(positions);

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        console.error("[get_positions] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 3. close_position ─────────────────────────────────────────────────────
  server.tool(
    "close_position",
    "Mark a stock position as closed (set closed_at timestamp). " +
      "The position record is kept for historical reference but will no longer " +
      "appear in get_positions.",
    {
      actionCode: z
        .string()
        .min(2)
        .max(10)
        .toUpperCase()
        .describe("Stock ticker code of the position to close"),
    },
    async ({ actionCode }) => {
      try {
        await initDatabase();
        const db = getDb();

        const closed = closePosition(db, actionCode);

        return {
          content: [
            {
              type: "text" as const,
              text: closed
                ? `Vi the ${actionCode} da duoc dong lai.`
                : `Khong tim thay vi the mo nao cho ${actionCode}.`,
            },
          ],
        };
      } catch (err) {
        console.error("[close_position] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
