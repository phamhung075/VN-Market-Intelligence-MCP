/**
 * Period picker — SSR NavLinks that change ?period=. /dashboard/market-summaries.
 * FACTORY-FRONTEND-split-market-summaries: extracted verbatim from the route file.
 */
import { NavLink } from "@remix-run/react";
import { PERIOD_LABELS } from "~/domain/market-summaries/format";
import type { PeriodCounts, PeriodType } from "~/routes/dashboard.market-summaries";

export function PeriodPicker({
  selected,
  periods,
}: {
  selected: PeriodType;
  periods: PeriodCounts;
}) {
  const items: PeriodType[] = [
    "daily",
    "weekly",
    "monthly",
    "quarterly",
    "yearly",
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((p) => {
        const isActive = selected === p;
        const cnt = periods[p];
        return (
          <NavLink
            key={p}
            to={`/dashboard/market-summaries?period=${p}`}
            reloadDocument
            className={[
              "rounded px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-slate-700 text-slate-100"
                : "text-slate-400 hover:bg-slate-700 hover:text-slate-200",
            ].join(" ")}
          >
            {PERIOD_LABELS[p]} ({cnt})
          </NavLink>
        );
      })}
    </div>
  );
}
