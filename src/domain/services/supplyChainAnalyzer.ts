/**
 * Supply Chain Analyzer — Domain Service (Task 253)
 *
 * Pure domain service. Maps shipping index σ-deviations to stock-level impacts.
 *
 * Uses existing macroThresholds.ts for σ-based classification (classifyDeviation).
 * Maps each shipping index to stocks with known shipping exposure,
 * then computes direction (bullish/bearish) based on the stock's relationship
 * to that index (direct vs inverse).
 *
 * Design:
 *   - Zero I/O — no imports from infrastructure/
 *   - Receives pre-fetched shipping indices + pre-computed MacroStats
 *   - Returns SupplyChainSignal[] for the cascade engine to consume
 *
 * Layer: domain/services
 */

import {
  classifyDeviation,
  type MacroStats,
  type MacroDeviation,
} from "./macroThresholds.js";
import type { WatchlistEntry } from "./cascadeEngine.js";
import type { ShippingIndex } from "../models/shared-types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImpactDirection = "bullish" | "bearish" | "neutral";
export type Severity = "low" | "medium" | "high" | "critical";

export interface SupplyChainSignal {
  /** Index name, e.g. "BDI" */
  index: string;
  /** σ-based deviation classification */
  deviation: MacroDeviation;
  /** Stocks affected and their direction */
  affectedStocks: Array<{
    code: string;
    direction: ImpactDirection;
    reasoning: string;
  }>;
  /** Overall severity of this signal */
  severity: Severity;
  /** Confidence in the signal (0–1) */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Shipping Exposure Map
// ---------------------------------------------------------------------------

type SensitivityLevel = "high" | "medium" | "low";
type ExposureRelationship = "direct" | "inverse" | "neutral";

interface ShippingExposure {
  sensitivity: SensitivityLevel;
  /** direct: index up → stock up; inverse: index up → stock down */
  relationship: ExposureRelationship;
  /** Vietnamese explanation of why */
  reasoningVi: string;
}

/**
 * Maps stock codes to their shipping index exposure.
 * Applies to ALL shipping indices (BDI, FBX, SCFI) unless overridden.
 */
const SHIPPING_EXPOSURE: Record<string, ShippingExposure> = {
  HPG: {
    sensitivity: "high",
    relationship: "inverse",
    reasoningVi: "HPG nhập phế liệu thép — chi phí tăng khi cước vận tải cao",
  },
  GMD: {
    sensitivity: "high",
    relationship: "direct",
    reasoningVi: "GMD doanh thu logistics — tăng theo cước vận tải",
  },
  VNM: {
    sensitivity: "medium",
    relationship: "inverse",
    reasoningVi: "VNM xuất sữa — chi phí logistics tăng làm giảm biên lợi nhuận xuất khẩu",
  },
  GVR: {
    sensitivity: "medium",
    relationship: "inverse",
    reasoningVi: "GVR xuất cao su — cước vận tải cao làm tăng chi phí giao hàng",
  },
  DGC: {
    sensitivity: "medium",
    relationship: "inverse",
    reasoningVi: "DGC xuất hóa chất — phụ thuộc vận tải biển để xuất khẩu",
  },
  FPT: {
    sensitivity: "low",
    relationship: "neutral",
    reasoningVi: "FPT digital services — ít phụ thuộc vận tải vật lý",
  },
  PHP: {
    sensitivity: "high",
    relationship: "direct",
    reasoningVi: "PHP cảng Hải Phòng — doanh thu cảng tăng theo lưu lượng vận tải",
  },
  GMC: {
    sensitivity: "medium",
    relationship: "direct",
    reasoningVi: "GMC logistics container — tăng theo cước FBX container",
  },
};

// Indicator name → statName in MacroStats
const INDEX_TO_STAT_NAME: Record<string, string> = {
  BDI: "shipping_bdi",
  FBX_ASIA_US: "shipping_fbx_asia_us",
  FBX_ASIA_EU: "shipping_fbx_asia_eu",
  SCFI: "shipping_scfi",
};

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

function deviationToSeverity(deviation: MacroDeviation): Severity {
  const absZ = Math.abs(deviation.zScore);
  if (absZ >= 3) return "critical";
  if (absZ >= 2) return "high";
  if (absZ >= 1) return "medium";
  return "low";
}

function sensitivityToConfidenceDelta(sensitivity: SensitivityLevel): number {
  switch (sensitivity) {
    case "high": return 0.15;
    case "medium": return 0.10;
    case "low": return 0.05;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyzes shipping index data to produce stock-level supply chain signals.
 *
 * @param indices   - Current shipping index values (from shippingIndex fetcher)
 * @param stats     - Pre-computed rolling MacroStats for each shipping indicator
 * @param watchlist - User's watchlist to filter signals to relevant stocks
 * @returns Array of SupplyChainSignal, one per index that deviates significantly
 */
export function analyzeSupplyChainImpact(
  indices: ShippingIndex[],
  stats: MacroStats[],
  watchlist: WatchlistEntry[],
): SupplyChainSignal[] {
  if (indices.length === 0 || stats.length === 0) return [];

  const watchlistCodes = new Set(watchlist.map((w) => w.actionCode));
  const signals: SupplyChainSignal[] = [];

  // Build a lookup: statName → MacroStats
  const statsMap = new Map<string, MacroStats>();
  for (const s of stats) {
    statsMap.set(s.name, s);
  }

  for (const idx of indices) {
    const statName = INDEX_TO_STAT_NAME[idx.name];
    if (!statName) continue;

    const macroStats = statsMap.get(statName);
    if (!macroStats) continue;

    // Classify deviation
    const deviation = classifyDeviation(macroStats);

    // Only fire signal if deviation is significant (≥ 1σ)
    if (deviation.level === "normal") continue;

    const severity = deviationToSeverity(deviation);

    // Find affected stocks from watchlist
    const affectedStocks: SupplyChainSignal["affectedStocks"] = [];

    for (const code of watchlistCodes) {
      const exposure = SHIPPING_EXPOSURE[code];
      if (!exposure) continue;
      if (exposure.relationship === "neutral") continue;

      // Compute direction: deviation direction + relationship type
      let direction: ImpactDirection;
      if (exposure.relationship === "direct") {
        direction = deviation.direction === "above" ? "bullish" : "bearish";
      } else {
        // inverse
        direction = deviation.direction === "above" ? "bearish" : "bullish";
      }

      const sign = deviation.direction === "above" ? "tăng" : "giảm";
      const reasoning =
        `${idx.name} ${sign} ${Math.abs(deviation.zScore).toFixed(1)}σ: ${exposure.reasoningVi}`;

      affectedStocks.push({ code, direction, reasoning });
    }

    if (affectedStocks.length === 0) continue;

    // Base confidence from deviation level + sensitivity adjustment
    const baseConfidence =
      deviation.level === "extreme" ? 0.85 :
      deviation.level === "high" ? 0.75 :
      deviation.level === "elevated" ? 0.60 : 0.45;

    // Average sensitivity of affected stocks (for confidence adjustment)
    const avgSensitivityDelta =
      affectedStocks.reduce((sum, s) => {
        const exp = SHIPPING_EXPOSURE[s.code];
        return sum + (exp ? sensitivityToConfidenceDelta(exp.sensitivity) : 0.05);
      }, 0) / affectedStocks.length;

    const confidence = Math.min(
      0.99,
      Math.max(0.1, baseConfidence + avgSensitivityDelta),
    );

    signals.push({
      index: idx.name,
      deviation,
      affectedStocks,
      severity,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  return signals;
}
