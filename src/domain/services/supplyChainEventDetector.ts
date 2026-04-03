/**
 * Supply Chain Event Detector — Domain Service (Task 254)
 *
 * Pure domain service. Detects supply chain disruption events from news text
 * using 12 Vietnamese + English patterns.
 *
 * Patterns cover:
 *   - port_congestion   : Tắc nghẽn cảng / port congestion
 *   - dock_strike       : Đình công cảng / dock strike
 *   - canal_blockage    : Kênh Suez/Panama / Suez Canal / Panama Canal (CRITICAL)
 *   - container_shortage: Thiếu container / container shortage
 *   - force_majeure     : Force majeure declaration
 *   - route_disruption  : Gián đoạn chuỗi cung ứng / supply chain disruption
 *
 * Layer: domain/services — zero I/O, zero infrastructure imports.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SupplyChainEventType =
  | "port_congestion"
  | "dock_strike"
  | "canal_blockage"
  | "container_shortage"
  | "force_majeure"
  | "route_disruption";

export type Severity = "low" | "medium" | "high" | "critical";

export interface SupplyChainEvent {
  /** Type of supply chain disruption */
  eventType: SupplyChainEventType;
  /** Impact severity */
  severity: Severity;
  /** Geographic routes affected (e.g., "Asia-US", "Asia-EU") */
  affectedRoutes: string[];
  /** Watchlist stock codes affected by this event */
  affectedStocks: string[];
  /** Confidence in the detection (0–1) */
  confidence: number;
  /** Human-readable event description */
  description: string;
}

// ---------------------------------------------------------------------------
// Pattern definitions (12 patterns)
// ---------------------------------------------------------------------------

interface ScPattern {
  pattern: RegExp;
  eventType: SupplyChainEventType;
  severity: Severity;
  /** Routes typically affected by this event type */
  defaultRoutes: string[];
  /** Description template */
  descriptionVi: string;
  confidence: number;
}

const SC_PATTERNS: ScPattern[] = [
  // 1. Port congestion — Vietnamese
  {
    pattern: /tắc nghẽn cảng/i,
    eventType: "port_congestion",
    severity: "high",
    defaultRoutes: ["Asia-Global"],
    descriptionVi: "Tắc nghẽn cảng biển — ảnh hưởng xuất nhập khẩu",
    confidence: 0.85,
  },
  // 2. Port congestion — English
  {
    pattern: /port congestion/i,
    eventType: "port_congestion",
    severity: "high",
    defaultRoutes: ["Asia-Global"],
    descriptionVi: "Port congestion — ảnh hưởng xuất nhập khẩu",
    confidence: 0.85,
  },
  // 3. Dock strike — Vietnamese
  {
    pattern: /đình công.{0,30}cảng/i,
    eventType: "dock_strike",
    severity: "high",
    defaultRoutes: ["Asia-US", "Asia-EU"],
    descriptionVi: "Đình công tại cảng — gián đoạn bốc dỡ hàng hóa",
    confidence: 0.90,
  },
  // 4. Dock strike — English
  {
    pattern: /dock strike/i,
    eventType: "dock_strike",
    severity: "high",
    defaultRoutes: ["Asia-US", "Asia-EU"],
    descriptionVi: "Dock strike — gián đoạn bốc dỡ hàng hóa",
    confidence: 0.90,
  },
  // 5. Suez Canal — Vietnamese
  {
    pattern: /kênh suez/i,
    eventType: "canal_blockage",
    severity: "critical",
    defaultRoutes: ["Asia-EU", "Middle East-EU"],
    descriptionVi: "Kênh Suez bị ảnh hưởng — tuyến Asia-EU gián đoạn nghiêm trọng",
    confidence: 0.95,
  },
  // 6. Suez Canal — English
  {
    pattern: /suez canal/i,
    eventType: "canal_blockage",
    severity: "critical",
    defaultRoutes: ["Asia-EU", "Middle East-EU"],
    descriptionVi: "Suez Canal disruption — tuyến Asia-EU gián đoạn",
    confidence: 0.95,
  },
  // 7. Panama Canal — Vietnamese
  {
    pattern: /kênh panama/i,
    eventType: "canal_blockage",
    severity: "critical",
    defaultRoutes: ["Asia-US East Coast"],
    descriptionVi: "Kênh Panama bị ảnh hưởng — tuyến Asia-US East Coast gián đoạn",
    confidence: 0.95,
  },
  // 8. Panama Canal — English
  {
    pattern: /panama canal/i,
    eventType: "canal_blockage",
    severity: "critical",
    defaultRoutes: ["Asia-US East Coast"],
    descriptionVi: "Panama Canal disruption — tuyến Asia-US East Coast gián đoạn",
    confidence: 0.95,
  },
  // 9. Container shortage — Vietnamese
  {
    pattern: /thiếu container/i,
    eventType: "container_shortage",
    severity: "medium",
    defaultRoutes: ["Asia-US", "Asia-EU"],
    descriptionVi: "Thiếu container rỗng — ảnh hưởng xuất khẩu hàng hóa",
    confidence: 0.80,
  },
  // 10. Container shortage — English
  {
    pattern: /container shortage/i,
    eventType: "container_shortage",
    severity: "medium",
    defaultRoutes: ["Asia-US", "Asia-EU"],
    descriptionVi: "Container shortage — ảnh hưởng xuất khẩu hàng hóa",
    confidence: 0.80,
  },
  // 11. Force majeure
  {
    pattern: /force majeure/i,
    eventType: "force_majeure",
    severity: "high",
    defaultRoutes: ["Global"],
    descriptionVi: "Force majeure — gián đoạn hợp đồng vận tải",
    confidence: 0.85,
  },
  // 12a. Supply chain disruption — Vietnamese
  {
    pattern: /gián đoạn.{0,30}cung ứng/i,
    eventType: "route_disruption",
    severity: "high",
    defaultRoutes: ["Asia-Global"],
    descriptionVi: "Gián đoạn chuỗi cung ứng — ảnh hưởng toàn diện",
    confidence: 0.75,
  },
  // 12b. Supply chain disruption — English
  {
    pattern: /supply chain disruption/i,
    eventType: "route_disruption",
    severity: "high",
    defaultRoutes: ["Asia-Global"],
    descriptionVi: "Supply chain disruption — ảnh hưởng toàn diện",
    confidence: 0.75,
  },
];

// ---------------------------------------------------------------------------
// Stock impact mapping per event type
// ---------------------------------------------------------------------------

/**
 * Maps supply chain event types to stocks most likely to be impacted.
 * These are cross-checked against the provided watchlist.
 */
const EVENT_STOCK_IMPACT: Record<SupplyChainEventType, string[]> = {
  port_congestion: ["HPG", "GMD", "VNM", "GVR", "DGC", "PHP", "GMC"],
  dock_strike: ["HPG", "GMD", "VNM", "GVR", "DGC"],
  canal_blockage: ["HPG", "GMD", "VNM", "GVR", "DGC", "PHP"],
  container_shortage: ["VNM", "GVR", "DGC", "HPG"],
  force_majeure: ["GMD", "HPG", "VNM"],
  route_disruption: ["HPG", "GMD", "VNM", "GVR", "DGC"],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detects a supply chain disruption event from news text.
 *
 * Returns the FIRST matching pattern (highest priority match wins).
 * Canal blockage patterns are checked first due to critical severity.
 *
 * @param text           - News article title + content
 * @param watchlistCodes - Codes to filter stock impacts to
 * @returns SupplyChainEvent if a disruption pattern is detected, null otherwise
 */
export function detectSupplyChainEvent(
  text: string,
  watchlistCodes: string[],
): SupplyChainEvent | null {
  if (!text || text.trim().length === 0) return null;

  // Sort patterns: critical first (canal_blockage), then by confidence desc
  const sorted = [...SC_PATTERNS].sort((a, b) => {
    const severityOrder: Record<Severity, number> = {
      critical: 0, high: 1, medium: 2, low: 3,
    };
    const sDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sDiff !== 0) return sDiff;
    return b.confidence - a.confidence;
  });

  for (const sc of sorted) {
    if (!sc.pattern.test(text)) continue;

    // Found a match
    const eventType = sc.eventType;

    // Filter affected stocks to watchlist
    const allImpacted = EVENT_STOCK_IMPACT[eventType] ?? [];
    const watchlistSet = new Set(watchlistCodes);
    const affectedStocks = allImpacted.filter((code) => watchlistSet.has(code));

    return {
      eventType,
      severity: sc.severity,
      affectedRoutes: [...sc.defaultRoutes],
      affectedStocks,
      confidence: sc.confidence,
      description: sc.descriptionVi,
    };
  }

  return null;
}
