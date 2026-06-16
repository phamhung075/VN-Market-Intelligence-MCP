/**
 * /dashboard/fed-rates — Lãi suất Fed Mỹ (US Federal Reserve Rates).
 *
 * Data source: GET /api/fed-rates (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.fed-rates.tsx, mirroring the api.financials.tsx precedent.
 *
 * Endpoint contract (GET /api/fed-rates) — VERIFIED live 2026-06-09:
 *   {
 *     generatedAt: string (ISO),
 *     asOf: string | null,
 *     effr: number | null,       // latest EFFR %
 *     iorb: number | null,       // latest IORB %
 *     spread: number | null,     // latest EFFR-IORB % (may carry float noise; ROUND for display)
 *     trend30d: "widening" | "narrowing" | "stable" | null,
 *     sampleCount: number,
 *     series: FedRatesRow[],     // ascending by date
 *   }
 *
 * Empty-state: sampleCount === 0, series = []. Page renders honest empty-state.
 *
 * Named exports (for unit tests):
 *   fetchFedRatesData, formatSpread, formatRate, mapTrend30d, formatDate
 *
 * Decision journal (DJ-GATE-1): New read-only dashboard page (TASK17-PAGE17).
 * Named-export helper pattern: Remix strips loader in jsdom; named helpers bypass that.
 * No query params forwarded — full-window endpoint.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { safeFetch } from "~/lib/api/fetchUtils";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Lãi suất Fed Mỹ — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/fed-rates live payload
// ---------------------------------------------------------------------------

export interface FedRatesRow {
  date: string;
  effr: number | null;
  iorb: number | null;
  spread: number | null;
}

export type Trend30d = "widening" | "narrowing" | "stable" | null;

export interface FedRatesDto {
  generatedAt: string;
  asOf: string | null;
  effr: number | null;
  iorb: number | null;
  spread: number | null;
  trend30d: Trend30d;
  sampleCount: number;
  series: FedRatesRow[];
}

// ---------------------------------------------------------------------------
// LoaderData
// ---------------------------------------------------------------------------

export interface LoaderData {
  generatedAt: string;
  asOf: string | null;
  effr: number | null;
  iorb: number | null;
  spread: number | null;
  trend30d: Trend30d;
  sampleCount: number;
  series: FedRatesRow[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Format a rate value (EFFR or IORB) to 2 decimal places with "%" suffix.
 * null → "—".
 */
export function formatRate(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n.toFixed(2)}%`;
}

/**
 * Format a spread value to 2 decimal places with "%" suffix.
 * Rounds to eliminate float noise (e.g. -0.0299999 → -0.03).
 * null → "—".
 */
export function formatSpread(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const rounded = Math.round(n * 100) / 100;
  return `${rounded.toFixed(2)}%`;
}

/**
 * Map trend30d string value to Vietnamese display label.
 * "widening"  → "Đang nới rộng"
 * "narrowing" → "Đang thu hẹp"
 * "stable"    → "Ổn định"
 * null / unknown → "—"
 */
export function mapTrend30d(trend: Trend30d): string {
  if (trend === "widening") return "Đang nới rộng";
  if (trend === "narrowing") return "Đang thu hẹp";
  if (trend === "stable") return "Ổn định";
  return "—";
}

/**
 * Format an ISO date string to Vietnamese short date (DD/MM/YYYY).
 * Invalid or empty → original string.
 */
export function formatDate(iso: string): string {
  if (!iso) return iso;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// parseFedRatesDto — named parse function for safeFetch
// ---------------------------------------------------------------------------

function parseFedRatesDto(raw: unknown): FedRatesDto {
  if (raw === null) {
    return {
      generatedAt: new Date().toISOString(),
      asOf: null,
      effr: null,
      iorb: null,
      spread: null,
      trend30d: null,
      sampleCount: 0,
      series: [],
    };
  }
  if (
    typeof raw !== "object" ||
    !("sampleCount" in raw) ||
    !("series" in raw)
  ) {
    throw new Error("Unexpected response shape from /api/fed-rates");
  }
  const dto = raw as FedRatesDto;
  return {
    generatedAt: typeof dto.generatedAt === "string" ? dto.generatedAt : new Date().toISOString(),
    asOf: typeof dto.asOf === "string" ? dto.asOf : null,
    effr: typeof dto.effr === "number" ? dto.effr : null,
    iorb: typeof dto.iorb === "number" ? dto.iorb : null,
    spread: typeof dto.spread === "number" ? dto.spread : null,
    trend30d:
      dto.trend30d === "widening" ||
      dto.trend30d === "narrowing" ||
      dto.trend30d === "stable"
        ? dto.trend30d
        : null,
    sampleCount: typeof dto.sampleCount === "number" ? dto.sampleCount : 0,
    series: Array.isArray(dto.series) ? dto.series : [],
  };
}

// ---------------------------------------------------------------------------
// fetchFedRatesData — exported named helper for unit tests
// (Remix strips loader in jsdom; named helper bypasses that)
// ---------------------------------------------------------------------------

export async function fetchFedRatesData(origin: string): Promise<LoaderData> {
  const url = `${origin}/api/fed-rates`;

  const { data, error } = await safeFetch<FedRatesDto>(url, parseFedRatesDto, {
    label: "dashboard.fed-rates",
  });

  const dto = data ?? parseFedRatesDto(null);
  return {
    generatedAt: dto.generatedAt,
    asOf: dto.asOf,
    effr: dto.effr,
    iorb: dto.iorb,
    spread: dto.spread,
    trend30d: dto.trend30d,
    sampleCount: dto.sampleCount,
    series: dto.series,
    error,
  };
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const data = await fetchFedRatesData(origin);
  return json<LoaderData>(data);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Summary metric card */
function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-1">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums text-slate-100">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/** One row in the time-series table */
function SeriesRow({ row }: { row: FedRatesRow }) {
  return (
    <tr className="border-b border-slate-700 last:border-0 hover:bg-slate-800/50">
      <td className="px-3 py-2 text-xs font-mono text-slate-300 whitespace-nowrap">
        {row.date}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatRate(row.effr)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatRate(row.iorb)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatSpread(row.spread)}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FedRatesPage() {
  const {
    asOf,
    effr,
    iorb,
    spread,
    trend30d,
    sampleCount,
    series,
    error,
  } = useLoaderData<typeof loader>();

  const isEmpty = !error && sampleCount === 0;

  // Reverse for display (most-recent first); do NOT mutate loader data
  const displaySeries = [...series].reverse();

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Lãi suất Fed Mỹ"
        subtitle="EFFR · IORB · Chênh lệch thanh khoản — ảnh hưởng dòng vốn ngoại vào TTCK Việt Nam"
        actions={
          <span className="text-xs text-slate-500 text-right">
            {sampleCount > 0 && (
              <span className="block font-medium text-slate-300">
                {sampleCount} phiên
              </span>
            )}
            {asOf && (
              <span className="block text-slate-600">
                Dữ liệu đến {asOf}
              </span>
            )}
          </span>
        }
      />

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không thể tải dữ liệu lãi suất Fed — {error}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Không có dữ liệu lãi suất Fed
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Hệ thống chưa có dữ liệu EFFR/IORB nào trong cơ sở dữ liệu.
          </p>
        </div>
      )}

      {/* Main content — only shown when no error and data present */}
      {!error && !isEmpty && (
        <>
          {/* Summary cluster — 4 metric cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="EFFR hiện tại"
              value={formatRate(effr)}
              sub="Lãi suất quỹ liên bang thực tế"
            />
            <MetricCard
              label="IORB"
              value={formatRate(iorb)}
              sub="Lãi suất Fed trả cho dự trữ ngân hàng"
            />
            <MetricCard
              label="Chênh lệch thanh khoản"
              value={formatSpread(spread)}
              sub="EFFR − IORB (âm = thanh khoản dồi dào)"
            />
            <MetricCard
              label="Xu hướng 30 ngày"
              value={mapTrend30d(trend30d)}
              sub={sampleCount > 0 ? `${sampleCount} phiên` : undefined}
            />
          </div>

          {/* Time-series table — most-recent first */}
          {displaySeries.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-x-auto">
              <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Chuỗi thời gian — {displaySeries.length} phiên (mới nhất trước)
              </p>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800">
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">
                      Ngày
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      EFFR (%)
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      IORB (%)
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Chênh lệch (%)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displaySeries.map((row) => (
                    <SeriesRow key={row.date} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Honest framing note */}
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-400">Lưu ý:</span>{" "}
            EFFR (Effective Federal Funds Rate) là lãi suất thực tế ngân hàng Mỹ cho vay qua đêm lẫn nhau.
            IORB là lãi suất Fed trả cho phần dự trữ vượt mức mà các ngân hàng gửi tại Fed.
            Khi chênh lệch EFFR−IORB âm hoặc thu hẹp, thanh khoản USD dồi dào — vốn ngoại có xu hướng tìm kiếm lợi suất cao hơn tại các thị trường mới nổi như Việt Nam.
            Khi chênh lệch dương hoặc nới rộng, chi phí vốn USD tăng, dòng vốn ngoại vào TTCK Việt Nam có thể chịu áp lực.
            Đây là dữ liệu tham chiếu vĩ mô, không phải khuyến nghị đầu tư.
          </p>
        </>
      )}
    </div>
  );
}
