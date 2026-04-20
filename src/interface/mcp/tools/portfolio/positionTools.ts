/**
 * Task 179 — Position Tracking MCP Tools
 * Task 1079 — get_user_positions_for_analysis (enriched analysis tool)
 *
 * Interface layer: registers four MCP tools for investor position management.
 *
 * Tools registered:
 *   1. set_position                   — Record or update a stock position (upsert)
 *   2. get_positions                  — List all open positions with live P&L in Vietnamese format
 *   3. close_position                 — Mark a position as closed
 *   4. get_user_positions_for_analysis — Enriched positions with stop-loss floor + TP ladder for agents
 *
 * All prices are in VND (Vietnamese Dong), not million VND.
 *
 * @module interface/mcp/tools/positionTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";

import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import {
  upsertPosition,
  listOpenPositions,
  closePosition,
  type PositionWithPnl,
} from "../../../../infrastructure/db/positionStore.js";

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
export function buildPortfolioText(positions: PositionWithPnl[]): string {
  if (positions.length === 0) {
    return "Danh mục đầu tư trống. Dùng set_position để thêm vị thế mới.";
  }

  const lines: string[] = [
    `Danh mục đầu tư (${positions.length} vị thế)`,
    "",
    "Mã     | Số lượng | Giá TB         | Giá hiện tại   | Lãi/Lỗ",
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
      `Tổng giá trị: ${fmtVnd(totalValue)} VND | Tổng lãi/lỗ: ${fmtPnl(totalPnl)} (${fmtPct(totalPnlPct)})`,
    );
  } else {
    lines.push(`Tổng giá vốn: ${fmtVnd(totalCost)} VND | Chưa có giá thị trường`);
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Enriched position type (Task 1079)
// ─────────────────────────────────────────────────────────────────────────────

/** Output shape for get_user_positions_for_analysis — one item per open position. */
export interface PositionForAnalysis {
  code: string;
  shares: number;
  /** Average purchase price in VND. */
  avgPrice: number;
  /** Live price from market_prices, or null if unavailable. */
  currentPrice: number | null;
  /** Total cost basis = shares × avgPrice. */
  costBasis: number;
  /** Current market value = shares × currentPrice, or null if no price. */
  currentValue: number | null;
  /** Absolute unrealized P&L in VND, or null if no current price. */
  unrealizedPnl: number | null;
  /** Unrealized P&L as % of costBasis, or null if no current price. */
  unrealizedPnlPct: number | null;
  /** Simple stop-loss floor = Math.round(avgPrice * 0.93). */
  stopLossFloor: number;
  /** Take-profit +10% level = Math.round(avgPrice * 1.10). */
  tp1: number;
  /** Take-profit +20% level = Math.round(avgPrice * 1.20). */
  tp2: number;
  /** Take-profit +30% level = Math.round(avgPrice * 1.30). */
  tp3: number;
}

/**
 * Enrich a PositionWithPnl with stop-loss floor and TP ladder.
 *
 * @param p - Raw position with live P&L from listOpenPositions.
 * @returns PositionForAnalysis with computed analysis fields.
 */
function enrichPosition(p: PositionWithPnl): PositionForAnalysis {
  return {
    code: p.code,
    shares: p.shares,
    avgPrice: p.avgPrice,
    currentPrice: p.currentPrice,
    costBasis: p.costBasis,
    currentValue: p.currentPrice != null ? p.currentValue : null,
    unrealizedPnl: p.currentPrice != null ? p.unrealizedPnl : null,
    unrealizedPnlPct: p.currentPrice != null ? p.unrealizedPnlPct : null,
    stopLossFloor: Math.round(p.avgPrice * 0.93),
    tp1: Math.round(p.avgPrice * 1.10),
    tp2: Math.round(p.avgPrice * 1.20),
    tp3: Math.round(p.avgPrice * 1.30),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register all four position tracking tools on an McpServer instance.
 *
 * @param server  - The McpServer instance to register tools on.
 * @param _testDb - Optional test database (injected in tests). In production, uses getDb().
 */
export function registerPositionTools(server: McpServer, _testDb?: Database): void {

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
                `Vị thế ${actionCode} đã được lưu:\n` +
                `  Số lượng: ${fmtVnd(shares)} cổ phiếu\n` +
                `  Giá trung bình: ${fmtVnd(avgPrice)} VND\n` +
                `  Vốn đầu tư: ${fmtVnd(costBasis)} VND` +
                (notes ? `\n  Ghi chú: ${notes}` : ""),
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
                ? `Vị thế ${actionCode} đã được đóng lại.`
                : `Không tìm thấy vị thế mở nào cho ${actionCode}.`,
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

  // ── 4. get_user_positions_for_analysis ────────────────────────────────────
  server.tool(
    "get_user_positions_for_analysis",
    "Return enriched position data for Cowork analysis agents. " +
      "Each position includes: qty, avg_cost, current price (from market_prices), " +
      "absolute and percentage P&L (null if no live price), " +
      "stop-loss floor (avg_cost × 0.93), and TP ladder (+10%/+20%/+30%). " +
      "Optional ticker filter narrows results to a single stock. " +
      "Returns an empty JSON array when the portfolio has no open positions.",
    {
      ticker: z
        .string()
        .min(2)
        .max(10)
        .toUpperCase()
        .optional()
        .describe(
          "Optional stock ticker to filter results (e.g. 'VCB'). " +
            "Omit to return all open positions.",
        ),
    },
    async ({ ticker }) => {
      try {
        if (!_testDb) await initDatabase();
        const db = _testDb ?? getDb();

        const all = listOpenPositions(db);
        const filtered =
          ticker != null
            ? all.filter((p) => p.code === ticker.toUpperCase())
            : all;

        const result: PositionForAnalysis[] = filtered.map(enrichPosition);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        console.error("[get_user_positions_for_analysis] Error:", err);
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
