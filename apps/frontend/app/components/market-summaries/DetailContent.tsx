/**
 * "Full detail" block of the DETAIL view for /dashboard/market-summaries
 * (item !== null branch — activity chips, narrative, key events, tables).
 * FACTORY-FRONTEND-split-market-summaries: extracted verbatim from the route
 * file's DetailView (split further to keep DetailView.tsx <=120L).
 */
import type { SummaryDetailItem } from "~/routes/dashboard.market-summaries";
import { CountChip } from "~/components/market-summaries/CountChip";
import { SectionHeader } from "~/components/market-summaries/SectionHeader";
import { KeyEventsSection } from "~/components/market-summaries/KeyEventsSection";
import { StockPerformanceTable } from "~/components/market-summaries/StockPerformanceTable";
import { RecommendationsTable } from "~/components/market-summaries/RecommendationsTable";

export function DetailContent({ item }: { item: SummaryDetailItem }) {
  return (
    <div className="space-y-8">
      {/* Activity chips */}
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
        <CountChip label="Sự kiện" count={item.keyEvents.length} />
        <CountChip label="Cổ phiếu" count={item.stockPerformance.length} />
      </div>

      {/* Summary text — full narrative */}
      <section>
        <SectionHeader>Nội dung tổng hợp</SectionHeader>
        <div className="rounded border border-slate-700 bg-slate-900 px-4 py-4">
          <p className="whitespace-pre-wrap text-sm text-slate-300 leading-relaxed">
            {item.summaryText}
          </p>
        </div>
      </section>

      {/* Key events timeline */}
      <section>
        <SectionHeader>
          Sự kiện nổi bật ({item.keyEvents.length})
        </SectionHeader>
        <KeyEventsSection events={item.keyEvents} />
      </section>

      {/* Stock performance table */}
      <section>
        <SectionHeader>
          Hiệu suất cổ phiếu ({item.stockPerformance.length})
        </SectionHeader>
        <StockPerformanceTable rows={item.stockPerformance} />
      </section>

      {/* Recommendations table */}
      <section>
        <SectionHeader>
          Khuyến nghị ({item.recommendations.length})
        </SectionHeader>
        <RecommendationsTable rows={item.recommendations} />
      </section>
    </div>
  );
}
