import type { TASnapshot, KinhDichReading, PricePoint } from "~/domain/market";
import { computeDecision, type DecisionResult } from "~/domain/analysis/decision";

/**
 * Decision panel — synthesized buy/sell/hold from computeDecision (TA/RSI/KD/price).
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function AnalysisDecision({
  ta,
  reading,
  prices,
}: {
  ta: TASnapshot | null;
  reading: KinhDichReading;
  prices: PricePoint[];
}) {
  const decision: DecisionResult = computeDecision(ta, reading, prices);

  return (
    <div className={`border-b border-slate-700 px-4 py-4 ${decision.bgColor}`}>
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Quyết định
          </p>
          <span className={`text-2xl font-bold ${decision.textColor}`}>
            {decision.label}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {decision.reasons.map((r, i) => (
            <span
              key={i}
              className="rounded bg-slate-800/60 px-2 py-0.5 text-xs text-slate-300"
            >
              {r}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
