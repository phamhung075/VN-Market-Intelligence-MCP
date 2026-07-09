import type { AnalysisBriefResult } from "~/routes/dashboard.analysis";
import { StalenessTag, BriefSection } from "~/components/analysis/BriefSection";

/**
 * AiDeepDivePanel — renders the AI analysis brief for a selected ticker.
 * Shows fundamentals / news / price / synthesis as labelled collapsible sections.
 * On 404 → "chưa có phân tích cho mã này" (no fabrication).
 * On network failure (null) → silent — panel not rendered.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function AiDeepDivePanel({
  result,
  ticker,
}: {
  result: AnalysisBriefResult | null;
  ticker: string;
}) {
  if (result === null) {
    // Network failure — degrade silently (fetch failed entirely).
    return null;
  }

  if (!result.ok) {
    if (result.errorCode === "not_found" || result.status === 404) {
      return (
        <div className="rounded border border-slate-700 bg-slate-800/50 px-4 py-4 text-sm text-slate-500 italic">
          Chưa có phân tích chuyên sâu cho mã {ticker}.
        </div>
      );
    }
    // Other upstream errors (400, 500, 502…) — show terse message.
    return (
      <div className="rounded border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
        Không thể tải phân tích AI cho {ticker} ({result.errorCode}).
      </div>
    );
  }

  const { brief } = result;

  return (
    <div className="space-y-3">
      {/* Header: ticker + staleness badge */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm font-bold text-blue-400">{brief.ticker}</span>
        <StalenessTag updatedAt={brief.updatedAt} />
      </div>

      {/* Collapsible sections — Vietnamese labels */}
      <BriefSection label="Tổng hợp" content={brief.synthesis} defaultOpen />
      <BriefSection label="Cơ bản" content={brief.fundamentals} />
      <BriefSection label="Tin tức" content={brief.news} />
      <BriefSection label="Giá" content={brief.price} />
    </div>
  );
}
