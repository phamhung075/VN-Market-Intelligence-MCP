import type { AgentSignal } from "~/domain/market";
import { InfoCardExpand } from "~/components/InfoCardExpand";
import { formatDateOnlyVi } from "~/lib/formatDate";

/**
 * Cascade macro → stock linkage panel — shows the macro events that
 * propagated an impact signal onto this stock in the last 24h.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function MacroImpactPanel({
  cascadeSignals,
  stock,
}: {
  cascadeSignals: AgentSignal[];
  stock: string;
}) {
  return (
    <div className="border-b border-slate-700 px-4 py-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
        Tác động Macro — {stock}
      </h3>

      {cascadeSignals.length === 0 ? (
        <p className="text-xs text-slate-500">
          Không có cascade macro cho {stock} trong 24h qua.
        </p>
      ) : (
        <div className="space-y-2">
          {cascadeSignals.map((sig) => {
            const isBullish = sig.direction === "BULLISH";
            const isBearish = sig.direction === "BEARISH";
            const dirCls = isBullish
              ? "text-green-400"
              : isBearish
                ? "text-red-400"
                : "text-slate-400";
            const borderCls = isBullish
              ? "border-green-800"
              : isBearish
                ? "border-red-800"
                : "border-slate-700";

            const summary = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-slate-300 leading-relaxed flex-1">
                    {sig.reasoning || "Cascade macro event"}
                  </p>
                  <span className={`shrink-0 text-xs font-semibold ${dirCls}`}>
                    {isBullish ? "↑ BULLISH" : isBearish ? "↓ BEARISH" : sig.direction}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                  <span>
                    {sig.confidence !== null && typeof sig.confidence === "number" && !Number.isNaN(sig.confidence)
                      ? `${Math.round(sig.confidence * 100)}% tin cậy`
                      : "— tin cậy"}
                  </span>
                  <span suppressHydrationWarning>
                    {formatDateOnlyVi(sig.createdAt)}
                  </span>
                </div>
              </>
            );

            return (
              <InfoCardExpand
                key={sig.id}
                summary={summary}
                findingData={sig.findingData}
                source={sig.source}
                className={`rounded border bg-slate-800/60 px-3 py-2 ${borderCls}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
