import { Link } from "@remix-run/react";
import { WATCHLIST_STOCKS } from "~/domain/market";
import type { WatchlistTileData } from "~/lib/api/client";
import { formatDirectionArrow } from "~/domain/formatters/direction-arrow.js";
import { formatChangePct } from "~/domain/formatters/change-pct.js";

/**
 * Quick comparison strip: siblings in the same sector as the selected stock.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function SectorPeersBar({
  currentTicker,
  sector,
  tiles,
}: {
  currentTicker: string;
  sector: string | null;
  tiles: Record<string, WatchlistTileData>;
}) {
  if (!sector) return null;

  const peers = WATCHLIST_STOCKS.filter(
    (s) => s.active && s.sector === sector && s.ticker !== currentTicker,
  );

  if (peers.length === 0) return null;

  return (
    <div className="border-b border-slate-700 px-4 py-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Cùng ngành — {sector}
      </h3>
      <div className="flex flex-wrap gap-2">
        {peers.map((peer) => {
          const tile = tiles[peer.ticker];
          const arrow = tile ? formatDirectionArrow(tile.direction) : { symbol: "—", cls: "text-slate-600" };
          const peerChangePct = tile ? formatChangePct(tile.changePct) : null;
          return (
            <Link
              key={peer.ticker}
              to={`?stock=${peer.ticker}`}
              className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-2 py-1 hover:border-slate-500 transition-colors"
            >
              <span className="font-mono text-xs font-semibold text-blue-400">
                {peer.ticker}
              </span>
              {tile ? (
                <span className={`text-xs font-semibold ${peerChangePct!.cls}`}>
                  {arrow.symbol} {peerChangePct!.formatted}
                </span>
              ) : (
                <span className="text-xs text-slate-600">—</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
