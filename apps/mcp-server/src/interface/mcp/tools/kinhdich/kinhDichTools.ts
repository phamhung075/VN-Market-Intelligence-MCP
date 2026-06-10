/**
 * Task 285 — Kinh Dich MCP Tools
 *
 * 5 MCP tools exposing the Kinh Dich engine to Claude agents:
 *   - get_kinhdich_reading       — full reading for a watchlist stock
 *   - get_hexagram_history       — timeline of past readings for a stock
 *   - get_transition_probabilities — Markov top-N next hexagrams
 *   - run_hexagram_backtest      — accuracy report for stored readings
 *   - explain_hexagram           — full Vietnamese explanation for hexagram 1-64
 *
 * Note: get_market_hexagram was deregistered (TSH-1, 2026-05-31). The
 * /market endpoint in kinh-dich-service returns 501 (not implemented).
 * Re-wire as a separate feature sprint (KINH-DICH-MARKET) when the
 * kinh-dich-service /market endpoint is fully implemented.
 *
 * P2-KD-G: All 6 tool handlers rewired to HTTP calls to kinh-dich-service
 * (port 5005). Zero direct domain imports from mcp-server parallel copy.
 * Score computation helpers (computeHaoScores etc.) remain in mcp-server
 * as integration glue — they are NOT migrated (AC-8).
 *
 * Layer: interface/mcp/tools/kinhdich
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { sqlInClause } from "../../../../infrastructure/db/sqlHelpers.js";
import type { IKinhDichScoreRepository } from "../../../../domain/repositories/IKinhDichScoreRepository.js";
import { SqliteKinhDichScoreRepository } from "../../../../infrastructure/db/repositories/SqliteKinhDichScoreRepository.js";
import { getSectorPeers } from "../../../../domain/services/sectorPeers.js";
import type { DomainType } from "../../../../../bctc-schema.js";
import { logger } from "../../../../infrastructure/logger.js";
import {
  getKinhDichReading,
  getKinhDichHistory,
  getHexagramTransitions,
  runKinhDichBacktest,
} from "../../../../infrastructure/microservices/clients.js";
import { QUE_DATA, QUE_META } from "../../../../domain/services/kinhDich/hexagramLibrary.js";

// ─────────────────────────────────────────────────────────────────────────────
// Score computation helpers (best-effort, all wrapped in try/catch)
// These stay in mcp-server as integration glue — NOT migrated (AC-8).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hao 1 — Sentiment score from recent rag_analyses entries.
 * Counts bullish vs bearish sentiments for the stock code.
 * Returns a value in [-1, +1].
 *
 * Task 1838b: accepts optional repo for DI (default = production SQLite adapter).
 */
export function computeSentimentScore(
  code: string,
  repo: IKinhDichScoreRepository = new SqliteKinhDichScoreRepository(getDb()),
): number {
  try {
    const rows = repo.getRecentSentiments(code, 7, 20);

    // rag_analyses may not have stock_code column in older schemas — try JSON metadata
    if (rows.length === 0) {
      // fallback: search analysis text via direct DB query (legacy path)
      const db = getDb();
      const textRows = db
        .query<{ text: string }, [string]>(
          `SELECT text FROM rag_analyses WHERE text LIKE ? LIMIT 20`,
        )
        .all(`%${code}%`);

      if (textRows.length === 0) return 0.0;

      let bullish = 0;
      let bearish = 0;
      for (const r of textRows) {
        const upper = r.text.toUpperCase();
        if (
          upper.includes("BULLISH") ||
          upper.includes("TANG") ||
          upper.includes("MUA") ||
          upper.includes("TICH CUC")
        ) {
          bullish++;
        } else if (
          upper.includes("BEARISH") ||
          upper.includes("GIAM") ||
          upper.includes("BAN") ||
          upper.includes("TIEU CUC")
        ) {
          bearish++;
        }
      }

      const total = bullish + bearish;
      if (total === 0) return 0.0;
      return (bullish - bearish) / total;
    }

    return 0.0;
  } catch {
    return 0.0;
  }
}

/**
 * Hao 2 — Fundamentals score from vnstock_financials PE vs sector average.
 * Returns a value in [-1, +1]: positive if PE below sector avg (undervalued),
 * negative if PE above (overvalued relative).
 *
 * Task 1838b: accepts optional repo for DI (default = production SQLite adapter).
 */
export function computeFundamentalsScore(
  code: string,
  repo: IKinhDichScoreRepository = new SqliteKinhDichScoreRepository(getDb()),
): number {
  try {
    const targetRow = repo.getLatestPe(code);
    if (!targetRow?.pe || targetRow.pe <= 0) return 0.0;

    const domain = repo.getWatchlistDomain(code);
    if (!domain) return 0.0;

    const sectorRows = repo.getSectorPeList(domain, 10);
    if (sectorRows.length === 0) return 0.0;

    const avgPE =
      sectorRows.slice(0, 10).reduce((s, r) => s + (r.pe ?? 0), 0) /
      Math.min(sectorRows.length, 10);

    if (avgPE === 0) return 0.0;

    // PE below avg → positive (undervalued = good), above → negative
    const ratio = (avgPE - targetRow.pe) / avgPE;
    return Math.max(-1, Math.min(1, ratio));
  } catch {
    return 0.0;
  }
}

/**
 * Hao 3 — Price score from latest market_prices change_pct.
 * Normalizes to [-1, +1] via a tanh-like scaling (±5% = ±1).
 *
 * Task 1838b: accepts optional repo for DI (default = production SQLite adapter).
 */
export function computePriceScore(
  code: string,
  repo: IKinhDichScoreRepository = new SqliteKinhDichScoreRepository(getDb()),
): number {
  try {
    const row = repo.getLatestChangePct(code);
    if (!row?.changePct) return 0.0;
    // Scale: 5% change → score of 1.0
    return Math.max(-1, Math.min(1, row.changePct / 5.0));
  } catch {
    return 0.0;
  }
}

/**
 * Hao 4 — Foreign flow score from vnstock_trading_stats.
 * Computes net foreign volume ratio: foreign_volume / avg_volume_2w.
 * Returns a value in [-1, +1].
 *
 * Task 1838b: accepts optional repo for DI (default = production SQLite adapter).
 */
export function computeForeignFlowScore(
  code: string,
  repo: IKinhDichScoreRepository = new SqliteKinhDichScoreRepository(getDb()),
): number {
  try {
    const row = repo.getLatestTradingStats(code);
    if (!row?.foreignVolume || !row?.avgVolume2w || row.avgVolume2w === 0) {
      return 0.0;
    }
    return Math.max(-1, Math.min(1, row.foreignVolume / row.avgVolume2w));
  } catch {
    return 0.0;
  }
}

/**
 * Hao 5 — Sector relative strength.
 * Compares stock change_pct vs average of sector peers from getSectorPeers()
 * (domain service), intersected with codes present in market_prices.
 * Returns a value in [-1, +1].
 *
 * Task 1838b: accepts optional repo for DI (default = production SQLite adapter).
 */
export function computeSectorScore(
  code: string,
  repo: IKinhDichScoreRepository = new SqliteKinhDichScoreRepository(getDb()),
): number {
  try {
    const domain = repo.getWatchlistDomain(code);
    if (!domain) return 0.0;

    // Resolve peer codes from domain service (pure, no I/O)
    const sectorPeerEntries = getSectorPeers(
      domain as DomainType,
      new Set([code]),
    );
    const peerCodesFromDomain = sectorPeerEntries.map((p) => p.code);

    // Intersect with codes that actually have prices in market_prices
    let peerCodes: string[] = [];
    if (peerCodesFromDomain.length > 0) {
      const available = repo.getMarketPricesForCodes(peerCodesFromDomain);
      peerCodes = available.map((r) => r.code);
    }

    // Fallback: use all available market_prices codes except the target stock
    if (peerCodes.length === 0) {
      const db = getDb();
      peerCodes = db
        .query<{ code: string }, [string]>(
          "SELECT DISTINCT code FROM market_prices WHERE code != ? LIMIT 20",
        )
        .all(code)
        .map((r) => r.code);
    }

    if (peerCodes.length === 0) return 0.0;

    const peerPrices = repo.getMarketPricesForCodes(peerCodes);
    const validChanges = peerPrices
      .map((r) => r.changePct)
      .filter((v) => v !== 0);
    if (validChanges.length === 0) return 0.0;

    const sectorAvg =
      validChanges.reduce((s, v) => s + v, 0) / validChanges.length;

    // My own change
    const myRow = repo.getLatestChangePct(code);
    const myChange = myRow?.changePct ?? 0;
    const relativeStrength = myChange - sectorAvg;
    // Scale: 3% outperformance → 1.0
    return Math.max(-1, Math.min(1, relativeStrength / 3.0));
  } catch {
    return 0.0;
  }
}

/**
 * Hao 6 — Macro score from tracked_indicators (brent_crude_usd, gold_usd_oz, wti_crude_usd).
 * Derives z-score inline from a rolling history window of each indicator.
 * Rising commodity prices = macro stress = negative score for stocks.
 * Returns a value in [-1, +1].
 */
export function computeMacroScore(): number {
  try {
    const db = getDb();
    const indicators = ["brent_crude_usd", "gold_usd_oz", "wti_crude_usd"];
    const placeholders = sqlInClause(indicators.length);

    const rows = db
      .query<
        { indicator: string; value: number },
        string[]
      >(
        `SELECT indicator, value FROM tracked_indicators
         WHERE indicator IN (${placeholders})
         ORDER BY extracted_at DESC LIMIT 80`,
      )
      .all(...indicators);

    if (rows.length === 0) return 0.0;

    // Group by indicator — first value per group is the most recent (ORDER BY extracted_at DESC)
    const byIndicator = new Map<string, number[]>();
    for (const r of rows) {
      const arr = byIndicator.get(r.indicator) ?? [];
      arr.push(r.value);
      byIndicator.set(r.indicator, arr);
    }

    const zScores: number[] = [];
    for (const [, values] of byIndicator) {
      if (values.length < 3) continue;
      const latest = values[0]!;
      const window = values.slice(1);
      const mean = window.reduce((s, v) => s + v, 0) / window.length;
      const std = Math.sqrt(
        window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length,
      );
      if (std === 0) continue;
      zScores.push((latest - mean) / std);
    }

    if (zScores.length === 0) return 0.0;

    const avgZ = zScores.reduce((s, v) => s + v, 0) / zScores.length;
    // High macro stress (positive z = rising commodities) = negative for stocks
    return Math.max(-1, Math.min(1, -avgZ / 2.0));
  } catch {
    return 0.0;
  }
}

/**
 * Deterministic per-ticker jitter to prevent convergence when real data is absent.
 *
 * When BCTC is missing, VPS is offline, or no rag_analyses exist, all 6 hao
 * scores default to 0.0 and multiple stocks collapse to the same hexagram.
 * This jitter adds a tiny but unique perturbation to Hao 5 (sector) for each
 * stock code so the final hexagram differs even when all real signals are flat.
 *
 * Properties:
 *   - Deterministic: same code → same jitter (stable across cycles)
 *   - Small: |jitter| ≤ 0.089 → real scores (typically 0.2–1.0) always dominate
 *   - Non-zero: |jitter| ≥ 0.05 → large enough to differentiate
 *   - Straddles the 0.10 THIEU_DUONG/THIEU_AM threshold so different tickers
 *     land on opposite sides → different binary signals → different hexagrams
 *   - Positive or negative: derived from odd/even sum to spread across ±
 *   - Case-insensitive: normalised to uppercase before hashing
 *
 * Task 1007 / Report 1007 + 1020. Extended to all haos in KI-278 fix.
 *
 * @param code - Stock ticker, e.g. "VCB". Case-insensitive.
 * @param seed - Optional seed to produce different jitter per hao (default 0).
 * @returns A value in (-0.089, -0.05] ∪ [+0.05, +0.089], or 0 for empty input.
 */
export function tickerJitter(code: string, seed: number = 0): number {
  if (!code) return 0;
  const upper = code.toUpperCase();
  // Polynomial hash: each char contributes code × (position+1) × 31^position
  // Seed mixed in to produce different values per hao dimension.
  let h = seed >>> 0;
  for (let i = 0; i < upper.length; i++) {
    h = (h * 31 + upper.charCodeAt(i)) >>> 0; // unsigned 32-bit
  }
  // Map to [0, 39] → [0.05, 0.089] range (40 steps of 0.001) — task 1292.
  // Clamped to max 0.089 to satisfy test 1007 contract (|jitter| <= 0.09).
  // Original range was 0.05–0.15; the upper bound drifted past the test limit.
  const magnitude = 0.05 + (h % 40) * 0.001; // 0.050 … 0.089
  // Sign: mix seed into char sum for per-hao sign variation
  const charSum = upper.split("").reduce((s, c) => s + c.charCodeAt(0), 0) + seed;
  return charSum % 2 === 1 ? magnitude : -magnitude;
}

/**
 * Compute all 6 hao scores for a stock code.
 * Each score defaults to 0.0 on any error.
 *
 * ALL haos receive a deterministic per-ticker jitter (|jitter| ≤ 0.09)
 * when their raw score is 0.0 (data absent). Each hao uses a different seed
 * so stocks differentiate across multiple dimensions, not just hao 5.
 * Non-zero real signals are never perturbed. Task 1007 + KI-278.
 *
 * Task 1838b: accepts optional repo for DI (default = production SQLite adapter).
 */
export function computeHaoScores(
  code: string,
  repo: IKinhDichScoreRepository = new SqliteKinhDichScoreRepository(getDb()),
): number[] {
  const raw = [
    computeSentimentScore(code, repo),      // hao 1, seed 1
    computeFundamentalsScore(code, repo),   // hao 2, seed 2
    computePriceScore(code, repo),          // hao 3, seed 3
    computeForeignFlowScore(code, repo),    // hao 4, seed 4
    computeSectorScore(code, repo),         // hao 5, seed 5
    computeMacroScore(),                    // hao 6, seed 6
  ];

  // Apply per-hao jitter only when the raw score is exactly 0.0 (data absent).
  // Different seed per hao ensures maximum differentiation across stocks.
  return raw.map((score, i) =>
    score === 0.0
      ? Math.max(-1, Math.min(1, tickerJitter(code, i + 1)))
      : score,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VN-Index + macro composite scores for market hexagram (local helpers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives a z-score for a single indicator from its recent history.
 * Used by get_market_hexagram for USD/VND, oil, gold direction.
 *
 * Sign convention: +z/2.0 (caller interprets the sign for market context).
 * Returns a value in [-1, +1], or 0.0 if fewer than 3 rows exist.
 */
export function computeMacroIndicatorScore(name: string): number {
  try {
    const db = getDb();
    const rows = db
      .query<{ value: number }, [string]>(
        `SELECT value FROM tracked_indicators
         WHERE indicator = ? ORDER BY extracted_at DESC LIMIT 21`,
      )
      .all(name);

    if (rows.length < 3) return 0.0;

    const latest = rows[0]!.value;
    const window = rows.slice(1).map((r) => r.value);
    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    const std = Math.sqrt(
      window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length,
    );
    if (std === 0) return 0.0;

    const z = (latest - mean) / std;
    return Math.max(-1, Math.min(1, z / 2.0));
  } catch {
    return 0.0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported helpers (testability — task 1408/1409)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats the trading-context sentence for a Kinh Dich reading output.
 * Exported for testability (task 1408).
 * @param trend - the trend label from data.state.trend (any case)
 */
export function formatKinhDichTradingContext(trend: string): string {
  const t = trend.toUpperCase();
  if (t.includes("THUAN LOI") || t.includes("THUẬN LỢI")) {
    return "Nhận định giao dịch: Thuận lợi cho giao dịch — xu hướng tích cực";
  } else if (t.includes("BAT LOI") || t.includes("BẤT LỢI")) {
    return "Nhận định giao dịch: Bất lợi cho giao dịch — cẩn thận";
  } else {
    return "Nhận định giao dịch: Trung tính — cần xem thêm tín hiệu khác";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerKinhDichTools(server: McpServer): void {
  // ── 1. get_kinhdich_reading ──────────────────────────────────────────────

  server.tool(
    "get_kinhdich_reading",
    "Compute a full Kinh Dich (I-Ching) reading for a watchlist stock. Encodes 6 market dimensions (sentiment, fundamentals, price, foreign flow, sector, macro) into a 64-hexagram reading with trading signal and Vietnamese interpretation. Stock must be in the watchlist.",
    {
      code: z
        .string()
        .min(1)
        .max(10)
        .describe("Stock ticker code (e.g. \"VCB\", \"FPT\")"),
    },
    async ({ code: rawCode }) => {
      const code = rawCode.toUpperCase().trim();
      try {
        await initDatabase();

        // Verify stock is on watchlist
        const db = getDb();
        const watchlistRow = db
          .query<{ code: string }, [string]>(
            "SELECT code FROM watchlist WHERE code = ?",
          )
          .get(code);

        if (!watchlistRow) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Lỗi: ${code} không có trong watchlist. Thêm cổ phiếu trước khi đọc Kinh Dịch.`,
              },
            ],
          };
        }

        // Compute local hao scores (integration glue — stays in mcp-server, AC-8)
        const scores = computeHaoScores(code);

        // Delegate reading computation + storage to kinh-dich-service (port 5005)
        const reading = await getKinhDichReading(code, 30);

        const lines: string[] = [];
        lines.push(`=== KINH DỊCH: ${code} ===`);
        lines.push(`Quẻ ${reading.hexagram} — ${reading.name}`);
        lines.push(`Xu hướng: ${reading.trend}`);
        lines.push(`Tín hiệu: ${reading.signal}`);
        lines.push(`Độ tin cậy: ${Math.round(reading.confidence * 100)}%`);
        lines.push(`${reading.actionNote}`);
        lines.push('');
        lines.push(reading.overallReading);
        lines.push('');
        lines.push(`Điểm Hào (tham khảo): [${scores.map((s) => s.toFixed(2)).join(', ')}]`);

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[get_kinhdich_reading] Error", {
          code,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi khi đọc Kinh Dịch cho ${code}: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 3. get_hexagram_history ──────────────────────────────────────────────

  server.tool(
    "get_hexagram_history",
    "Get the timeline of Kinh Dich readings for a stock over the past N days (default 30). Shows hexagram changes, trading signals, and confidence levels.",
    {
      code: z
        .string()
        .min(1)
        .max(10)
        .describe("Stock ticker code (e.g. \"VCB\")"),
      days: z.coerce
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .describe("Number of past days to retrieve (default 30)"),
    },
    async ({ code: rawCode, days = 30 }) => {
      const code = rawCode.toUpperCase().trim();
      try {
        await initDatabase();

        // Delegate to kinh-dich-service /readings/{code}/history (port 5005)
        const result = await getKinhDichHistory(code, days);

        if (result.total === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Chưa có lịch sử quẻ Kinh Dịch cho ${code} trong ${days} ngày qua. Chạy get_kinhdich_reading trước.`,
              },
            ],
          };
        }

        const lines: string[] = [];
        lines.push(`=== LỊCH SỬ KINH DỊCH: ${code} (${days} ngày) ===`);
        lines.push(`Tổng số lần đọc: ${result.total}`);
        lines.push("");

        for (const r of result.readings.map(e => ({ ...e, hexagramNumber: e.hexagram, tradingSignal: e.signal }))) {
          const ts = r.timestamp.slice(0, 16).replace("T", " ");
          const confPct = Math.round(r.confidence * 100);
          lines.push(
            `${ts} | Quẻ ${r.hexagramNumber} ${r.name} | Tín hiệu: ${r.tradingSignal} | Độ tin cậy: ${confPct}%`,
          );
        }

        lines.push("");
        lines.push(
          `Quẻ phổ biến nhất: ${result.mostFrequent} | Cập nhật: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
        );

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[get_hexagram_history] Error", {
          code,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi khi lấy lịch sử quẻ cho ${code}: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 4. get_transition_probabilities ─────────────────────────────────────

  server.tool(
    "get_transition_probabilities",
    "Get the Markov transition probabilities for a hexagram: which hexagrams are most likely to follow, based on historical observations. Requires prior readings stored in DB.",
    {
      hexagram_number: z.coerce
        .number()
        .int()
        .min(1)
        .max(64)
        .describe("Hexagram number 1-64"),
      code: z
        .string()
        .min(1)
        .max(10)
        .optional()
        .describe("Stock code for stock-specific transitions (optional, defaults to all stocks = VNINDEX)"),
    },
    async ({ hexagram_number, code: rawCode }) => {
      const code = rawCode?.toUpperCase().trim() ?? "VNINDEX";
      try {
        await initDatabase();

        // Delegate to kinh-dich-service /hexagram/{number}/transitions (port 5005)
        const result = await getHexagramTransitions(hexagram_number, code, 10);

        if (result.transitions.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Chưa có dữ liệu chuyển quẻ cho Quẻ ${hexagram_number} (${result.name}). Cần thêm lịch sử đọc quẻ.`,
              },
            ],
          };
        }

        const lines: string[] = [];
        lines.push(
          `=== XÁC SUẤT CHUYỂN QUẺ: Từ Quẻ ${hexagram_number} (${result.name}) ===`,
        );
        lines.push(`Cổ phiếu: ${code}`);
        lines.push("");
        lines.push("Xác suất chuyển sang (top 10):");

        for (const t of result.transitions) {
          const pct = Math.round(t.probability * 100);
          lines.push(
            `  → Que ${t.toHexagram} ${t.name}: ${pct}% (${t.count} lan)`,
          );
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[get_transition_probabilities] Error", {
          hexagram_number,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi khi lấy xác suất chuyển quẻ: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 5. run_hexagram_backtest ─────────────────────────────────────────────

  server.tool(
    "run_hexagram_backtest",
    "Run a backtest of Kinh Dich trading signals against actual price outcomes. Measures how accurately hexagram readings predicted price direction over the past N days.",
    {
      code: z
        .string()
        .min(1)
        .max(10)
        .optional()
        .describe("Stock code to backtest (optional, default VNINDEX)"),
      days: z.coerce
        .number()
        .int()
        .min(7)
        .max(365)
        .optional()
        .describe("Number of past days to analyse (default 30)"),
    },
    async ({ code: rawCode, days = 30 }) => {
      const code = rawCode?.toUpperCase().trim() ?? "VNINDEX";
      try {
        await initDatabase();

        // Delegate to kinh-dich-service /backtest/{code} (port 5005)
        const result = await runKinhDichBacktest(code, days);

        if (result.totalReadings === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Chưa có dữ liệu backtest cho ${code} trong ${days} ngày. Cần thêm lịch sử đọc quẻ.`,
              },
            ],
          };
        }

        const lines: string[] = [];
        lines.push(`=== BACKTEST KINH DỊCH: ${code} (${days} ngày) ===`);
        lines.push("");
        lines.push(`Tổng số lần đọc: ${result.totalReadings}`);
        lines.push(`Độ chính xác (BUY/SELL): ${Math.round(result.accuracy * 100)}%`);
        lines.push(
          `Lợi nhuận TB 5 phiên: ${result.avgReturn5d >= 0 ? "+" : ""}${(result.avgReturn5d * 100).toFixed(2)}%`,
        );
        lines.push(
          `Thay đổi TB: ${result.avgReturn5d >= 0 ? "+" : ""}${(result.avgReturn5d * 100).toFixed(2)}%`,
        );

        if (result.bestHexagram) {
          lines.push(
            `Quẻ tốt nhất: ${result.bestHexagram.number} ${result.bestHexagram.name} (Tỷ lệ thắng: ${Math.round(result.bestHexagram.winRate * 100)}%, ${result.bestHexagram.count} lần)`,
          );
        }

        if (result.worstHexagram) {
          lines.push(
            `Quẻ xấu nhất: ${result.worstHexagram.number} ${result.worstHexagram.name} (Tỷ lệ thắng: ${Math.round(result.worstHexagram.winRate * 100)}%, ${result.worstHexagram.count} lần)`,
          );
        }

        lines.push("");
        lines.push(
          `Lưu ý: Backtest chỉ mang tính tham khảo. Kinh Dịch là công cụ hỗ trợ — không phải cam kết lợi nhuận.`,
        );

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[run_hexagram_backtest] Error", {
          code,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi khi chạy backtest Kinh Dịch: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 6. explain_hexagram ──────────────────────────────────────────────────

  server.tool(
    "explain_hexagram",
    "Get the full Vietnamese explanation for a hexagram (1-64): name, Chinese character, judgment, image, 6 hao lines, and trading implications.",
    {
      // KD-OBS-01 FIX: accept any integer at Zod level; range guard is inside
      // the handler so out-of-range inputs return a graceful error object
      // instead of a raw MCP -32602 protocol error.
      number: z.coerce
        .number()
        .int()
        .describe("Hexagram number 1-64"),
      hexagram_number: z.coerce
        .number()
        .int()
        .optional()
        .describe("Alias for number (1-64) — preferred parameter name"),
    },
    async (args) => {
      // Support both `number` and `hexagram_number` parameter names
      const number = (args as unknown as { hexagram_number?: number; number?: number }).hexagram_number
        ?? (args as unknown as { number?: number }).number
        ?? 0;

      // KD-OBS-01: graceful range guard — return structured error instead of -32602
      if (number < 1 || number > 64) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "hexagram_number must be 1–64",
                received: number,
              }),
            },
          ],
        };
      }

      // Path A: use local QUE_DATA library — zero Go service / no HTTP call
      const meta = QUE_META.find((q) => q.id === number);
      const data = QUE_DATA[number];

      if (!meta || !data) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi: Không có dữ liệu giải thích cho Quẻ ${number}`,
            },
          ],
        };
      }

      const lines: string[] = [];
      lines.push(`=== QUẺ ${meta.id}: ${meta.name} ${meta.chinese} ===`);
      lines.push(`Thượng quán (trên): ${meta.upper} | Hạ quán (dưới): ${meta.lower}`);
      lines.push("");
      lines.push(`Ý nghĩa chính: ${data.coreMeaning}`);
      lines.push("");

      // Judgment (Hào từ)
      lines.push("Hào từ (Phán quyết):");
      lines.push(`  ${data.judgment.vietnamese}`);
      lines.push(`  ${data.judgment.interpretation}`);
      lines.push("");

      // Image (Tượng truyện)
      lines.push("Tượng truyện (Hình tượng):");
      lines.push(`  ${data.image.description}`);
      lines.push(`  Hành động: ${data.image.action}`);
      lines.push("");

      // State
      lines.push(`Tình trạng quẻ:`);
      lines.push(`  Xu hướng: ${data.state.trend}`);
      lines.push(`  Sự nghiệp: ${data.state.career}`);
      lines.push(`  Cảnh báo: ${data.state.warning}`);
      lines.push("");

      // 6 Hào lines
      lines.push("6 Hào (từng đường):");
      for (const line of data.lines) {
        lines.push(`Hao ${line.position}: ${line.name} — ${line.vietnamese}`);
        lines.push(`  Kết quả: ${line.outcome}`);
        lines.push(`  ${line.action}`);
      }
      lines.push("");

      // Trading context
      lines.push(`Nhận định giao dịch: ${data.state.trend}`);

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );
}
