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
import { logger } from "../../../../infrastructure/logger.js";
import { fetchReservoirLevels } from "../../../../infrastructure/fetchers/hydrologicalData.js";
import {
  analyzeEnergyMarket,
  type EnergyData,
} from "../../../../domain/services/energyMarketAnalyzer.js";

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
  // DSI-S3 C2: thermalDispatchPct/renewableDispatchPct/peakDemandGW/installedCapacityGW
  // are hardcoded approximations (no live EVN API). Tag all derived signals as
  // is_estimate: true / source_tier: 4 so downstream consumers know the provenance.
  const rawSignals = analyzeEnergyMarket(energyData);
  const signals = rawSignals.map((s) => ({ ...s, is_estimate: true, source_tier: 4 as const }));

  // ── Format output ─────────────────────────────────────────────────────────
  let text = `=== TRẠNG THÁI ĐIỆN LỰC VIỆT NAM ===\n\n`;

  // Reservoir summary
  if (reservoirs.length > 0) {
    text += `Hồ chứa thuỷ điện:\n`;
    for (const r of reservoirs) {
      const trend = r.trend === "rising" ? "tăng" : r.trend === "falling" ? "giảm" : "ổn định";
      text += `  ${r.name}: ${r.capacityPct}% (${trend})\n`;
    }
    text += `  Trung bình: ${avgCapacity.toFixed(1)}%\n\n`;
  } else {
    text += `Hồ chứa: Không lấy được dữ liệu hiện tại. Sử dụng ước tính mặc định (70%).\n\n`;
  }

  text += `Dữ liệu lưới điện (ước tính):\n`;
  text += `  Thuỷ điện: ${avgCapacity.toFixed(0)}% dung tích\n`;
  text += `  Nhiệt điện: ${energyData.thermalDispatchPct}% phụ tải\n`;
  text += `  Năng lượng tái tạo: ${energyData.renewableDispatchPct}% phụ tải\n`;
  text += `  Nhu cầu đỉnh: ~${energyData.peakDemandGW} GW / ${energyData.installedCapacityGW} GW cắp đặt (${((energyData.peakDemandGW / energyData.installedCapacityGW) * 100).toFixed(0)}%)\n\n`;

  if (signals.length === 0) {
    text += `Tình trạng điện lượng: BÌNH THƯỜNG\n`;
    text += `Không có tín hiệu báo động điện lực hiện tại.\n`;
  } else {
    text += `=== TÍN HIỆU BÁO ĐỘNG (ƯỚC TÍNH — dữ liệu lưới điện chưa từ EVN API) ===\n\n`;
    for (const signal of signals) {
      // DSI-S3 C2: mark each signal derived from hardcoded grid figures
      const estimateTag = signal.is_estimate ? " [ƯỚC TÍNH]" : "";
      text += `[${signal.severity.toUpperCase()}]${estimateTag} ${signal.type.replace(/_/g, " ").toUpperCase()}\n`;
      text += `  Độ tin cậy: ${(signal.confidence * 100).toFixed(0)}%\n`;
      for (const stock of signal.affectedStocks) {
        const dir = stock.direction === "up" ? "TĂNG" : stock.direction === "down" ? "GIẢM" : "TRUNG LẬP";
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
    "Lấy tín hiệu thị trường điện lực VN: mức nước hồ thủy điện, cơ cấu phát điện, nguy cơ thiếu điện. Phân tích ảnh hưởng lên cổ phiếu năng lượng (REE, GEG, PC1) và khu công nghiệp (IDC, KBC).",
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
              text: `Lỗi khi lấy tín hiệu điện lực: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
