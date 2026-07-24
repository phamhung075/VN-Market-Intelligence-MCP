/**
 * Pure formatter/filter helpers for /dashboard/market-summaries.
 * Domain layer: zero imports from lib/api/, routes/, or components/.
 *
 * FACTORY-FRONTEND-split-market-summaries: relocated verbatim (byte-identical logic)
 * from apps/frontend/app/routes/dashboard.market-summaries.tsx.
 *
 * ⚠️ formatChangePct / changePctColorClass / directionArrow / directionArrowColorClass
 * deliberately DO NOT reuse the canonical app/domain/formatters/change-pct.ts or
 * direction-arrow.ts. Those canonical formatters return OBJECTS ({formatted, symbol, cls})
 * with a different color family ("text-green-400") and always emit a direction symbol.
 * This route's original helpers return BARE STRINGS with a different color family
 * ("text-emerald-400") and the symbol is a separate opt-in call (directionArrow()).
 * Reusing the canonical versions here would change the rendered output — kept as
 * independent, verbatim exports instead. See DJ-GATE-1 entry for FACTORY-FRONTEND-
 * split-market-summaries for the full rationale.
 */

import type { PeriodType } from "~/routes/dashboard.market-summaries";

// ---------------------------------------------------------------------------
// PERIOD_LABELS — exported for tests
// ---------------------------------------------------------------------------

export const PERIOD_LABELS: Record<PeriodType, string> = {
  daily: "Hàng ngày",
  weekly: "Hàng tuần",
  monthly: "Hàng tháng",
  quarterly: "Hàng quý",
  yearly: "Hàng năm",
};

/**
 * Format a date range string for display.
 * Same start and end → show just one date.
 * Different → show "start → end".
 */
export function formatDateRange(start: string, end: string): string {
  if (!start) return end ?? "";
  if (!end || start === end) return start;
  return `${start} → ${end}`;
}

/**
 * Format changePct with sign and one decimal place.
 * e.g. 0.33 → "+0.3%", -1.5 → "-1.5%", 0 → "0.0%"
 */
export function formatChangePct(pct: number): string {
  const fixed = pct.toFixed(1);
  if (pct > 0) return `+${fixed}%`;
  return `${fixed}%`;
}

/**
 * Map changePct to Tailwind text color class.
 * Positive → green, negative → red, zero → slate.
 */
export function changePctColorClass(pct: number): string {
  if (pct > 0) return "text-emerald-400";
  if (pct < 0) return "text-red-400";
  return "text-slate-400";
}

/**
 * Map stockPerformance direction field to Unicode arrow glyph.
 * "up" → ↑, "down" → ↓, "flat" → —, undefined/unknown → "" (no arrow).
 * NFR-C-4 (REAUDIT-FE-003): direction field supplied by DEV-REAUDIT-4.
 */
export function directionArrow(direction: "up" | "down" | "flat" | undefined): string {
  if (direction === "up") return "↑";
  if (direction === "down") return "↓";
  if (direction === "flat") return "—";
  return "";
}

/**
 * Map stockPerformance direction field to Tailwind text color class.
 * Mirrors changePctColorClass color family: up=emerald, down=red, flat=slate.
 * undefined/unknown → "" (no class — backward compat).
 * NFR-C-4 (REAUDIT-FE-003): direction field supplied by DEV-REAUDIT-4.
 */
export function directionArrowColorClass(direction: "up" | "down" | "flat" | undefined): string {
  if (direction === "up") return "text-emerald-400";
  if (direction === "down") return "text-red-400";
  if (direction === "flat") return "text-slate-400";
  return "";
}

/**
 * Map recommendation outlook to Vietnamese label.
 */
export function outlookLabel(
  outlook: "bullish" | "bearish" | "neutral"
): string {
  switch (outlook) {
    case "bullish":
      return "Tích cực";
    case "bearish":
      return "Tiêu cực";
    case "neutral":
    default:
      return "Trung lập";
  }
}

/**
 * Map recommendation outlook to Tailwind badge class.
 */
export function outlookColorClass(
  outlook: "bullish" | "bearish" | "neutral"
): string {
  switch (outlook) {
    case "bullish":
      return "bg-emerald-900 text-emerald-300 border border-emerald-700";
    case "bearish":
      return "bg-red-900 text-red-300 border border-red-700";
    case "neutral":
    default:
      return "bg-slate-700 text-slate-300 border border-slate-600";
  }
}

/**
 * Filter a list of stocks by query string (case-insensitive symbol match).
 * Empty query → returns original list.
 */
export function filterTickers<T extends { symbol: string }>(
  stocks: T[],
  query: string
): T[] {
  if (!query.trim()) return stocks;
  const q = query.trim().toUpperCase();
  return stocks.filter((s) => s.symbol.toUpperCase().includes(q));
}
