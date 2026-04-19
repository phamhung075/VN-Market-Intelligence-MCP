/**
 * Interface — Climate Risk MCP Tool (Task 262)
 *
 * Registers `get_climate_risk_signals` on a McpServer instance.
 *
 * The tool:
 *   1. Fetches active weather warnings (NCHMF + NOAA ENSO)
 *   2. Maps events to stock-level impacts via climateImpactMapper
 *   3. Returns seasonal risk context + affected stocks + confidence
 *
 * Output: Vietnamese text summary with risk levels and affected stocks.
 *
 * @module interface/mcp/tools/climateTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../../infrastructure/logger.js";
import { fetchWeatherWarnings } from "../../../infrastructure/fetchers/weatherVn.js";
import {
  mapClimateImpact,
  getSeasonalContext,
} from "../../../domain/services/climateImpactMapper.js";

// ─────────────────────────────────────────────────────────────────────────────
// Core logic (exported for integration testing)
// ─────────────────────────────────────────────────────────────────────────────

export interface ClimateRiskOptions {
  stock?: string;
}

/**
 * Core logic for get_climate_risk_signals.
 * Returns formatted Vietnamese text with climate risk analysis.
 */
export async function getClimateRiskSignals(
  opts: ClimateRiskOptions,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const currentMonth = new Date().getMonth() + 1;

  // ── Seasonal context (always available) ─────────────────────────────────
  const seasonalCtx = getSeasonalContext(currentMonth);

  // ── Fetch watchlist from DB ───────────────────────────────────────────────
  let watchlist: Array<{ actionCode: string; domain: string; exchange: string }> = [];
  try {
    const { getDb } = await import("../../../infrastructure/db/schema.js");
    const db = getDb();
    const rows = db
      .prepare<{ code: string; domain: string; exchange: string }, []>(
        `SELECT code, domain, exchange FROM watchlist ORDER BY code`,
      )
      .all();
    watchlist = rows.map((r) => ({
      actionCode: r.code,
      domain: r.domain,
      exchange: r.exchange,
    }));

    // Filter to specific stock if requested
    if (opts.stock) {
      watchlist = watchlist.filter((w) => w.actionCode === opts.stock);
    }
  } catch (err) {
    logger.warn("[climateTools] failed to load watchlist", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Fetch weather events ─────────────────────────────────────────────────
  let weatherEvents: Awaited<ReturnType<typeof fetchWeatherWarnings>> = [];
  try {
    weatherEvents = await fetchWeatherWarnings();
  } catch (err) {
    logger.warn("[climateTools] fetchWeatherWarnings failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Map to stock signals ─────────────────────────────────────────────────
  const signals = weatherEvents
    .map((event) => mapClimateImpact(event, watchlist))
    .filter((s) => s.affectedStocks.length > 0);

  // ── Format output ─────────────────────────────────────────────────────────
  let text = `=== PHÂN TÍCH RỦI RO KHÍ HẬU ===\n\n`;
  text += `Tháng ${currentMonth}: ${seasonalCtx}\n\n`;

  if (weatherEvents.length === 0) {
    text += `Không có cảnh báo thời tiết hiện hành.\n\n`;
  } else {
    text += `Sự kiện thời tiết đang hoạt động: ${weatherEvents.length}\n\n`;
    for (const event of weatherEvents) {
      const sev = event.severity.toUpperCase();
      text += `[${sev}] ${event.type.replace(/_/g, " ").toUpperCase()}\n`;
      text += `  Vùng: ${event.regions.join(", ")}\n`;
      text += `  Mô tả: ${event.description.slice(0, 120)}\n`;
      text += `  Thời hạn: ${event.impactDuration}\n\n`;
    }
  }

  if (signals.length > 0) {
    text += `=== CỔ PHIẾU BỊ ẢNH HƯỞNG ===\n\n`;
    for (const signal of signals) {
      text += `${signal.eventType.replace(/_/g, " ").toUpperCase()} (${signal.severity}, tin tưởng: ${(signal.confidence * 100).toFixed(0)}%)\n`;
      for (const stock of signal.affectedStocks) {
        const dir = stock.direction === "up" ? "TĂNG" : stock.direction === "down" ? "GIẢM" : "TRUNG LẬP";
        text += `  ${stock.code}: ${dir} — ${stock.reasoning.slice(0, 100)}\n`;
      }
      text += "\n";
    }
  } else {
    text += `Không có cổ phiếu trong danh mục bị ảnh hưởng trực tiếp.\n`;
  }

  if (opts.stock) {
    text += `\nLọc: ${opts.stock}`;
  }

  return {
    content: [{ type: "text" as const, text }],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers `get_climate_risk_signals` on the MCP server.
 */
export function registerClimateTools(server: McpServer): void {
  server.tool(
    "get_climate_risk_signals",
    "Lấy tín hiệu rủi ro khí hậu và thời tiết cho cổ phiếu VN. Phân tích ảnh hưởng bão lũ, hạn hán, El Nino/La Nina, nắng nóng lên các cổ phiếu theo dõi (REE, GEG, BVH, MPC, IDC, v.v.). Bao gồm lịch rủi ro mùa vụ VN.",
    {
      stock: z.string().optional().describe("Mã cổ phiếu để lọc kết quả (tùy chọn, ví dụ: REE, GEG, BVH)"),
    },
    async ({ stock }) => {
      try {
        const opts: ClimateRiskOptions = {};
        if (stock != null) opts.stock = stock;
        return await getClimateRiskSignals(opts);
      } catch (err) {
        logger.error("[climateTools] get_climate_risk_signals error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi khi lấy tín hiệu khí hậu: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
