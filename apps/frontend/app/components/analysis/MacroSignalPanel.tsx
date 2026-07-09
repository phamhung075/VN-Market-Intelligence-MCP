import type { MacroSnapshot, MacroSignalEntry } from "~/domain/market";
import { indicatorLabel } from "~/domain/formatters/indicator-label";

/**
 * Macro signal cards grid — oil / gold / USD-VND and any other keyed macro signals.
 * Supports both legacy underscore-keyed and canonical Go SignalResult keys.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function MacroSignalPanel({ snapshot }: { snapshot: MacroSnapshot }) {
  const valueMap: Record<string, number | null> = {
    // canonical keyed-object keys
    oil: snapshot.oilUsd,
    gold: snapshot.goldUsd,
    usdvnd: snapshot.usdVnd,
    // legacy underscore-keyed names (backward-compat)
    oil_usd: snapshot.oilUsd,
    gold_usd: snapshot.goldUsd,
    usd_vnd: snapshot.usdVnd,
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {Object.entries(snapshot.signals).map(([key, entry]: [string, MacroSignalEntry]) => {
        const direction = entry.direction ?? entry.regime ?? entry.label ?? "";
        const impact = entry.impact ?? entry.tier ?? "LOW";
        const numericValue = entry.priceUSD ?? entry.rateVND ?? entry.score ?? valueMap[key];
        const isBullish = direction === "BULLISH";
        const isBearish = direction === "BEARISH";
        const dirColor = isBullish
          ? "text-green-400"
          : isBearish
            ? "text-red-400"
            : "text-slate-400";
        const impactClass =
          impact === "HIGH"
            ? "border-red-800"
            : impact === "MEDIUM"
              ? "border-yellow-800"
              : "border-slate-700";

        return (
          <div
            key={key}
            className={`rounded-lg border bg-slate-800 p-4 ${impactClass}`}
          >
            <p className="text-xs text-slate-500">{indicatorLabel(key)}</p>
            <p suppressHydrationWarning className="mt-1 text-xl font-bold text-slate-100">
              {numericValue != null
                ? Number(numericValue).toLocaleString("vi-VN")
                : "—"}
            </p>
            <div className={`mt-2 flex items-center gap-1 text-sm font-semibold ${dirColor}`}>
              {isBullish ? "↑" : isBearish ? "↓" : "—"}
              <span>{direction}</span>
              <span className="ml-auto text-xs font-normal text-slate-500">{impact}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
