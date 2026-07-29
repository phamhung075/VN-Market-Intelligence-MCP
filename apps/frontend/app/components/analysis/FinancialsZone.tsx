/**
 * FinancialsZone — stock-scoped financial metrics panel.
 *
 * Accepts a `stock` (ticker code) prop.
 * Fetches GET /api/financials (full-universe endpoint — NO per-code param).
 * Filters client-side: rows where row.code === stock (exact match on `code` field).
 *
 * Data facts inherited from api.financials.tsx:
 *   - nim and npl are NULL for all rows — NOT rendered.
 *   - eps can be legitimately 0 → render "0", only null → "—".
 *   - Full-universe endpoint; client-side filter only; no query param forwarded.
 *
 * DJ-GATE-2: FE-AHUB-W3-FINANCIALS-ZONE
 * Sprint: FRONTEND-ANALYSIS-HUB-CONSOLIDATION
 */
import { useFetcher } from "@remix-run/react";
import { useEffect } from "react";
import type { FinancialsRow } from "~/routes/dashboard.financials";
import {
  formatNum,
  formatPct1,
} from "~/routes/dashboard.financials";
import { FreshnessBadge } from "~/components/FreshnessBadge";

// ---------------------------------------------------------------------------
// Local type — minimal slice of the /api/financials payload used here
// ---------------------------------------------------------------------------

interface FinancialsPayload {
  generatedAt: string;
  rows: FinancialsRow[];
}

// ---------------------------------------------------------------------------
// Exported pure helper — testable without Remix context
// ---------------------------------------------------------------------------

/**
 * Filter a full financials row array to the single row matching `stockCode`.
 * Comparison is exact — codes in the dataset are uppercase (e.g. "FPT", "VCB").
 * Returns null when no matching row is found.
 *
 * CLIENT-SIDE FILTER FIELD: `code` (FinancialsRow.code)
 */
export function findFinancialsRow(
  rows: FinancialsRow[],
  stockCode: string
): FinancialsRow | null {
  return rows.find((r) => r.code === stockCode) ?? null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="text-sm font-medium tabular-nums text-slate-100">
        {value}
      </span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Đang tải dữ liệu tài chính"
      className="rounded-lg border border-slate-700 bg-slate-900 p-4 animate-pulse"
    >
      <div className="h-3 w-28 rounded bg-slate-700 mb-4" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-2 w-14 rounded bg-slate-700" />
            <div className="h-4 w-20 rounded bg-slate-800" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FinancialsZoneProps {
  /** Stock ticker code, e.g. "FPT". Must match FinancialsRow.code exactly. */
  stock: string;
}

// ---------------------------------------------------------------------------
// FinancialsZone
// ---------------------------------------------------------------------------

/**
 * Renders the financial metrics for a single stock code.
 *
 * Mount behaviour: triggers one GET /api/financials load.
 * Stock change: re-filters the already-loaded payload — no re-fetch needed
 * (the endpoint is full-universe; filtering is always client-side).
 */
export function FinancialsZone({ stock }: FinancialsZoneProps) {
  const fetcher = useFetcher<FinancialsPayload>();

  // Fetch the full-universe payload once on mount.
  // We intentionally omit `fetcher` from deps — the load is a one-shot
  // bootstrap; stock changes only affect the client-side filter below.
  useEffect(() => {
    fetcher.load("/api/financials");
  }, []);

  // Show skeleton while the initial load is in flight or not yet started.
  if (fetcher.state !== "idle" || !fetcher.data) {
    return <LoadingSkeleton />;
  }

  // Client-side filter: code field exact match.
  const row = findFinancialsRow(fetcher.data.rows ?? [], stock);

  // No row found for this stock in the dataset.
  if (!row) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-6 text-center">
        <p className="text-sm text-slate-500">
          Không có dữ liệu tài chính cho mã{" "}
          <span className="font-mono font-semibold text-slate-300">{stock}</span>.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Mã này chưa có trong tập dữ liệu định giá.
        </p>
      </div>
    );
  }

  const generatedAt = fetcher.data.generatedAt ?? null;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Định giá &amp; Cơ bản
          </span>
          <span className="text-xs text-slate-600 tabular-nums">
            Kỳ: {row.period}
          </span>
        </div>
        <FreshnessBadge dataAsof={generatedAt} slaTierKey="weekly" />
      </div>

      {/* Metric grid — 11 metrics; nim/npl intentionally omitted */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        <MetricPair label="Doanh thu (tỷ)" value={formatNum(row.revenueBn)} />
        <MetricPair label="Tăng trưởng DT" value={formatPct1(row.revenueYoy)} />
        <MetricPair label="LN ròng (tỷ)" value={formatNum(row.netProfitBn)} />
        <MetricPair label="Tăng trưởng LN" value={formatPct1(row.netProfitYoy)} />
        <MetricPair
          label="EPS"
          value={
            row.eps === null || row.eps === undefined ? "—" : formatNum(row.eps)
          }
        />
        <MetricPair label="P/E" value={formatNum(row.pe)} />
        <MetricPair label="P/B" value={formatNum(row.pb)} />
        <MetricPair label="ROE (%)" value={formatPct1(row.roe)} />
        <MetricPair label="ROA (%)" value={formatPct1(row.roa)} />
        <MetricPair label="Nợ/VCSH" value={formatNum(row.debtToEquity)} />
        <MetricPair label="Biên LN ròng" value={formatPct1(row.netProfitMargin)} />
      </div>

      {/* Honest framing note */}
      <p className="text-[10px] text-slate-600 leading-relaxed">
        NIM/NPL không có trong bộ dữ liệu này. P/E = 0 hoặc trống có thể nghĩa là chưa công bố hoặc không áp dụng.
      </p>
    </div>
  );
}
