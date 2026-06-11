/**
 * /dashboard/technical — Giá & Phân Tích Kỹ Thuật.
 *
 * Data source: GET /api/price-history/:ticker?days=N (frontend proxy → mcp-server :3000).
 * The proxy route is api.price-history.$ticker.tsx.
 *
 * Ticker selected via ?stock=TICKER query param (mirrors dashboard.analysis.tsx convention).
 * Default: first active watchlist ticker (VNM) when ?stock= is absent.
 *
 * Response shape (GET /api/price-history/:ticker):
 *   { ticker, generated_at: ISO, data_source: "live"|"unavailable",
 *     stale_served: boolean, count: number,
 *     latest: { date, close, change_abs: number|null, change_pct: number|null },
 *     candles: [ { date, open, high, low, close, volume } ] }
 *
 * Honest states:
 *   - data_source:"unavailable" / 502 / network failure → degraded banner "Không tải được dữ liệu giá"
 *   - count:0 (unknown ticker) → empty state "Chưa có dữ liệu giá cho {ticker}"
 *   - Loader never throws — all errors are non-fatal.
 *
 * TA indicators (RSI / MACD / Bollinger Bands):
 *   TODO: Wire TA indicators from /api/ta/:ticker once the gateway /ta path-rewrite
 *   is fixed (separate task). The StockChart component already computes these client-side
 *   from candle data using the indicators.ts helpers — they will render automatically.
 *   NOTE: Do NOT fabricate RSI/MACD values from server — chart client-computes them.
 *
 * Labels: plain Vietnamese — non-technical user.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { PageHeader } from "~/components/PageHeader";
import { StockChart } from "~/components/charts/StockChart";
import { WATCHLIST_STOCKS } from "~/domain/market";
import type { PricePoint } from "~/domain/market";

export const meta: MetaFunction = () => [
  { title: "Kỹ Thuật — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/price-history/:ticker DTO
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
}

// ---------------------------------------------------------------------------
// Loader types
// ---------------------------------------------------------------------------

export interface LoaderData {
  ticker: string;
  generated_at: string;
  data_source: string | null;
  stale_served: boolean;
  count: number;
  latest: PriceLatest | null;
  candles: PriceCandle[];
  /** Converted to PricePoint[] for StockChart reuse */
  pricePoints: PricePoint[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// Pure fetch helper — exported for unit testing
// ---------------------------------------------------------------------------

/**
 * Core fetch-and-parse logic — exported for unit tests.
 * Pure async function, no Remix dependency.
 */
export async function fetchPriceHistory(
  origin: string,
  ticker: string,
  days = 90,
): Promise<Omit<LoaderData, "ticker" | "generated_at">> {
  let data_source: string | null = null;
  let stale_served = false;
  let count = 0;
  let latest: PriceLatest | null = null;
  let candles: PriceCandle[] = [];
  let pricePoints: PricePoint[] = [];
  let error: string | null = null;

  try {
    const response = await fetch(
      `${origin}/api/price-history/${encodeURIComponent(ticker)}?days=${days}`,
      { headers: { Accept: "application/json" } },
    );

    if (!response.ok) {
      error = `Upstream returned ${response.status} ${response.statusText}`;
    } else {
      const raw = (await response.json()) as unknown;
      if (
        raw !== null &&
        typeof raw === "object" &&
        "candles" in raw &&
        "count" in raw
      ) {
        const dto = raw as PriceHistoryDto;
        data_source =
          typeof dto.data_source === "string" ? dto.data_source : null;
        stale_served = dto.stale_served === true;
        count = typeof dto.count === "number" ? dto.count : 0;
        latest =
          dto.latest !== null && typeof dto.latest === "object"
            ? dto.latest
            : null;
        candles = Array.isArray(dto.candles) ? dto.candles : [];
        // Convert candles → PricePoint[] for StockChart reuse
        pricePoints = candles.map((c) => ({
          date: c.date,
          code: ticker,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        }));
      } else {
        error = "Unexpected response shape from /api/price-history";
      }
    }
  } catch (err) {
    error =
      err instanceof Error
        ? err.message
        : "Không thể kết nối tới máy chủ giá";
  }

  return { data_source, stale_served, count, latest, candles, pricePoints, error };
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

// Active tickers only — read from SSOT (no hardcode)
const ACTIVE_TICKERS = WATCHLIST_STOCKS.filter((s) => s.active).map(
  (s) => s.ticker,
);

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const stockParam = url.searchParams.get("stock")?.toUpperCase().trim();

  // Default to first active watchlist ticker if no ?stock= param
  const ticker =
    stockParam && stockParam.length > 0
      ? stockParam
      : ACTIVE_TICKERS[0] ?? "VNM";

  const generated_at = new Date().toISOString();

  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const data = await fetchPriceHistory(origin, ticker, 90);

  return json<LoaderData>({
    ticker,
    generated_at,
    ...data,
  });
}

// ---------------------------------------------------------------------------
// TickerSwitcher — compact select or links row
// ---------------------------------------------------------------------------

function TickerSwitcher({ currentTicker }: { currentTicker: string }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ACTIVE_TICKERS.map((t) => (
        <Link
          key={t}
          to={`?stock=${t}`}
          className={`rounded px-2 py-0.5 text-xs font-mono font-semibold transition-colors ${
            t === currentTicker
              ? "bg-blue-600 text-white"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
          }`}
        >
          {t}
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LatestPriceStat — close + change, colour-coded green/red
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
// StatsRow — period high, low, volume, trading days
// ---------------------------------------------------------------------------

interface StatsRowProps {
  candles: PriceCandle[];
  count: number;
}

function StatsRow({ candles, count }: StatsRowProps) {
  if (candles.length === 0) return null;

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const periodHigh = Math.max(...highs);
  const periodLow = Math.min(...lows);
  const latestVolume = candles[candles.length - 1]?.volume ?? 0;

  void closes; // available for future use

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
// PriceChartSection — date axis endpoints + min/max annotation
// ---------------------------------------------------------------------------

interface PriceChartSectionProps {
  pricePoints: PricePoint[];
  candles: PriceCandle[];
}

function PriceChartSection({ pricePoints, candles }: PriceChartSectionProps) {
  if (pricePoints.length === 0) return null;

  const firstDate = candles[0]?.date ?? "";
  const lastDate = candles[candles.length - 1]?.date ?? "";

  const closes = candles.map((c) => c.close);
  const periodHigh = Math.max(...candles.map((c) => c.high));
  const periodLow = Math.min(...candles.map((c) => c.low));

  void closes; // referenced in StatsRow above

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{firstDate}</span>
        <span className="text-slate-600">
          Biên độ: {periodLow.toLocaleString("vi-VN")} — {periodHigh.toLocaleString("vi-VN")}
        </span>
        <span>{lastDate}</span>
      </div>
      {/* Reuse existing StockChart component — no new dep */}
      <StockChart prices={pricePoints} height={480} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TechnicalPage() {
  const {
    ticker,
    generated_at,
    stale_served,
    data_source,
    count,
    latest,
    candles,
    pricePoints,
    error,
  } = useLoaderData<typeof loader>();

  const isDegraded = !!error || data_source === "unavailable";
  const isEmpty = !isDegraded && count === 0;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Giá & Phân Tích Kỹ Thuật"
        subtitle={`Biểu đồ giá và chỉ số kỹ thuật — ${ticker}`}
        actions={
          <span className="text-xs text-slate-500">
            <ClientTimestamp iso={generated_at} />
          </span>
        }
      />

      {/* Ticker switcher */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Chọn mã cổ phiếu
        </h2>
        <TickerSwitcher currentTicker={ticker} />
      </section>

      {/* Stale banner */}
      {stale_served && !isDegraded && (
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
          Không tải được dữ liệu giá
          {error ? ` — ${error}` : ""}
        </div>
      )}

      {/* Empty state — unknown ticker (count:0, no error) */}
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

      {/* Main content — only shown when we have candle data */}
      {!isDegraded && !isEmpty && latest && (
        <>
          {/* Prominent latest price stat */}
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

          {/* Price chart — reuses existing StockChart (lightweight-charts, no new dep) */}
          <PriceChartSection pricePoints={pricePoints} candles={candles} />

          {/* Stats row — period high, low, volume, trading days */}
          <StatsRow candles={candles} count={count} />

          {/*
           * TODO: TA indicator panels (RSI / MACD / Bollinger Bands).
           * The StockChart above already client-computes these via indicators.ts.
           * A separate server-side TA indicator section (e.g. RSI gauge, MACD histogram
           * summary) requires the gateway /ta path-rewrite to be fixed (separate task).
           * Do NOT fabricate RSI/MACD values here — only show what the gateway provides.
           */}
        </>
      )}
    </div>
  );
}
