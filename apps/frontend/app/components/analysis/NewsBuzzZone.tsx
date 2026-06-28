/**
 * NewsBuzzZone — stock-scoped News Buzz card for the Analysis Hub.
 *
 * Data source: GET /api/news-buzz (full-universe, 7-day rolling, no per-code param).
 * Filter strategy: CLIENT-SIDE — fetches all leaderboard entries and
 *   filters client-side to `props.stock` (entry.code === stock).
 *
 * Usage:
 *   <NewsBuzzZone stock="VCB" />
 *
 * The component is self-contained: it calls useFetcher to load /api/news-buzz
 * on mount and renders only the entry matching `stock`. The parent route
 * (dashboard.analysis.tsx) does NOT need to pre-fetch this data.
 *
 * Exported pure helpers (for unit tests):
 *   filterNewsBuzzEntry — find a single entry by code
 */
import { useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import {
  getNegativityTier,
  getNegativityBadgeClass,
  getNegativityLabel,
  formatNegativeRatioPct,
} from "~/routes/dashboard.news-buzz";
import type { NewsBuzzEntry } from "~/routes/dashboard.news-buzz";

// ---------------------------------------------------------------------------
// Re-export domain types so test files can import from this file
// ---------------------------------------------------------------------------

export type { NewsBuzzEntry };

// ---------------------------------------------------------------------------
// Exported pure helper — tested separately without DOM
// ---------------------------------------------------------------------------

/**
 * Find a single NewsBuzzEntry by its ticker code (case-sensitive).
 * Returns undefined when the stock is not present in the leaderboard.
 */
export function filterNewsBuzzEntry(
  leaderboard: NewsBuzzEntry[],
  stock: string,
): NewsBuzzEntry | undefined {
  return leaderboard.find((e) => e.code === stock);
}

// ---------------------------------------------------------------------------
// Raw DTO shape expected from /api/news-buzz
// ---------------------------------------------------------------------------

interface NewsBuzzApiDto {
  leaderboard: NewsBuzzEntry[];
  generatedAt?: string;
  windowStart?: string | null;
  windowEnd?: string | null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Metric chip used inside the card. */
function StatChip({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col items-center rounded border border-slate-700 bg-slate-900 px-3 py-1.5 min-w-[72px]">
      <span className="text-base font-bold text-slate-100">{value}</span>
      <span className="text-[10px] text-slate-500">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NewsBuzzZoneProps {
  /** Stock ticker code, e.g. "VCB". Case-sensitive — must match leaderboard. */
  stock: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * NewsBuzzZone — renders the news-buzz card for a single stock.
 *
 * Loading strategy: useFetcher.load("/api/news-buzz") on mount.
 * Filter: client-side — entry.code === stock.
 */
export function NewsBuzzZone({ stock }: NewsBuzzZoneProps) {
  const fetcher = useFetcher<NewsBuzzApiDto>();

  // Trigger load on mount (and whenever load reference changes).
  const { load } = fetcher;
  useEffect(() => {
    load("/api/news-buzz");
  }, [load]);

  const loading = fetcher.state !== "idle" || !fetcher.data;
  const rawData = fetcher.data as NewsBuzzApiDto | undefined;

  const entry =
    rawData?.leaderboard !== undefined
      ? filterNewsBuzzEntry(rawData.leaderboard, stock)
      : undefined;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-6 text-center">
        <p className="text-xs text-slate-500 animate-pulse">
          Đang tải dữ liệu tin tức…
        </p>
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────
  if (entry === undefined) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-6 text-center">
        <p className="text-xs text-slate-500">
          Chưa có dữ liệu tin tức cho mã {stock} trong cửa sổ 7 ngày.
        </p>
      </div>
    );
  }

  // ── Entry found ──────────────────────────────────────────────────────────
  const tier = getNegativityTier(entry.negativeRatio);
  const ratioPct = formatNegativeRatioPct(entry.negativeRatio);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-slate-100">Tin tức 7 ngày</span>
        <span
          className={getNegativityBadgeClass(tier)}
          aria-label={`Mức tiêu cực: ${getNegativityLabel(tier)}`}
        >
          {ratioPct} {getNegativityLabel(tier)}
        </span>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-2">
        <StatChip label="Lượt nhắc" value={entry.mentions} />
        <StatChip label="Tin tiêu cực" value={entry.negative} />
        <StatChip label="Nguồn tin" value={entry.sources} />
        <StatChip label="Giờ hoạt động" value={`${entry.hoursActive}h`} />
      </div>

      {/* Ratio bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>Tỷ lệ tiêu cực</span>
          <span>{ratioPct}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-700">
          <div
            className={`h-1.5 rounded-full transition-all ${
              tier === "danger"
                ? "bg-red-500"
                : tier === "warning"
                  ? "bg-yellow-500"
                  : "bg-green-500"
            }`}
            style={{ width: ratioPct }}
          />
        </div>
      </div>

      {/* Framing note */}
      <p className="text-[10px] text-slate-600 leading-relaxed">
        Cửa sổ 7 ngày. Mức tiêu cực: Thấp &lt;30% · Trung bình 30–60% · Cao ≥60%.
        Tín hiệu cảnh báo sớm — không phải khuyến nghị đầu tư.
      </p>
    </div>
  );
}
