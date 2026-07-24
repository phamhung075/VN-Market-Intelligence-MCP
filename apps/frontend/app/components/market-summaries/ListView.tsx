/**
 * LIST view for /dashboard/market-summaries.
 * FACTORY-FRONTEND-split-market-summaries: extracted verbatim from the route file.
 */
import { PageHeader } from "~/components/PageHeader";
import { FreshnessBadge } from "~/components/FreshnessBadge";
import { useFreshnessRevalidator } from "~/lib/hooks/useFreshnessRevalidator";
import type { LoaderData } from "~/routes/dashboard.market-summaries";
import { PeriodPicker } from "~/components/market-summaries/PeriodPicker";
import { SummaryCard } from "~/components/market-summaries/SummaryCard";

export function ListView({
  data,
}: {
  data: Extract<LoaderData, { mode: "list" }>;
}) {
  const { generatedAt, periods, items, count, selectedPeriod, error } = data;
  useFreshnessRevalidator("daily");

  const isEmpty = !error && items.length === 0;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Lưu trữ Tổng hợp Thị trường"
        subtitle="Xem lại các bản tổng hợp thị trường hàng ngày, hàng tuần, hàng tháng và hơn thế nữa"
        actions={
          <span className="text-xs text-slate-500">
            {count > 0 && (
              <span className="mr-3 font-medium text-slate-300">
                {count} báo cáo
              </span>
            )}
            <FreshnessBadge dataAsof={generatedAt ?? null} slaTierKey="daily" />
          </span>
        }
      />

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không thể tải dữ liệu tổng hợp thị trường — {error}
        </div>
      )}

      {/* Period picker */}
      <PeriodPicker selected={selectedPeriod} periods={periods} />

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Không có dữ liệu tổng hợp cho kỳ này
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Thử chọn kỳ khác để xem thêm.
          </p>
        </div>
      )}

      {/* Report cards grid */}
      {items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <SummaryCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
