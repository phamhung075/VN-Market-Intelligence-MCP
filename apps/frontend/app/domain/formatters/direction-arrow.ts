/**
 * formatDirectionArrow — pure formatter for price/signal direction display.
 * Domain layer: zero imports from lib/api/, routes/, or components/.
 *
 * Extracted from dashboard.analysis.tsx (P1-B1).
 */

export interface DirectionDisplay {
  symbol: string;
  cls: string;
}

/**
 * Format a direction string into a display symbol + Tailwind color class.
 * "up"   → { symbol: "↑", cls: "text-green-400" }
 * "down" → { symbol: "↓", cls: "text-red-400" }
 * other  → { symbol: "—", cls: "text-slate-500" }
 */
export function formatDirectionArrow(
  direction: "up" | "down" | "flat" | string
): DirectionDisplay {
  if (direction === "up") return { symbol: "↑", cls: "text-green-400" };
  if (direction === "down") return { symbol: "↓", cls: "text-red-400" };
  return { symbol: "—", cls: "text-slate-500" };
}
