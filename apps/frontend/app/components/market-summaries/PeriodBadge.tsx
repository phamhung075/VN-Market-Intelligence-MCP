/**
 * Period type badge — /dashboard/market-summaries.
 * FACTORY-FRONTEND-split-market-summaries: extracted verbatim from the route file.
 */
import { PERIOD_LABELS } from "~/domain/market-summaries/format";
import type { PeriodType } from "~/routes/dashboard.market-summaries";

export function PeriodBadge({ periodType }: { periodType: PeriodType }) {
  return (
    <span className="inline-block rounded bg-slate-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
      {PERIOD_LABELS[periodType] ?? periodType}
    </span>
  );
}
