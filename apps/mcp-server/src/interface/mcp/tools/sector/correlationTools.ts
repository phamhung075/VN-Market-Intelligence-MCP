/**
 * Task 189 — Correlation Matrix MCP Tool
 *
 * Interface layer: registers the `get_correlation_matrix` tool on a McpServer.
 *
 * The tool:
 *   1. Reads price history from `market_prices_history` (last N days).
 *   2. Computes daily returns for each stock.
 *   3. Runs the Pearson correlation matrix (domain service).
 *   4. Returns Vietnamese formatted table + diversification score.
 *
 * Supports `_testDb` injection for in-memory SQLite in tests, so no network
 * or filesystem access is required during the test suite.
 *
 * @module interface/mcp/tools/correlationTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Database } from "bun:sqlite";

import {
  computeCorrelationMatrix,
  diversificationScore,
  correlationLabel,
  diversificationGrade,
} from "../../../../domain/services/correlationCalculator.js";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { sqlInClause } from "../../../../infrastructure/db/sqlHelpers.js";
import { logger } from "../../../../infrastructure/logger.js";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface PriceRow {
  code: string;
  price: number;
  fetched_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reads all watchlist codes from the database.
 * Returns empty array if table doesn't exist or is empty.
 */
function getWatchlistCodes(db: Database): string[] {
  try {
    const rows = db
      .query<{ code: string }, []>("SELECT code FROM watchlist")
      .all();
    return rows.map((r) => r.code);
  } catch {
    return [];
  }
}

/**
 * Queries `market_prices_history` for the last `days` calendar days,
 * grouped per stock code, ordered by date ascending.
 *
 * Returns a Map from stock code → ordered array of daily prices (VND).
 * Only one price per day is kept (the most recent record of that day).
 */
function loadPriceHistory(
  db: Database,
  codes: string[],
  days: number,
): Map<string, number[]> {
  if (codes.length === 0) return new Map();

  // market_prices_history (with exchange column) is created by initDatabase()
  // in src/infrastructure/db/schema.ts — no inline DDL needed here.

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10); // "YYYY-MM-DD"

  // Build parameterised IN clause
  const placeholders = sqlInClause(codes.length);

  let rows: PriceRow[];
  try {
    rows = db
      .query<PriceRow, string[]>(
        `SELECT code, price, fetched_at
         FROM market_prices_history
         WHERE code IN (${placeholders})
           AND fetched_at >= ?
         ORDER BY code ASC, fetched_at ASC`,
      )
      .all(...codes, cutoff);
  } catch {
    return new Map();
  }

  // Group by code → deduplicate to one price per calendar day (last record)
  const grouped = new Map<string, Map<string, number>>();
  const rawByCode = new Map<string, number[]>();
  for (const row of rows) {
    const day = row.fetched_at.slice(0, 10);
    if (!grouped.has(row.code)) grouped.set(row.code, new Map());
    grouped.get(row.code)!.set(day, row.price); // last record for that day wins
    if (!rawByCode.has(row.code)) rawByCode.set(row.code, []);
    rawByCode.get(row.code)!.push(row.price);
  }

  // Convert to ordered price arrays.
  // Preferred path: one sample per calendar day (for proper daily returns).
  // Fallback path (task 308): when only intraday data exists for a single day
  // (first day of deployment, or tight time window), fall back to the raw
  // intraday series downsampled to ≤30 evenly-spaced points. Without this,
  // get_correlation_matrix returns empty every time the watchlist has <2
  // calendar days of history — producing the '0 stocks analysed' complaint.
  const result = new Map<string, number[]>();
  for (const [code, dayMap] of grouped) {
    const daily = Array.from(dayMap.values());
    if (daily.length >= 2) {
      result.set(code, daily);
      continue;
    }
    const raw = rawByCode.get(code) ?? [];
    if (raw.length >= 10) {
      // Downsample to at most 30 points preserving order
      const stride = Math.max(1, Math.floor(raw.length / 30));
      const sampled: number[] = [];
      for (let i = 0; i < raw.length; i += stride) {
        const v = raw[i];
        if (v !== undefined) sampled.push(v);
      }
      if (sampled.length >= 2) result.set(code, sampled);
    }
  }

  return result;
}

/**
 * Converts a price series to simple daily returns:
 * rᵢ = (pᵢ - pᵢ₋₁) / pᵢ₋₁
 *
 * Returns array of length (prices.length - 1).
 */
function toReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const curr = prices[i] ?? 0;
    const prev = prices[i - 1] ?? 0;
    if (prev === 0) {
      returns.push(0);
    } else {
      returns.push((curr - prev) / prev);
    }
  }
  return returns;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Pads a string to a fixed width (left-aligned).
 */
function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

/**
 * Builds the Vietnamese formatted correlation table.
 *
 * Output example:
 *   Ma 1  | Ma 2  | Tuong quan | Muc do
 *   VCB   | FPT   | 0.32       | Thap
 *   VCB   | HPG   | 0.78       | Cao (!)
 *   FPT   | HPG   | 0.15       | Rat thap
 *
 *   Diem da dang hoa: 0.58 / 1.00 (Trung binh)
 */
export function formatOutput(
  correlations: { pair: [string, string]; r: number }[],
  stockCount: number,
  days: number,
): string {
  const score = correlations.length > 0 ? diversificationScore(correlations) : 0;
  const lines: string[] = [];

  lines.push(`=== Ma trận tương quan (${days} ngày gần nhất) ===`);
  lines.push(`Cổ phiếu phân tích: ${stockCount}  |  Cặp tương quan: ${correlations.length}`);
  lines.push("");

  if (correlations.length === 0) {
    lines.push(
      "Không đủ dữ liệu lịch sử giá để tính tương quan,",
      "Vui lòng chờ hệ thống thu thập dữ liệu (tối thiểu 2 ngày × 2 cổ phiếu).",
    );
  } else {
    // Table header
    const hdr = [
      pad("Mã 1", 6),
      pad("Mã 2", 6),
      pad("Tương quan", 12),
      "Mức độ",
    ].join(" | ");
    lines.push(hdr);
    lines.push("-".repeat(hdr.length));

    // Sort by |r| descending so strongest correlations appear first
    const sorted = [...correlations].sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

    for (const { pair, r } of sorted) {
      const { label, warn } = correlationLabel(r);
      const rStr = r.toFixed(2).padStart(6);
      const warnStr = warn ? " (!)" : "";
      lines.push(
        [
          pad(pair[0], 6),
          pad(pair[1], 6),
          pad(`${rStr}`, 12),
          `${label}${warnStr}`,
        ].join(" | "),
      );
    }

    lines.push("");
    const grade = diversificationGrade(score);
    lines.push(
      `Điểm đa dạng hoá: ${score.toFixed(2)} / 1.00 (${grade})`,
    );

    // Interpretation note
    if (score >= 0.8) {
      lines.push("-> Danh mục đa dạng hoá tốt. Rủi ro tập trung thấp.");
    } else if (score >= 0.6) {
      lines.push("-> Danh mục đa dạng hoá trung bình.");
    } else if (score >= 0.4) {
      lines.push("-> Danh mục ít đa dạng hoá. Xem xét thêm cổ phiếu các ngành khác.");
    } else {
      lines.push("-> Danh mục tập trung cao, các cổ phiếu biến động cùng chiều!");
    }
  }

  lines.push("");
  lines.push(`Cap nhat: ${new Date().toISOString()}`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Registers the `get_correlation_matrix` MCP tool on the given server.
 *
 * @param server - The McpServer instance to register on.
 */
export function registerCorrelationTools(server: McpServer): void {
  server.tool(
    "get_correlation_matrix",
    "Tính ma trận tương quan Pearson cho tất cả cặp cổ phiếu trong watchlist. " +
      "Sử dụng lịch sử giá tích lũy trong SQLite (market_prices_history). " +
      "Trả về bảng tương quan có phân loại mức độ (rất thấp / thấp / trung bình / cao / rất cao) " +
      "và điểm đa dạng hóa danh mục (0-1). " +
      "Compute Pearson correlation matrix for all watchlist stock pairs using price history.",
    {
      days: z.coerce
        .number()
        .int()
        .min(5)
        .max(365)
        .default(30)
        .describe(
          "Number of calendar days of price history to use (default: 30, min: 5, max: 365).",
        ),
      codes: z
        .array(z.string().min(1).max(10))
        .optional()
        .describe(
          "Optional list of stock codes to analyse. If omitted, all watchlist codes are used.",
        ),
      // Test-only injection: path to an in-memory or alternative DB
      _testDb: z.string().optional().describe("Internal: test DB path override"),
    },
    async (args) => {
      const { days: daysRaw, codes: codesArg, _testDb } = args as {
        days?: number;
        codes?: string[];
        _testDb?: string;
      };

      const days = daysRaw ?? 30;

      try {
        // ── Resolve database ────────────────────────────────────────────────
        let db: Database;
        if (_testDb !== undefined) {
          // Test mode: open a fresh in-memory DB (no persistent data)
          db = new Database(_testDb);
        } else {
          await initDatabase();
          db = getDb();
        }

        // ── Resolve stock codes ──────────────────────────────────────────────
        const rawCodes =
          codesArg && codesArg.length > 0
            ? codesArg.map((c) => c.toUpperCase())
            : getWatchlistCodes(db);

        if (rawCodes.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: [
                  "=== Ma trận tương quan ===",
                  "",
                  "Watchlist trống (không có cổ phiếu). ",
                  "Vui lòng thêm cổ phiếu vào watchlist trước (add_watchlist_stock).",
                ].join("\n"),
              },
            ],
          };
        }

        // ── Load price history ───────────────────────────────────────────────
        const priceHistory = loadPriceHistory(db, rawCodes, days);

        // Convert to return series — only keep stocks with ≥2 data points
        const returnSeries = new Map<string, number[]>();
        for (const [code, prices] of priceHistory) {
          const returns = toReturns(prices);
          if (returns.length >= 2) {
            returnSeries.set(code, returns);
          }
        }

        // ── Compute correlations ─────────────────────────────────────────────
        const correlations = computeCorrelationMatrix(returnSeries);

        // ── Format output ────────────────────────────────────────────────────
        const text = formatOutput(
          correlations,
          returnSeries.size,
          days,
        );

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        logger.error("[get_correlation_matrix] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi khi tính ma trận tương quan: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
