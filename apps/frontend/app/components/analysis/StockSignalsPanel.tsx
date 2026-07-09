import type { AgentSignal } from "~/domain/market";
import { accuracyBadgeProps } from "~/lib/api/client";
import { directionLabel } from "~/domain/formatters/signal-direction-label";
import { confidenceLabel } from "~/domain/formatters/confidence-label";
import { formatSignalTypeLabel } from "~/domain/formatters/signal-type-label.js";
import { formatSignalTimestamp } from "~/lib/formatDate";
import { InfoCardExpand } from "~/components/InfoCardExpand";

/**
 * Render an accuracy badge inline.
 * - absent accuracy → dash
 * - sample_count < 3 → grey "New"
 * - rate >= 0.70 → green
 * - rate 0.40–0.69 → amber
 * - rate < 0.40 → red "Low"
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
function AccuracyBadge({ accuracy }: { accuracy: AgentSignal["accuracy"] }) {
  if (accuracy === undefined) {
    return <span className="text-slate-600">—</span>;
  }
  const { color, label } = accuracyBadgeProps(accuracy);
  const colorClass =
    color === "green"
      ? "bg-green-100 text-green-800"
      : color === "amber"
        ? "bg-yellow-100 text-yellow-800"
        : color === "red"
          ? "bg-red-100 text-red-800"
          : "bg-slate-700 text-slate-400"; // grey
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${colorClass}`}>
      {label}
    </span>
  );
}

/**
 * Last-10 agent signals table for the selected stock.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function StockSignalsPanel({ signals }: { signals: AgentSignal[] | null }) {
  return (
    <div className="border-b border-slate-700 px-4 py-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
        Signals (last 10)
      </h3>

      {signals === null ? (
        <p className="text-xs text-slate-500">Unavailable — signal endpoint did not respond.</p>
      ) : signals.length === 0 ? (
        <p className="text-xs text-slate-500">No signals recorded for this stock yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="py-1.5 text-left pr-3 font-medium">Time</th>
                <th className="py-1.5 text-left pr-3 font-medium">Source</th>
                <th className="py-1.5 text-left pr-3 font-medium">Direction</th>
                <th className="py-1.5 text-left pr-3 font-medium">Confidence</th>
                <th className="py-1.5 text-left pr-4 font-medium">Accuracy</th>
                <th className="py-1.5 text-left font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((sig) => {
                const dir = directionLabel(sig.direction);
                const conf = confidenceLabel(sig.confidence);
                return (
                  <tr key={sig.id} className="border-b border-slate-800 last:border-0">
                    <td suppressHydrationWarning className="py-1.5 pr-3 font-mono text-slate-400 whitespace-nowrap">
                      {formatSignalTimestamp(sig.createdAt)}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                        {formatSignalTypeLabel(sig.signalType)}
                      </span>
                    </td>
                    <td className={`py-1.5 pr-3 font-semibold ${dir.cls}`}>
                      {dir.text}
                    </td>
                    <td className={`py-1.5 pr-3 font-semibold ${conf.cls}`}>
                      {conf.text}
                    </td>
                    <td className="py-1.5 pr-4">
                      <AccuracyBadge accuracy={sig.accuracy} />
                    </td>
                    <td className="py-1.5 text-slate-300 max-w-xs align-top">
                      <InfoCardExpand
                        summary={
                          <span className="text-xs text-slate-300 line-clamp-2" title={sig.reasoning}>
                            {sig.reasoning || <span className="text-slate-600 italic">—</span>}
                          </span>
                        }
                        findingData={sig.findingData}
                        source={sig.source}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
