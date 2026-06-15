/**
 * Technical Indicator MCP Tool — Task 1303 (HTTP rewire P2-B1)
 *
 * Interface layer: registers the `get_technical_indicators` MCP tool.
 *
 * Tool registered:
 *   1. get_technical_indicators — calls the Go TA microservice (port 5003) via
 *      HTTP POST /ta/indicators to compute MA(5/20/50), RSI(14), MACD(12,26,9),
 *      and BB(20,2σ), then returns a Vietnamese-friendly text report with a
 *      bullish/bearish conclusion block.
 *
 * HTTP rewire (P2-B1 — G5):
 *   Removed domain/services/technicalIndicators.js import (AC-1).
 *   Primary path: HTTP call to infrastructure/microservices/clients.ts
 *     computeTAIndicators() at port 5003 via POST /ta/indicators (AC-2, AC-4).
 *   Fallback path: local DB computation using local pure-math helpers when
 *     Go service is unavailable (ensures continuity until P2-B2 completion).
 *   Local ToolCandle type defined here (AC-6) — replaces DailyCandle from
 *     domain service. Exported for test files 1408/1410 type redirect (AC-9).
 *   formatTaIndicatorReport kept for test-layer use (task 1408) via local
 *     pure-math helpers — no domain import required.
 *
 * DB injection:
 *   The second argument `_db` accepts a `bun:sqlite` Database instance.
 *   When omitted, the production singleton from `infrastructure/db/index.ts`
 *   is used. Tests pass an isolated in-memory database.
 *
 * @module interface/mcp/tools/technicalIndicatorTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Database } from "bun:sqlite";
import { logger } from "../../../../infrastructure/logger.js";
import {
  computeTAIndicators,
  type ComputeTAResponse,
} from "../../../../infrastructure/microservices/clients.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Local candle type — replaces DailyCandle from domain service (P2-B1 AC-6).
 * Shape is identical to the former domain DailyCandle: { day, close }.
 * Exported so test files 1408 and 1410 can redirect their type import here
 * instead of domain/services/technicalIndicators.js (AC-9).
 */
export interface ToolCandle {
  /** "YYYY-MM-DD" */
  day: string;
  /** Closing price for that date */
  close: number;
}

/** Local indicator result — mirrors domain TechnicalIndicatorResult, no import. */
interface LocalIndicatorResult {
  ma5: number | null;
  ma20: number | null;
  ma50: number | null;
  rsi14: number | null;
  macd: { line: number; signal: number; histogram: number } | null;
  bb20: { upper: number; mid: number; lower: number } | null;
}

/** One row returned by the daily-candle SQL query. */
interface CandleRow {
  day: string;
  close_price: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Local pure-math helpers
// Self-contained duplicates of the domain math for use by formatTaIndicatorReport
// (test-layer compat) and the DB fallback path. Kept until G5 is complete (P2-B2).
// ─────────────────────────────────────────────────────────────────────────────

/** Standard EMA using k = 2 / (period + 1). Seed = prices[0]. */
function localEma(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [prices[0]!];
  for (let i = 1; i < prices.length; i++) {
    result.push(prices[i]! * k + result[i - 1]! * (1 - k));
  }
  return result;
}

/** Wilder EMA using k = 1/period. Seed = simple mean of first `period` values. */
function localWilderEma(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 1 / period;
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result: number[] = [seed];
  for (let i = period; i < values.length; i++) {
    result.push(values[i]! * k + result[result.length - 1]! * (1 - k));
  }
  return result;
}

/** Population standard deviation (divide by N). Returns 0 for < 2 elements. */
function localPopStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Simple Moving Average of last `period` values. Returns null if insufficient data. */
function localComputeMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const window = prices.slice(-period);
  return window.reduce((a, b) => a + b, 0) / period;
}

/** RSI(period) with Wilder smoothing. Returns null if insufficient data. */
function localComputeRSI(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  const deltas: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    deltas.push(prices[i]! - prices[i - 1]!);
  }
  const gains = deltas.map((d) => (d > 0 ? d : 0));
  const losses = deltas.map((d) => (d < 0 ? -d : 0));
  const sg = localWilderEma(gains, period);
  const sl = localWilderEma(losses, period);
  if (!sg.length || !sl.length) return null;
  const avgGain = sg[sg.length - 1]!;
  const avgLoss = sl[sl.length - 1]!;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** MACD(fast,slow,signal) using standard EMA. Returns null if insufficient data. */
function localComputeMACD(
  prices: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { line: number; signal: number; histogram: number } | null {
  if (prices.length < slow + signalPeriod - 1) return null;
  const fastEma = localEma(prices, fast);
  const slowEma = localEma(prices, slow);
  const macdLine: number[] = slowEma.map((s, i) => (fastEma[i] ?? 0) - s);
  const signalLine = localEma(macdLine, signalPeriod);
  const lastMacd = macdLine[macdLine.length - 1]!;
  const lastSignal = signalLine[signalLine.length - 1]!;
  return { line: lastMacd, signal: lastSignal, histogram: lastMacd - lastSignal };
}

/** Bollinger Bands(period, mult×σ). Returns null if insufficient data. */
function localComputeBB(
  prices: number[],
  period = 20,
  mult = 2,
): { upper: number; mid: number; lower: number } | null {
  if (prices.length < period) return null;
  const window = prices.slice(-period);
  const mid = window.reduce((a, b) => a + b, 0) / period;
  const stdDev = localPopStdDev(window);
  return { upper: mid + mult * stdDev, mid, lower: mid - mult * stdDev };
}

/** Compute all indicators from a ToolCandle array using local pure-math helpers. */
function localComputeAllIndicators(candles: ToolCandle[]): LocalIndicatorResult {
  const prices = candles.map((c) => c.close);
  return {
    ma5:   localComputeMA(prices, 5),
    ma20:  localComputeMA(prices, 20),
    ma50:  localComputeMA(prices, 50),
    rsi14: localComputeRSI(prices, 14),
    macd:  localComputeMACD(prices),
    bb20:  localComputeBB(prices, 20, 2),
  };
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
  if (
    ma5 !== null && ma20 !== null && ma50 !== null &&
    price > ma5 && ma5 > ma20 && ma20 > ma50
  ) return "TANG";
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

/** Map Go service trend field to local signal. */
function mapGoTrend(
  trend: "TANG" | "GIAM" | "TREN_DUNG" | "NEUTRAL",
): "TANG" | "GIAM" | "TRUNG TINH" {
  if (trend === "TANG") return "TANG";
  if (trend === "GIAM") return "GIAM";
  return "TRUNG TINH";
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the full Vietnamese-friendly technical indicator report from a ToolCandle
 * array using local pure-math computation. Used by formatTaIndicatorReport (exported
 * for test-layer use) and by the DB fallback path in the production handler.
 *
 * @param code         - Stock ticker (uppercase).
 * @param candles      - Daily candles ordered oldest → newest.
 * @param lookbackDays - The requested look-back window (for header).
 */
function formatReport(code: string, candles: ToolCandle[], lookbackDays: number): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  // ── Insufficient data guard ────────────────────────────────────────────────
  if (candles.length < 35) {
    lines.push(`[${code}] Không đủ dữ liệu kỹ thuật`);
    lines.push(`Tìm thấy ${candles.length} nến (cần tối thiểu 35 cho MACD).`);
    lines.push(`Vui lòng thử lại sau khi có thêm dữ liệu lịch sử.`);
    lines.push(`TA: en attente (${candles.length}/35 bougies)`);
    return lines.join("\n");
  }

  // ── Compute indicators via local helpers ───────────────────────────────────
  const result = localComputeAllIndicators(candles);
  const lastPrice = candles[candles.length - 1]!.close;

  // ── Header ─────────────────────────────────────────────────────────────────
  lines.push(`[${code}] Chỉ báo kỹ thuật — ${today} (${lookbackDays} ngày)`);
  lines.push("");

  // ── MA block ───────────────────────────────────────────────────────────────
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
    const { label } = rsiLabel(result.rsi14);
    lines.push(`RSI(14): ${fmtDec1(result.rsi14)} → ${label}`);
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
    lines.push(`BB(20):  Upper=${fmtPrice(upper)}  Mid=${fmtPrice(mid)}  Lower=${fmtPrice(lower)}`);
    lines.push(`         Price=${fmtPrice(lastPrice)} → ${fmtDec1(pct)}% cua dai BB (${zone})`);
  } else {
    lines.push(`BB(20):  N/A (cần tối thiểu 20 nến)`);
  }

  // ── Conclusion block ───────────────────────────────────────────────────────
  lines.push("");
  const signals: Array<"TANG" | "GIAM" | "TRUNG TINH"> = [];
  signals.push(maSignal(lastPrice, result.ma5, result.ma20, result.ma50));
  if (result.rsi14 !== null) signals.push(rsiLabel(result.rsi14).signal);
  if (result.macd !== null) signals.push(macdSignal(result.macd.histogram));
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

/**
 * Build Vietnamese-friendly report from Go TA service HTTP response.
 * Used in the primary production path after a successful HTTP call to port 5003.
 * Produces the same output format as formatReport for AC-3 compliance.
 *
 * @param code         - Stock ticker (uppercase).
 * @param res          - ComputeTAResponse from Go service.
 * @param lastPrice    - Latest close price from DB (for BB position %). May be null.
 * @param lookbackDays - The requested look-back window (for header).
 */
function formatReportFromGoResponse(
  code: string,
  res: ComputeTAResponse,
  lastPrice: number | null,
  lookbackDays: number,
): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  // ── Insufficient data guard ────────────────────────────────────────────────
  if (res.candlesAvailable !== undefined && res.candlesAvailable < 35) {
    lines.push(`[${code}] Không đủ dữ liệu kỹ thuật`);
    lines.push(`Tìm thấy ${res.candlesAvailable} nến (cần tối thiểu 35 cho MACD).`);
    lines.push(`Vui lòng thử lại sau khi có thêm dữ liệu lịch sử.`);
    lines.push(`TA: en attente (${res.candlesAvailable}/35 bougies)`);
    return lines.join("\n");
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  lines.push(`[${code}] Chỉ báo kỹ thuật — ${today} (${lookbackDays} ngày)`);
  lines.push("");

  // ── MA block ───────────────────────────────────────────────────────────────
  const ma5Str  = res.ma5  !== undefined ? `MA5=${fmtPrice(res.ma5)}`   : "MA5=N/A";
  const ma20Str = res.ma20 !== undefined ? `MA20=${fmtPrice(res.ma20)}` : "MA20=N/A";
  const ma50Str = res.ma50 !== undefined ? `MA50=${fmtPrice(res.ma50)}` : "MA50=N/A (cần 50 nến)";
  const maSig = mapGoTrend(res.trend);
  const maDesc =
    maSig === "TANG" ? "giá > MA5 > MA20 > MA50" :
    maSig === "GIAM" ? "giá < MA5 < MA20 < MA50" :
    "sắp xếp hỗn hợp";
  lines.push(`MA:   ${ma5Str}  ${ma20Str}  ${ma50Str}  → Xu hướng ${maSig} (${maDesc})`);

  // ── RSI block ──────────────────────────────────────────────────────────────
  if (res.rsi !== undefined) {
    const { label } = rsiLabel(res.rsi);
    lines.push(`RSI(14): ${fmtDec1(res.rsi)} → ${label}`);
  } else {
    lines.push(`RSI(14): N/A (cần tối thiểu 15 nến)`);
  }

  // ── MACD block ─────────────────────────────────────────────────────────────
  if (res.macd !== undefined) {
    const { value: line, signal, histogram } = res.macd;
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
  if (res.bb !== undefined) {
    const { upper, middle, lower } = res.bb;
    if (lastPrice !== null) {
      const { pct } = bbSignal(lastPrice, upper, lower);
      const zone =
        pct > 80 ? "cao (cảnh overbought)" :
        pct > 50 ? "trung bình-cao" :
        pct > 20 ? "trung bình-thấp" :
        "thấp (cảnh oversold)";
      lines.push(`BB(20):  Upper=${fmtPrice(upper)}  Mid=${fmtPrice(middle)}  Lower=${fmtPrice(lower)}`);
      lines.push(`         Price=${fmtPrice(lastPrice)} → ${fmtDec1(pct)}% cua dai BB (${zone})`);
    } else {
      lines.push(`BB(20):  Upper=${fmtPrice(upper)}  Mid=${fmtPrice(middle)}  Lower=${fmtPrice(lower)}`);
    }
  } else {
    lines.push(`BB(20):  N/A (cần tối thiểu 20 nến)`);
  }

  // ── Conclusion block ───────────────────────────────────────────────────────
  lines.push("");
  const signals: Array<"TANG" | "GIAM" | "TRUNG TINH"> = [];
  signals.push(maSig);
  if (res.rsi !== undefined) signals.push(rsiLabel(res.rsi).signal);
  if (res.macd !== undefined) signals.push(macdSignal(res.macd.histogram));
  if (res.bb !== undefined && lastPrice !== null) {
    const { signal: bbSig } = bbSignal(lastPrice, res.bb.upper, res.bb.lower);
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

/** Exported alias for testability (task 1408). Uses local pure-math helpers, no domain import. */
export const formatTaIndicatorReport = formatReport;

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `get_technical_indicators` MCP tool.
 *
 * Primary path: calls Go TA service via HTTP POST /ta/indicators (port 5003).
 * Fallback path: local DB query + local pure-math computation when Go service
 *   is unavailable. Ensures continuity until P2-B2 (Go service stabilised).
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
    "Calls Go TA microservice (port 5003), falls back to local price history. " +
      "Quantitative price-derived indicators (RSI, MACD, MA, Bollinger Bands). " +
      "Distinct from get_patterns which does semantic historical precedent lookup " +
      "from RAG memory. " +
      "Compute RSI(14), MACD(12,26,9), MA(5/20/50), and Bollinger Bands(20,2σ) " +
      "for a VN stock ticker using existing price history. Returns a Vietnamese-" +
      "friendly plain-text report with a TANG/GIAM/TRUNG TINH conclusion block. " +
      "Calls the Go TA microservice (port 5003) via HTTP POST /ta/indicators; " +
      "falls back to local DB computation if the service is unavailable. " +
      "Source tier: 3 (derived — all indicators computed from price history; no live external source).",
    {
      code: z
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
    async ({ code: rawCode, days }) => {
      const lookbackDays = days ?? 60;
      const code = rawCode.toUpperCase().trim();

      // ── Resolve DB instance (used by fallback path + last-price query) ──────
      let resolvedDb: Database | undefined;
      try {
        if (_db) {
          resolvedDb = _db;
        } else {
          const { getDb } = await import("../../../../infrastructure/db/index.js");
          resolvedDb = getDb();
        }
      } catch {
        // DB unavailable — handled per path below
      }

      try {
        // ── Pre-fetch closes from DB for RSI/MA candle-window alignment ─────────
        // Passing closes to Go service ensures BOTH paths operate on identical data,
        // eliminating the ~1pt RSI drift from calendar-window vs row-count divergence.
        // Query mirrors Go GetCandles + TS report defaultComputeTa: ORDER BY date ASC LIMIT 60.
        let prefetchedCloses: number[] | undefined;
        let lastPrice: number | null = null;
        if (resolvedDb) {
          try {
            const candleRows = resolvedDb.query<CandleRow, [string]>(
              `SELECT date AS day, close AS close_price
                 FROM daily_ohlcv
                WHERE code = ?
                  AND close > 0
                ORDER BY date ASC
                LIMIT 60`,
            ).all(code);
            if (candleRows.length > 0) {
              prefetchedCloses = candleRows.map((r) => r.close_price);
              lastPrice = candleRows[candleRows.length - 1]!.close_price;
            }
          } catch {
            // DB unavailable — Go service will use its own DB fetch
          }
        }

        // ── Primary: call Go TA service via HTTP (AC-2, AC-4: POST /ta/indicators) ──
        const taResult = await computeTAIndicators(
          prefetchedCloses !== undefined
            ? { code, days: lookbackDays, closes: prefetchedCloses }
            : { code, days: lookbackDays },
        );

        // ── Get last close price from DB for BB position % (best-effort) ───────
        // Already fetched above via prefetchedCloses; do a single-row fallback only
        // if prefetch missed (DB was unavailable during prefetch).
        if (lastPrice === null && resolvedDb) {
          try {
            const row = resolvedDb.query<{ close_price: number }, [string]>(
              `SELECT close AS close_price FROM daily_ohlcv
                WHERE code = ? ORDER BY date DESC LIMIT 1`,
            ).get(code);
            lastPrice = row?.close_price ?? null;
          } catch {
            // Degrade gracefully — BB position % omitted from report
          }
        }

        const text = formatReportFromGoResponse(code, taResult, lastPrice, lookbackDays);

        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            source_tier: 3 as const,
            text,
            fetchedAt: new Date().toISOString(),
          }, null, 2) }],
        };
      } catch (httpErr) {
        // ── Fallback: HTTP unavailable → local DB computation ─────────────────
        // Ensures continuity until P2-B2 Go service is fully stabilised.
        if (resolvedDb) {
          try {
            logger.warn("[get_technical_indicators] HTTP unavailable, using local DB fallback", {
              code,
              error: httpErr instanceof Error ? httpErr.message : String(httpErr),
            });

            const rows = resolvedDb
              .query<CandleRow, [string, number]>(
                `SELECT date AS day, close AS close_price
                   FROM daily_ohlcv
                  WHERE code = ?
                    AND date >= date('now', '-' || ? || ' days')
                  ORDER BY date ASC`,
              )
              .all(code, lookbackDays);

            const candles: ToolCandle[] = rows.map((r) => ({
              day: r.day,
              close: r.close_price,
            }));

            const text = formatReport(code, candles, lookbackDays);

            return {
              content: [{ type: "text" as const, text: JSON.stringify({
                source_tier: 3 as const,
                text,
                fetchedAt: new Date().toISOString(),
              }, null, 2) }],
            };
          } catch {
            // DB fallback also failed — fall through to error envelope
          }
        }

        // ── Error envelope (AC-5: user-friendly, no raw stack trace) ─────────
        logger.error("[get_technical_indicators] Both HTTP and DB fallback failed", {
          code,
          days: lookbackDays,
          error: httpErr instanceof Error ? httpErr.message : String(httpErr),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                source_tier: 3 as const,
                error: `Lỗi tính chỉ báo kỹ thuật ${code}: ${httpErr instanceof Error ? httpErr.message : String(httpErr)}`,
              }, null, 2),
            },
          ],
        };
      }
    },
  );
}
