import type { AccuracyDigestStats } from "~/domain/market";
import { deriveAccuracyDigestState, digestRateColor } from "~/lib/api/client";

/**
 * System-level accuracy digest card — 6 states, top-3/bottom-3 signal types
 * by accuracy rate. Non-fatal — degrades gracefully on null data or errors.
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis), pure move.
 */
export function AccuracyDigestCard({
  data,
}: {
  data: AccuracyDigestStats | null;
}) {
  const state = deriveAccuracyDigestState(data);

  if (state === "loading") {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="flex justify-between gap-4">
            <div className="h-5 w-24 bg-slate-800 animate-pulse rounded" />
            <div className="h-5 w-16 bg-slate-800 animate-pulse rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (state === "empty") {
    return (
      <p className="text-sm text-slate-400">
        No accuracy data yet — signal outcomes are still seeding.
      </p>
    );
  }

  if (state === "all-neutral") {
    return (
      <p className="text-sm text-slate-400">
        All resolved outcomes are neutral — no directional accuracy measurable yet. ({data!.neutralOnlyRows} neutral outcomes recorded)
      </p>
    );
  }

  if (state === "insufficient-sample") {
    return (
      <p className="text-sm text-slate-400">
        No signal types have ≥3 resolved samples yet. ({data!.totalResolved} resolved rows recorded — tracking in progress)
      </p>
    );
  }

  // Partial or normal state — render table
  const displayRows = data!.bySignalType;
  const topThree = displayRows.slice(0, 3);
  const bottomThree = displayRows.slice(-3).reverse();
  const uniqueRows = Array.from(
    new Map([...topThree, ...bottomThree].map((r) => [r.signal_type, r])).values(),
  );
  void uniqueRows; // used for dedup reference; columns rendered separately

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-4 text-xs">
        {/* Top-3 column */}
        <div>
          <p className="text-slate-500 font-semibold mb-2">Best</p>
          {topThree.map((row) => (
            <div
              key={row.signal_type}
              className="flex justify-between gap-2 py-1 border-b border-slate-700"
            >
              <span className="truncate">{row.signal_type}</span>
              <span className={`font-mono font-semibold ${digestRateColor(row.rate)}`}>
                {(row.rate * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
        {/* Bottom-3 column */}
        <div>
          <p className="text-slate-500 font-semibold mb-2">Worst</p>
          {bottomThree.map((row) => (
            <div
              key={row.signal_type}
              className="flex justify-between gap-2 py-1 border-b border-slate-700"
            >
              <span className="truncate">{row.signal_type}</span>
              <span className={`font-mono font-semibold ${digestRateColor(row.rate)}`}>
                {(row.rate * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer row */}
      <div className="mt-4 pt-2 border-t border-slate-700 text-xs text-slate-400">
        {data!.overallRate === null ? (
          <p>
            System: n/a{" "}
            <span className="text-slate-600">(need 10+ resolved)</span>
          </p>
        ) : (
          <p>
            System:{" "}
            <span className="font-semibold text-slate-200">
              {(data!.overallRate * 100).toFixed(1)}%
            </span>{" "}
            <span className="text-slate-600">
              ({data!.totalCorrect.toLocaleString("vi-VN")} /{" "}
              {data!.totalResolved.toLocaleString("vi-VN")} total)
            </span>{" "}
            · {data!.newStocksCount} stocks still seeding
          </p>
        )}
      </div>
    </div>
  );
}
