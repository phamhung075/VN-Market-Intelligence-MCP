import { WATCHLIST_STOCKS, groupBySector } from "~/domain/market";
import type { WatchlistTileData } from "~/lib/api/client";
import { WatchlistTile } from "~/components/analysis/WatchlistTile";

/**
 * All 30 watchlist stocks as tiles, grouped by sector — the default
 * (no ?stock=) view of /dashboard/analysis.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function WatchlistOverviewGrid({
  tiles,
}: {
  tiles: Record<string, WatchlistTileData>;
}) {
  const activeStocks = WATCHLIST_STOCKS.filter((s) => s.active);
  const sectorGroups = groupBySector(WATCHLIST_STOCKS);
  const sectorNames = Object.keys(sectorGroups).sort();

  const totalWithPrice = activeStocks.filter((s) => tiles[s.ticker] !== undefined).length;

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>{activeStocks.length} cổ phiếu</span>
        <span>·</span>
        <span>{sectorNames.length} nhóm ngành</span>
        {totalWithPrice > 0 && (
          <>
            <span>·</span>
            <span className="text-green-500">{totalWithPrice} có giá</span>
          </>
        )}
        {totalWithPrice === 0 && (
          <>
            <span>·</span>
            <span className="text-slate-600">Giá chưa khả dụng — click mã để xem chi tiết</span>
          </>
        )}
      </div>

      {/* Sector groups */}
      {sectorNames.map((sector) => {
        const stocks = sectorGroups[sector];
        return (
          <div key={sector}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {sector}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {stocks.map((s) => (
                <WatchlistTile key={s.ticker} stock={s} tile={tiles[s.ticker]} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
