import type { KinhDichReading, PricePoint } from "~/domain/market";
import { signalColor } from "~/domain/formatters/signal-color";
import { QueName } from "~/components/QueName";
import { ConfidenceBar } from "~/components/analysis/ConfidenceBar";
import { Row } from "~/components/analysis/SectionShell";
import { MiniPriceTable } from "~/components/analysis/MiniPriceTable";

/**
 * Bottom half of StockDetailPanel: Kinh Dịch reading detail (quẻ/xu hướng/
 * tín hiệu/độ tin cậy + action note/overall reading) side-by-side with the
 * recent price table.
 *
 * Extracted from dashboard.analysis.tsx StockDetailPanel() (FACTORY-FRONTEND-split-dashboard-analysis)
 * — pure move, no behavior change.
 */
export function StockDetailBottomGrid({
  reading,
  prices,
}: {
  reading: KinhDichReading;
  prices: PricePoint[];
}) {
  return (
    <div className="grid gap-0 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-700">
      {/* Kinh Dịch details */}
      <div className="p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Kinh Dịch
        </h3>
        <div className="space-y-2 text-sm">
          <Row
            label="Quẻ"
            value={
              <QueName
                hexagram={reading.hexagram}
                name={reading.name}
                className="text-slate-200"
              />
            }
          />
          <Row
            label="Xu hướng"
            value={<span className="text-slate-200">{reading.trend}</span>}
          />
          <Row
            label="Tín hiệu"
            value={
              <span className={`font-semibold ${signalColor(reading.signal)}`}>
                {reading.signal}
              </span>
            }
          />
          <Row label="Độ tin cậy" value={<ConfidenceBar confidence={reading.confidence} />} />
        </div>

        {reading.actionNote && (
          <div className="mt-3 rounded bg-slate-800 px-3 py-2 text-xs text-slate-300 leading-relaxed">
            {reading.actionNote}
          </div>
        )}

        {reading.overallReading && (
          <div className="mt-2 rounded bg-slate-800 px-3 py-2 text-xs text-slate-400 leading-relaxed">
            {reading.overallReading}
          </div>
        )}
      </div>

      {/* Recent price table */}
      <div className="p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Lịch sử giá — 7 phiên gần nhất
        </h3>
        <MiniPriceTable prices={prices} />
      </div>
    </div>
  );
}
