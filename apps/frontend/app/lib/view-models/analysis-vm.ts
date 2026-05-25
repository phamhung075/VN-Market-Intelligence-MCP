/**
 * analysis-vm.ts — view model for the analysis dashboard watchlist tile.
 * Application layer: pure data → display model transformation.
 *
 * Imports ONLY from ~/domain/ and ~/domain/formatters/.
 * Zero imports from ~/lib/api/ (no fetch/IO).
 * Zero calls to Date.now() or new Date() — all inputs come from loader data.
 *
 * This is the frontend's G2 analog: a module that composes formatters
 * to build a display model from loader-provided data.
 *
 * Created in P1-C.
 */

import { formatChangePct } from "~/domain/formatters/change-pct.js";
import { formatDirectionArrow } from "~/domain/formatters/direction-arrow.js";

export interface WatchlistSummaryVM {
  ticker: string;
  hasPrice: boolean;
  priceDisplay: string;
  changePctDisplay: string; // always direction + %, never bare (market-data policy)
  directionSymbol: string;
  directionCls: string;
}

/**
 * Build view model for a single watchlist tile.
 * Pure: no fetch, no Date.now() — inputs come from loader data.
 * Composes formatChangePct + formatDirectionArrow formatters.
 */
export function buildWatchlistTileVM(
  ticker: string,
  close: number | undefined,
  changePct: number | undefined,
  direction: "up" | "down" | "flat" | undefined
): WatchlistSummaryVM {
  const hasPrice = close !== undefined && changePct !== undefined;

  if (!hasPrice) {
    return {
      ticker,
      hasPrice: false,
      priceDisplay: "Không có giá",
      changePctDisplay: "—",
      directionSymbol: "—",
      directionCls: "text-slate-600",
    };
  }

  const pctDisplay = formatChangePct(changePct!);
  const arrowDisplay = formatDirectionArrow(direction ?? "flat");

  return {
    ticker,
    hasPrice: true,
    priceDisplay: close!.toLocaleString("vi-VN"),
    changePctDisplay: `${pctDisplay.symbol} ${pctDisplay.formatted}`,
    directionSymbol: arrowDisplay.symbol,
    directionCls: arrowDisplay.cls,
  };
}
