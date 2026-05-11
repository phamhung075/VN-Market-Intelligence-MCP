/**
 * Task 223 — Portfolio Target Allocation MCP Tools
 * Task 241 — set_target_allocation removed (user-only mutation tool)
 *
 * Registers one MCP tool:
 *
 *   1. `get_target_allocation` — display current targets vs actual portfolio weights
 *                                with drift column (thua/thieu)
 *
 * Tools removed (task 241):
 *   - `set_target_allocation` — user-only mutation; manage via analyst workflow instead
 *
 * Output format for get_target_allocation (Vietnamese, plain text):
 *
 *   Phân bổ mục tiêu
 *
 *   Mã    | Mục tiêu | Hiện tại | Lệch
 *   VCB   | 40%      | 50.0%    | +10.0% (thừa)
 *   FPT   | 30%      | 25.0%    | -5.0% (thiếu)
 *   HPG   | 30%      | 25.0%    | -5.0% (thiếu)
 *
 *   Tổng danh mục: 14,000,000 VND
 *
 * @module interface/mcp/tools/targetAllocationTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { sqlInClause } from "../../../../infrastructure/db/sqlHelpers.js";
import {
  getTargetWeights,
} from "../../../../infrastructure/db/targetAllocationStore.js";
import { logger } from "../../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal DB row shapes
// ─────────────────────────────────────────────────────────────────────────────

interface PositionRow {
  code: string;
  shares: number;
  avg_price: number;
}

interface PriceRow {
  code: string;
  price: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Format a VND amount with thousand-separators using commas. */
function fmtVnd(amount: number): string {
  return Math.round(amount).toLocaleString("en-US");
}

/**
 * Pad a string to a fixed width with trailing spaces.
 * Allows consistent column alignment in monospace output.
 */
function pad(s: string, width: number): string {
  return s.padEnd(width, " ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register target allocation MCP tools on the given McpServer instance.
 * Registers: get_target_allocation.
 * NOTE: set_target_allocation was removed (task 241). Manage via analyst workflow instead.
 *
 * @param server - McpServer instance to attach the tools to.
 */
export function registerTargetAllocationTools(server: McpServer): void {
  // ── set_target_allocation REMOVED (task 241) ───────────────────────────────
  // User-only mutation tool. Manage allocations through analyst workflow instead.

  // ── 1. get_target_allocation ───────────────────────────────────────────────
  server.tool(
    "get_target_allocation",
    "Show current portfolio target weights vs actual allocation with drift column. " +
      "Reads portfolio_targets, positions, and market_prices tables. " +
      "Falls back to avg_price when live price is unavailable.",
    {},
    async () => {
      try {
        await initDatabase();
        const db = getDb();

        // ── Load target weights ──────────────────────────────────────────────
        const targetRows = await getTargetWeights();
        if (targetRows.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Chưa có mục tiêu phân bổ.\n" +
                  "Vui lòng thiết lập mục tiêu qua analyst workflow trước khi xem gap.",
              },
            ],
          };
        }

        // ── Load open positions ──────────────────────────────────────────────
        let positionRows: PositionRow[] = [];
        try {
          positionRows = db
            .query<PositionRow, []>(
              "SELECT code, shares, avg_price FROM positions WHERE closed_at IS NULL",
            )
            .all();
        } catch {
          // positions table may not exist yet
        }

        // ── Load live prices ─────────────────────────────────────────────────
        const priceMap = new Map<string, number>();
        if (positionRows.length > 0) {
          try {
            const codes = positionRows.map((p) => p.code);
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
            // market_prices may be empty — will fall back to avg_price
          }
        }

        // ── Compute actual allocation ────────────────────────────────────────
        type PositionValue = { code: string; value: number };
        const posValues: PositionValue[] = positionRows.map((p) => {
          const price = priceMap.get(p.code) ?? p.avg_price;
          return { code: p.code, value: p.shares * price };
        });

        const totalValue = posValues.reduce((s, v) => s + v.value, 0);
        const actualMap = new Map<string, number>();
        for (const pv of posValues) {
          actualMap.set(
            pv.code,
            totalValue > 0 ? (pv.value / totalValue) * 100 : 0,
          );
        }

        // ── Build output table ───────────────────────────────────────────────
        const header = [
          "Phân bổ mục tiêu",
          "",
          pad("Mã", 8) +
            pad("Mục tiêu", 12) +
            pad("Hiện tại", 12) +
            "Lệch",
          "-".repeat(50),
        ];

        const rows: string[] = [];
        for (const row of targetRows) {
          const target = row.target_weight;
          const actual = actualMap.get(row.code) ?? 0;
          const drift = actual - target;
          const driftStr =
            drift === 0
              ? "  0.0% (đúng)"
              : drift > 0
                ? `+${drift.toFixed(1)}% (thừa)`
                : `${drift.toFixed(1)}% (thiếu)`;

          rows.push(
            pad(row.code, 8) +
              pad(`${target}%`, 12) +
              pad(
                actual > 0
                  ? `${actual.toFixed(1)}%`
                  : totalValue === 0
                    ? "N/A"
                    : "0.0%",
                12,
              ) +
              driftStr,
          );
        }

        // Stocks in positions but NOT in targets (orphan positions)
        const targetCodes = new Set(targetRows.map((r) => r.code));
        for (const pv of posValues) {
          if (!targetCodes.has(pv.code)) {
            const actual =
              totalValue > 0 ? (pv.value / totalValue) * 100 : 0;
            rows.push(
              pad(pv.code, 8) +
                pad("—", 12) +
                pad(`${actual.toFixed(1)}%`, 12) +
                "(không có mục tiêu)",
            );
          }
        }

        const footer: string[] = [""];
        if (totalValue > 0) {
          footer.push(`Tổng danh mục: ${fmtVnd(totalValue)} VND`);
        }
        if (priceMap.size < positionRows.length) {
          const missingPrices = positionRows
            .filter((p) => !priceMap.has(p.code))
            .map((p) => p.code);
          footer.push(
            `Lưu ý: Giá ước tính (giá vốn) cho: ${missingPrices.join(", ")}`,
          );
        }
        if (positionRows.length === 0) {
          footer.push(
            "Lưu ý: Chưa có vị trí nào trong danh mục — thêm vị trí bằng set_position.",
          );
        }

        const output = [...header, ...rows, ...footer].join("\n");
        return { content: [{ type: "text" as const, text: output }] };
      } catch (err) {
        logger.error("[get_target_allocation] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi khi đọc phân bổ mục tiêu: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
