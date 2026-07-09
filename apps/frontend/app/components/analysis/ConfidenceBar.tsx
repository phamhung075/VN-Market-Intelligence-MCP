/**
 * ConfidenceBar — small horizontal confidence meter (0-1 float in, coloured bar + % out).
 * green >=80%, yellow >=50%, red below.
 *
 * Extracted from dashboard.analysis.tsx confidenceBar() (FACTORY-FRONTEND-split-dashboard-analysis)
 * — pure move, no behavior change.
 */
export function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-slate-700">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-400">{pct}%</span>
    </div>
  );
}
