/**
 * confidencePct — formats a 0-1 confidence float as a rounded percentage string.
 * Domain layer: zero imports from lib/api/, routes/, or components/.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function confidencePct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
