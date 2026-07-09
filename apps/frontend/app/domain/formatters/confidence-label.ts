/**
 * confidenceLabel — colour-coded confidence display for AgentSignal.confidence.
 * null = genuine absence — renders "—" (never fabricates 0% or 50%).
 * Domain layer: zero imports from lib/api/, routes/, or components/.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function confidenceLabel(confidence: number | null): { text: string; cls: string } {
  // null = genuine absence — render "—" (not 0%, not 50%)
  const hasConfidence =
    confidence !== null &&
    typeof confidence === "number" &&
    !Number.isNaN(confidence);
  if (!hasConfidence) return { text: "—", cls: "text-slate-600" };
  const pct = Math.round(confidence * 100);
  const text = `${pct}%`;
  if (pct >= 70) return { text, cls: "text-green-400" };
  if (pct >= 40) return { text, cls: "text-amber-400" };
  return { text, cls: "text-slate-400" };
}
