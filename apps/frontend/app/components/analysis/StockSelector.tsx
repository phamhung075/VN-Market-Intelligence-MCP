import { Link } from "@remix-run/react";
import { WATCHLIST_STOCKS, groupBySector } from "~/domain/market";

/**
 * Compact row of clickable ticker badges for all 30 watchlist stocks.
 * Grouped by sector. Selected stock is highlighted in blue.
 * Clicking a badge navigates to ?stock=XXX.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function StockSelector({ selectedStock }: { selectedStock: string | null }) {
  const sectorGroups = groupBySector(WATCHLIST_STOCKS);
  const sectorNames = Object.keys(sectorGroups).sort();

  return (
    <div className="space-y-3">
      {sectorNames.map((sector) => {
        const stocks = sectorGroups[sector];
        return (
          <div key={sector} className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
            <span className="shrink-0 w-40 text-xs text-slate-500 pt-0.5 truncate" title={sector}>
              {sector}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {stocks.map((s) => {
                const isSelected = s.ticker === selectedStock;
                return (
                  <Link
                    key={s.ticker}
                    to={isSelected ? "." : `?stock=${s.ticker}`}
                    className={`rounded px-2 py-0.5 text-xs font-mono font-semibold transition-colors ${
                      isSelected
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                    }`}
                    title={`${s.company} — ${s.exchange}`}
                  >
                    {s.ticker}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
