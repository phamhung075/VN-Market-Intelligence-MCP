import type { KinhDichMarket } from "~/domain/market";
import { signalColor } from "~/domain/formatters/signal-color";
import { QueName } from "~/components/QueName";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { ConfidenceBar } from "~/components/analysis/ConfidenceBar";
import { Row } from "~/components/analysis/SectionShell";

/**
 * Market-wide Kinh Dịch reading — hexagram, trend, signal, confidence.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function KinhDichMarketPanel({ market }: { market: KinhDichMarket }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
      <div className="flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-6 py-4 shrink-0">
        <QueName
          hexagram={market.hexagram}
          name={market.name}
          className="text-sm font-semibold text-slate-300"
        />
      </div>
      <div className="flex-1 space-y-2 text-sm">
        <Row label="Xu hướng" value={<span className="font-medium text-slate-200">{market.trend}</span>} />
        <Row label="Tín hiệu" value={<span className={`font-semibold ${signalColor(market.signal)}`}>{market.signal}</span>} />
        <Row label="Độ tin cậy" value={<ConfidenceBar confidence={market.confidence} />} />
        <Row label="Thời gian" value={<ClientTimestamp iso={market.timestamp} />} />
      </div>
    </div>
  );
}
