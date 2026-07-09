/**
 * directionLabel — English direction label + colour class for AgentSignal.direction
 * (BULLISH/BEARISH/other). Distinct from the unrelated same-named helpers local to
 * dashboard.sector-cascade.tsx / dashboard.prediction-claims.tsx (different signature,
 * different domain — VN "up"/"down"/"neutral" labels, not this AgentSignal shape).
 * Domain layer: zero imports from lib/api/, routes/, or components/.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function directionLabel(direction: string): { text: string; cls: string } {
  const d = direction.toUpperCase();
  if (d === "BULLISH") return { text: "BULLISH↑", cls: "text-green-400" };
  if (d === "BEARISH") return { text: "BEARISH↓", cls: "text-red-400" };
  return { text: direction || "NEUTRAL", cls: "text-slate-400" };
}
