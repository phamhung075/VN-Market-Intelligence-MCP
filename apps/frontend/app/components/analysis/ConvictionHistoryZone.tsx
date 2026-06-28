/**
 * ConvictionHistoryZone — stock-scoped AI Conviction card for the Analysis Hub.
 *
 * Data source: GET /api/conviction-history?symbol=<stock>
 * Filter strategy: NATIVE — the API accepts ?symbol= and returns data scoped
 *   to that single ticker. No client-side filtering needed.
 *
 * Usage:
 *   <ConvictionHistoryZone stock="HPG" />
 *
 * The component is self-contained: it calls useFetcher to load
 * /api/conviction-history?symbol=${stock} on mount. The parent route
 * (dashboard.analysis.tsx) does NOT need to pre-fetch this data.
 *
 * Exported pure helpers (for unit tests):
 *   pickStockConvictionRow — extract the single ConvictionRow for the stock
 *   pickStockSeries        — extract the time series for the stock
 */
import { useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import {
  formatScore,
  signalLabel,
  signalColorClass,
  isStale,
  partitionSnapshot,
} from "~/routes/dashboard.conviction-history";
import type {
  ConvictionRow,
  ConvictionSummary,
} from "~/routes/dashboard.conviction-history";

// ---------------------------------------------------------------------------
// Re-export domain types so test files can import from this file
// ---------------------------------------------------------------------------

export type { ConvictionRow, ConvictionSummary };

// ---------------------------------------------------------------------------
// Raw DTO shape expected from /api/conviction-history?symbol=<stock>
// When filtered by symbol the endpoint returns the same DTO shape but with
// snapshot and series scoped to the single requested ticker.
// ---------------------------------------------------------------------------

interface ConvictionHistoryApiDto {
  generatedAt: string;
  tradingDate: string;
  stale?: boolean;
  staleByDays?: number;
  snapshot: ConvictionRow[];
  series: Record<string, ConvictionRow[]>;
  summary: ConvictionSummary;
  count: number;
}

// ---------------------------------------------------------------------------
// Exported pure helpers — tested separately without DOM
// ---------------------------------------------------------------------------

/**
 * Extract the ConvictionRow for the requested stock from the snapshot.
 * The API already filters server-side, so this is a safety guard for
 * edge cases where the snapshot contains multiple rows.
 */
export function pickStockConvictionRow(
  snapshot: ConvictionRow[],
  stock: string,
): ConvictionRow | undefined {
  return snapshot.find((r) => r.symbol === stock);
}

/**
 * Extract the time series for the requested stock.
 * Returns [] when the stock has no history.
 */
export function pickStockSeries(
  series: Record<string, ConvictionRow[]>,
  stock: string,
): ConvictionRow[] {
  return series[stock] ?? [];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Signal badge — matches the standalone page's badge style. */
function SignalBadge({ signal }: { signal: string }) {
  const { badge } = signalColorClass(signal);
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge}`}
    >
      {signalLabel(signal)}
    </span>
  );
}

/** Score bar — horizontal fill from 0–1. */
function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-right text-xs font-mono tabular-nums text-slate-300">
        {formatScore(score)}
      </span>
      <div className="h-1.5 w-20 rounded-full bg-slate-700">
        <div
          className="h-1.5 rounded-full bg-blue-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Mini sparkline for conviction score history. */
function ConvictionSparkline({ points }: { points: ConvictionRow[] }) {
  if (points.length === 0) {
    return <span className="text-xs text-slate-600">—</span>;
  }
  const recent = points.slice(-10);
  const max = Math.max(...recent.map((p) => p.peakScore), 0.01);
  return (
    <svg
      width={recent.length * 6}
      height={24}
      aria-hidden="true"
      className="inline-block align-middle"
    >
      {recent.map((p, i) => {
        const barH = Math.max(2, Math.round((p.peakScore / max) * 22));
        return (
          <rect
            key={i}
            x={i * 6}
            y={24 - barH}
            width={5}
            height={barH}
            rx={1}
            className="fill-blue-500 opacity-70"
          />
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ConvictionHistoryZoneProps {
  /** Stock ticker code, e.g. "HPG". Passed as ?symbol= to the API. */
  stock: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ConvictionHistoryZone — renders the AI conviction card for a single stock.
 *
 * Loading strategy: useFetcher.load(`/api/conviction-history?symbol=${stock}`)
 *   on mount (or when stock changes).
 * Filter: NATIVE — API returns only the requested symbol's data.
 */
export function ConvictionHistoryZone({ stock }: ConvictionHistoryZoneProps) {
  const fetcher = useFetcher<ConvictionHistoryApiDto>();

  // Trigger load on mount or when stock changes.
  const { load } = fetcher;
  useEffect(() => {
    load(`/api/conviction-history?symbol=${encodeURIComponent(stock)}`);
  }, [load, stock]);

  const loading = fetcher.state !== "idle" || !fetcher.data;
  const rawData = fetcher.data as ConvictionHistoryApiDto | undefined;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-6 text-center">
        <p className="text-xs text-slate-500 animate-pulse">
          Đang tải dữ liệu niềm tin AI…
        </p>
      </div>
    );
  }

  const tradingDate = rawData?.tradingDate ?? "";
  const snapshot = rawData?.snapshot ?? [];
  const series = rawData?.series ?? {};
  const stale = rawData?.stale ?? false;
  const staleByDays = rawData?.staleByDays ?? 0;

  const isEmpty = snapshot.length === 0 || !tradingDate;

  // ── Empty ────────────────────────────────────────────────────────────────
  if (isEmpty) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-6 text-center">
        <p className="text-xs text-slate-500">
          Chưa có dữ liệu niềm tin AI cho mã {stock}.
        </p>
      </div>
    );
  }

  const { fresh, stale: staleRows } = partitionSnapshot(snapshot, tradingDate);
  const row = pickStockConvictionRow(snapshot, stock);
  const seriesPoints = pickStockSeries(series, stock);

  // Determine which row to show (prefer fresh, fall back to stale)
  const displayRow =
    fresh.length > 0
      ? fresh[0]
      : staleRows.length > 0
        ? staleRows[0]
        : row;

  if (displayRow === undefined) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-6 text-center">
        <p className="text-xs text-slate-500">
          Chưa có dữ liệu niềm tin AI cho mã {stock}.
        </p>
      </div>
    );
  }

  const isFresh = !isStale(displayRow.date, tradingDate);

  // ── Data ─────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-3">
      {/* Stale data warning */}
      {stale && (
        <div
          role="status"
          className="rounded border border-amber-700 bg-amber-950 px-3 py-2 text-xs text-amber-300"
        >
          Dữ liệu đã cũ {staleByDays} ngày
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-100">Niềm tin AI</span>
          {!isFresh && (
            <span className="inline-block rounded bg-amber-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400 border border-amber-700">
              cũ
            </span>
          )}
        </div>
        <SignalBadge signal={displayRow.signal} />
      </div>

      {/* Score */}
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-slate-500">Điểm tin cậy:</span>
        <ScoreBar score={displayRow.peakScore} />
      </div>

      {/* Date */}
      <p className="text-[11px] text-slate-500">
        Ngày:{" "}
        <span className="text-slate-400 font-medium">{displayRow.date}</span>
        {tradingDate && displayRow.date !== tradingDate && (
          <span className="ml-2 text-amber-500">
            (ngày giao dịch gần nhất: {tradingDate})
          </span>
        )}
      </p>

      {/* Sparkline */}
      {seriesPoints.length > 1 && (
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-500">Xu hướng:</span>
          <ConvictionSparkline points={seriesPoints} />
          <span className="text-[11px] text-slate-600">
            {seriesPoints.length} ngày
          </span>
        </div>
      )}

      {/* Framing note */}
      <p className="text-[10px] text-slate-600 leading-relaxed">
        Điểm tin cậy 0–1: AI tin rằng xu hướng sẽ xảy ra. Tăng / Giảm / Trung lập / Không rõ.
        Không phải khuyến nghị đầu tư.
      </p>
    </div>
  );
}
