/**
 * Energy Market Analyzer — Task 260
 *
 * Pure domain service. Analyzes Vietnam power grid data and generates
 * stock impact signals for energy and industrial companies.
 *
 * Key rules:
 *   Reservoir < 40% capacity → hydro_deficit → REE/GEG bullish, CHP bearish
 *   Peak demand > 90% installed → power_shortage → IDC/KBC bearish, GEG bullish
 *   Thermal dispatch > 60% → thermal_stress → coal supply chain risks
 *   Renewable dispatch > 30% → renewable_growth → GEG/REE bullish
 *
 * Layer: domain/services — ZERO imports from infrastructure/ or application/.
 */

import type { ImpactDirection } from "./newsNormalizer.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EnergyData {
  /** Hydro reservoir capacity as percentage (0–100) */
  hydroCapacityPct: number;
  /** Thermal (coal/gas) dispatch as percentage of total generation */
  thermalDispatchPct: number;
  /** Renewable (solar/wind) dispatch as percentage of total generation */
  renewableDispatchPct: number;
  /** Current peak demand in GW */
  peakDemandGW: number;
  /** Total installed generation capacity in GW */
  installedCapacityGW: number;
}

export type EnergySignalType =
  | "power_shortage"
  | "hydro_deficit"
  | "renewable_growth"
  | "thermal_stress";

export type EnergySeverity = "low" | "medium" | "high" | "critical";

export interface EnergyAffectedStock {
  code: string;
  direction: ImpactDirection;
  reasoning: string;
}

export interface EnergySignal {
  type: EnergySignalType;
  severity: EnergySeverity;
  affectedStocks: EnergyAffectedStock[];
  confidence: number;
  /**
   * DSI-S3 C2: true when signal is derived from hardcoded/estimated grid figures
   * (thermalDispatchPct/renewableDispatchPct/peakDemandGW/installedCapacityGW).
   * Absent or false only when all input values come from a live EVN API fetch.
   */
  is_estimate?: boolean;
  /** DSI-S3 C2: provenance tier — 4 = fixture/estimate. */
  source_tier?: 1 | 2 | 3 | 4;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Hydro reservoir capacity thresholds */
const HYDRO_DEFICIT_PCT = 40;
const HYDRO_CRITICAL_PCT = 25;

/** Peak demand as fraction of installed capacity */
const PEAK_SHORTAGE_RATIO = 0.90;
const PEAK_CRITICAL_RATIO = 0.97;

/** Thermal dispatch percentage thresholds */
const THERMAL_STRESS_PCT = 60;
const THERMAL_HIGH_PCT = 75;

/** Renewable dispatch percentage thresholds */
const RENEWABLE_GROWTH_PCT = 30;

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

function hydroSeverity(pct: number): EnergySeverity {
  if (pct < HYDRO_CRITICAL_PCT) return "critical";
  if (pct < HYDRO_DEFICIT_PCT) return "high";
  return "medium";
}

function shortageSeverity(ratio: number): EnergySeverity {
  if (ratio >= PEAK_CRITICAL_RATIO) return "critical";
  if (ratio >= PEAK_SHORTAGE_RATIO) return "high";
  return "medium";
}

function thermalSeverity(pct: number): EnergySeverity {
  if (pct >= THERMAL_HIGH_PCT) return "high";
  return "medium";
}

function severityToConfidence(severity: EnergySeverity): number {
  switch (severity) {
    case "critical": return 0.90;
    case "high": return 0.75;
    case "medium": return 0.60;
    case "low": return 0.45;
  }
}

// ---------------------------------------------------------------------------
// Main public API
// ---------------------------------------------------------------------------

/**
 * Pure function: analyzes power grid data and returns stock-level impact signals.
 * Returns empty array when all indicators are within normal ranges.
 *
 * @param data - Current power grid data
 * @returns Array of EnergySignal (may be empty when conditions are normal)
 */
export function analyzeEnergyMarket(data: EnergyData): EnergySignal[] {
  const signals: EnergySignal[] = [];

  // ── Signal 1: Hydro Deficit ─────────────────────────────────────────────
  if (data.hydroCapacityPct < HYDRO_DEFICIT_PCT) {
    const severity = hydroSeverity(data.hydroCapacityPct);
    signals.push({
      type: "hydro_deficit",
      severity,
      affectedStocks: [
        {
          code: "REE",
          direction: "up",
          reasoning: `Hồ thủy điện chỉ còn ${data.hydroCapacityPct}% — thủy điện thiếu sản lượng → nhu cầu solar/wind thay thế tăng`,
        },
        {
          code: "GEG",
          direction: "up",
          reasoning: `Thiếu thủy điện tạo cơ hội cho GEG (điện gió, điện mặt trời)`,
        },
        {
          code: "CHP",
          direction: "down",
          reasoning: `Thủy điện nhỏ: hồ chứa ${data.hydroCapacityPct}% → sản lượng điện giảm, doanh thu sụt`,
        },
        {
          code: "IDC",
          direction: "down",
          reasoning: `Thiếu thủy điện + hồ thấp → nguy cơ cắt điện khu công nghiệp`,
        },
        {
          code: "KBC",
          direction: "down",
          reasoning: `Rủi ro thiếu điện ảnh hưởng các khu công nghiệp KBC`,
        },
      ],
      confidence: severityToConfidence(severity),
    });
  }

  // ── Signal 2: Power Shortage ─────────────────────────────────────────────
  if (data.installedCapacityGW > 0) {
    const ratio = data.peakDemandGW / data.installedCapacityGW;
    if (ratio >= PEAK_SHORTAGE_RATIO) {
      const severity = shortageSeverity(ratio);
      signals.push({
        type: "power_shortage",
        severity,
        affectedStocks: [
          {
            code: "IDC",
            direction: "down",
            reasoning: `Nhu cầu điện ${(ratio * 100).toFixed(0)}% công suất lắp đặt → nguy cơ cắt điện luân phiên trong KCN, ảnh hưởng FDI`,
          },
          {
            code: "KBC",
            direction: "down",
            reasoning: `Thiếu điện nghiêm trọng → doanh nghiệp FDI lo ngại tính ổn định nguồn điện`,
          },
          {
            code: "GEG",
            direction: "up",
            reasoning: `Thiếu điện → chính phủ đẩy mạnh mua điện tái tạo khẩn cấp → GEG hưởng lợi`,
          },
          {
            code: "REE",
            direction: "up",
            reasoning: `Khủng hoảng điện → tăng tốc phê duyệt dự án solar/wind → REE (M&A dự án điện) hưởng lợi`,
          },
        ],
        confidence: severityToConfidence(severity),
      });
    }
  }

  // ── Signal 3: Thermal Stress ─────────────────────────────────────────────
  if (data.thermalDispatchPct > THERMAL_STRESS_PCT) {
    const severity = thermalSeverity(data.thermalDispatchPct);
    signals.push({
      type: "thermal_stress",
      severity,
      affectedStocks: [
        {
          code: "PLX",
          direction: "up",
          reasoning: `Nhiệt điện ${data.thermalDispatchPct}% phụ tải → nhu cầu than/khí tăng → PLX (xăng dầu, khí) hưởng lợi`,
        },
        {
          code: "GAS",
          direction: "up",
          reasoning: `Nhiệt điện khí cao → nhu cầu khí đốt tăng → PVGas (GAS) hưởng lợi`,
        },
        {
          code: "REE",
          direction: "up",
          reasoning: `Phụ thuộc nhiệt điện cao → dài hạn thúc đẩy chính sách chuyển dịch năng lượng → tái tạo hưởng lợi`,
        },
      ],
      confidence: severityToConfidence(severity),
    });
  }

  // ── Signal 4: Renewable Growth ───────────────────────────────────────────
  if (data.renewableDispatchPct > RENEWABLE_GROWTH_PCT) {
    signals.push({
      type: "renewable_growth",
      severity: "medium",
      affectedStocks: [
        {
          code: "GEG",
          direction: "up",
          reasoning: `Năng lượng tái tạo chiếm ${data.renewableDispatchPct}% — chính sách hỗ trợ mạnh, GEG tăng trưởng sản lượng`,
        },
        {
          code: "REE",
          direction: "up",
          reasoning: `Tỷ trọng NLTT ${data.renewableDispatchPct}% — REE (M&A, vận hành dự án NLTT) hưởng lợi dài hạn`,
        },
        {
          code: "PC1",
          direction: "up",
          reasoning: `NLTT tăng → nhu cầu đường dây truyền tải, trạm biến áp → PC1 (xây lắp điện) hưởng lợi`,
        },
      ],
      confidence: 0.65,
    });
  }

  // ── Combined extreme scenario: boost severity if both hydro + shortage ───
  if (signals.length >= 2) {
    const hydroSignal = signals.find((s) => s.type === "hydro_deficit");
    const shortageSignal = signals.find((s) => s.type === "power_shortage");
    if (hydroSignal && shortageSignal) {
      // Escalate to critical when both fire together
      hydroSignal.severity = "critical";
      shortageSignal.severity = "critical";
      hydroSignal.confidence = 0.90;
      shortageSignal.confidence = 0.90;
    }
  }

  return signals;
}
