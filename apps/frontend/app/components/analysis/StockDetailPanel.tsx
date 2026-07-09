import { Link } from "@remix-run/react";
import type { MacroSnapshot, WatchlistStock } from "~/domain/market";
import type { WatchlistTileData } from "~/lib/api/client";
import type { StockDetail } from "~/routes/dashboard.analysis";
import { signalColor } from "~/domain/formatters/signal-color";
import { SectorPeersBar } from "~/components/analysis/SectorPeersBar";
import { AnalysisDecision } from "~/components/analysis/AnalysisDecision";
import { InfoSourcePanel } from "~/components/analysis/InfoSourcePanel";
import { MacroImpactPanel } from "~/components/analysis/MacroImpactPanel";
import { StockSignalsPanel } from "~/components/analysis/StockSignalsPanel";
import { StockDetailBottomGrid } from "~/components/analysis/StockDetailBottomGrid";

/**
 * Full analysis panel for the selected stock — header, sector peers,
 * decision, info sources, macro impact, agent signals, Kinh Dịch detail
 * + recent price table.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function StockDetailPanel({
  detail,
  stock,
  stockInfo,
  snapshot,
  watchlistTiles,
}: {
  detail: StockDetail;
  stock: string;
  stockInfo: WatchlistStock | null;
  snapshot: MacroSnapshot | null;
  watchlistTiles: Record<string, WatchlistTileData>;
}) {
  const { reading, prices, ta, signals, cascadeSignals } = detail;

  return (
    <div className="mt-6 rounded-lg border border-blue-800 bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-blue-800 bg-blue-950 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xl font-bold text-blue-300">{stock}</span>
          {stockInfo && (
            <span className="text-xs text-slate-400">{stockInfo.company}</span>
          )}
          <span className={`text-sm font-semibold ${signalColor(reading.signal)}`}>
            {reading.signal}
          </span>
          <span className="text-xs text-slate-500">{prices.length} phiên</span>
        </div>
        <Link to="." className="text-xs text-slate-400 hover:text-slate-200">
          ✕ đóng
        </Link>
      </div>

      {/* Sector peers bar — quick comparison with siblings */}
      <SectorPeersBar
        currentTicker={stock}
        sector={stockInfo?.sector ?? null}
        tiles={watchlistTiles}
      />

      {/* Decision panel — synthesized buy/sell/hold */}
      <AnalysisDecision ta={ta} reading={reading} prices={prices} />

      {/* Info source panel — contributing data sources */}
      <InfoSourcePanel ta={ta} reading={reading} prices={prices} snapshot={snapshot} />

      {/* Macro impact panel — cascade macro → sector → stock linkage */}
      <MacroImpactPanel cascadeSignals={cascadeSignals} stock={stock} />

      {/* Agent signals — why this stock has been flagged */}
      <StockSignalsPanel signals={signals} />

      {/* Bottom: Kinh Dịch + Price table side-by-side */}
      <StockDetailBottomGrid reading={reading} prices={prices} />
    </div>
  );
}
