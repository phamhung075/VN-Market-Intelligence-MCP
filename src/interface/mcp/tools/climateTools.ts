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
  let text = `=== PHAN TICH RUI RO KHI HAU ===\n\n`;
  text += `Thang ${currentMonth}: ${seasonalCtx}\n\n`;

  if (weatherEvents.length === 0) {
    text += `Khong co canh bao thoi tiet hien hanh.\n\n`;
  } else {
    text += `Su kien thoi tiet dang hoat dong: ${weatherEvents.length}\n\n`;
    for (const event of weatherEvents) {
      const sev = event.severity.toUpperCase();
      text += `[${sev}] ${event.type.replace(/_/g, " ").toUpperCase()}\n`;
      text += `  Vung: ${event.regions.join(", ")}\n`;
      text += `  Mo ta: ${event.description.slice(0, 120)}\n`;
      text += `  Thoi han: ${event.impactDuration}\n\n`;
    }
  }

  if (signals.length > 0) {
    text += `=== CO PHIEU BI ANH HUONG ===\n\n`;
    for (const signal of signals) {
      text += `${signal.eventType.replace(/_/g, " ").toUpperCase()} (${signal.severity}, tin tuong: ${(signal.confidence * 100).toFixed(0)}%)\n`;
      for (const stock of signal.affectedStocks) {
        const dir = stock.direction === "up" ? "TANG" : stock.direction === "down" ? "GIAM" : "TRUNG LAP";
        text += `  ${stock.code}: ${dir} — ${stock.reasoning.slice(0, 100)}\n`;
      }
      text += "\n";
    }
  } else {
    text += `Khong co co phieu trong danh muc bi anh huong truc tiep.\n`;
  }

  if (opts.stock) {
    text += `\nLoc: ${opts.stock}`;
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
    "Lay tin hieu rui ro khi hau va thoi tiet cho co phieu VN. Phan tich anh huong bao lu, han han, El Nino/La Nina, nang nong len cac co phieu theo doi (REE, GEG, BVH, MPC, IDC, v.v.). Bao gom lich rui ro mua vu VN.",
    {
      stock: z.string().optional().describe("Ma co phieu de loc ket qua (tuy chon, vi du: REE, GEG, BVH)"),
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
              text: `Loi khi lay tin hieu khi hau: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
