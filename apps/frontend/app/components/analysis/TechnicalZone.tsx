/**
 * TechnicalZone — stock-scoped technical analysis zone component.
 *
 * Merges the full content of /dashboard/technical into a self-contained,
 * embeddable zone for a single stock. Accepts a `stock` prop (ticker) and
 * fetches its own data via useFetcher — no parent loader dependency.
 *
 * Data source: GET /api/price-history/:ticker?days=90
 *   (frontend proxy → mcp-server :3000 via api.price-history.$ticker.tsx)
 *
 * Auto-refresh: every 5 minutes (intraday SLA tier).
 *
 * Honest states:
 *   - Idle (not yet loaded) / loading → loading placeholder
 *   - data_source:"unavailable" or parse error → degraded banner
 *   - count:0 (unknown ticker) → empty state
 *   - Normal → latest price stat block + StockChart (candle+RSI+MACD) + stats row
 *
 * Design rules:
 *   - NEVER use useLoaderData or useRevalidator — this is a zone component, not a route.
 *   - NEVER fabricate price or indicator values — only show what the gateway provides.
 *   - TA indicators (RSI / MACD / Bollinger Bands) are client-computed by StockChart
 *     from candle data via indicators.ts — no server-side TA fabrication.
 *
 * Labels: plain Vietnamese — non-technical user.
 */
import { useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import { FreshnessBadge } from "~/components/FreshnessBadge";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { StockChart } from "~/components/charts/StockChart";
import type { PricePoint } from "~/domain/market";

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/price-history/:ticker DTO
// (mirrors types in dashboard.technical.tsx for DRY reference)
// ---------------------------------------------------------------------------

interface PriceLatest {
  date: string;
  close: number;
  change_abs: number | null;
  change_pct: number | null;
}

interface PriceCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PriceHistoryDto {
  ticker: string;
  generated_at: string;
  data_source: "live" | "unavailable" | string;
  stale_served: boolean;
  count: number;
  latest: PriceLatest | null;
  candles: PriceCandle[];
  data_asof?: string | null;
}

// ---------------------------------------------------------------------------
// Type guard — exported for unit tests
// Defensive check against proxy error payloads (e.g. { error: "..." } shapes).
// ---------------------------------------------------------------------------

export function isPriceHistoryDto(value: unknown): value is PriceHistoryDto {
  return (
    value !== null &&
    typeof value === "object" &&
    "candles" in value &&
    Array.isArray((value as Record<string, unknown>)["candles"]) &&
    "count" in value
  );
}

// ---------------------------------------------------------------------------
// Period stats — exported pure helper for unit tests
// Computes high, low, and latest-session volume from a candles array.
// Skips non-trading-day poison rows (close===0 && volume===0).
// Returns null when candles is empty.
// ---------------------------------------------------------------------------

export interface PeriodStats {
  periodHigh: number;
  periodLow: number;
  latestVolume: number;
  tradingCount: number;
}

export function derivePeriodStats(candles: PriceCandle[]): PeriodStats | null {
  if (candles.length === 0) return null;
  const trading = candles.filter((c) => !(c.close === 0 && c.volume === 0));
  const displayCandles = trading.length > 0 ? trading : candles;
  const periodHigh = Math.max(...displayCandles.map((c) => c.high));
  const periodLow = Math.min(...displayCandles.map((c) => c.low));
  const latestVolume = candles[candles.length - 1]?.volume ?? 0;
  return { periodHigh, periodLow, latestVolume, tradingCount: displayCandles.length };
}

// ---------------------------------------------------------------------------
// Candle → PricePoint conversion — exported pure helper for unit tests
// ---------------------------------------------------------------------------

export function candlesToPricePoints(
  candles: PriceCandle[],
  ticker: string,
): PricePoint[] {
  return candles.map((c) => ({
    date: c.date,
    code: ticker,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TechnicalZoneProps {
  /** Stock ticker to render (e.g. "FPT", "VCB"). Must be a valid watchlist code. */
  stock: string;
  /** Chart height in pixels. Defaults to 480 (same as standalone page). */
  chartHeight?: number;
}

// ---------------------------------------------------------------------------
// Sub-component — LatestPriceStat
// Colour-coded close price + directional change indicator.
// ---------------------------------------------------------------------------

function LatestPriceStat({ latest }: { latest: PriceLatest }) {
  const hasChange =
    latest.change_abs !== null && latest.change_pct !== null;

  const isUp = (latest.change_pct ?? 0) > 0;
  const isDown = (latest.change_pct ?? 0) < 0;

  const dirColor = isUp
    ? "text-green-400"
    : isDown
      ? "text-red-400"
      : "text-slate-400";

  const arrow = isUp ? "▲" : isDown ? "▼" : "—";

  const absFormatted =
    latest.change_abs !== null
      ? latest.change_abs.toLocaleString("vi-VN", {
          signDisplay: "exceptZero",
        })
      : null;

  const pctFormatted =
    latest.change_pct !== null
      ? `${latest.change_pct > 0 ? "+" : ""}${latest.change_pct.toFixed(2)}%`
      : null;

  return (
    <div className="flex flex-wrap items-baseline gap-3">
      <span className="text-3xl font-bold text-slate-100">
        {latest.close.toLocaleString("vi-VN")}
      </span>
      {hasChange && (
        <span className={`text-lg font-semibold ${dirColor}`}>
          {arrow} {absFormatted} ({pctFormatted})
        </span>
      )}
      <span className="text-xs text-slate-500 self-center">{latest.date}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component — StatsRow
// Period high, low, latest volume, and number of trading sessions.
// ---------------------------------------------------------------------------

interface StatsRowProps {
  candles: PriceCandle[];
  count: number;
}

function StatsRow({ candles, count }: StatsRowProps) {
  if (candles.length === 0) return null;

  const ps = derivePeriodStats(candles);
  if (!ps) return null;

  const { periodHigh, periodLow, latestVolume } = ps;

  const stats = [
    {
      label: "Cao nhất kỳ",
      value: periodHigh.toLocaleString("vi-VN"),
      color: "text-green-400",
    },
    {
      label: "Thấp nhất kỳ",
      value: periodLow.toLocaleString("vi-VN"),
      color: "text-red-400",
    },
    {
      label: "KL phiên cuối",
      value: latestVolume.toLocaleString("vi-VN"),
      color: "text-slate-100",
    },
    {
      label: "Số phiên",
      value: `${count}`,
      color: "text-slate-100",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(({ label, value, color }) => (
        <div
          key={label}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 space-y-1"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className={`text-lg font-bold ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component — PriceChartSection
// Date-axis header + StockChart (candle + MA20/50 + BB + RSI + MACD).
// ---------------------------------------------------------------------------

interface PriceChartSectionProps {
  pricePoints: PricePoint[];
  candles: PriceCandle[];
  chartHeight: number;
}

function PriceChartSection({
  pricePoints,
  candles,
  chartHeight,
}: PriceChartSectionProps) {
  if (pricePoints.length === 0) return null;

  const firstDate = candles[0]?.date ?? "";
  const lastDate = candles[candles.length - 1]?.date ?? "";

  // Filter out non-trading-day poison rows for the header annotation.
  const tradingCandles = candles.filter(
    (c) => !(c.close === 0 && c.volume === 0),
  );
  const displayCandles = tradingCandles.length > 0 ? tradingCandles : candles;

  const periodHigh = Math.max(...displayCandles.map((c) => c.high));
  const periodLow = Math.min(...displayCandles.map((c) => c.low));

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{firstDate}</span>
        <span className="text-slate-600">
          Biên độ: {periodLow.toLocaleString("vi-VN")} —{" "}
          {periodHigh.toLocaleString("vi-VN")}
        </span>
        <span>{lastDate}</span>
      </div>
      {/* Reuse existing StockChart — client-only, no new dependency */}
      <StockChart prices={pricePoints} height={chartHeight} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// TechnicalZone — main component
// ---------------------------------------------------------------------------

/** Auto-refresh cadence for intraday data (5 min). */
const INTRADAY_REFRESH_MS = 300_000;

/**
 * TechnicalZone renders technical analysis for a single stock.
 *
 * Embeddable inside any Remix route without loader coupling — data is fetched
 * autonomously via useFetcher from /api/price-history/:stock?days=90.
 */
export function TechnicalZone({
  stock,
  chartHeight = 480,
}: TechnicalZoneProps) {
  const ticker = stock.toUpperCase().trim();

  // Fetcher is stable per useFetcher's contract — reference does NOT change
  // between renders from the same hook call site.
  const fetcher = useFetcher<PriceHistoryDto>();

  const loadUrl = `/api/price-history/${encodeURIComponent(ticker)}?days=90`;

  // Initial load and reload whenever the stock ticker changes.
  useEffect(() => {
    fetcher.load(loadUrl);
  }, [loadUrl]);

  // Auto-refresh on intraday SLA cadence (5 min).
  useEffect(() => {
    const id = setInterval(() => {
      // Only reload when idle — avoids queuing on slow connections.
      if (fetcher.state === "idle") {
        fetcher.load(loadUrl);
      }
    }, INTRADAY_REFRESH_MS);
    return () => clearInterval(id);
  }, [loadUrl]);

  // ── Derive display state ──────────────────────────────────────────────────

  const isLoading =
    fetcher.state === "loading" ||
    (fetcher.state === "idle" && fetcher.data === undefined);

  const dto = isPriceHistoryDto(fetcher.data) ? fetcher.data : null;

  // Degraded = fetch succeeded but upstream couldn't provide data,
  // OR the fetcher returned a non-DTO payload (gateway/proxy error).
  const isDegraded =
    !isLoading && (dto === null || dto.data_source === "unavailable");

  const count = dto?.count ?? 0;
  const isEmpty = !isLoading && !isDegraded && count === 0;

  const candles: PriceCandle[] = dto?.candles ?? [];
  const latest: PriceLatest | null = dto?.latest ?? null;
  const stale_served = dto?.stale_served ?? false;
  const data_source = dto?.data_source ?? null;
  const data_asof = dto?.data_asof ?? null;
  const generated_at = dto?.generated_at ?? new Date().toISOString();

  // Convert candles to PricePoint[] for StockChart reuse.
  const pricePoints: PricePoint[] = candlesToPricePoints(candles, ticker);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-6">
      {/* Zone header — freshness only; parent SectionCard owns title + stock subtitle */}
      <div className="flex items-center justify-end gap-4 pb-1 border-b border-slate-800">
        {dto && (
          <span className="text-xs text-slate-500 flex items-center gap-2 shrink-0">
            <FreshnessBadge dataAsof={data_asof} slaTierKey="intraday" />
            <ClientTimestamp iso={generated_at} />
          </span>
        )}
      </div>

      {/* Loading placeholder */}
      {isLoading && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm text-slate-400 animate-pulse">
            Đang tải dữ liệu giá {ticker}...
          </p>
        </div>
      )}

      {/* Stale banner — data served from cache, not live */}
      {!isLoading && stale_served && !isDegraded && (
        <div
          role="status"
          className="rounded border border-yellow-700 bg-yellow-950 px-4 py-3 text-sm text-yellow-300"
        >
          Dữ liệu giá có thể chưa được cập nhật mới nhất — đang hiển thị bản
          lưu tạm.
        </div>
      )}

      {/* Degraded banner — 502 / network / data_source:unavailable */}
      {isDegraded && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không tải được dữ liệu giá cho {ticker}
        </div>
      )}

      {/* Empty state — valid ticker, but no price history yet */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Chưa có dữ liệu giá cho {ticker}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Mã cổ phiếu này chưa có lịch sử giá trong hệ thống.
          </p>
        </div>
      )}

      {/* Main content — rendered only when we have candle + latest data */}
      {!isLoading && !isDegraded && !isEmpty && latest && (
        <>
          {/* Latest price stat block with live badge */}
          <section className="rounded-lg border border-slate-700 bg-slate-800 px-5 py-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-bold text-blue-400">
                {ticker}
              </span>
              {data_source === "live" && (
                <span className="rounded bg-green-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-400">
                  Live
                </span>
              )}
            </div>
            <LatestPriceStat latest={latest} />
          </section>

          {/* Price chart — reuses existing StockChart (lightweight-charts, no new dep).
           * StockChart client-computes MA20, MA50, Bollinger Bands (pane 0),
           * RSI(14) (pane 1), and MACD(12,26,9) (pane 2) from candle data.
           * NOTE: Do NOT add server-side TA value display here until the gateway
           * /ta path-rewrite is fixed (separate task). */}
          <PriceChartSection
            pricePoints={pricePoints}
            candles={candles}
            chartHeight={chartHeight}
          />

          {/* Stats row — period high, low, latest session volume, trading day count */}
          <StatsRow candles={candles} count={count} />
        </>
      )}
    </div>
  );
}
