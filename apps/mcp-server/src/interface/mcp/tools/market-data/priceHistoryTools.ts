/**
 * Task 178 — Price History MCP Tool
 *
 * Interface layer: registers the `get_price_history` MCP tool.
 *
 * Tool registered:
 *   1. get_price_history — queries `daily_ohlcv` table for a given stock code
 *      over N days and returns a formatted Vietnamese-friendly text table with
 *      per-row OHLCV data plus period statistics (min, max, avg, return %).
 *
 *   NOTE (Task 1804c): Changed from `market_prices_history` (24h rolling
 *   intraday ticks) to `daily_ohlcv` (permanent daily candles). The old table
 *   was pruned on every VPS push so a days=30 query only returned 24h of data.
 *
 * DB injection:
 *   The second argument `_db` accepts a `bun:sqlite` Database instance.
 *   When omitted, the production singleton from `infrastructure/db/index.ts`
 *   is used. Tests pass an isolated in-memory database.
 *
 * @module interface/mcp/tools/priceHistory
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Database } from "bun:sqlite";
import { logger } from "../../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A single row read from `daily_ohlcv`. */
interface PriceRow {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a price number as a Vietnamese-style integer string with commas.
 *
 * @example formatPrice(85000) → "85,000"
 */
function formatPrice(price: number): string {
  return Math.round(price).toLocaleString("en-US");
}

/**
 * Format a volume number in abbreviated form (M = million, K = thousand).
 */
function formatVolume(volume: number): string {
  if (volume >= 1_000_000) {
    return `${(volume / 1_000_000).toFixed(2)}M`;
  }
  if (volume >= 1_000) {
    return `${(volume / 1_000).toFixed(1)}K`;
  }
  return String(Math.round(volume));
}

/**
 * Parse an ISO date string and return the date portion in "YYYY-MM-DD" format.
 */
function toDateStr(isoString: string): string {
  return isoString.slice(0, 10);
}

/**
 * Format the period return as "+X.XX%" or "-X.XX%".
 *
 * @param oldest - Price at the start of the period.
 * @param newest - Price at the end of the period.
 */
function formatReturn(oldest: number, newest: number): string {
  if (oldest === 0) return "N/A";
  const pct = ((newest - oldest) / oldest) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * Build the formatted text output for a price history query.
 *
 * @param code   - Stock ticker (e.g. "VCB").
 * @param days   - Requested look-back window.
 * @param rows   - Data rows from the DB, sorted newest → oldest.
 * @returns Multi-line plain-text string suitable for MCP tool output.
 */
export function formatPriceHistory(code: string, days: number, rows: PriceRow[]): string {
  const lines: string[] = [];

  lines.push(`Lịch sử giá ${code} (${days} ngày)`);
  lines.push("=".repeat(52));

  if (rows.length === 0) {
    lines.push(`Không có dữ liệu cho mã ${code} trong ${days} ngày qua.`);
    return lines.join("\n");
  }

  // ── Table header ──────────────────────────────────────────────────────────
  lines.push(
    `${"Ngày".padEnd(12)} | ${"Giá".padStart(10)} | ${"KL GD".padStart(10)} | ${"Thay đổi".padStart(10)}`,
  );
  lines.push("-".repeat(52));

  // ── Table rows (newest first) ──────────────────────────────────────────
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const dateStr = toDateStr(row.date);
    const priceStr = formatPrice(row.close);
    const volumeStr = formatVolume(row.volume);

    // Change vs previous (older) row — row i+1 is the previous day
    let changeStr = "-";
    const prevRow = rows[i + 1];
    if (prevRow !== undefined) {
      const prev = prevRow.close;
      if (prev > 0) {
        const pct = ((row.close - prev) / prev) * 100;
        const sign = pct >= 0 ? "+" : "";
        changeStr = `${sign}${pct.toFixed(2)}%`;
      }
    }

    lines.push(
      `${dateStr.padEnd(12)} | ${priceStr.padStart(10)} | ${volumeStr.padStart(10)} | ${changeStr.padStart(10)}`,
    );
  }

  lines.push("-".repeat(52));

  // ── Statistics ─────────────────────────────────────────────────────────
  const prices = rows.map((r) => r.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

  // Period return: oldest row → newest row (rows[0] is newest, rows[last] is oldest)
  const newestRow = rows[0];
  const oldestRow = rows[rows.length - 1];
  const newestPrice = newestRow?.close ?? 0;
  const oldestPrice = oldestRow?.close ?? 0;
  const periodReturn = formatReturn(oldestPrice, newestPrice);

  lines.push(
    `Thống kê: Min ${formatPrice(minPrice)} | Max ${formatPrice(maxPrice)} | TB ${formatPrice(avgPrice)} | Lợi nhuận ${periodReturn}`,
  );

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `get_price_history` MCP tool.
 *
 * @param server - The McpServer instance to register tools on.
 * @param _db    - Optional Database override for testing (uses production
 *                 singleton when omitted).
 */
export function registerPriceHistoryTools(
  server: McpServer,
  _db?: Database,
): void {
  server.tool(
    "get_price_history",
    "Get price history for a stock over N days. Returns daily OHLCV data with min/max/avg/return stats. " +
      "Queries the daily_ohlcv table which holds permanent daily candles (not the 24h-pruned intraday ticks).",
    {
      code: z
        .string()
        .describe("Stock ticker code (e.g. 'VCB', 'FPT', 'VNM')"),
      days: z.coerce
        .number()
        .max(730)
        .optional()
        .default(7)
        .describe("Number of days to look back (default 7, max 730)"),
    },
    async ({ code: rawCode, days }) => {
      const lookbackDays = Math.min(Math.max(1, days ?? 7), 730); // FIX-E: widened 90→730
      const code = rawCode.toUpperCase().trim();

      try {
        // ── Resolve DB instance ─────────────────────────────────────────────
        let db: Database;
        if (_db) {
          db = _db;
        } else {
          // Production path: import singleton lazily to avoid circular deps
          const { getDb } = await import("../../../../infrastructure/db/index.js");
          db = getDb();
        }

        // ── Query ───────────────────────────────────────────────────────────
        // ALLZERO-OHLCV-FETCH: AND close > 0 excludes all-zero rows (DPI-4 foreign-flow
        // stub rows with open/high/low/close=0, and non-trading-day gap rows stamped
        // with zeros by the bulk fetcher on 2026-05-30). A zero in the 20-period BB
        // window detonates stdev to ±35k and zero-anchors the chart Y-axis.
        const rows = db
          .query<PriceRow, [string, number]>(
            `SELECT code, date, open, high, low, close, volume
               FROM daily_ohlcv
              WHERE code = ?
                AND date >= date('now', '-' || ? || ' days')
                AND close > 0
              ORDER BY date DESC`,
          )
          .all(code, lookbackDays);

        // ── Format ──────────────────────────────────────────────────────────
        const text = formatPriceHistory(code, lookbackDays, rows);

        // FIX-E: structured JSON array output {code, date, close, volume}
        // Added ALONGSIDE existing text output (non-breaking — content[0] is unchanged).
        // Consumers that read content[1] get machine-readable candles.
        // Honest-absent: empty array when no rows exist (no padding/fabrication).
        const structuredArray = rows.map((r) => ({
          code: r.code,
          date: toDateStr(r.date),
          close: r.close,
          volume: r.volume,
        }));

        return {
          content: [
            { type: "text" as const, text },
            {
              type: "text" as const,
              text: JSON.stringify({
                code,
                days: lookbackDays,
                data: structuredArray,
              }),
            },
          ],
        };
      } catch (err) {
        logger.error("[get_price_history] Query failed", {
          code,
          days: lookbackDays,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi truy vấn lịch sử giá ${code}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
