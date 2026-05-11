/**
 * Task 191 — get_performance_attribution MCP Tool
 *
 * Interface layer: registers the `get_performance_attribution` MCP tool.
 *
 * Tool registered:
 *   get_performance_attribution — show which signal types drove the best
 *   investment returns over a configurable lookback period.
 *
 * Logic:
 *   1. Query `alerts` table for alerts within `days` lookback period,
 *      optionally filtered by signalType.
 *   2. For each alert, extract the primary signal type from `signals_json`
 *      and the stock code from `affected_actions_json`.
 *   3. Fetch matching price history from `market_prices_history`.
 *   4. Delegate to computeAttribution() domain service for scoring.
 *   5. Format output as a Vietnamese attribution table.
 *
 * Output format (plain text, no Markdown):
 *   Hieu suat theo loai tin hieu (30 ngay)
 *
 *   Loai            | SL   | Thang | Thua  | TB %  | Win Rate
 *   news_mention    | 30   | 21    | 9     | +1.2% | 70%
 *   price_drop      | 11   | 6     | 5     | -0.3% | 55%
 *
 *   Tong: 45 alerts | Win Rate trung binh: 64%
 *
 * @module interface/mcp/tools/performanceTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { sqlInClause } from "../../../../infrastructure/db/sqlHelpers.js";
import {
  computeAttribution,
  type AlertInput,
  type PricePoint,
} from "../../../../domain/services/performanceAttribution.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal types for DB row shapes
// ─────────────────────────────────────────────────────────────────────────────

interface AlertRow {
  id: string;
  triggered_at: string;
  signals_json: string | null;
  affected_actions_json: string | null;
}

interface PriceRow {
  code: string;
  price: number;
  fetched_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the primary signal type from a signals_json string.
 * Returns "unknown" when the field is null, invalid, or empty.
 */
function extractPrimarySignalType(json: string | null): string {
  if (!json) return "unknown";
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length === 0) return "unknown";
    const first = parsed[0];
    if (first && typeof first === "object" && "type" in first) {
      const t = (first as { type: unknown }).type;
      if (typeof t === "string" && t.length > 0) return t;
    }
    if (typeof first === "string") return first;
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Extract the primary stock code from an affected_actions_json string.
 * Returns null when the field is null, invalid, or empty.
 */
function extractPrimaryCode(json: string | null): string | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const first = parsed[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "code" in first) {
      const code = (first as { code: unknown }).code;
      return typeof code === "string" ? code : null;
    }
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Output formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a SignalPerformance array as a Vietnamese attribution table.
 *
 * @param performances - Array from computeAttribution()
 * @param days         - Lookback period in days (for header)
 * @param signalFilter - Optional signal type filter applied (for header)
 */
export function formatAttribution(
  performances: ReturnType<typeof computeAttribution>,
  days: number,
  signalFilter: string | undefined,
): string {
  if (performances.length === 0) {
    const filterNote = signalFilter ? ` (${signalFilter})` : "";
    return `Không có dữ liệu${filterNote} trong ${days} ngày qua.`;
  }

  const lines: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────────
  const filterNote = signalFilter ? ` - Lọc: ${signalFilter}` : "";
  lines.push(`Hiệu suất theo loại tín hiệu (${days} ngày)${filterNote}`);
  lines.push("");

  // ── Table header ──────────────────────────────────────────────────────────
  const COL_W = 16;
  const numCol = (n: number | string, w = 6) => String(n).padStart(w);

  const header =
    "Loại".padEnd(COL_W) +
    "| " + numCol("SL") + " " +
    "| " + numCol("Thắng") + " " +
    "| " + numCol("Thua") + " " +
    "| " + numCol("TB %", 7) + " " +
    "| " + numCol("Win Rate", 9);
  lines.push(header);
  lines.push("-".repeat(header.length));

  // ── Rows ──────────────────────────────────────────────────────────────────
  let totalAlerts = 0;
  let totalHits = 0;
  let totalScoreable = 0;

  for (const perf of performances) {
    const avgStr = Number.isNaN(perf.avgReturnPct)
      ? "  N/A "
      : (perf.avgReturnPct >= 0 ? "+" : "") +
        perf.avgReturnPct.toFixed(1) + "%";

    const winStr = (perf.hitCount + perf.missCount) > 0
      ? perf.winRate + "%"
      : "N/A";

    const row =
      perf.signalType.padEnd(COL_W) +
      "| " + numCol(perf.totalAlerts) + " " +
      "| " + numCol(perf.hitCount) + " " +
      "| " + numCol(perf.missCount) + " " +
      "| " + numCol(avgStr, 7) + " " +
      "| " + numCol(winStr, 9);
    lines.push(row);

    totalAlerts += perf.totalAlerts;
    totalHits += perf.hitCount;
    totalScoreable += perf.hitCount + perf.missCount;
  }

  // ── Summary line ──────────────────────────────────────────────────────────
  lines.push("");
  const avgWinRate =
    totalScoreable > 0
      ? Math.round((totalHits / totalScoreable) * 100)
      : 0;

  lines.push(
    `Tổng: ${totalAlerts} alerts | Win Rate trung bình: ${avgWinRate}%`,
  );

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `get_performance_attribution` MCP tool on the given server instance.
 *
 * @param server - The McpServer instance to register the tool on.
 */
export function registerPerformanceTools(server: McpServer): void {
  server.tool(
    "get_performance_attribution",
    "Performance attribution: shows which signal types drove the best investment returns. " +
      "For each signal type (price_drop, price_surge, news_mention, etc.), shows total alerts, " +
      "hit count (correct direction), miss count (wrong direction), average 3-day return %, " +
      "and win rate. Directional signals (price_drop/price_surge) are scored; " +
      "neutral signals (news_mention) are counted but not scored. " +
      "Output is a Vietnamese formatted attribution table.",
    {
      days: z.coerce
        .number()
        .optional()
        .default(30)
        .describe("Lookback period in days (default: 30)"),
      signalType: z
        .string()
        .optional()
        .describe(
          "Optional: filter to a specific signal type, e.g. 'price_drop', 'news_mention'",
        ),
    },
    async ({ days: daysRaw, signalType }) => {
      const days = daysRaw ?? 30;

      try {
        await initDatabase();
        const db = getDb();

        const since = new Date(Date.now() - days * 86_400_000).toISOString();

        // ── 1. Query alerts in the window ────────────────────────────────────
        let query = `
          SELECT id, triggered_at, signals_json, affected_actions_json
          FROM alerts
          WHERE triggered_at >= ?
        `;
        const queryParams: (string | number)[] = [since];

        if (signalType) {
          // Simple JSON substring filter — good enough for signal type matching
          query += " AND signals_json LIKE ?";
          queryParams.push(`%${signalType}%`);
        }

        query += " ORDER BY triggered_at DESC";

        const alertRows = db.prepare(query).all(...queryParams) as AlertRow[];

        // ── 2. Build AlertInput list and collect stock codes ─────────────────
        const alertInputs: AlertInput[] = [];
        const stockCodes = new Set<string>();

        for (const row of alertRows) {
          const sType = extractPrimarySignalType(row.signals_json);
          const code = extractPrimaryCode(row.affected_actions_json);
          if (!code) continue;

          // Apply signalType filter at the parsed level too
          if (signalType && sType !== signalType) continue;

          alertInputs.push({
            signalType: sType,
            actionCode: code,
            triggeredAt: row.triggered_at,
          });
          stockCodes.add(code);
        }

        // ── 3. Fetch price history for relevant stocks ───────────────────────
        const priceHistory = new Map<string, PricePoint[]>();

        if (stockCodes.size > 0) {
          const codes = Array.from(stockCodes);
          const placeholders = sqlInClause(codes.length);

          const priceRows = db
            .prepare<PriceRow, string[]>(`
              SELECT code, price, fetched_at
              FROM market_prices_history
              WHERE code IN (${placeholders})
                AND fetched_at >= ?
              ORDER BY code, fetched_at ASC
            `)
            .all(...codes, since) as PriceRow[];

          for (const row of priceRows) {
            const list = priceHistory.get(row.code) ?? [];
            list.push({ date: row.fetched_at, price: row.price });
            priceHistory.set(row.code, list);
          }
        }

        // ── 4. Delegate to domain service ────────────────────────────────────
        const performances = computeAttribution(alertInputs, priceHistory);

        // ── 5. Format output ─────────────────────────────────────────────────
        const text = formatAttribution(performances, days, signalType);

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        console.error("[get_performance_attribution] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi khi tính toán hiệu suất: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
