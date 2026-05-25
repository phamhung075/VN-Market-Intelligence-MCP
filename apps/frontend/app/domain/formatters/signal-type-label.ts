/**
 * formatSignalTypeLabel — pure formatter for signal type display labels.
 * Domain layer: zero imports from lib/api/, routes/, or components/.
 *
 * Maps internal signal type enum keys to compact display labels.
 * Unknown keys pass through unchanged.
 *
 * Extracted from dashboard.analysis.tsx signalTypeLabel (P1-B3).
 */

export function formatSignalTypeLabel(signalType: string): string {
  switch (signalType) {
    case "chain_catalyst":         return "cascade";
    case "urgent_news":            return "news";
    case "price_anomaly":          return "price";
    case "cross_validate":         return "validate";
    case "fundamental_validation": return "BCTC";
    case "price_confirmation":     return "confirm";
    case "verified_chain":         return "verified";
    case "signal_feedback":        return "feedback";
    default:                       return signalType;
  }
}
