/**
 * Task 285 — Kinh Dich MCP Tools
 *
 * 6 MCP tools exposing the Kinh Dich engine to Claude agents:
 *   - get_kinhdich_reading       — full reading for a watchlist stock
 *   - get_market_hexagram        — market-wide I Ching state (local compute, no HTTP)
 *   - get_hexagram_history       — timeline of past readings for a stock
 *   - get_transition_probabilities — Markov top-N next hexagrams
 *   - run_hexagram_backtest      — accuracy report for stored readings
 *   - explain_hexagram           — full Vietnamese explanation for hexagram 1-64
 *
 * FIX-MARKET-HEXAGRAM-TOOL-MISSING (2026-06-15): get_market_hexagram re-registered
 * using local compute only. The kinh-dich-service /market endpoint returns 501
 * (not implemented); this tool derives the market hexagram directly from local
 * market data (VN-Index change, USD/VND, oil, gold, foreign flow, macro z-scores)
 * without any HTTP call — same pattern as explain_hexagram.
 *
 * P2-KD-G: All 6 tool handlers rewired to HTTP calls to kinh-dich-service
 * (port 5005). Zero direct domain imports from mcp-server parallel copy.
 * Score computation helpers (computeHaoScores etc.) remain internal to
 * mcp-server as integration glue — they are NOT migrated to the separate
 * kinh-dich-service HTTP microservice (AC-8).
 *
 * FACTORY-INTERFACE-move-kinhdich-ta-scoring-down (2026-07-24): the score
 * computation helpers themselves (business/scoring math — computeHaoScores,
 * computeMacroScore, tickerJitter, etc.) moved OUT of this interface layer
 * into application/services/kinhDich/kinhDichScoring.ts (pure move — AC-8
 * unaffected, still not migrated to kinh-dich-service). This file now only
 * imports + calls them; interface layer keeps request parsing, tool
 * registration, and response-text shaping.
 *
 * Layer: interface/mcp/tools/kinhdich
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";
import {
  getKinhDichReading,
  getKinhDichHistory,
  getHexagramTransitions,
  runKinhDichBacktest,
} from "../../../../infrastructure/microservices/clients.js";
import { QUE_DATA, QUE_META } from "../../../../domain/services/kinhDich/hexagramLibrary.js";
import { encodeHaos, haosToSignals } from "../../../../domain/services/kinhDich/haoEncoder.js";
import { resolveHexagram } from "../../../../domain/services/kinhDich/hexagramResolver.js";
import { notifyKinhDichError } from "./kinhDichErrorNotify.js";
import {
  computeHaoScores,
  computeMacroScore,
  computeMacroIndicatorScore,
} from "../../../../application/services/kinhDich/kinhDichScoring.js";

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

export function registerKinhDichTools(
  server: McpServer,
  // KD-OBS-01-FIX: injectable for testing — defaults to the real BUG-channel notifier.
  notifyError: typeof notifyKinhDichError = notifyKinhDichError,
): void {
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
        const message = err instanceof Error ? err.message : String(err);
        logger.error("[get_kinhdich_reading] Error", { code, error: message });
        // KD-OBS-01-FIX: genuine data error — surface to BUG channel, not just the logger.
        void notifyError("get_kinhdich_reading", "kinhdich-reading-error", `${code}: ${message}`);
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

  // ── 2. get_market_hexagram ───────────────────────────────────────────────
  // FIX-MARKET-HEXAGRAM-TOOL-MISSING (2026-06-15): local-compute path only.
  // kinh-dich-service /market returns 501; derive hexagram from local DB signals.
  //
  // 6 market-wide hào dimensions:
  //   Hào 1 — VN-Index price momentum (change_pct z-score)
  //   Hào 2 — USD/VND direction (usd_vnd indicator z-score, inverted)
  //   Hào 3 — Oil (brent_crude_usd z-score, inverted for stocks)
  //   Hào 4 — Gold (gold_usd_oz z-score, safe-haven = negative for equity)
  //   Hào 5 — Foreign net flow breadth (market-wide avg foreign_volume ratio)
  //   Hào 6 — Macro composite z-score (existing computeMacroScore())

  server.tool(
    "get_market_hexagram",
    "Get the market-wide I Ching hexagram derived from VN-Index momentum, USD/VND, oil, gold, foreign flow, and macro signals. Returns overall market state and hexagram interpretation. Uses local compute — no Go service required.",
    {},
    async () => {
      try {
        await initDatabase();
        const db = getDb();

        // ── Hào 1: VN-Index price change_pct (z-score vs recent history) ──
        const vnidxRows = db
          .query<{ change_pct: number }, []>(
            `SELECT change_pct FROM market_prices
             WHERE code = 'VNINDEX' ORDER BY updated_at DESC LIMIT 21`,
          )
          .all();

        let hao1 = 0.0;
        if (vnidxRows.length >= 3) {
          const latest = vnidxRows[0]!.change_pct;
          const window = vnidxRows.slice(1).map((r) => r.change_pct);
          const mean = window.reduce((s, v) => s + v, 0) / window.length;
          const std = Math.sqrt(
            window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length,
          );
          hao1 = std === 0 ? 0.0 : Math.max(-1, Math.min(1, (latest - mean) / std / 2.0));
        } else if (vnidxRows.length >= 1) {
          // Fallback: use latest change_pct directly (scale ±2% = ±1)
          hao1 = Math.max(-1, Math.min(1, (vnidxRows[0]?.change_pct ?? 0) / 2.0));
        }

        // ── Hào 2: USD/VND direction (strong VND = good for equities = positive) ──
        const hao2Raw = computeMacroIndicatorScore("usd_vnd");
        const hao2 = -hao2Raw; // Rising USD/VND is bad for equities

        // ── Hào 3: Oil (rising oil = macro stress for VN importers = negative) ──
        const hao3 = -computeMacroIndicatorScore("brent_crude_usd");

        // ── Hào 4: Gold (rising gold = risk-off = negative for equity) ──
        const hao4 = -computeMacroIndicatorScore("gold_usd_oz");

        // ── Hào 5: Market-wide foreign net flow (avg across all watchlist stocks) ──
        const flowRows = db
          .query<{ foreign_volume: number; avg_volume: number }, []>(
            `SELECT foreign_volume, avg_volume_2w AS avg_volume
             FROM vnstock_trading_stats
             WHERE avg_volume_2w > 0 LIMIT 30`,
          )
          .all();

        let hao5 = 0.0;
        if (flowRows.length > 0) {
          const ratios = flowRows.map((r) =>
            Math.max(-1, Math.min(1, r.foreign_volume / r.avg_volume)),
          );
          hao5 = ratios.reduce((s, v) => s + v, 0) / ratios.length;
        }

        // ── Hào 6: Macro composite (existing helper) ──
        const hao6 = computeMacroScore();

        // ── Encode scores → hexagram ──
        const scores = [hao1, hao2, hao3, hao4, hao5, hao6];
        const haos = encodeHaos(scores);
        const signals = haosToSignals(haos);
        const hexagramNumber = resolveHexagram(signals);

        const meta = QUE_META.find((q) => q.id === hexagramNumber);
        const data = QUE_DATA[hexagramNumber];

        // Derive overall market signal from hào states
        const yangCount = haos.filter((h) => h.binary === 1).length;
        const changingCount = haos.filter((h) => h.isChanging).length;
        let marketSignal: string;
        let trend: string;
        if (yangCount >= 4) {
          marketSignal = "TÍCH CỰC";
          trend = data?.state?.trend ?? "Thuận lợi";
        } else if (yangCount <= 2) {
          marketSignal = "TIÊU CỰC";
          trend = data?.state?.trend ?? "Bất lợi";
        } else {
          marketSignal = "TRUNG TÍNH";
          trend = data?.state?.trend ?? "Trung tính";
        }

        // Confidence: fewer changing lines = more stable reading
        const confidence = Math.max(0.3, 1.0 - changingCount * 0.12);

        const lines: string[] = [];
        lines.push(`=== QUẺ THỊ TRƯỜNG ===`);
        lines.push(`Quẻ ${hexagramNumber} — ${meta?.name ?? "?"} ${meta?.chinese ?? ""}`);
        lines.push(`Xu hướng thị trường: ${trend}`);
        lines.push(`Tín hiệu: ${marketSignal}`);
        lines.push(`Độ tin cậy: ${Math.round(confidence * 100)}%`);
        lines.push(`Hào dương/âm: ${yangCount}/6 dương | Hào biến: ${changingCount}`);
        lines.push("");
        if (data?.coreMeaning) {
          lines.push(`Ý nghĩa: ${data.coreMeaning}`);
        }
        if (data?.image?.action) {
          lines.push(`Hành động: ${data.image.action}`);
        }
        lines.push("");
        lines.push(
          `Điểm Hào thị trường: [${scores.map((s) => s.toFixed(2)).join(", ")}]`,
        );
        lines.push(`(VN-Index | USD/VND | Dầu | Vàng | Ngoại tệ | Vĩ mô)`);
        lines.push(`Cập nhật: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("[get_market_hexagram] Error", { error: message });
        // KD-OBS-01-FIX: genuine data error — surface to BUG channel, not just the logger.
        void notifyError("get_market_hexagram", "kinhdich-market-hexagram-error", message);
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi khi tính quẻ thị trường: ${(err as Error).message}`,
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
        const message = err instanceof Error ? err.message : String(err);
        logger.error("[get_hexagram_history] Error", { code, error: message });
        // KD-OBS-01-FIX: genuine data error — surface to BUG channel, not just the logger.
        void notifyError("get_hexagram_history", "kinhdich-history-error", `${code}: ${message}`);
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
        const message = err instanceof Error ? err.message : String(err);
        logger.error("[get_transition_probabilities] Error", { hexagram_number, error: message });
        // KD-OBS-01-FIX: genuine data error — surface to BUG channel, not just the logger.
        void notifyError(
          "get_transition_probabilities",
          "kinhdich-transitions-error",
          `hexagram ${hexagram_number}: ${message}`,
        );
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
        const message = err instanceof Error ? err.message : String(err);
        logger.error("[run_hexagram_backtest] Error", { code, error: message });
        // KD-OBS-01-FIX: genuine data error — surface to BUG channel, not just the logger.
        void notifyError("run_hexagram_backtest", "kinhdich-backtest-error", `${code}: ${message}`);
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
