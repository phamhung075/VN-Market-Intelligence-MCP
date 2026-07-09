/**
 * size-justification: 457L — FACTORY-FRONTEND-split-dashboard-analysis dropped this
 * route from 1836L to 457L across 18 extraction waves (small pure helpers moved to
 * app/domain/formatters/*, ~24 presentational components moved to
 * app/components/analysis/*, each <=120L). What remains is exactly what the backlog
 * approach mandated stay in the route: the LoaderFunctionArgs loader (single
 * Promise.allSettled data-fetch orchestration, ~135L), the AnalysisBriefDto/
 * AnalysisBriefResult/StockDetail/LoaderData type contracts (~55L, several now
 * exported so the extracted components can import them via `import type` — the
 * same route-exports-type pattern already used by FinancialsZone/NewsBuzzZone),
 * and the default-export page composition (~190L) that legitimately owns the
 * top of this route's render tree per Remix route-module convention. Further
 * splitting the loader or the composition would move the review surface, not
 * shrink it. 457L is already the smallest of all 19 /dashboard/* route files in
 * this zone (siblings run 510-1325L); the monorepo-wide size-justification-header
 * sweep is a separate, not-yet-due backlog item gated behind a CI size-lint guard
 * that does not exist yet (see docs/architecture-briefs/2026-06-15-maintainability-
 * factory-audit.md "CI-size-lint-justification" + "FACTORY-XZONE-size-justification-
 * sweep").
 *
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
import { AiDeepDivePanel } from "~/components/analysis/AiDeepDivePanel";
import { AccuracyDigestCard } from "~/components/analysis/AccuracyDigestCard";

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
export interface AnalysisBriefDto {
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

export type AnalysisBriefResult =
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
