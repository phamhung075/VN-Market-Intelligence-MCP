import type { KinhDichReading, MacroSnapshot, PricePoint, TASnapshot } from "~/domain/market";
import { buildInfoSourceRows } from "~/components/analysis/buildInfoSourceRows";

/**
 * "Nguồn dữ liệu" table — contributing data sources (price / TA / Kinh Dịch / macro)
 * for the selected stock's decision.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function InfoSourcePanel({
  ta,
  reading,
  prices,
  snapshot,
}: {
  ta: TASnapshot | null;
  reading: KinhDichReading;
  prices: PricePoint[];
  snapshot: MacroSnapshot | null;
}) {
  const rows = buildInfoSourceRows(ta, reading, prices, snapshot);

  return (
    <div className="border-b border-slate-700 px-4 py-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
        Nguồn dữ liệu
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-xs text-slate-400">
              <th className="py-1.5 text-left pr-4 font-medium">Nguồn</th>
              <th className="py-1.5 text-left pr-4 font-medium">Chỉ số</th>
              <th className="py-1.5 text-left font-medium">Giá trị</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-800 last:border-0">
                <td className="py-1.5 pr-4 text-xs text-slate-500">{row.source}</td>
                <td className="py-1.5 pr-4 text-xs text-slate-400">{row.indicator}</td>
                <td className="py-1.5 text-xs">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
