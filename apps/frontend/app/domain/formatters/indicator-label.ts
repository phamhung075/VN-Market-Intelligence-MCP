/**
 * indicatorLabel — Vietnamese display label for a macro indicator key.
 * Supports both legacy underscore-keyed names and canonical Go SignalResult keys.
 * Domain layer: zero imports from lib/api/, routes/, or components/.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function indicatorLabel(indicator: string): string {
  switch (indicator) {
    // legacy underscore-keyed names
    case "oil_usd": return "Dầu thô (WTI)";
    case "gold_usd": return "Vàng";
    case "usd_vnd": return "USD/VND";
    // canonical keyed-object keys from Go SignalResult (dtos.go)
    case "oil": return "Dầu thô (WTI)";
    case "gold": return "Vàng";
    case "usdvnd": return "USD/VND";
    case "investment-clock": return "Investment Clock";
    case "carry": return "Carry Trade";
    case "yield": return "Yield Spread";
    default: return indicator;
  }
}
