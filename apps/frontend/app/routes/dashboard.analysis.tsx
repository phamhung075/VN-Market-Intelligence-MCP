/**
 * /dashboard/analysis — Agent market analysis.
 * Sections: Stock selector (all 30 watchlist tickers grouped by sector),
 *           Watchlist overview grid (when no ?stock=),
 *           Kinh Dịch market signal, macro signals, stock table, detail panel.
 * ?stock=CODE — loads full Kinh Dịch reading + 90-day OHLCV for chart rendering.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, Form } from "@remix-run/react";
import {
  fetchKinhDichMarket,
  fetchKinhDichReading,
  fetchMacroSnapshot,
  fetchPriceHistory,
  fetchStockSignals,
  fetchTASnapshot,
  fetchWatchlistPrices,
  fetchCascadeSignals,
  fetchAccuracyDigest,
  deriveAccuracyDigestState,
  digestRateColor,
  accuracyBadgeProps,
  type WatchlistTileData,
} from "~/lib/api/client";
import type {
  AgentSignal,
  AccuracyDigestStats,
  KinhDichMarket,
  KinhDichReading,
  MacroSnapshot,
  MacroSignalEntry,
  PricePoint,
  TASnapshot,
  WatchlistStock,
} from "~/domain/market";
import {
  WATCHLIST_STOCKS,
  groupBySector,
} from "~/domain/market";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { StockChart } from "~/components/charts/StockChart";
import { formatDirectionArrow } from "~/domain/formatters/direction-arrow.js";
import { formatChangePct } from "~/domain/formatters/change-pct.js";
import { formatSignalTypeLabel } from "~/domain/formatters/signal-type-label.js";

export const meta: MetaFunction = () => [
  { title: "Market Analysis — VN Market Intelligence" },
];

// Active watchlist tickers only (VEA excluded)
const ACTIVE_TICKERS = WATCHLIST_STOCKS.filter((s) => s.active).map((s) => s.ticker);

// Representative sample for the KD overview table (top 8 cross-sector picks)
const KD_SAMPLE_TICKERS = ["FPT", "VNM", "HPG", "VCB", "MSN", "VIC", "SSI", "VJC"] as const;

// --------------------------------------------------------------------------
// Domain interfaces
// --------------------------------------------------------------------------

interface StockDetail {
  reading: KinhDichReading;
  prices: PricePoint[];
  ta: TASnapshot | null;
  signals: AgentSignal[] | null;
  cascadeSignals: AgentSignal[];
}

interface LoaderData {
  market: KinhDichMarket | null;
  readings: KinhDichReading[];
  snapshot: MacroSnapshot | null;
  accuracyDigest: AccuracyDigestStats | null;
  selectedStock: string | null;
  selectedStockInfo: WatchlistStock | null;
  detail: StockDetail | null;
  detailError: string | null;
  watchlistTiles: Record<string, WatchlistTileData>;
  errors: string[];
  fetchedAt: string;
}

// --------------------------------------------------------------------------
// Loader
// --------------------------------------------------------------------------

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const selectedStock = url.searchParams.get("stock")?.toUpperCase().trim() || null;

  const errors: string[] = [];

  // Base data — always fetched in parallel
  const [marketResult, snapshotResult, accuracyResult, ...readingResults] =
    await Promise.allSettled([
      fetchKinhDichMarket(),
      fetchMacroSnapshot(),
      fetchAccuracyDigest(30),
      ...KD_SAMPLE_TICKERS.map((t) => fetchKinhDichReading(t)),
    ]);

  const market =
    marketResult.status === "fulfilled"
      ? marketResult.value
      : (errors.push(`Kinh Dịch market: ${String(marketResult.reason)}`), null);

  const snapshot =
    snapshotResult.status === "fulfilled"
      ? snapshotResult.value
      : (errors.push(`Macro snapshot: ${String(snapshotResult.reason)}`), null);

  const accuracyDigest =
    accuracyResult.status === "fulfilled" ? accuracyResult.value : null;

  const readings = readingResults
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((r): r is KinhDichReading => r !== null);

  // Watchlist tile prices — lightweight batch fetch (non-fatal → {})
  let watchlistTiles: Record<string, WatchlistTileData> = {};
  try {
    watchlistTiles = await fetchWatchlistPrices(ACTIVE_TICKERS);
  } catch {
    // non-fatal — overview cards show "—" for price
  }

  // Detail — only when a stock is selected
  let detail: StockDetail | null = null;
  let detailError: string | null = null;

  if (selectedStock) {
    const [readingRes, priceRes, taRes, signalsRes, cascadeRes] = await Promise.allSettled([
      fetchKinhDichReading(selectedStock),
      fetchPriceHistory(selectedStock, 90),     // 90 days for indicator charts
      fetchTASnapshot(selectedStock),            // TA non-fatal — null on failure
      fetchStockSignals(selectedStock, 10),      // signals non-fatal — null on failure
      fetchCascadeSignals(selectedStock, 5),     // cascade macro impact — non-fatal
    ]);

    if (readingRes.status === "fulfilled" && priceRes.status === "fulfilled") {
      const ta = taRes.status === "fulfilled" ? taRes.value : null;
      const signals = signalsRes.status === "fulfilled" ? signalsRes.value : null;
      const cascadeSignals = cascadeRes.status === "fulfilled" ? cascadeRes.value : [];
      detail = { reading: readingRes.value, prices: priceRes.value, ta, signals, cascadeSignals };
    } else {
      detailError =
        readingRes.status === "rejected"
          ? `Không tải được dữ liệu cho ${selectedStock}: ${String(readingRes.reason)}`
          : `Không tải được giá cho ${selectedStock}`;
    }
  }

  // Find watchlist metadata for selected stock (sector, company name)
  const selectedStockInfo = selectedStock
    ? WATCHLIST_STOCKS.find((s) => s.ticker === selectedStock) ?? null
    : null;

  return json<LoaderData>({
    market,
    readings,
    snapshot,
    accuracyDigest,
    selectedStock,
    selectedStockInfo,
    detail,
    detailError,
    watchlistTiles,
    errors,
    fetchedAt: new Date().toISOString(),
  });
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function signalColor(signal: string): string {
  const s = signal.toUpperCase();
  if (s.includes("MUA") || s.includes("BULLISH")) return "text-green-400";
  if (s.includes("BÁN") || s.includes("BEARISH")) return "text-red-400";
  if (s.includes("THẬN TRỌNG") || s.includes("THAN TRONG")) return "text-yellow-400";
  return "text-slate-300";
}

function confidencePct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function confidenceBar(confidence: number) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-slate-700">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-400">{pct}%</span>
    </div>
  );
}

function indicatorLabel(indicator: string): string {
  switch (indicator) {
    // legacy underscore-keyed names
    case "oil_usd": return "Dầu thô (WTI)";
    case "gold_usd": return "Vàng";
    case "usd_vnd": return "USD/VND";
    // canonical keyed-object keys from Go SignalResult (dtos.go)
    case "oil": return "Dầu thô (WTI)";
    case "gold": return "Vàng";
    case "usdvnd": return "USD/VND";
    case "investment-clock": return "Investment Clock";
    case "carry": return "Carry Trade";
    case "yield": return "Yield Spread";
    default: return indicator;
  }
}

// --------------------------------------------------------------------------
// Accuracy Digest Card (Sprint 1945b)
// --------------------------------------------------------------------------

/**
 * System-level accuracy digest card — 6 states.
 * Displays top-3 / bottom-3 signal types by accuracy rate.
 * Non-fatal — shows graceful degradation on null data or errors.
 */
function AccuracyDigestCard({
  data,
}: {
  data: AccuracyDigestStats | null;
}) {
  const state = deriveAccuracyDigestState(data);

  if (state === "loading") {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="flex justify-between gap-4">
            <div className="h-5 w-24 bg-slate-800 animate-pulse rounded" />
            <div className="h-5 w-16 bg-slate-800 animate-pulse rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (state === "empty") {
    return (
      <p className="text-sm text-slate-400">
        No accuracy data yet — signal outcomes are still seeding.
      </p>
    );
  }

  if (state === "all-neutral") {
    return (
      <p className="text-sm text-slate-400">
        All resolved outcomes are neutral — no directional accuracy measurable yet. ({data!.neutralOnlyRows} neutral outcomes recorded)
      </p>
    );
  }

  if (state === "insufficient-sample") {
    return (
      <p className="text-sm text-slate-400">
        No signal types have ≥3 resolved samples yet. ({data!.totalResolved} resolved rows recorded — tracking in progress)
      </p>
    );
  }

  // Partial or normal state — render table
  const displayRows = data!.bySignalType;
  const topThree = displayRows.slice(0, 3);
  const bottomThree = displayRows.slice(-3).reverse();
  const uniqueRows = Array.from(
    new Map([...topThree, ...bottomThree].map((r) => [r.signal_type, r])).values(),
  );
  void uniqueRows; // used for dedup reference; columns rendered separately

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-4 text-xs">
        {/* Top-3 column */}
        <div>
          <p className="text-slate-500 font-semibold mb-2">Best</p>
          {topThree.map((row) => (
            <div
              key={row.signal_type}
              className="flex justify-between gap-2 py-1 border-b border-slate-700"
            >
              <span className="truncate">{row.signal_type}</span>
              <span className={`font-mono font-semibold ${digestRateColor(row.rate)}`}>
                {(row.rate * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>

        {/* Bottom-3 column */}
        <div>
          <p className="text-slate-500 font-semibold mb-2">Worst</p>
          {bottomThree.map((row) => (
            <div
              key={row.signal_type}
              className="flex justify-between gap-2 py-1 border-b border-slate-700"
            >
              <span className="truncate">{row.signal_type}</span>
              <span className={`font-mono font-semibold ${digestRateColor(row.rate)}`}>
                {(row.rate * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer row */}
      <div className="mt-4 pt-2 border-t border-slate-700 text-xs text-slate-400">
        {data!.overallRate === null ? (
          <p>
            System: n/a{" "}
            <span className="text-slate-600">(need 10+ resolved)</span>
          </p>
        ) : (
          <p>
            System:{" "}
            <span className="font-semibold text-slate-200">
              {(data!.overallRate * 100).toFixed(1)}%
            </span>{" "}
            <span className="text-slate-600">
              ({data!.totalCorrect.toLocaleString("vi-VN")} /{" "}
              {data!.totalResolved.toLocaleString("vi-VN")} total)
            </span>{" "}
            · {data!.newStocksCount} stocks still seeding
          </p>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Section shell
// --------------------------------------------------------------------------

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900">
      <div className="border-b border-slate-700 px-4 py-3">
        <h2 className="font-semibold text-slate-300">
          {title}
          {subtitle && (
            <span className="ml-2 text-xs font-normal text-slate-500">
              {subtitle}
            </span>
          )}
        </h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Stock Selector — ticker badges grouped by sector (Priority 1)
// --------------------------------------------------------------------------

/**
 * Compact row of clickable ticker badges for all 30 watchlist stocks.
 * Grouped by sector. Selected stock is highlighted in blue.
 * Clicking a badge navigates to ?stock=XXX.
 */
function StockSelector({ selectedStock }: { selectedStock: string | null }) {
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

// --------------------------------------------------------------------------
// Watchlist Overview Grid — all 30 stocks as tiles (Priority 2)
// --------------------------------------------------------------------------

/**
 * Single tile card: ticker + company + last price + direction + signal count.
 * Clicking navigates to ?stock=XXX to load full detail.
 */
function WatchlistTile({
  stock,
  tile,
}: {
  stock: WatchlistStock;
  tile: WatchlistTileData | undefined;
}) {
  const arrow = tile ? formatDirectionArrow(tile.direction) : { symbol: "—", cls: "text-slate-600" };
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
    </Link>
  );
}

function WatchlistOverviewGrid({
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

// --------------------------------------------------------------------------
// Sector Peers Bar — siblings in same sector (Priority 4)
// --------------------------------------------------------------------------

function SectorPeersBar({
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

// --------------------------------------------------------------------------
// Macro Impact Panel — cascade signals showing macro → stock linkage (Priority 3)
// --------------------------------------------------------------------------

function MacroImpactPanel({
  cascadeSignals,
  stock,
}: {
  cascadeSignals: AgentSignal[];
  stock: string;
}) {
  return (
    <div className="border-b border-slate-700 px-4 py-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
        Tác động Macro — {stock}
      </h3>

      {cascadeSignals.length === 0 ? (
        <p className="text-xs text-slate-500">
          Không có cascade macro cho {stock} trong 24h qua.
        </p>
      ) : (
        <div className="space-y-2">
          {cascadeSignals.map((sig) => {
            const isBullish = sig.direction === "BULLISH";
            const isBearish = sig.direction === "BEARISH";
            const dirCls = isBullish
              ? "text-green-400"
              : isBearish
                ? "text-red-400"
                : "text-slate-400";
            const borderCls = isBullish
              ? "border-green-800"
              : isBearish
                ? "border-red-800"
                : "border-slate-700";

            return (
              <div
                key={sig.id}
                className={`rounded border bg-slate-800/60 px-3 py-2 ${borderCls}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-slate-300 leading-relaxed flex-1">
                    {sig.reasoning || "Cascade macro event"}
                  </p>
                  <span className={`shrink-0 text-xs font-semibold ${dirCls}`}>
                    {isBullish ? "↑ BULLISH" : isBearish ? "↓ BEARISH" : sig.direction}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                  <span>{Math.round(sig.confidence * 100)}% tin cậy</span>
                  <span suppressHydrationWarning>
                    {sig.createdAt ? new Date(sig.createdAt.replace(" ", "T") + "Z").toLocaleDateString("vi-VN") : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Kinh Dịch market panel
// --------------------------------------------------------------------------

function KinhDichMarketPanel({ market }: { market: KinhDichMarket }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
      <div className="flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-6 py-4 shrink-0">
        <span className="text-4xl font-bold text-blue-400">#{market.hexagram}</span>
        <span className="text-sm font-semibold text-slate-300">{market.name}</span>
      </div>
      <div className="flex-1 space-y-2 text-sm">
        <Row label="Xu hướng" value={<span className="font-medium text-slate-200">{market.trend}</span>} />
        <Row label="Tín hiệu" value={<span className={`font-semibold ${signalColor(market.signal)}`}>{market.signal}</span>} />
        <Row label="Độ tin cậy" value={confidenceBar(market.confidence)} />
        <Row label="Thời gian" value={<ClientTimestamp iso={market.timestamp} />} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-slate-500">{label}</span>
      {value}
    </div>
  );
}

// --------------------------------------------------------------------------
// Macro signals panel
// --------------------------------------------------------------------------

function MacroSignalPanel({ snapshot }: { snapshot: MacroSnapshot }) {
  const valueMap: Record<string, number | null> = {
    // canonical keyed-object keys
    oil: snapshot.oilUsd,
    gold: snapshot.goldUsd,
    usdvnd: snapshot.usdVnd,
    // legacy underscore-keyed names (backward-compat)
    oil_usd: snapshot.oilUsd,
    gold_usd: snapshot.goldUsd,
    usd_vnd: snapshot.usdVnd,
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {Object.entries(snapshot.signals).map(([key, entry]: [string, MacroSignalEntry]) => {
        const direction = entry.direction ?? entry.regime ?? entry.label ?? "";
        const impact = entry.impact ?? entry.tier ?? "LOW";
        const numericValue = entry.priceUSD ?? entry.rateVND ?? entry.score ?? valueMap[key];
        const isBullish = direction === "BULLISH";
        const isBearish = direction === "BEARISH";
        const dirColor = isBullish
          ? "text-green-400"
          : isBearish
            ? "text-red-400"
            : "text-slate-400";
        const impactClass =
          impact === "HIGH"
            ? "border-red-800"
            : impact === "MEDIUM"
              ? "border-yellow-800"
              : "border-slate-700";

        return (
          <div
            key={key}
            className={`rounded-lg border bg-slate-800 p-4 ${impactClass}`}
          >
            <p className="text-xs text-slate-500">{indicatorLabel(key)}</p>
            <p suppressHydrationWarning className="mt-1 text-xl font-bold text-slate-100">
              {numericValue != null
                ? Number(numericValue).toLocaleString("vi-VN")
                : "—"}
            </p>
            <div className={`mt-2 flex items-center gap-1 text-sm font-semibold ${dirColor}`}>
              {isBullish ? "↑" : isBearish ? "↓" : "—"}
              <span>{direction}</span>
              <span className="ml-auto text-xs font-normal text-slate-500">{impact}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------
// Stock table + search
// --------------------------------------------------------------------------

function StockTable({
  readings,
  selectedStock,
}: {
  readings: KinhDichReading[];
  selectedStock: string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-800">
            <th className="px-3 py-2 text-left font-semibold text-slate-300">Mã</th>
            <th className="px-3 py-2 text-center font-semibold text-slate-300">Quẻ</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-300">Xu hướng</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-300">Tín hiệu</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-300">Tin cậy</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {readings.map((r, idx) => {
            const isSelected = r.stock === selectedStock;
            return (
              <tr
                key={r.stock}
                className={`border-b border-slate-700 last:border-0 transition-colors ${
                  isSelected
                    ? "bg-blue-950 border-blue-800"
                    : idx % 2 === 0
                      ? "bg-slate-900 hover:bg-slate-800"
                      : "bg-slate-800 hover:bg-slate-750"
                }`}
              >
                <td className="px-3 py-2 font-mono font-semibold text-blue-400">
                  {r.stock}
                </td>
                <td className="px-3 py-2 text-center">
                  <span className="text-slate-300">#{r.hexagram}</span>
                  <span className="ml-1 text-xs text-slate-600">{r.name}</span>
                </td>
                <td className="px-3 py-2 text-slate-300">{r.trend}</td>
                <td className={`px-3 py-2 font-medium ${signalColor(r.signal)}`}>
                  {r.signal}
                </td>
                <td className="px-3 py-2 text-right">
                  {confidenceBar(r.confidence)}
                </td>
                <td className="px-3 py-2 text-right">
                  {isSelected ? (
                    <Link
                      to="."
                      className="text-xs text-slate-500 hover:text-slate-300"
                    >
                      ✕ đóng
                    </Link>
                  ) : (
                    <Link
                      to={`?stock=${r.stock}`}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Chi tiết →
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StockSearchForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <Form method="get" className="flex items-center gap-2">
      <input
        name="stock"
        type="text"
        defaultValue={defaultValue ?? ""}
        placeholder="Nhập mã cổ phiếu (VD: VNM)"
        className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none w-52"
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="submit"
        className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
      >
        Phân tích
      </button>
    </Form>
  );
}

// --------------------------------------------------------------------------
// Decision logic
// --------------------------------------------------------------------------

interface DecisionResult {
  label: string;
  textColor: string;
  bgColor: string;
  reasons: string[];
}

export function computeDecision(
  ta: TASnapshot | null,
  reading: KinhDichReading,
  prices: PricePoint[],
): DecisionResult {
  let score = 0;
  const reasons: string[] = [];

  // TA trend
  if (ta) {
    if (ta.trend === "BULLISH") {
      score += 2;
      reasons.push("TA: BULLISH");
    } else if (ta.trend === "BEARISH") {
      score -= 2;
      reasons.push("TA: BEARISH");
    } else {
      reasons.push("TA: NEUTRAL");
    }

    // RSI
    if (ta.rsi !== null) {
      const rsi = ta.rsi;
      reasons.push(`RSI: ${rsi.toFixed(1)}`);
      if (rsi < 30) {
        score += 1; // oversold — recovery potential
      } else if (rsi >= 30 && rsi < 50) {
        score += 1; // oversold recovery zone
      } else if (rsi > 70) {
        score -= 1; // overbought
      }
      // 50–70: neutral, no adjustment
    }
  }

  // Kinh Dịch signal
  const sig = reading.signal.toUpperCase();
  if (sig.includes("MUA")) {
    score += 2;
    reasons.push(`KD: ${reading.signal}`);
  } else if (sig.includes("BÁN") || sig.includes("BAN")) {
    score -= 2;
    reasons.push(`KD: ${reading.signal}`);
  } else if (sig.includes("THẬN TRỌNG") || sig.includes("THAN TRONG")) {
    score -= 1;
    reasons.push(`KD: ${reading.signal}`);
  } else {
    reasons.push(`KD: ${reading.signal}`);
  }

  // Price trend — last close vs 5 sessions ago
  if (prices.length >= 5) {
    const last = prices[prices.length - 1].close;
    const prev5 = prices[prices.length - 5].close;
    const deltaPct = ((last - prev5) / prev5) * 100;
    if (deltaPct > 0) {
      score += 1;
      reasons.push(`Giá +${deltaPct.toFixed(1)}% (5 phiên)`);
    } else if (deltaPct < 0) {
      score -= 1;
      reasons.push(`Giá ${deltaPct.toFixed(1)}% (5 phiên)`);
    }
  }

  // Map score to label + colors
  if (score >= 4) {
    return { label: "MUA MẠNH", textColor: "text-green-400", bgColor: "bg-green-950", reasons };
  }
  if (score >= 2) {
    return { label: "MUA", textColor: "text-green-300", bgColor: "bg-green-900/30", reasons };
  }
  if (score >= -1) {
    return { label: "GIỮ", textColor: "text-yellow-400", bgColor: "bg-yellow-900/20", reasons };
  }
  if (score >= -3) {
    return { label: "BÁN", textColor: "text-red-300", bgColor: "bg-red-900/30", reasons };
  }
  return { label: "BÁN MẠNH", textColor: "text-red-400", bgColor: "bg-red-950", reasons };
}

// --------------------------------------------------------------------------
// Decision panel component
// --------------------------------------------------------------------------

function AnalysisDecision({
  ta,
  reading,
  prices,
}: {
  ta: TASnapshot | null;
  reading: KinhDichReading;
  prices: PricePoint[];
}) {
  const decision = computeDecision(ta, reading, prices);

  return (
    <div className={`border-b border-slate-700 px-4 py-4 ${decision.bgColor}`}>
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Quyết định
          </p>
          <span className={`text-2xl font-bold ${decision.textColor}`}>
            {decision.label}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {decision.reasons.map((r, i) => (
            <span
              key={i}
              className="rounded bg-slate-800/60 px-2 py-0.5 text-xs text-slate-300"
            >
              {r}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Info source panel component
// --------------------------------------------------------------------------

function InfoSourcePanel({
  ta,
  reading,
  prices,
  snapshot,
}: {
  ta: TASnapshot | null;
  reading: KinhDichReading;
  prices: PricePoint[];
  snapshot: MacroSnapshot | null;
}) {
  // Build rows from available data
  const rows: { source: string; indicator: string; value: React.ReactNode }[] = [];

  // Price row
  if (prices.length > 0) {
    const last = prices[prices.length - 1];
    const sessions = prices.length;
    let priceDelta: React.ReactNode = null;
    if (prices.length >= 2) {
      const prev = prices[prices.length - 2].close;
      const pct = ((last.close - prev) / prev) * 100;
      priceDelta = (
        <span className={pct > 0 ? "text-green-400" : pct < 0 ? "text-red-400" : "text-slate-400"}>
          {pct > 0 ? "↑" : pct < 0 ? "↓" : "—"}{Math.abs(pct).toFixed(1)}%
        </span>
      );
    }
    rows.push({
      source: "Stock Price",
      indicator: `${sessions} phiên`,
      value: (
        <span className="text-slate-200">
          {last.close.toLocaleString("vi-VN")} {priceDelta}
        </span>
      ),
    });
  }

  // TA rows
  if (ta) {
    rows.push({
      source: "TA service",
      indicator: "RSI(14)",
      value: (
        <span className="text-slate-200">
          {ta.rsi !== null ? ta.rsi.toFixed(1) : "—"}
          {" · "}
          <span className={ta.trend === "BULLISH" ? "text-green-400" : ta.trend === "BEARISH" ? "text-red-400" : "text-slate-400"}>
            {ta.trend}
          </span>
        </span>
      ),
    });
    if (ta.macd !== null) {
      const hist = ta.macd.histogram;
      rows.push({
        source: "TA service",
        indicator: "MACD",
        value: (
          <span className={hist > 0 ? "text-green-400" : hist < 0 ? "text-red-400" : "text-slate-400"}>
            {hist > 0 ? "+" : ""}{hist.toFixed(3)} ({hist > 0 ? "tăng" : hist < 0 ? "giảm" : "ngang"})
          </span>
        ),
      });
    } else {
      rows.push({ source: "TA service", indicator: "MACD", value: <span className="text-slate-500">—</span> });
    }
  } else {
    rows.push({ source: "TA service", indicator: "RSI(14)", value: <span className="text-slate-500">—</span> });
    rows.push({ source: "TA service", indicator: "MACD", value: <span className="text-slate-500">—</span> });
  }

  // Kinh Dịch row
  rows.push({
    source: "Kinh Dịch",
    indicator: `Quẻ #${reading.hexagram}`,
    value: (
      <span className="text-slate-200">
        <span className={`font-semibold ${signalColor(reading.signal)}`}>{reading.signal}</span>
        {" · "}
        {confidencePct(reading.confidence)}
      </span>
    ),
  });

  // Macro row — highest impact signal (keyed-object contract)
  if (snapshot && Object.values(snapshot.signals).length > 0) {
    const impactRank = (entry: MacroSignalEntry) => {
      const imp = entry.impact ?? entry.tier ?? "LOW";
      return imp === "HIGH" ? 3 : imp === "MEDIUM" ? 2 : 1;
    };
    const [[topKey, topEntry]] = Object.entries(snapshot.signals).sort(
      ([, a], [, b]) => impactRank(b) - impactRank(a)
    );
    const topDirection = topEntry.direction ?? topEntry.regime ?? topEntry.label ?? "—";
    const topImpact = topEntry.impact ?? topEntry.tier ?? "LOW";
    rows.push({
      source: "Macro",
      indicator: indicatorLabel(topKey),
      value: (
        <span className="text-slate-200">
          <span className={topDirection === "BULLISH" ? "text-green-400" : topDirection === "BEARISH" ? "text-red-400" : "text-slate-400"}>
            {topDirection}
          </span>
          {" · "}
          <span className="text-slate-400">{topImpact}</span>
        </span>
      ),
    });
  }

  return (
    <div className="border-b border-slate-700 px-4 py-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
        Nguồn dữ liệu
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-xs text-slate-400">
              <th className="py-1.5 text-left pr-4 font-medium">Nguồn</th>
              <th className="py-1.5 text-left pr-4 font-medium">Chỉ số</th>
              <th className="py-1.5 text-left font-medium">Giá trị</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-800 last:border-0">
                <td className="py-1.5 pr-4 text-xs text-slate-500">{row.source}</td>
                <td className="py-1.5 pr-4 text-xs text-slate-400">{row.indicator}</td>
                <td className="py-1.5 text-xs">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Stock signals panel
// --------------------------------------------------------------------------

/**
 * Format a SQLite/ISO datetime string for compact display.
 * If the date portion equals today, show only HH:mm.
 * Otherwise show MM-DD HH:mm.
 */
function formatSignalTime(createdAt: string): string {
  // SQLite stores "YYYY-MM-DD HH:MM:SS"; convert to a valid ISO string
  const iso = createdAt.includes("T") ? createdAt : createdAt.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return createdAt;

  const todayStr = new Date().toISOString().slice(0, 10);
  const signalDateStr = iso.slice(0, 10);
  const hhmm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" });

  if (signalDateStr === todayStr) return hhmm;
  const mmdd = iso.slice(5, 10); // "MM-DD"
  return `${mmdd} ${hhmm}`;
}

function directionLabel(direction: string): { text: string; cls: string } {
  const d = direction.toUpperCase();
  if (d === "BULLISH") return { text: "BULLISH↑", cls: "text-green-400" };
  if (d === "BEARISH") return { text: "BEARISH↓", cls: "text-red-400" };
  return { text: direction || "NEUTRAL", cls: "text-slate-400" };
}

function confidenceLabel(confidence: number): { text: string; cls: string } {
  const pct = Math.round(confidence * 100);
  const text = `${pct}%`;
  if (pct >= 70) return { text, cls: "text-green-400" };
  if (pct >= 40) return { text, cls: "text-amber-400" };
  return { text, cls: "text-slate-400" };
}

/**
 * Render an accuracy badge inline.
 * - absent accuracy → dash
 * - sample_count < 3 → grey "New"
 * - rate >= 0.70 → green
 * - rate 0.40–0.69 → amber
 * - rate < 0.40 → red "Low"
 */
function AccuracyBadge({ accuracy }: { accuracy: AgentSignal["accuracy"] }) {
  if (accuracy === undefined) {
    return <span className="text-slate-600">—</span>;
  }
  const { color, label } = accuracyBadgeProps(accuracy);
  const colorClass =
    color === "green"
      ? "bg-green-100 text-green-800"
      : color === "amber"
        ? "bg-yellow-100 text-yellow-800"
        : color === "red"
          ? "bg-red-100 text-red-800"
          : "bg-slate-700 text-slate-400"; // grey
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${colorClass}`}>
      {label}
    </span>
  );
}

function StockSignalsPanel({ signals }: { signals: AgentSignal[] | null }) {
  return (
    <div className="border-b border-slate-700 px-4 py-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
        Signals (last 10)
      </h3>

      {signals === null ? (
        <p className="text-xs text-slate-500">Unavailable — signal endpoint did not respond.</p>
      ) : signals.length === 0 ? (
        <p className="text-xs text-slate-500">No signals recorded for this stock yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="py-1.5 text-left pr-3 font-medium">Time</th>
                <th className="py-1.5 text-left pr-3 font-medium">Source</th>
                <th className="py-1.5 text-left pr-3 font-medium">Direction</th>
                <th className="py-1.5 text-left pr-3 font-medium">Confidence</th>
                <th className="py-1.5 text-left pr-4 font-medium">Accuracy</th>
                <th className="py-1.5 text-left font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((sig) => {
                const dir = directionLabel(sig.direction);
                const conf = confidenceLabel(sig.confidence);
                return (
                  <tr key={sig.id} className="border-b border-slate-800 last:border-0">
                    <td suppressHydrationWarning className="py-1.5 pr-3 font-mono text-slate-400 whitespace-nowrap">
                      {formatSignalTime(sig.createdAt)}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                        {formatSignalTypeLabel(sig.signalType)}
                      </span>
                    </td>
                    <td className={`py-1.5 pr-3 font-semibold ${dir.cls}`}>
                      {dir.text}
                    </td>
                    <td className={`py-1.5 pr-3 font-semibold ${conf.cls}`}>
                      {conf.text}
                    </td>
                    <td className="py-1.5 pr-4">
                      <AccuracyBadge accuracy={sig.accuracy} />
                    </td>
                    <td className="py-1.5 text-slate-300 max-w-xs truncate" title={sig.reasoning}>
                      {sig.reasoning || <span className="text-slate-600 italic">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Detail panel
// --------------------------------------------------------------------------

function MiniPriceTable({ prices }: { prices: PricePoint[] }) {
  const recent = prices.slice(-7).reverse();
  if (recent.length === 0) return <p className="text-sm text-slate-500">Không có dữ liệu giá.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400">
            <th className="py-1.5 text-left pr-3">Ngày</th>
            <th className="py-1.5 text-right pr-3">Đóng cửa</th>
            <th className="py-1.5 text-right pr-3">Mở cửa</th>
            <th className="py-1.5 text-right pr-3">Cao</th>
            <th className="py-1.5 text-right pr-3">Thấp</th>
            <th className="py-1.5 text-right">Khối lượng</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((p, i) => {
            const delta =
              p.open != null && p.open !== 0
                ? ((p.close - p.open) / p.open) * 100
                : null;
            return (
              <tr key={i} className="border-b border-slate-800 last:border-0">
                <td className="py-1.5 font-mono text-slate-400 pr-3">{p.date}</td>
                <td suppressHydrationWarning className="py-1.5 text-right font-semibold text-slate-100 pr-3">
                  {p.close.toLocaleString("vi-VN")}
                  {delta != null && (
                    <span
                      className={`ml-1 text-xs ${
                        delta > 0
                          ? "text-green-400"
                          : delta < 0
                            ? "text-red-400"
                            : "text-slate-500"
                      }`}
                    >
                      {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                    </span>
                  )}
                </td>
                <td suppressHydrationWarning className="py-1.5 text-right text-slate-400 pr-3">
                  {p.open != null ? p.open.toLocaleString("vi-VN") : "—"}
                </td>
                <td suppressHydrationWarning className="py-1.5 text-right text-green-400 pr-3">
                  {p.high != null ? p.high.toLocaleString("vi-VN") : "—"}
                </td>
                <td suppressHydrationWarning className="py-1.5 text-right text-red-400 pr-3">
                  {p.low != null ? p.low.toLocaleString("vi-VN") : "—"}
                </td>
                <td suppressHydrationWarning className="py-1.5 text-right text-slate-500">
                  {p.volume != null ? p.volume.toLocaleString("vi-VN") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StockDetailPanel({
  detail,
  stock,
  stockInfo,
  snapshot,
  watchlistTiles,
}: {
  detail: StockDetail;
  stock: string;
  stockInfo: WatchlistStock | null;
  snapshot: MacroSnapshot | null;
  watchlistTiles: Record<string, WatchlistTileData>;
}) {
  const { reading, prices, ta, signals, cascadeSignals } = detail;

  return (
    <div className="mt-6 rounded-lg border border-blue-800 bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-blue-800 bg-blue-950 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xl font-bold text-blue-300">{stock}</span>
          {stockInfo && (
            <span className="text-xs text-slate-400">{stockInfo.company}</span>
          )}
          <span className={`text-sm font-semibold ${signalColor(reading.signal)}`}>
            {reading.signal}
          </span>
          <span className="text-xs text-slate-500">{prices.length} phiên</span>
        </div>
        <Link to="." className="text-xs text-slate-400 hover:text-slate-200">
          ✕ đóng
        </Link>
      </div>

      {/* Sector peers bar — quick comparison with siblings */}
      <SectorPeersBar
        currentTicker={stock}
        sector={stockInfo?.sector ?? null}
        tiles={watchlistTiles}
      />

      {/* Chart — full width, client-only render */}
      <div className="border-b border-slate-700">
        <StockChart prices={prices} height={560} />
      </div>

      {/* Decision panel — synthesized buy/sell/hold */}
      <AnalysisDecision ta={ta} reading={reading} prices={prices} />

      {/* Info source panel — contributing data sources */}
      <InfoSourcePanel ta={ta} reading={reading} prices={prices} snapshot={snapshot} />

      {/* Macro impact panel — cascade macro → sector → stock linkage */}
      <MacroImpactPanel cascadeSignals={cascadeSignals} stock={stock} />

      {/* Agent signals — why this stock has been flagged */}
      <StockSignalsPanel signals={signals} />

      {/* Bottom: Kinh Dịch + Price table side-by-side */}
      <div className="grid gap-0 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-700">
        {/* Kinh Dịch details */}
        <div className="p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Kinh Dịch
          </h3>
          <div className="space-y-2 text-sm">
            <Row
              label="Quẻ"
              value={
                <span className="text-slate-200">
                  #{reading.hexagram} — {reading.name}
                </span>
              }
            />
            <Row
              label="Xu hướng"
              value={<span className="text-slate-200">{reading.trend}</span>}
            />
            <Row
              label="Tín hiệu"
              value={
                <span className={`font-semibold ${signalColor(reading.signal)}`}>
                  {reading.signal}
                </span>
              }
            />
            <Row label="Độ tin cậy" value={confidenceBar(reading.confidence)} />
          </div>

          {reading.actionNote && (
            <div className="mt-3 rounded bg-slate-800 px-3 py-2 text-xs text-slate-300 leading-relaxed">
              {reading.actionNote}
            </div>
          )}

          {reading.overallReading && (
            <div className="mt-2 rounded bg-slate-800 px-3 py-2 text-xs text-slate-400 leading-relaxed">
              {reading.overallReading}
            </div>
          )}
        </div>

        {/* Recent price table */}
        <div className="p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Lịch sử giá — 7 phiên gần nhất
          </h3>
          <MiniPriceTable prices={prices} />
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

export default function AnalysisDashboard() {
  const {
    market,
    readings,
    snapshot,
    accuracyDigest,
    selectedStock,
    selectedStockInfo,
    detail,
    detailError,
    watchlistTiles,
    errors,
    fetchedAt,
  } = useLoaderData<typeof loader>();

  const hasWatchlistPrices = Object.keys(watchlistTiles).length > 0;

  return (
    <div className="max-w-6xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Market Analysis</h1>
        <span className="text-xs text-slate-500">
          <ClientTimestamp iso={fetchedAt} />
        </span>
      </div>

      {errors.length > 0 && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300 space-y-1"
        >
          {errors.map((e, idx) => (
            <p key={idx}>{e}</p>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Stock Selector — all 30 tickers grouped by sector (Priority 1)     */}
      {/* ------------------------------------------------------------------ */}
      <SectionCard
        title="Chọn cổ phiếu"
        subtitle={`${WATCHLIST_STOCKS.filter((s) => s.active).length} mã · 10 nhóm ngành`}
      >
        <StockSelector selectedStock={selectedStock} />

        {/* Quick free-text search below the sector grid */}
        <div className="mt-4 border-t border-slate-700 pt-4">
          <StockSearchForm defaultValue={selectedStock ?? ""} />
        </div>
      </SectionCard>

      {/* ------------------------------------------------------------------ */}
      {/* When no stock selected: show watchlist overview grid (Priority 2)  */}
      {/* ------------------------------------------------------------------ */}
      {!selectedStock && (
        <SectionCard
          title="Watchlist — Tổng quan"
          subtitle="30 cổ phiếu · click để xem chi tiết"
        >
          <WatchlistOverviewGrid tiles={watchlistTiles} />
        </SectionCard>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* When a stock IS selected: show full analysis panel                 */}
      {/* ------------------------------------------------------------------ */}
      {selectedStock && detailError && (
        <div className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300">
          {detailError}
        </div>
      )}
      {selectedStock && detail && (
        <StockDetailPanel
          detail={detail}
          stock={selectedStock}
          stockInfo={selectedStockInfo}
          snapshot={snapshot}
          watchlistTiles={watchlistTiles}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Kinh Dịch market signal — always visible                           */}
      {/* ------------------------------------------------------------------ */}
      <SectionCard title="Kinh Dịch — Tín hiệu thị trường" subtitle="tổng quan">
        {market ? (
          <KinhDichMarketPanel market={market} />
        ) : (
          <p className="text-sm text-slate-500">Không có dữ liệu.</p>
        )}
      </SectionCard>

      {/* Macro signals */}
      <SectionCard title="Macro Signals" subtitle="dầu · vàng · tỷ giá">
        {snapshot ? (
          <MacroSignalPanel snapshot={snapshot} />
        ) : (
          <p className="text-sm text-slate-500">Không có dữ liệu.</p>
        )}
      </SectionCard>

      {/* KD overview table for sample tickers */}
      <SectionCard
        title="Kinh Dịch — Cổ phiếu mẫu"
        subtitle="8 mã đại diện · chọn mã bằng bảng selector ở trên"
      >
        <StockTable readings={readings} selectedStock={selectedStock} />
      </SectionCard>

      {/* Signal Accuracy digest — always visible, non-fatal */}
      <SectionCard title="Signal Accuracy" subtitle="30d · top-3 / bottom-3">
        <AccuracyDigestCard
          data={accuracyDigest}
        />
      </SectionCard>
    </div>
  );
}
