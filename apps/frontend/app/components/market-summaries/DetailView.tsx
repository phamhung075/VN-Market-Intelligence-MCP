/**
 * DETAIL view for /dashboard/market-summaries.
 * FACTORY-FRONTEND-split-market-summaries: extracted verbatim from the route file.
 */
import { Link } from "@remix-run/react";
import { PageHeader } from "~/components/PageHeader";
import { FreshnessBadge } from "~/components/FreshnessBadge";
import { useFreshnessRevalidator } from "~/lib/hooks/useFreshnessRevalidator";
import { formatDateRange, PERIOD_LABELS } from "~/domain/market-summaries/format";
import type { LoaderData } from "~/routes/dashboard.market-summaries";
import { DetailContent } from "~/components/market-summaries/DetailContent";

export function DetailView({
  data,
}: {
  data: Extract<LoaderData, { mode: "detail" }>;
}) {
  const { item, error, generatedAt } = data;
  useFreshnessRevalidator("daily");

  return (
    <div className="w-full space-y-6">
      {/* Back link */}
      <div>
        <Link
          to="/dashboard/market-summaries"
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          ← Quay lại
        </Link>
      </div>

      <PageHeader
        title={
          item
            ? `Tổng hợp ${PERIOD_LABELS[item.periodType] ?? item.periodType} — ${formatDateRange(item.periodStart, item.periodEnd)}`
            : "Chi tiết báo cáo"
        }
        subtitle={
          item
            ? `Tổng hợp vào: ${new Date(item.createdAt).toLocaleString("vi-VN")}`
            : undefined
        }
        actions={<FreshnessBadge dataAsof={generatedAt ?? null} slaTierKey="daily" />}
      />

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không thể tải chi tiết báo cáo — {error}
        </div>
      )}

      {/* Null item — not found */}
      {!error && item === null && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Không tìm thấy báo cáo
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Báo cáo này không tồn tại hoặc đã bị xóa. Vui lòng quay lại danh
            sách.
          </p>
        </div>
      )}

      {/* Full detail */}
      {item !== null && item !== undefined && <DetailContent item={item} />}
    </div>
  );
}
