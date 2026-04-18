/**
 * Technical Indicator MCP Tool — Task 1303
 *
 * Interface layer: registers the `get_technical_indicators` MCP tool.
 *
 * Tool registered:
 *   1. get_technical_indicators — queries `market_prices_history` for daily
 *      closing prices, runs MA(5/20/50), RSI(14), MACD(12,26,9), and
 *      BB(20,2σ) via the pure domain service, and returns a Vietnamese-
 *      friendly text report with a bullish/bearish conclusion block.
 *
 * DB injection:
 *   The second argument `_db` accepts a `bun:sqlite` Database instance.
 *   When omitted, the production singleton from `infrastructure/db/index.ts`
 *   is used. Tests pass an isolated in-memory database.
 *
 * SQL note:
 *   Uses AVG(price) GROUP BY date as the daily close proxy per REQ-090.
 *   All parameters are bound via parameterized queries — no string interpolation.
 *
 * @module interface/mcp/tools/technicalIndicatorTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import {
  computeAllIndicators,
  type DailyCandle,
} from "../../../domain/services/technicalIndicators.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One row returned by the daily-candle SQL query. */
interface CandleRow {
  day: string;
  close_price: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — formatting
// ─────────────────────────────────────────────────────────────────────────────

/** Format a price as integer with commas, e.g. 94200 → "94,200". */
function fmtPrice(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Format a signed number with leading + sign, e.g. 180 → "+180", -95 → "-95". */
function fmtSigned(n: number): string {
  const rounded = Math.round(n);
  return rounded >= 0 ? `+${rounded.toLocaleString("en-US")}` : rounded.toLocaleString("en-US");
}

/** Format a float to one decimal place. */
function fmtDec1(n: number): string {
  return n.toFixed(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — signal interpretation
// ─────────────────────────────────────────────────────────────────────────────

/** MA stack verdict — requires current price for comparison. */
function maSignal(
  price: number,
  ma5: number | null,
  ma20: number | null,
  ma50: number | null,
): "TANG" | "GIAM" | "TRUNG TINH" {
  // Bullish stack: price > MA5 > MA20 > MA50
  if (
    ma5 !== null && ma20 !== null && ma50 !== null &&
    price > ma5 && ma5 > ma20 && ma20 > ma50
  ) return "TANG";

  // Bearish stack: price < MA5 < MA20 < MA50
  if (
    ma5 !== null && ma20 !== null && ma50 !== null &&
    price < ma5 && ma5 < ma20 && ma20 < ma50
  ) return "GIAM";

  return "TRUNG TINH";
}

/** RSI zone label. */
function rsiLabel(rsi: number): { signal: "TANG" | "GIAM" | "TRUNG TINH"; label: string } {
  if (rsi > 70) return { signal: "TANG", label: `Quá mua (overbought)` };
  if (rsi < 40) return { signal: "GIAM", label: `Quá bán (oversold)` };
  return { signal: "TRUNG TINH", label: `Trung tính (vùng 40-70, còn dư room)` };
}

/** MACD verdict based on histogram sign. */
function macdSignal(histogram: number): "TANG" | "GIAM" | "TRUNG TINH" {
  if (histogram > 0) return "TANG";
  if (histogram < 0) return "GIAM";
  return "TRUNG TINH";
}

/** BB position verdict: (price - lower) / (upper - lower) > 50% = TANG. */
function bbSignal(
  price: number,
  upper: number,
  lower: number,
): { signal: "TANG" | "GIAM"; pct: number } {
  const range = upper - lower;
  const pct = range > 0 ? ((price - lower) / range) * 100 : 50;
  return { signal: pct > 50 ? "TANG" : "GIAM", pct };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — output format
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the full Vietnamese-friendly technical indicator report.
 *
 * @param code       - Stock ticker (uppercase).
 * @param candles    - Daily candles ordered oldest → newest.
 * @param lookbackDays - The requested look-back window (for header).
 */
function formatReport(code: string, candles: DailyCandle[], lookbackDays: number): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  // ── Insufficient data guard ────────────────────────────────────────────────
  if (candles.length < 35) {
    lines.push(`[${code}] Không đủ dữ liệu kỹ thuật`);
    lines.push(
      `Tìm thấy ${candles.length} nến (cần tối thiểu 35 cho MACD).`,
    );
    lines.push(`Vui lòng thử lại sau khi có thêm dữ liệu lịch sử.`);
    return lines.join("\n");
  }

  // ── Compute indicators ─────────────────────────────────────────────────────
  const result = computeAllIndicators(candles);
  const lastPrice = candles[candles.length - 1]!.close;

  // ── Header ─────────────────────────────────────────────────────────────────
  lines.push(`[${code}] Chỉ báo kỹ thuật — ${today} (${lookbackDays} ngày)`);
  lines.push("");

  // ── MA block ──────────────────────────────────────────────────────────────
  const ma5Str  = result.ma5  !== null ? `MA5=${fmtPrice(result.ma5)}`   : "MA5=N/A";
  const ma20Str = result.ma20 !== null ? `MA20=${fmtPrice(result.ma20)}` : "MA20=N/A";
  const ma50Str = result.ma50 !== null ? `MA50=${fmtPrice(result.ma50)}` : "MA50=N/A (cần 50 nến)";
  const maSig = maSignal(lastPrice, result.ma5, result.ma20, result.ma50);
  const maDesc =
    maSig === "TANG" ? "giá > MA5 > MA20 > MA50" :
    maSig === "GIAM" ? "giá < MA5 < MA20 < MA50" :
    "sắp xếp hỗn hợp";
  lines.push(`MA:   ${ma5Str}  ${ma20Str}  ${ma50Str}  → Xu hướng ${maSig} (${maDesc})`);

  // ── RSI block ──────────────────────────────────────────────────────────────
  if (result.rsi14 !== null) {
    const rsi = result.rsi14;
    const { label } = rsiLabel(rsi);
    lines.push(`RSI(14): ${fmtDec1(rsi)} → ${label}`);
  } else {
    lines.push(`RSI(14): N/A (cần tối thiểu 15 nến)`);
  }

  // ── MACD block ─────────────────────────────────────────────────────────────
  if (result.macd !== null) {
    const { line, signal, histogram } = result.macd;
    const sig = macdSignal(histogram);
    const desc =
      sig === "TANG" ? "histogram dương và tăng" :
      sig === "GIAM" ? "histogram âm và giảm" :
      "histogram = 0";
    lines.push(
      `MACD:  Line=${fmtSigned(line)}  Signal=${fmtSigned(signal)}  Hist=${fmtSigned(histogram)}  → ${sig} (${desc})`,
    );
  } else {
    lines.push(`MACD:  N/A (cần tối thiểu 34 nến)`);
  }

  // ── BB block ───────────────────────────────────────────────────────────────
  if (result.bb20 !== null) {
    const { upper, mid, lower } = result.bb20;
    const { pct } = bbSignal(lastPrice, upper, lower);
    const zone =
      pct > 80 ? "cao (cảnh overbought)" :
      pct > 50 ? "trung bình-cao" :
      pct > 20 ? "trung bình-thấp" :
      "thấp (cảnh oversold)";
    lines.push(
      `BB(20):  Upper=${fmtPrice(upper)}  Mid=${fmtPrice(mid)}  Lower=${fmtPrice(lower)}`,
    );
    lines.push(
      `         Price=${fmtPrice(lastPrice)} → ${fmtDec1(pct)}% cua dai BB (${zone})`,
    );
  } else {
    lines.push(`BB(20):  N/A (cần tối thiểu 20 nến)`);
  }

  // ── Conclusion block ───────────────────────────────────────────────────────
  lines.push("");
  const signals: Array<"TANG" | "GIAM" | "TRUNG TINH"> = [];

  // MA signal (only count if all 3 MAs available for full stack determination)
  signals.push(maSignal(lastPrice, result.ma5, result.ma20, result.ma50));

  // RSI signal
  if (result.rsi14 !== null) {
    signals.push(rsiLabel(result.rsi14).signal);
  }

  // MACD signal
  if (result.macd !== null) {
    signals.push(macdSignal(result.macd.histogram));
  }

  // BB signal
  if (result.bb20 !== null) {
    const { signal: bbSig } = bbSignal(lastPrice, result.bb20.upper, result.bb20.lower);
    signals.push(bbSig);
  }

  const tangCount = signals.filter((s) => s === "TANG").length;
  const giamCount = signals.filter((s) => s === "GIAM").length;
  const total = signals.length;

  let verdict: string;
  let phrase: string;
  if (tangCount >= giamCount && tangCount > total / 2) {
    verdict = "TĂNG";
    phrase = "có thể xem xét MUA khi RSI < 70";
  } else if (giamCount > tangCount && giamCount > total / 2) {
    verdict = "GIẢM";
    phrase = "cẩn thận — có thể xem xét chốt lời hoặc chờ thêm xác nhận";
  } else {
    verdict = "TRUNG TÍNH";
    phrase = "chưa rõ xu hướng — theo dõi thêm trước khi hành động";
  }

  lines.push(`Kết luận: ${tangCount}/${total} chỉ báo TĂNG — ${phrase}`);
  lines.push(`Tổng thể: ${verdict}`);

  return lines.join("\n");
}

/** Exported alias for testability (task 1408). Same function as formatReport. */
export const formatTaIndicatorReport = formatReport;

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `get_technical_indicators` MCP tool.
 *
 * @param server - The McpServer instance to register tools on.
 * @param _db    - Optional Database override for testing (uses production
 *                 singleton when omitted).
 */
export function registerTechnicalIndicatorTools(
  server: McpServer,
  _db?: Database,
): void {
  server.tool(
    "get_technical_indicators",
    "Compute RSI(14), MACD(12,26,9), MA(5/20/50), and Bollinger Bands(20,2σ) " +
      "for a VN stock ticker using existing price history. Returns a Vietnamese-" +
      "friendly plain-text report with a TANG/GIAM/TRUNG TINH conclusion block. " +
      "Reads from the local market_prices_history table — no new data fetches.",
    {
      actionCode: z
        .string()
        .min(1)
        .max(10)
        .describe("Stock ticker, e.g. VCB, HPG, FPT"),
      days: z.coerce
        .number()
        .int()
        .min(35)
        .max(365)
        .optional()
        .default(60)
        .describe("Look-back days (default 60, min 35 for MACD)"),
    },
    async ({ actionCode, days }) => {
      const lookbackDays = days ?? 60;
      const code = actionCode.toUpperCase().trim();

      try {
        // ── Resolve DB instance ───────────────────────────────────────────────
        let db: Database;
        if (_db) {
          db = _db;
        } else {
          const { getDb } = await import("../../../infrastructure/db/index.js");
          db = getDb();
        }

        // ── Parameterized query: one AVG price row per calendar day ──────────
        // Parameter binding: [code, "-60 days"] format required by SQLite datetime()
        const interval = `-${lookbackDays} days`;
        const rows = db
          .query<CandleRow, [string, string]>(
            `SELECT date(fetched_at) AS day, AVG(price) AS close_price
               FROM market_prices_history
              WHERE code = ?
                AND fetched_at >= datetime('now', ?)
              GROUP BY date(fetched_at)
              ORDER BY day ASC`,
          )
          .all(code, interval);

        // ── Map to DailyCandle ────────────────────────────────────────────────
        const candles: DailyCandle[] = rows.map((r) => ({
          day: r.day,
          close: r.close_price,
        }));

        // ── Format report ─────────────────────────────────────────────────────
        const text = formatReport(code, candles, lookbackDays);

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        logger.error("[get_technical_indicators] Query failed", {
          code,
          days: lookbackDays,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi tính chỉ báo kỹ thuật ${code}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
