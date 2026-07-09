/**
 * signalColor — Tailwind text-color class for a Kinh Dịch / market signal string.
 * Domain layer: zero imports from lib/api/, routes/, or components/.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function signalColor(signal: string): string {
  const s = signal.toUpperCase();
  if (s.includes("MUA") || s.includes("BULLISH")) return "text-green-400";
  if (s.includes("BÁN") || s.includes("BEARISH")) return "text-red-400";
  if (s.includes("THẬN TRỌNG") || s.includes("THAN TRONG")) return "text-yellow-400";
  return "text-slate-300";
}
