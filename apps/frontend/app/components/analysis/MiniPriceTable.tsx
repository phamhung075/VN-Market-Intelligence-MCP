import type { PricePoint } from "~/domain/market";

/**
 * Last-7-session price table (Ngày/Đóng/Mở/Cao/Thấp/Khối lượng), shown
 * alongside the Kinh Dịch detail block in the stock detail panel.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function MiniPriceTable({ prices }: { prices: PricePoint[] }) {
  const recent = prices.slice(-7).reverse();
  if (recent.length === 0) return <p className="text-sm text-slate-500">Không có dữ liệu giá.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400">
            <th className="py-1.5 text-left pr-3">Ngày</th>
            <th className="py-1.5 text-right pr-3">Đóng cửa</th>
            <th className="py-1.5 text-right pr-3">Mở cửa</th>
            <th className="py-1.5 text-right pr-3">Cao</th>
            <th className="py-1.5 text-right pr-3">Thấp</th>
            <th className="py-1.5 text-right">Khối lượng</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((p, i) => {
            const delta =
              p.open != null && p.open !== 0
                ? ((p.close - p.open) / p.open) * 100
                : null;
            return (
              <tr key={i} className="border-b border-slate-800 last:border-0">
                <td className="py-1.5 font-mono text-slate-400 pr-3">{p.date}</td>
                <td suppressHydrationWarning className="py-1.5 text-right font-semibold text-slate-100 pr-3">
                  {p.close.toLocaleString("vi-VN")}
                  {delta != null && (
                    <span
                      className={`ml-1 text-xs ${
                        delta > 0
                          ? "text-green-400"
                          : delta < 0
                            ? "text-red-400"
                            : "text-slate-500"
                      }`}
                    >
                      {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                    </span>
                  )}
                </td>
                <td suppressHydrationWarning className="py-1.5 text-right text-slate-400 pr-3">
                  {p.open != null ? p.open.toLocaleString("vi-VN") : "—"}
                </td>
                <td suppressHydrationWarning className="py-1.5 text-right text-green-400 pr-3">
                  {p.high != null ? p.high.toLocaleString("vi-VN") : "—"}
                </td>
                <td suppressHydrationWarning className="py-1.5 text-right text-red-400 pr-3">
                  {p.low != null ? p.low.toLocaleString("vi-VN") : "—"}
                </td>
                <td suppressHydrationWarning className="py-1.5 text-right text-slate-500">
                  {p.volume != null ? p.volume.toLocaleString("vi-VN") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
