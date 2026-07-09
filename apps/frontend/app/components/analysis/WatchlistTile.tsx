import { Link } from "@remix-run/react";
import type { KinhDichReading, WatchlistStock } from "~/domain/market";
import type { WatchlistTileData } from "~/lib/api/client";
import { formatChangePct } from "~/domain/formatters/change-pct.js";
import { QueName } from "~/components/QueName";

/**
 * KD signal pill for a watchlist tile — TASK-17.
 * Shows signal string (from API) with colour-coding.
 * Returns null (no render) when reading is absent or degraded.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
function KdTilePill({ reading }: { reading: KinhDichReading | null | undefined }) {
  if (!reading) return null;
  const sig = reading.signal.toUpperCase();
  const colorCls = sig.includes("MUA") || sig.includes("BULLISH")
    ? "border-green-700 bg-green-950 text-green-300"
    : sig.includes("BÁN") || sig.includes("BAN") || sig.includes("BEARISH")
      ? "border-red-700 bg-red-950 text-red-300"
      : sig.includes("THẬN TRỌNG") || sig.includes("THAN TRONG")
        ? "border-yellow-700 bg-yellow-950 text-yellow-300"
        : "border-slate-600 bg-slate-800 text-slate-400";
  const pct = Math.round(reading.confidence * 100);
  const barColor = pct >= 60 ? "bg-green-500" : pct >= 35 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="mt-2 space-y-1">
      {/* Quẻ name + signal pill */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <QueName
          hexagram={reading.hexagram}
          name={reading.name}
          className="text-[10px] text-slate-400"
        />
        <span className={`inline-flex items-center rounded border px-1 py-0.5 text-[10px] font-semibold ${colorCls}`}>
          {reading.signal}
        </span>
      </div>
      {/* Confidence bar */}
      <div className="flex items-center gap-1.5">
        <div className="h-1 w-12 rounded-full bg-slate-700">
          <div className={`h-1 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-slate-500">{pct}%</span>
      </div>
    </div>
  );
}

/**
 * Single tile card: ticker + company + last price + direction + signal count + KD reading.
 * Clicking navigates to ?stock=XXX to load full detail.
 * KD pill is non-fatal — renders nothing when reading is absent (TASK-17).
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function WatchlistTile({
  stock,
  tile,
}: {
  stock: WatchlistStock;
  tile: WatchlistTileData | undefined;
}) {
  const changePctDisplay = tile ? formatChangePct(tile.changePct) : null;
  const hasPrice = tile !== undefined;

  return (
    <Link
      to={`?stock=${stock.ticker}`}
      className="group block rounded-lg border border-slate-700 bg-slate-800/60 p-3 hover:border-blue-600 hover:bg-slate-800 transition-colors"
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-bold text-blue-400 group-hover:text-blue-300">
          {stock.ticker}
        </span>
        <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-400">
          {stock.exchange}
        </span>
      </div>

      {/* Company name */}
      <p className="mt-0.5 text-xs text-slate-500 truncate" title={stock.company}>
        {stock.company}
      </p>

      {/* Price + direction */}
      <div className="mt-2 flex items-baseline justify-between">
        {hasPrice ? (
          <>
            <span suppressHydrationWarning className="text-sm font-semibold text-slate-100">
              {tile.close.toLocaleString("vi-VN")}
            </span>
            <span className={`text-xs font-semibold ${changePctDisplay!.cls}`}>
              {changePctDisplay!.symbol}{" "}
              {changePctDisplay!.formatted}
            </span>
          </>
        ) : (
          <span className="text-xs text-slate-600">Không có giá</span>
        )}
      </div>

      {/* Signal count badge */}
      {hasPrice && tile.signalCount > 0 && (
        <div className="mt-1.5 flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
          <span className="text-xs text-slate-400">
            {tile.signalCount} signal{tile.signalCount > 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* KD reading pill — non-fatal: renders nothing when kd is undefined/null */}
      <KdTilePill reading={tile?.kd} />
    </Link>
  );
}
