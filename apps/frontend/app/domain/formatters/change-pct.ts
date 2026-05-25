/**
 * formatChangePct — pure formatter for price change percentage display.
 * Domain layer: zero imports from lib/api/, routes/, or components/.
 *
 * Market-data UI policy (BINDING):
 * ALWAYS show direction symbol + delta %.
 * NEVER return a bare number. Even 0.0% must show the "—" symbol.
 *
 * Extracted from dashboard.analysis.tsx WatchlistTile inline logic (P1-B2).
 */

export interface ChangePctDisplay {
  formatted: string; // e.g. "+2.5%" or "-1.3%" or "0.0%"
  symbol: string;    // "↑" | "↓" | "—"
  cls: string;       // tailwind color class
}

/**
 * Format a change percentage for display.
 * Market-data UI policy: ALWAYS show direction symbol + delta %.
 * NEVER return a bare number. Even 0.0% must show the "—" symbol.
 */
export function formatChangePct(changePct: number): ChangePctDisplay {
  if (changePct > 0) {
    return {
      formatted: `+${changePct.toFixed(1)}%`,
      symbol: "↑",
      cls: "text-green-400",
    };
  }
  if (changePct < 0) {
    return {
      formatted: `${changePct.toFixed(1)}%`,
      symbol: "↓",
      cls: "text-red-400",
    };
  }
  // Zero or NaN treated as neutral
  return {
    formatted: `${(0).toFixed(1)}%`,
    symbol: "—",
    cls: "text-slate-400",
  };
}
