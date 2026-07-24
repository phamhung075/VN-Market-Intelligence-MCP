/**
 * Ticker filter + scrollable table for stockPerformance and recommendations.
 * /dashboard/market-summaries. FACTORY-FRONTEND-split-market-summaries:
 * extracted verbatim from the route file.
 */
import { useState } from "react";
import { filterTickers } from "~/domain/market-summaries/format";

export function TickerFilteredTable<T extends { symbol: string }>({
  rows,
  renderHeader,
  renderRow,
  emptyLabel,
}: {
  rows: T[];
  renderHeader: () => React.ReactNode;
  renderRow: (row: T, i: number) => React.ReactNode;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = filterTickers(rows, query);

  return (
    <div className="space-y-3">
      {/* Search box */}
      <input
        type="text"
        placeholder="Tìm mã cổ phiếu (VD: VCB, FPT...)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full max-w-xs rounded border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-slate-400 focus:outline-none"
      />
      {/* Scrollable table */}
      <div className="max-h-96 overflow-y-auto rounded border border-slate-700">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-800 text-left text-xs text-slate-500 uppercase tracking-wide">
            <tr>{renderHeader()}</tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={99}
                  className="px-4 py-6 text-center text-sm text-slate-500"
                >
                  {query
                    ? `Không tìm thấy mã "${query.toUpperCase()}"`
                    : emptyLabel}
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => renderRow(row, i))
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && (
        <p className="text-xs text-slate-600">
          {filtered.length} / {rows.length} mã
        </p>
      )}
    </div>
  );
}
