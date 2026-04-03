/**
 * Interface — Energy Grid MCP Tool (Task 262)
 *
 * Registers `get_energy_grid_signals` on a McpServer instance.
 *
 * The tool:
 *   1. Fetches reservoir levels from Vietnamese news
 *   2. Constructs EnergyData from reservoir levels + defaults
 *   3. Calls analyzeEnergyMarket() to get EnergySignal[]
 *   4. Returns formatted Vietnamese text with grid status + stock impacts
 *
 * @module interface/mcp/tools/energyTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../../../infrastructure/logger.js";
import { fetchReservoirLevels } from "../../../infrastructure/fetchers/hydrologicalData.js";
import {
  analyzeEnergyMarket,
  type EnergyData,
} from "../../../domain/services/energyMarketAnalyzer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Core logic (exported for integration testing)
// ─────────────────────────────────────────────────────────────────────────────

export interface EnergyGridOptions {
  // No options currently — returns all grid signals
}

/**
 * Core logic for get_energy_grid_signals.
 * Returns formatted Vietnamese text with energy market analysis.
 */
export async function getEnergyGridSignals(
  _opts: EnergyGridOptions,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return getEnergyGridStatus(_opts);
}

/**
 * Core logic for energy grid status (alias for getEnergyGridSignals, exported for tests).
 */
export async function getEnergyGridStatus(
  _opts: EnergyGridOptions,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  // ── Fetch reservoir levels ─────────────────────────────────────────────
  let reservoirs: Awaited<ReturnType<typeof fetchReservoirLevels>> = [];
  try {
    reservoirs = await fetchReservoirLevels();
  } catch (err) {
    logger.warn("[energyTools] fetchReservoirLevels failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Build EnergyData ────────────────────────────────────────────────────
  const avgCapacity =
    reservoirs.length > 0
      ? reservoirs.reduce((s, r) => s + r.capacityPct, 0) / reservoirs.length
      : 70;

  const energyData: EnergyData = {
    hydroCapacityPct: avgCapacity,
    thermalDispatchPct: 40,   // approximate; real data not available without EVN API
    renewableDispatchPct: 22, // approximate Vietnam NLTT share 2025
    peakDemandGW: 45,         // approximate Vietnam peak demand
    installedCapacityGW: 85,  // approximate Vietnam installed capacity
  };

  // ── Analyze market ───────────────────────────────────────────────────────
  const signals = analyzeEnergyMarket(energyData);

  // ── Format output ─────────────────────────────────────────────────────────
  let text = `=== TRANG THAI DIEN LUC VIET NAM ===\n\n`;

  // Reservoir summary
  if (reservoirs.length > 0) {
    text += `Ho chua thuy dien:\n`;
    for (const r of reservoirs) {
      const trend = r.trend === "rising" ? "tang" : r.trend === "falling" ? "giam" : "on dinh";
      text += `  ${r.name}: ${r.capacityPct}% (${trend})\n`;
    }
    text += `  Trung binh: ${avgCapacity.toFixed(1)}%\n\n`;
  } else {
    text += `Ho chua: Khong lay duoc du lieu hien tai. Su dung uoc tinh mac dinh (70%).\n\n`;
  }

  text += `Du lieu luoi dien (uoc tinh):\n`;
  text += `  Thuy dien: ${avgCapacity.toFixed(0)}% dung tich\n`;
  text += `  Nhiet dien: ${energyData.thermalDispatchPct}% phu tai\n`;
  text += `  Nang luong tai tao: ${energyData.renewableDispatchPct}% phu tai\n`;
  text += `  Nhu cau dinh: ~${energyData.peakDemandGW} GW / ${energyData.installedCapacityGW} GW cap dat (${((energyData.peakDemandGW / energyData.installedCapacityGW) * 100).toFixed(0)}%)\n\n`;

  if (signals.length === 0) {
    text += `Tinh trang dien luong: BINH THUONG\n`;
    text += `Khong co tin hieu bao dong dien luc hien tai.\n`;
  } else {
    text += `=== TIN HIEU BAO DONG ===\n\n`;
    for (const signal of signals) {
      text += `[${signal.severity.toUpperCase()}] ${signal.type.replace(/_/g, " ").toUpperCase()}\n`;
      text += `  Do tin cay: ${(signal.confidence * 100).toFixed(0)}%\n`;
      for (const stock of signal.affectedStocks) {
        const dir = stock.direction === "up" ? "TANG" : stock.direction === "down" ? "GIAM" : "TRUNG LAP";
        text += `  ${stock.code}: ${dir} — ${stock.reasoning.slice(0, 120)}\n`;
      }
      text += "\n";
    }
  }

  return {
    content: [{ type: "text" as const, text }],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers `get_energy_grid_signals` on the MCP server.
 */
export function registerEnergyTools(server: McpServer): void {
  server.tool(
    "get_energy_grid_signals",
    "Lay tin hieu thi truong dien luc VN: muc nuoc ho thuy dien, co cau phat dien, nguy co thieu dien. Phan tich anh huong len co phieu nang luong (REE, GEG, PC1) va khu cong nghiep (IDC, KBC).",
    {},
    async () => {
      try {
        return await getEnergyGridStatus({});
      } catch (err) {
        logger.error("[energyTools] get_energy_grid_signals error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi lay tin hieu dien luc: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
