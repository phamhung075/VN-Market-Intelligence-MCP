/**
 * Recommendations table (DETAIL view). /dashboard/market-summaries.
 * FACTORY-FRONTEND-split-market-summaries: extracted verbatim from the route file
 * (was inline in DetailView's "Recommendations table" <section>).
 */
import { outlookColorClass, outlookLabel } from "~/domain/market-summaries/format";
import type { Recommendation } from "~/routes/dashboard.market-summaries";
import { TickerFilteredTable } from "~/components/market-summaries/TickerFilteredTable";

export function RecommendationsTable({ rows }: { rows: Recommendation[] }) {
  return (
    <TickerFilteredTable
      rows={rows}
      emptyLabel="Không có khuyến nghị."
      renderHeader={() => (
        <>
          <th className="px-3 py-2">Mã CK</th>
          <th className="px-3 py-2">Triển vọng</th>
          <th className="px-3 py-2 text-right">Độ tin cậy</th>
          <th className="px-3 py-2">Nhận định</th>
        </>
      )}
      renderRow={(row, i) => (
        <tr
          key={row.symbol}
          className={i % 2 === 0 ? "bg-slate-800/40" : "bg-slate-900/40"}
        >
          <td className="px-3 py-2 font-bold text-slate-200">
            {row.symbol}
          </td>
          <td className="px-3 py-2">
            <span
              className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${outlookColorClass(row.outlook)}`}
            >
              {outlookLabel(row.outlook)}
            </span>
          </td>
          <td className="px-3 py-2 text-right tabular-nums text-slate-300">
            {Math.round(row.confidence * 100)}%
          </td>
          <td className="px-3 py-2 text-xs text-slate-400 max-w-xs truncate">
            {row.reasoning}
          </td>
        </tr>
      )}
    />
  );
}
