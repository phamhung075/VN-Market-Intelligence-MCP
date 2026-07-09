import { Link, Form } from "@remix-run/react";
import type { KinhDichReading } from "~/domain/market";
import { signalColor } from "~/domain/formatters/signal-color";
import { QueName } from "~/components/QueName";
import { ConfidenceBar } from "~/components/analysis/ConfidenceBar";

/**
 * KD overview table for the sample-ticker cross-sector list.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function StockTable({
  readings,
  selectedStock,
}: {
  readings: KinhDichReading[];
  selectedStock: string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-800">
            <th className="px-3 py-2 text-left font-semibold text-slate-300">Mã</th>
            <th className="px-3 py-2 text-center font-semibold text-slate-300">Quẻ</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-300">Xu hướng</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-300">Tín hiệu</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-300">Tin cậy</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {readings.map((r, idx) => {
            const isSelected = r.stock === selectedStock;
            return (
              <tr
                key={r.stock}
                className={`border-b border-slate-700 last:border-0 transition-colors ${
                  isSelected
                    ? "bg-blue-950 border-blue-800"
                    : idx % 2 === 0
                      ? "bg-slate-900 hover:bg-slate-800"
                      : "bg-slate-800 hover:bg-slate-750"
                }`}
              >
                <td className="px-3 py-2 font-mono font-semibold text-blue-400">
                  {r.stock}
                </td>
                <td className="px-3 py-2 text-center">
                  <QueName
                    hexagram={r.hexagram}
                    name={r.name}
                    className="text-xs text-slate-300"
                  />
                </td>
                <td className="px-3 py-2 text-slate-300">{r.trend}</td>
                <td className={`px-3 py-2 font-medium ${signalColor(r.signal)}`}>
                  {r.signal}
                </td>
                <td className="px-3 py-2 text-right">
                  <ConfidenceBar confidence={r.confidence} />
                </td>
                <td className="px-3 py-2 text-right">
                  {isSelected ? (
                    <Link
                      to="."
                      className="text-xs text-slate-500 hover:text-slate-300"
                    >
                      ✕ đóng
                    </Link>
                  ) : (
                    <Link
                      to={`?stock=${r.stock}`}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Chi tiết →
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Free-text ticker search form — submits ?stock= via GET.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function StockSearchForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <Form method="get" className="flex items-center gap-2">
      <input
        name="stock"
        type="text"
        defaultValue={defaultValue ?? ""}
        placeholder="Nhập mã cổ phiếu (VD: VNM)"
        className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none w-52"
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="submit"
        className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
      >
        Phân tích
      </button>
    </Form>
  );
}
