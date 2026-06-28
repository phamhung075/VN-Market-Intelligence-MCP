/**
 * ReputationZone — stock-scoped Corporate Reputation card for the Analysis Hub.
 *
 * Data source: GET /api/reputation (full-universe, no per-code param).
 * Filter strategy: CLIENT-SIDE — fetches all leaderboard entries and
 *   filters client-side to `props.stock` (entry.code === stock).
 *
 * Usage:
 *   <ReputationZone stock="FPT" />
 *
 * The component is self-contained: it calls useFetcher to load /api/reputation
 * on mount and renders only the entry matching `stock`. The parent route
 * (dashboard.analysis.tsx) does NOT need to pre-fetch this data.
 *
 * Exported pure helpers (for unit tests):
 *   filterReputationEntry — find a single entry by code
 *   filterReputationHistory — extract history points for a code
 */
import { useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import {
  mapTrend,
  mapRiskLevel,
  getRiskBadgeClass,
} from "~/routes/dashboard.reputation";
import type {
  ReputationEntry,
  HistoryPoint,
} from "~/routes/dashboard.reputation";

// ---------------------------------------------------------------------------
// Re-export domain types so test files can import from this file
// ---------------------------------------------------------------------------

export type { ReputationEntry, HistoryPoint };

// ---------------------------------------------------------------------------
// Exported pure helpers — tested separately without DOM
// ---------------------------------------------------------------------------

/**
 * Find a single ReputationEntry by its ticker code (case-sensitive).
 * Returns undefined when the stock is not present in the leaderboard.
 */
export function filterReputationEntry(
  leaderboard: ReputationEntry[],
  stock: string,
): ReputationEntry | undefined {
  return leaderboard.find((e) => e.code === stock);
}

/**
 * Extract history points for a given ticker from the history map.
 * Returns [] when the stock has no history.
 */
export function filterReputationHistory(
  history: Record<string, HistoryPoint[]>,
  stock: string,
): HistoryPoint[] {
  return history[stock] ?? [];
}

// ---------------------------------------------------------------------------
// Raw DTO shape expected from /api/reputation (same as upstream contract)
// ---------------------------------------------------------------------------

interface ReputationApiDto {
  leaderboard: ReputationEntry[];
  history: Record<string, HistoryPoint[]>;
  generatedAt?: string;
  asOf?: string | null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Small metric chip used inside the card. */
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

/** Mini sparkline for the stock's reputation history. */
function ReputationSparkline({ points }: { points: HistoryPoint[] }) {
  if (points.length === 0) {
    return <span className="text-xs text-slate-600">—</span>;
  }
  const recent = points.slice(-10);
  const max = Math.max(...recent.map((p) => p.score), 1);
  return (
    <svg
      width={recent.length * 6}
      height={24}
      aria-hidden="true"
      className="inline-block align-middle"
    >
      {recent.map((p, i) => {
        const barH = Math.max(2, Math.round((p.score / max) * 22));
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

export interface ReputationZoneProps {
  /** Stock ticker code, e.g. "FPT". Case-sensitive — must match leaderboard. */
  stock: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ReputationZone — renders the reputation card for a single stock.
 *
 * Loading strategy: useFetcher.load("/api/reputation") on mount.
 * Filter: client-side — entry.code === stock.
 */
export function ReputationZone({ stock }: ReputationZoneProps) {
  const fetcher = useFetcher<ReputationApiDto>();

  // Trigger load on mount (and whenever stock changes, re-load).
  const { load } = fetcher;
  useEffect(() => {
    load("/api/reputation");
  }, [load]);

  const loading = fetcher.state !== "idle" || !fetcher.data;
  const rawData = fetcher.data as ReputationApiDto | undefined;

  const entry =
    rawData?.leaderboard !== undefined
      ? filterReputationEntry(rawData.leaderboard, stock)
      : undefined;

  const history =
    rawData?.history !== undefined
      ? filterReputationHistory(rawData.history, stock)
      : [];

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-6 text-center">
        <p className="text-xs text-slate-500 animate-pulse">
          Đang tải dữ liệu uy tín…
        </p>
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────
  if (entry === undefined) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-6 text-center">
        <p className="text-xs text-slate-500">
          Chưa có dữ liệu điểm uy tín cho mã {stock}.
        </p>
      </div>
    );
  }

  // ── Entry found ──────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-100">Uy tín</span>
          <span
            className={getRiskBadgeClass(entry.riskLevel)}
            aria-label={`Mức rủi ro: ${mapRiskLevel(entry.riskLevel)}`}
          >
            {mapRiskLevel(entry.riskLevel)}
          </span>
        </div>
        <span className="text-xs text-slate-500">{mapTrend(entry.trend)}</span>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-2">
        <StatChip label="Điểm uy tín" value={entry.score} />
        <StatChip label="Xu hướng" value={mapTrend(entry.trend)} />
        <StatChip label="Mức rủi ro" value={mapRiskLevel(entry.riskLevel)} />
      </div>

      {/* History sparkline */}
      {history.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-500">Lịch sử:</span>
          <ReputationSparkline points={history} />
          <span className="text-[11px] text-slate-600">
            {history.length} điểm dữ liệu
          </span>
        </div>
      )}

      {/* Framing note */}
      <p className="text-[10px] text-slate-600 leading-relaxed">
        Điểm 0–100. An toàn &gt;60 · Theo dõi 40–60 · Cảnh báo 20–40 · Nguy hiểm &lt;20.
        Tín hiệu cảnh báo sớm — không phải khuyến nghị đầu tư.
      </p>
    </div>
  );
}
