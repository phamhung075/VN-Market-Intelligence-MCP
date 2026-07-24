/**
 * Summary card in LIST view. /dashboard/market-summaries.
 * FACTORY-FRONTEND-split-market-summaries: extracted verbatim from the route file.
 */
import { Link } from "@remix-run/react";
import { formatDateRange } from "~/domain/market-summaries/format";
import type { SummaryListItem } from "~/routes/dashboard.market-summaries";
import { PeriodBadge } from "~/components/market-summaries/PeriodBadge";
import { CountChip } from "~/components/market-summaries/CountChip";

export function SummaryCard({ item }: { item: SummaryListItem }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-base font-bold text-slate-100">
            {formatDateRange(item.periodStart, item.periodEnd)}
          </span>
          <span className="text-xs text-slate-500">
            Tổng hợp:{" "}
            {new Date(item.createdAt).toLocaleString("vi-VN")}
          </span>
        </div>
        <PeriodBadge periodType={item.periodType} />
      </div>

      {/* Preview text */}
      {item.summaryPreview && (
        <p className="text-sm text-slate-400 leading-relaxed line-clamp-3 whitespace-pre-line">
          {item.summaryPreview}
        </p>
      )}

      {/* Chips row */}
      <div className="flex flex-wrap gap-2">
        <CountChip label="Tin tức" count={item.newsCount} />
        <CountChip
          label="Cảnh báo"
          count={item.alertCount}
          colorClass={
            item.alertCount > 0 ? "text-amber-400" : "text-slate-400"
          }
        />
        {item.reportCount > 0 && (
          <CountChip label="Báo cáo" count={item.reportCount} />
        )}
        <CountChip label="Sự kiện" count={item.keyEventCount} />
        <CountChip label="Cổ phiếu" count={item.stockCount} />
      </div>

      {/* Link to detail */}
      <div>
        <Link
          to={`/dashboard/market-summaries?id=${encodeURIComponent(item.id)}`}
          className="inline-block rounded bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-600 transition-colors"
        >
          Xem chi tiết →
        </Link>
      </div>
    </div>
  );
}
