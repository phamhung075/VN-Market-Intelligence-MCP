/**
 * Stock performance table (DETAIL view). /dashboard/market-summaries.
 * FACTORY-FRONTEND-split-market-summaries: extracted verbatim from the route file
 * (was inline in DetailView's "Stock performance table" <section>).
 */
import {
  changePctColorClass,
  directionArrow,
  directionArrowColorClass,
  formatChangePct,
} from "~/domain/market-summaries/format";
import type { StockPerf } from "~/routes/dashboard.market-summaries";
import { TickerFilteredTable } from "~/components/market-summaries/TickerFilteredTable";

export function StockPerformanceTable({ rows }: { rows: StockPerf[] }) {
  return (
    <TickerFilteredTable
      rows={rows}
      emptyLabel="Không có dữ liệu cổ phiếu."
      renderHeader={() => (
        <>
          <th className="px-3 py-2">Mã CK</th>
          <th className="px-3 py-2 text-right">Giá đầu kỳ</th>
          <th className="px-3 py-2 text-right">Giá cuối kỳ</th>
          <th className="px-3 py-2 text-right">Thay đổi</th>
          <th className="px-3 py-2 text-right">Cảnh báo</th>
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
          <td className="px-3 py-2 text-right tabular-nums text-slate-300">
            {row.firstPrice.toLocaleString("vi-VN")}
          </td>
          <td className="px-3 py-2 text-right tabular-nums text-slate-300">
            {row.lastPrice.toLocaleString("vi-VN")}
          </td>
          <td
            className={`px-3 py-2 text-right tabular-nums font-bold ${changePctColorClass(row.changePct)}`}
          >
            {row.direction && (
              <span
                className={`mr-0.5 ${directionArrowColorClass(row.direction)}`}
                aria-label={
                  row.direction === "up"
                    ? "Tăng"
                    : row.direction === "down"
                    ? "Giảm"
                    : "Đi ngang"
                }
              >
                {directionArrow(row.direction)}
              </span>
            )}
            {formatChangePct(row.changePct)}
          </td>
          <td className="px-3 py-2 text-right tabular-nums text-slate-400">
            {row.alertCount > 0 ? (
              <span className="text-amber-400 font-medium">
                {row.alertCount}
              </span>
            ) : (
              row.alertCount
            )}
          </td>
        </tr>
      )}
    />
  );
}
