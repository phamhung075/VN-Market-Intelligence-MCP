/**
 * /dashboard/analysis — Agent market analysis.
 * Sections: Stock selector (all 30 watchlist tickers grouped by sector),
 *           Watchlist overview grid (when no ?stock=),
 *           Kinh Dịch market signal, macro signals, stock table, detail panel.
 * ?stock=CODE — loads full Kinh Dịch reading + 90-day OHLCV for chart rendering.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  fetchKinhDichMarket,
  fetchKinhDichReading,
  fetchKinhDichReadingNonFatal,
  fetchMacroSnapshot,
  fetchPriceHistory,
  fetchStockSignals,
  fetchTASnapshot,
  fetchWatchlistPrices,
  fetchCascadeSignals,
  fetchAccuracyDigest,
  deriveAccuracyDigestState,
  digestRateColor,
  type WatchlistTileData,
} from "~/lib/api/client";
import type {
  AgentSignal,
  AccuracyDigestStats,
  KinhDichMarket,
  KinhDichReading,
  MacroSnapshot,
  PricePoint,
  TASnapshot,
  WatchlistStock,
} from "~/domain/market";
import {
  WATCHLIST_STOCKS,
  groupBySector,
} from "~/domain/market";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { PageHeader } from "~/components/PageHeader";
import { FreshnessBadge } from "~/components/FreshnessBadge";
import { useFreshnessRevalidator } from "~/lib/hooks/useFreshnessRevalidator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { TechnicalZone } from "~/components/analysis/TechnicalZone";
import { CorporateEventsZone } from "~/components/analysis/CorporateEventsZone";
import { FinancialsZone } from "~/components/analysis/FinancialsZone";
import { ReputationZone } from "~/components/analysis/ReputationZone";
import { NewsBuzzZone } from "~/components/analysis/NewsBuzzZone";
import { ConvictionHistoryZone } from "~/components/analysis/ConvictionHistoryZone";
import { SectionCard } from "~/components/analysis/SectionShell";
import { StockSelector } from "~/components/analysis/StockSelector";
import { WatchlistOverviewGrid } from "~/components/analysis/WatchlistOverviewGrid";
import { KinhDichMarketPanel } from "~/components/analysis/KinhDichMarketPanel";
import { MacroSignalPanel } from "~/components/analysis/MacroSignalPanel";
import { StockTable, StockSearchForm } from "~/components/analysis/StockTable";
import { StockDetailPanel } from "~/components/analysis/StockDetailPanel";

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

// --------------------------------------------------------------------------
// AnalysisBrief — AI deep-dive per ticker (P0-4)
// --------------------------------------------------------------------------

/** Shape returned by GET /api/analysis-brief/:ticker (200 OK). */
interface AnalysisBriefDto {
  ticker: string;
  fundamentals: string | null;
  news: string | null;
  price: string | null;
  synthesis: string | null;
  raw: string | null;
  updatedAt: string | null;
}

/** Error shapes returned by GET /api/analysis-brief/:ticker. */
interface AnalysisBriefError {
  error: "not_found" | "invalid_ticker" | "io_error" | string;
  ticker?: string;
}

type AnalysisBriefResult =
  | { ok: true; brief: AnalysisBriefDto }
  | { ok: false; status: number; errorCode: string };

export interface StockDetail {
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
  analysisBrief: AnalysisBriefResult | null;
  watchlistTiles: Record<string, WatchlistTileData>;
  errors: string[];
  fetchedAt: string;
  kdGeneratedAt: string | null;
  watchlistDataAsof: string | null;
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

  // KD reading enrichment for watchlist tiles — TASK-17.
  // Fetch ALL active tickers in parallel; each call is non-fatal (null on 503/error).
  // Only runs when the overview grid is shown (no selectedStock) to avoid bulk load on detail view.
  if (!selectedStock && Object.keys(watchlistTiles).length > 0) {
    const kdTickers = ACTIVE_TICKERS;
    const kdResults = await Promise.allSettled(
      kdTickers.map((t) => fetchKinhDichReadingNonFatal(t)),
    );
    kdTickers.forEach((ticker, idx) => {
      const r = kdResults[idx];
      const reading = r.status === "fulfilled" ? r.value : null;
      if (watchlistTiles[ticker]) {
        watchlistTiles[ticker] = { ...watchlistTiles[ticker], kd: reading };
      }
    });
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

  // Analysis brief — AI deep-dive per ticker (P0-4, non-fatal)
  let analysisBrief: AnalysisBriefResult | null = null;
  if (selectedStock) {
    try {
      const origin =
        typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
          ? process.env["FRONTEND_ORIGIN"]
          : "http://localhost:3001";
      const briefResponse = await fetch(
        `${origin}/api/analysis-brief/${encodeURIComponent(selectedStock)}`,
        { headers: { Accept: "application/json" } },
      );
      if (briefResponse.ok) {
        const raw = (await briefResponse.json()) as unknown;
        analysisBrief = { ok: true, brief: raw as AnalysisBriefDto };
      } else {
        let errorCode = "io_error";
        try {
          const errBody = (await briefResponse.json()) as AnalysisBriefError;
          errorCode = errBody.error ?? "io_error";
        } catch {
          // non-parseable error body — use default
        }
        analysisBrief = { ok: false, status: briefResponse.status, errorCode };
      }
    } catch {
      // network failure — leave analysisBrief null (gracefully degraded)
    }
  }

  return json<LoaderData>({
    market,
    readings,
    snapshot,
    accuracyDigest,
    selectedStock,
    selectedStockInfo,
    detail,
    detailError,
    analysisBrief,
    watchlistTiles,
    errors,
    fetchedAt: new Date().toISOString(),
    kdGeneratedAt: market?.timestamp ?? null,
    watchlistDataAsof: null,
  });
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
// AI Deep-Dive panel (P0-4)
// --------------------------------------------------------------------------

/**
 * StalenessTag — shows how old the analysis brief is.
 * Age > 24h → amber "CŨ"; else shows timestamp.
 */
function StalenessTag({ updatedAt }: { updatedAt: string | null }) {
  if (!updatedAt) return null;
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  const isStale = ageMs > 24 * 60 * 60 * 1000;
  return (
    <span
      className={
        isStale
          ? "rounded border border-amber-600 bg-amber-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300"
          : "rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400"
      }
    >
      {isStale ? "CŨ" : ""}
      <ClientTimestamp iso={updatedAt} className="ml-1 font-normal normal-case tracking-normal" />
    </span>
  );
}

/**
 * BriefSection — a labelled collapsible section for one brief field.
 * label: Vietnamese label (Cơ bản / Tin tức / Giá / Tổng hợp)
 * content: prose string or null
 */
function BriefSection({
  label,
  content,
  defaultOpen = false,
}: {
  label: string;
  content: string | null;
  defaultOpen?: boolean;
}) {
  if (!content) {
    return (
      <div className="rounded border border-slate-700 bg-slate-800/50 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        <p className="mt-1 text-xs text-slate-600 italic">Chưa có dữ liệu.</p>
      </div>
    );
  }

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <div className="rounded border border-slate-700 bg-slate-800/50">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </span>
          <span aria-hidden="true" className="text-slate-500 text-xs select-none">
            ▾
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-slate-700 px-4 py-3">
            <p className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">
              {content}
            </p>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/**
 * AiDeepDivePanel — renders the AI analysis brief for a selected ticker.
 * Shows fundamentals / news / price / synthesis as labelled collapsible sections.
 * On 404 → "chưa có phân tích cho mã này" (no fabrication).
 * On network failure (null) → silent — panel not rendered.
 */
function AiDeepDivePanel({
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
    analysisBrief,
    watchlistTiles,
    errors,
    fetchedAt,
    kdGeneratedAt,
    watchlistDataAsof,
  } = useLoaderData<typeof loader>();
  useFreshnessRevalidator("intraday");
  useFreshnessRevalidator("realtime");

  const hasWatchlistPrices = Object.keys(watchlistTiles).length > 0;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Market Analysis"
        actions={
          <span className="text-xs text-slate-500 flex items-center gap-2">
            <FreshnessBadge dataAsof={kdGeneratedAt ?? null} slaTierKey="intraday" />
            <ClientTimestamp iso={fetchedAt} />
          </span>
        }
      />

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
        <div className="space-y-2">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <FreshnessBadge dataAsof={watchlistDataAsof ?? null} slaTierKey="realtime" />
          </div>
          <SectionCard
            title="Watchlist — Tổng quan"
            subtitle="30 cổ phiếu · click để xem chi tiết"
          >
            <WatchlistOverviewGrid tiles={watchlistTiles} />
          </SectionCard>
        </div>
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
      {/* AI Deep Dive — shown when a stock is selected (P0-4)               */}
      {/* ------------------------------------------------------------------ */}
      {selectedStock && (
        <SectionCard
          title="Phân Tích Chuyên Sâu (AI)"
          subtitle={selectedStock}
        >
          <AiDeepDivePanel result={analysisBrief} ticker={selectedStock} />
        </SectionCard>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Zone components — wired in by FE-AHUB-INT-INTEGRATE serial closer  */}
      {/* All zones are self-fetching via useFetcher — no loader dependency   */}
      {/* ------------------------------------------------------------------ */}
      {selectedStock && (
        <>
          {/* TechnicalZone — merged /dashboard/technical scoped to stock */}
          <SectionCard title="Giá & Kỹ thuật" subtitle={selectedStock}>
            <TechnicalZone stock={selectedStock} />
          </SectionCard>

          {/* Link → shareholders detail page */}
          <div>
            <Link
              to={`/dashboard/shareholders?code=${selectedStock}`}
              className="inline-block rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors"
            >
              Cơ cấu cổ đông {selectedStock} →
            </Link>
          </div>

          {/* CorporateEventsZone — client-side filtered to stock */}
          <CorporateEventsZone stock={selectedStock} />

          {/* Link → officers detail page */}
          <div>
            <Link
              to={`/dashboard/officers?code=${selectedStock}`}
              className="inline-block rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors"
            >
              Ban lãnh đạo {selectedStock} →
            </Link>
          </div>

          {/* FinancialsZone — client-side filtered to stock */}
          <FinancialsZone stock={selectedStock} />

          {/* ReputationZone — client-side filtered to stock */}
          <ReputationZone stock={selectedStock} />

          {/* NewsBuzzZone — client-side filtered to stock */}
          <NewsBuzzZone stock={selectedStock} />

          {/* ConvictionHistoryZone — server-filtered via ?symbol= */}
          <ConvictionHistoryZone stock={selectedStock} />
        </>
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
