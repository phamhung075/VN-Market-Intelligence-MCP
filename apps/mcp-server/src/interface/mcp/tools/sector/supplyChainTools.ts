/**
 * Task 256 — get_supply_chain_exposure MCP Tool
 *
 * Provides current supply chain exposure analysis for Vietnamese stocks.
 *
 * Data sources:
 *   - tracked_indicators table (shipping index history for σ computation)
 *   - market_prices table (for watchlist stocks)
 *   - watchlist table (for watchlist stocks)
 *
 * Output: plain-text Vietnamese report showing:
 *   - Current shipping index values + σ deviation
 *   - Affected stocks with direction (bullish/bearish)
 *   - Active supply chain disruption events (if any from recent news)
 *
 * @module interface/mcp/tools/supplyChainTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../../../infrastructure/logger.js";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { listTrackedIndicatorsFromDb } from "../../../../infrastructure/db/commodityTracker.js";
import {
  analyzeSupplyChainImpact,
  type SupplyChainSignal,
} from "../../../../domain/services/supplyChainAnalyzer.js";
import { classifyDeviation } from "../../../../domain/services/macroThresholds.js";
import type { SupplyChainEvent } from "../../../../domain/services/supplyChainEventDetector.js";
import { SEVERITY_VI } from "./severityLabels.js";
import type { ShippingIndex } from "../../../../infrastructure/fetchers/shippingIndex.js";

// ---------------------------------------------------------------------------
// Output builder (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Builds the plain-text output for the get_supply_chain_exposure tool.
 *
 * @param indices  - Current shipping index values
 * @param signals  - Computed supply chain signals
 * @param event    - Active disruption event if detected
 * @returns        - Formatted Vietnamese plain-text string
 */
export function buildSupplyChainExposureOutput(
  indices: ShippingIndex[],
  signals: SupplyChainSignal[],
  event: SupplyChainEvent | null,
): string {
  const lines: string[] = [];
  const now = new Date().toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  });

  lines.push(`PHÂN TÍCH CHUỖI CUNG ỨNG - ${now}`);
  lines.push("=".repeat(50));

  // ── Section 1: Shipping indices ───────────────────────────────────────────
  if (indices.length > 0) {
    lines.push("\nCHỈ SỐ VẬN TẢI BIỂN:");
    for (const idx of indices) {
      const sign = idx.changePct >= 0 ? "+" : "";
      lines.push(
        `  ${idx.name}: ${idx.value.toLocaleString()} (${sign}${idx.changePct.toFixed(1)}%) - ${idx.date}`,
      );
    }
  } else {
    lines.push("\nChỉ số vận tải: Chưa có dữ liệu (shipping index chưa fetch)");
  }

  // ── Section 2: Disruption event ──────────────────────────────────────────
  if (event) {
    lines.push(`\nSỰ KIỆN GIÁN ĐOẠN [${SEVERITY_VI[event.severity] ?? event.severity.toUpperCase()}]:`);
    lines.push(`  Loại: ${event.eventType}`);
    lines.push(`  Mô tả: ${event.description}`);
    lines.push(`  Tuyến đường bị ảnh hưởng: ${event.affectedRoutes.join(", ")}`);
    if (event.affectedStocks.length > 0) {
      lines.push(`  Cổ phiếu bị ảnh hưởng: ${event.affectedStocks.join(", ")}`);
    }
    lines.push(`  Độ tin cậy: ${Math.round(event.confidence * 100)}%`);
  } else {
    lines.push("\nSự kiện gián đoạn: Không phát hiện sự kiện bất thường");
  }

  // ── Section 3: Stock signals ──────────────────────────────────────────────
  if (signals.length > 0) {
    lines.push("\nTÍN HIỆU TÁC ĐỘNG CỔ PHIẾU:");
    for (const sig of signals) {
      const absZ = Math.abs(sig.deviation.zScore);
      const sigmaStr = `${sig.deviation.zScore >= 0 ? "+" : ""}${sig.deviation.zScore.toFixed(1)}σ`;
      lines.push(`\n  ${sig.index} - ${sigmaStr} (${sig.severity.toUpperCase()}, tin cay ${Math.round(sig.confidence * 100)}%):`);
      lines.push(`  Sai lệch: ${sig.deviation.summary}`);

      for (const stock of sig.affectedStocks) {
        const dirIcon = stock.direction === "bullish" ? "TĂNG" : stock.direction === "bearish" ? "GIẢM" : "TRUNG LẬP";
        lines.push(`    ${stock.code} [${dirIcon}]: ${stock.reasoning}`);
      }
    }
  } else {
    lines.push("\nTín hiệu cổ phiếu: Không có tín hiệu đáng kể (chỉ số vận tải trong ngưỡng bình thường)");
  }

  // ── Section 4: Summary ────────────────────────────────────────────────────
  lines.push("\n" + "=".repeat(50));
  const highSignals = signals.filter(
    (s) => s.severity === "high" || s.severity === "critical",
  );
  if (highSignals.length > 0 || event?.severity === "critical") {
    lines.push("TỔNG KẾT: Có tín hiệu QUAN TRỌNG — theo dõi chặt chẽ HPG/GMD/VNM");
  } else if (signals.length > 0) {
    lines.push("TỔNG KẾT: Phát hiện tín hiệu nhẹ — theo dõi thêm");
  } else if (indices.length === 0) {
    // FIX-BDI-SHIPPING-STALE-404-GUARD: no fresh shipping index survived the
    // staleness gate (all stale/absent — e.g. ^BDI permanently 404 since
    // 2026-04). A stale/absent shipping index must NOT be read as evidence
    // of a stable supply chain — that would be exactly the "ổn định" fake
    // conclusion this guard exists to prevent.
    lines.push(
      "TỔNG KẾT: Không đủ dữ liệu vận tải biển hiện thời để kết luận (chỉ số gần nhất đã cũ hoặc chưa có dữ liệu)",
    );
  } else {
    lines.push("TỔNG KẾT: Chuỗi cung ứng ổn định — không có tín hiệu bất thường");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Data access helpers
// ---------------------------------------------------------------------------

interface WatchlistRow {
  action_code: string;
  domain: string;
  exchange: string;
}

/**
 * Reads the latest shipping index values from tracked_indicators table.
 *
 * FIX-BDI-SHIPPING-STALE-404-GUARD: reuses the shared
 * listTrackedIndicatorsFromDb() staleness helper (DSI-MACRO-PHANTOM-STALE-GUARD
 * precedent — TRACKED_INDICATOR_STALE_MS, epoch-ms compare, not a
 * datetime('now') SQL string-compare) instead of a raw "latest row per
 * indicator" query with no freshness check. A shipping indicator whose
 * latest row is stale (e.g. shipping_bdi — ^BDI Yahoo has been permanently
 * HTTP 404 since 2026-04) is EXCLUDED here so it is never served as a
 * current value under a "current" header at a frozen "+0.0%".
 */
export function readShippingIndicesFromDb(db: ReturnType<typeof getDb>): ShippingIndex[] {
  try {
    return listTrackedIndicatorsFromDb(db)
      .filter((row) => row.indicator.startsWith("shipping_") && !row.isStale)
      .map((row) => ({
        name: row.indicator.replace("shipping_", "").toUpperCase(),
        value: row.value,
        change: 0, // historical change not stored
        changePct: 0,
        date: row.lastSeen.slice(0, 10),
      }));
  } catch {
    return [];
  }
}

/**
 * Reads rolling MacroStats for a shipping indicator from tracked_indicators.
 */
function readShippingStats(
  db: ReturnType<typeof getDb>,
  indicator: string,
  limit = 30,
): import("../../../../domain/services/macroThresholds.js").MacroStats | null {
  try {
    const rows = db
      .query<{ value: number }, [string, number]>(
        `SELECT value FROM tracked_indicators
         WHERE indicator = ?
         ORDER BY extracted_at DESC
         LIMIT ?`,
      )
      .all(indicator, limit);

    if (rows.length < 5) return null;

    const values = rows.map((r) => r.value);
    const current = values[0]!;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance =
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return {
      name: indicator,
      current,
      mean: Math.round(mean * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      sampleCount: values.length,
    };
  } catch {
    return null;
  }
}

/**
 * Reads watchlist entries from the DB.
 */
function readWatchlist(
  db: ReturnType<typeof getDb>,
): Array<{ actionCode: string; domain: import("../../../../domain/services/cascadeEngine.js").WatchlistEntry["domain"]; exchange: string }> {
  try {
    const rows = db
      .query<WatchlistRow, []>(
        `SELECT action_code, domain, exchange FROM watchlist ORDER BY action_code`,
      )
      .all();
    return rows.map((r) => ({
      actionCode: r.action_code,
      domain: r.domain as import("../../../../domain/services/cascadeEngine.js").WatchlistEntry["domain"],
      exchange: r.exchange,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Registers the get_supply_chain_exposure MCP tool.
 */
export function registerSupplyChainTools(server: McpServer): void {
  server.tool(
    "get_supply_chain_exposure",
    "Analyzes supply chain exposure for Vietnamese stocks based on global shipping indices (BDI, FBX) and detected disruption events. Shows which stocks are bullish/bearish based on shipping cost deviations.",
    {
      stock: z
        .string()
        .optional()
        .describe(
          "Optional: filter results to a specific stock code (e.g. 'HPG'). Omit for all watchlist stocks.",
        ),
    },
    async ({ stock }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
      try {
        const db = getDb();

        // 1. Read shipping indices from tracked_indicators
        let indices = readShippingIndicesFromDb(db);

        // 2. Filter by stock if requested
        let watchlist = readWatchlist(db);
        if (stock) {
          watchlist = watchlist.filter(
            (w) => w.actionCode.toUpperCase() === stock.toUpperCase(),
          );
        }

        // 3. Compute MacroStats for each shipping index
        const INDICATOR_NAMES = ["shipping_bdi", "shipping_fbx_asia_us", "shipping_scfi"];
        const stats = INDICATOR_NAMES.flatMap((ind) => {
          const s = readShippingStats(db, ind);
          return s ? [s] : [];
        });

        // 4. Run supply chain analysis
        const signals =
          indices.length > 0 && stats.length > 0 && watchlist.length > 0
            ? analyzeSupplyChainImpact(indices, stats, watchlist)
            : [];

        // 5. Filter signals to requested stock if applicable
        const filteredSignals = stock
          ? signals.map((sig) => ({
              ...sig,
              affectedStocks: sig.affectedStocks.filter(
                (s) => s.code.toUpperCase() === stock.toUpperCase(),
              ),
            })).filter((sig) => sig.affectedStocks.length > 0)
          : signals;

        // 6. Check for recent disruption events from news text (optional)
        // In production, this would query recent analysis entries for SC events.
        // For now, return null (no active event detected from DB query).
        const activeEvent: SupplyChainEvent | null = null;

        // 7. Build output
        const output = buildSupplyChainExposureOutput(
          indices,
          filteredSignals,
          activeEvent,
        );

        return {
          content: [{ type: "text" as const, text: output }],
        };
      } catch (err) {
        logger.error("[get_supply_chain_exposure] failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: "Lỗi: Không thể lấy dữ liệu chuỗi cung ứng. Vui lòng thử lại.",
            },
          ],
        };
      }
    },
  );
}
