/**
 * Climate Impact Mapper — Task 259
 *
 * Pure domain service. Maps weather events to stock-level investment impacts.
 * Incorporates a seasonal risk calendar for Vietnamese market context.
 *
 * Key impact rules:
 *   Drought / El Niño → REE/GEG bullish (solar replaces hydro), CHP/hydro bearish
 *   Typhoon Cat 3+    → BVH/PVI bearish (claims), MPC/ANV bearish (aquaculture)
 *   Heat wave         → IDC/KBC bearish (power shortage for industrial zones), GEG bullish
 *   Flood             → VNM/MPC bearish (supply chain), BVH/PVI bearish (claims)
 *   Cold snap         → DCM/DPM bearish (crop damage, reduced fertilizer demand)
 *   La Niña           → flood risk cascade → same as flood pattern
 *
 * Layer: domain/services — ZERO imports from infrastructure/ or application/.
 */

import type { WeatherEvent, WeatherEventType, WeatherSeverity } from "../models/shared-types.js";
import type { ImpactDirection } from "./newsNormalizer.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ClimateAffectedStock {
  code: string;
  direction: ImpactDirection;
  reasoning: string;
}

export interface ClimateSignal {
  eventType: WeatherEventType;
  severity: WeatherSeverity;
  affectedStocks: ClimateAffectedStock[];
  seasonalContext: string;
  confidence: number;
}

export interface WatchlistEntry {
  actionCode: string;
  domain: string;
}

// ---------------------------------------------------------------------------
// Seasonal risk calendar
// ---------------------------------------------------------------------------

/**
 * Monthly seasonal risk windows for Vietnam.
 * Key: "MM" zero-padded month number.
 */
const SEASONAL_RISKS: Record<string, { risk: string; stocks: string[]; note: string }> = {
  "06": { risk: "thiếu điện", stocks: ["IDC", "KBC", "GEG", "REE"], note: "Mùa nắng nóng, nhu cầu điện cao nhất năm" },
  "07": { risk: "thiếu điện", stocks: ["IDC", "KBC", "GEG", "REE"], note: "Đỉnh mùa nắng nóng" },
  "08": { risk: "thiếu điện/bão sớm", stocks: ["IDC", "KBC", "GEG", "REE", "BVH"], note: "Nhu cầu điện cao, bão bắt đầu" },
  "09": { risk: "bão lũ", stocks: ["MPC", "ANV", "BVH", "PVI", "VNM"], note: "Mùa bão chính miền Trung" },
  "10": { risk: "bão lũ", stocks: ["MPC", "ANV", "BVH", "PVI", "VNM"], note: "Bão tập trung miền Trung và Bắc" },
  "11": { risk: "lũ cuối mùa", stocks: ["MPC", "ANV", "BVH", "PVI"], note: "Lũ hậu bão, ngập úng ĐBSCL" },
  "12": { risk: "hạn hán/El Niño", stocks: ["REE", "CHP", "GEG"], note: "Mùa khô bắt đầu, thủy điện giảm" },
  "01": { risk: "rét đậm/El Niño", stocks: ["DCM", "DPM", "REE", "CHP"], note: "Rét đậm miền Bắc, hạn bắt đầu Nam Bộ" },
  "02": { risk: "hạn hán", stocks: ["REE", "CHP", "GEG", "VNM"], note: "Hạn hán đỉnh mùa khô" },
  "03": { risk: "hạn hán/El Niño", stocks: ["REE", "CHP", "GEG", "VNM"], note: "Thiếu nước mùa hè thu" },
  "04": { risk: "hạn cuối mùa khô", stocks: ["REE", "CHP", "GEG"], note: "Hạn cuối, nước hồ xuống thấp nhất" },
  "05": { risk: "nắng nóng sớm", stocks: ["IDC", "KBC", "GEG"], note: "Nắng nóng đầu mùa khô" },
};

/**
 * Returns a human-readable seasonal risk context description for a given month number (1–12).
 */
export function getSeasonalContext(month: number): string {
  const key = String(month).padStart(2, "0");
  const seasonal = SEASONAL_RISKS[key];
  if (!seasonal) return "Không có rủi ro mùa vụ đặc biệt trong tháng này.";
  const stocksDisplay = seasonal.stocks.length <= 5
    ? seasonal.stocks.join(", ")
    : `${seasonal.stocks.slice(0, 5).join(", ")} +${seasonal.stocks.length - 5} more`;
  return `Tháng ${month}: Rủi ro ${seasonal.risk} — ${seasonal.note}. Cổ phiếu cần theo dõi: ${stocksDisplay}.`;
}

// ---------------------------------------------------------------------------
// Impact rules
// ---------------------------------------------------------------------------

interface StockImpactRule {
  /** Stock codes this rule applies to */
  codes: string[];
  /** Domain types this rule applies to (alternative to codes) */
  domains?: string[];
  direction: ImpactDirection;
  reasoning: string;
  /** Minimum severity to trigger */
  minSeverity: WeatherSeverity;
}

const SEVERITY_ORDER: Record<WeatherSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function severityMeetsThreshold(actual: WeatherSeverity, min: WeatherSeverity): boolean {
  return SEVERITY_ORDER[actual] >= SEVERITY_ORDER[min];
}

/** Impact rules per weather event type */
const CLIMATE_RULES: Record<WeatherEventType, StockImpactRule[]> = {
  drought: [
    {
      codes: ["REE", "GEG"],
      direction: "up",
      reasoning: "Hạn hán → thủy điện thiếu sản lượng → nhu cầu solar/wind thay thế tăng mạnh",
      minSeverity: "low",
    },
    {
      codes: ["CHP"],
      direction: "down",
      reasoning: "Thủy điện nhỏ: hạn hán làm giảm lưu lượng nước, sản lượng điện giảm 20-40%",
      minSeverity: "low",
    },
    {
      domains: ["seafood"],
      codes: ["MPC", "ANV"],
      direction: "down",
      reasoning: "Hạn hán → thiếu nước ao nuôi thủy sản, chi phí tăng",
      minSeverity: "medium",
    },
    {
      domains: ["food_beverage"],
      codes: ["VNM"],
      direction: "down",
      reasoning: "Hạn hán → nguồn nước sản xuất và nguyên liệu (sữa bò) bị ảnh hưởng",
      minSeverity: "high",
    },
  ],

  el_nino: [
    {
      codes: ["REE", "GEG"],
      direction: "up",
      reasoning: "El Niño → hạn hán dài hạn → thủy điện giảm → cơ hội cho năng lượng tái tạo",
      minSeverity: "low",
    },
    {
      codes: ["CHP"],
      direction: "down",
      reasoning: "El Niño → ít mưa → hồ thủy điện cạn, sản lượng thủy điện giảm đáng kể",
      minSeverity: "low",
    },
    {
      domains: ["agriculture"],
      codes: ["VNM"],
      direction: "down",
      reasoning: "El Niño → nắng hạn kéo dài → ảnh hưởng nguyên liệu nông nghiệp",
      minSeverity: "medium",
    },
  ],

  typhoon: [
    {
      codes: ["BVH", "PVI"],
      direction: "down",
      reasoning: "Bão lớn → bồi thường bảo hiểm tài sản, xe cộ, nông nghiệp tăng cao",
      minSeverity: "medium",
    },
    {
      codes: ["MPC", "ANV"],
      direction: "down",
      reasoning: "Bão → thiệt hại ao nuôi tôm/cá vùng ven biển, tổn thất hàng tồn kho",
      minSeverity: "medium",
    },
    {
      codes: ["VNM"],
      direction: "down",
      reasoning: "Bão → gián đoạn chuỗi cung ứng, thiệt hại kho bãi, vận chuyển",
      minSeverity: "high",
    },
    // Construction sector benefits from reconstruction
    {
      domains: ["construction"],
      codes: [],
      direction: "up",
      reasoning: "Sau bão: nhu cầu tái thiết tăng → vật liệu xây dựng, xi măng, thép được hưởng lợi",
      minSeverity: "critical",
    },
  ],

  flood: [
    {
      codes: ["BVH", "PVI"],
      direction: "down",
      reasoning: "Lũ lụt → khiếu nại bảo hiểm tài sản và cây trồng tăng",
      minSeverity: "medium",
    },
    {
      codes: ["MPC", "ANV"],
      direction: "down",
      reasoning: "Lũ lụt → thiệt hại ao nuôi thủy sản vùng ven sông, ĐBSCL",
      minSeverity: "medium",
    },
    {
      codes: ["VNM"],
      direction: "down",
      reasoning: "Lũ lụt → gián đoạn sản xuất, phân phối sữa và nước giải khát",
      minSeverity: "medium",
    },
  ],

  heat_wave: [
    {
      codes: ["IDC", "KBC"],
      direction: "down",
      reasoning: "Nắng nóng → nguy cơ thiếu điện → nhà máy FDI trong KCN có thể bị cắt điện luân phiên",
      minSeverity: "medium",
    },
    {
      codes: ["GEG", "REE"],
      direction: "up",
      reasoning: "Nắng nóng → nhu cầu điều hòa tăng đột biến → nhu cầu năng lượng tái tạo tăng",
      minSeverity: "medium",
    },
  ],

  cold_snap: [
    {
      codes: ["DCM", "DPM"],
      direction: "down",
      reasoning: "Rét đậm → cây trồng chết rét, nông dân giảm mua phân bón vụ Đông Xuân",
      minSeverity: "medium",
    },
    {
      codes: ["VNM"],
      direction: "down",
      reasoning: "Rét đậm kéo dài → bò sữa giảm sản lượng, chi phí chăn nuôi tăng",
      minSeverity: "high",
    },
  ],

  la_nina: [
    {
      codes: ["BVH", "PVI"],
      direction: "down",
      reasoning: "La Niña → gia tăng mưa lũ tại VN → rủi ro bồi thường bảo hiểm tăng",
      minSeverity: "medium",
    },
    {
      codes: ["MPC", "ANV"],
      direction: "down",
      reasoning: "La Niña → mưa lớn kéo dài → ảnh hưởng nuôi trồng thủy sản ĐBSCL",
      minSeverity: "medium",
    },
    {
      codes: ["REE", "GEG"],
      direction: "up",
      reasoning: "La Niña → nhiều mưa → thủy điện được hưởng lợi nhưng solar/wind vẫn tăng về đa dạng hóa",
      minSeverity: "low",
    },
  ],
};

// ---------------------------------------------------------------------------
// Confidence mapping
// ---------------------------------------------------------------------------

function severityToConfidence(severity: WeatherSeverity): number {
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
 * Pure function: maps a weather event to stock-level investment signals.
 * Filters results to only stocks present in the provided watchlist.
 *
 * @param event     - Weather event from fetchWeatherWarnings()
 * @param watchlist - User's watchlist stocks (code + domain)
 * @returns ClimateSignal with affected stocks filtered to watchlist
 */
export function mapClimateImpact(
  event: WeatherEvent,
  watchlist: WatchlistEntry[],
): ClimateSignal {
  const watchlistCodes = new Set(watchlist.map((w) => w.actionCode));
  const watchlistByDomain = new Map<string, string[]>();
  for (const w of watchlist) {
    const existing = watchlistByDomain.get(w.domain) ?? [];
    existing.push(w.actionCode);
    watchlistByDomain.set(w.domain, existing);
  }

  const rules = CLIMATE_RULES[event.type] ?? [];
  const affectedStocks: ClimateAffectedStock[] = [];
  const seen = new Set<string>();

  for (const rule of rules) {
    if (!severityMeetsThreshold(event.severity, rule.minSeverity)) continue;

    // Direct stock codes from the rule
    for (const code of rule.codes) {
      if (!seen.has(code) && watchlistCodes.has(code)) {
        seen.add(code);
        affectedStocks.push({
          code,
          direction: rule.direction,
          reasoning: rule.reasoning,
        });
      }
    }

    // Domain-based matching
    if (rule.domains) {
      for (const domain of rule.domains) {
        const domainStocks = watchlistByDomain.get(domain) ?? [];
        for (const code of domainStocks) {
          if (!seen.has(code) && !rule.codes.includes(code)) {
            seen.add(code);
            affectedStocks.push({
              code,
              direction: rule.direction,
              reasoning: rule.reasoning,
            });
          }
        }
      }
    }
  }

  // Seasonal context: use event's forecastDate month
  const month = new Date(event.forecastDate).getMonth() + 1;
  const seasonalContext = getSeasonalContext(month);

  return {
    eventType: event.type,
    severity: event.severity,
    affectedStocks,
    seasonalContext,
    confidence: severityToConfidence(event.severity),
  };
}
