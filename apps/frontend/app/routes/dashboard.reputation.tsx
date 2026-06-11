/**
 * /dashboard/reputation — Điểm Uy tín Doanh nghiệp (Corporate Reputation Risk Leaderboard).
 *
 * Data source: GET /api/reputation (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.reputation.tsx, mirroring the api.fed-rates.tsx precedent.
 *
 * Endpoint contract (GET /api/reputation) — VERIFIED live 2026-06-09:
 *   {
 *     generatedAt: string (ISO),
 *     asOf: string | null,
 *     summary: {
 *       total: number,
 *       avgScore: number | null,
 *       byRisk: { safe: number, watch: number, warning: number, danger: number }
 *     },
 *     leaderboard: ReputationEntry[],  // score DESC, code ASC; length === total
 *     history: Record<string, HistoryPoint[]>  // keyed by ticker code
 *   }
 *
 * Empty-state: asOf null, summary.total 0, avgScore null, byRisk all 0, leaderboard [], history {}.
 *
 * Named exports (for unit tests):
 *   fetchReputationData, mapTrend, mapRiskLevel, getRiskBadgeClass
 *
 * Decision journal: New read-only dashboard page (TASK17-PAGE18).
 * Named-export helper pattern: Remix strips loader in jsdom; named helpers bypass that.
 * No query params forwarded — full-universe endpoint (all 41 tickers).
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Điểm Uy tín Doanh nghiệp — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/reputation live payload
// ---------------------------------------------------------------------------

export type RiskLevel = "safe" | "watch" | "warning" | "danger";
export type Trend = "improving" | "stable" | "deteriorating";

export interface ReputationEntry {
  code: string;
  score: number;
  trend: Trend | string;
  riskLevel: RiskLevel | string;
}

export interface HistoryPoint {
  date: string;
  score: number;
}

export interface ByRisk {
  safe: number;
  watch: number;
  warning: number;
  danger: number;
}

export interface ReputationSummary {
  total: number;
  avgScore: number | null;
  byRisk: ByRisk;
}

export interface ReputationDto {
  generatedAt: string;
  asOf: string | null;
  summary: ReputationSummary;
  leaderboard: ReputationEntry[];
  history: Record<string, HistoryPoint[]>;
}

// ---------------------------------------------------------------------------
// LoaderData
// ---------------------------------------------------------------------------

export interface LoaderData {
  generatedAt: string;
  asOf: string | null;
  summary: ReputationSummary;
  leaderboard: ReputationEntry[];
  history: Record<string, HistoryPoint[]>;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Map trend string value to Vietnamese display label.
 * "improving"    → "Cải thiện"
 * "stable"       → "Ổn định"
 * "deteriorating"→ "Suy giảm"
 * unknown        → the raw value
 */
export function mapTrend(trend: string): string {
  if (trend === "improving") return "Cải thiện";
  if (trend === "stable") return "Ổn định";
  if (trend === "deteriorating") return "Suy giảm";
  return trend;
}

/**
 * Map riskLevel string value to Vietnamese display label.
 * "safe"    → "An toàn"
 * "watch"   → "Theo dõi"
 * "warning" → "Cảnh báo"
 * "danger"  → "Nguy hiểm"
 * unknown   → the raw value
 */
export function mapRiskLevel(riskLevel: string): string {
  if (riskLevel === "safe") return "An toàn";
  if (riskLevel === "watch") return "Theo dõi";
  if (riskLevel === "warning") return "Cảnh báo";
  if (riskLevel === "danger") return "Nguy hiểm";
  return riskLevel;
}

/**
 * Return Tailwind CSS classes for the risk badge pill.
 * safe    → green
 * watch   → yellow/neutral
 * warning → amber/orange
 * danger  → red
 */
export function getRiskBadgeClass(riskLevel: string): string {
  if (riskLevel === "safe")
    return "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold bg-green-900 text-green-300";
  if (riskLevel === "watch")
    return "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold bg-yellow-900 text-yellow-300";
  if (riskLevel === "warning")
    return "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold bg-orange-900 text-orange-300";
  if (riskLevel === "danger")
    return "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold bg-red-900 text-red-300";
  return "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold bg-slate-700 text-slate-300";
}

/**
 * fetchReputationData — exported named helper for unit tests.
 * (Remix strips loader in jsdom; named helper bypasses that.)
 */
export async function fetchReputationData(origin: string): Promise<LoaderData> {
  const emptyByRisk: ByRisk = { safe: 0, watch: 0, warning: 0, danger: 0 };
  let generatedAt = new Date().toISOString();
  let asOf: string | null = null;
  let summary: ReputationSummary = {
    total: 0,
    avgScore: null,
    byRisk: emptyByRisk,
  };
  let leaderboard: ReputationEntry[] = [];
  let history: Record<string, HistoryPoint[]> = {};
  let error: string | null = null;

  try {
    const url = `${origin}/api/reputation`;

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      error = `Upstream returned ${response.status} ${response.statusText}`;
    } else {
      const raw = (await response.json()) as unknown;
      if (
        raw !== null &&
        typeof raw === "object" &&
        "summary" in raw &&
        "leaderboard" in raw
      ) {
        const dto = raw as ReputationDto;
        generatedAt =
          typeof dto.generatedAt === "string" ? dto.generatedAt : generatedAt;
        asOf = typeof dto.asOf === "string" ? dto.asOf : null;
        summary = {
          total:
            typeof dto.summary?.total === "number" ? dto.summary.total : 0,
          avgScore:
            typeof dto.summary?.avgScore === "number"
              ? dto.summary.avgScore
              : null,
          byRisk: {
            safe:
              typeof dto.summary?.byRisk?.safe === "number"
                ? dto.summary.byRisk.safe
                : 0,
            watch:
              typeof dto.summary?.byRisk?.watch === "number"
                ? dto.summary.byRisk.watch
                : 0,
            warning:
              typeof dto.summary?.byRisk?.warning === "number"
                ? dto.summary.byRisk.warning
                : 0,
            danger:
              typeof dto.summary?.byRisk?.danger === "number"
                ? dto.summary.byRisk.danger
                : 0,
          },
        };
        leaderboard = Array.isArray(dto.leaderboard) ? dto.leaderboard : [];
        history =
          dto.history !== null && typeof dto.history === "object"
            ? (dto.history as Record<string, HistoryPoint[]>)
            : {};
      } else {
        error = "Unexpected response shape from /api/reputation";
      }
    }
  } catch (err) {
    error =
      err instanceof Error
        ? err.message
        : "Không thể kết nối tới máy chủ dữ liệu uy tín doanh nghiệp";
  }

  return {
    generatedAt,
    asOf,
    summary,
    leaderboard,
    history,
    error,
  };
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const data = await fetchReputationData(origin);
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

/** One row in the leaderboard table */
function LeaderboardRow({
  entry,
  rank,
}: {
  entry: ReputationEntry;
  rank: number;
}) {
  return (
    <tr className="border-b border-slate-700 last:border-0 hover:bg-slate-800/50">
      <td className="px-3 py-2 text-xs tabular-nums text-slate-500 text-center w-10">
        {rank}
      </td>
      <td className="px-3 py-2 text-xs font-mono font-semibold text-slate-100 whitespace-nowrap">
        {entry.code}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-200 text-right whitespace-nowrap">
        {entry.score}
      </td>
      <td className="px-3 py-2 text-xs text-slate-300 whitespace-nowrap">
        {mapTrend(entry.trend)}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className={getRiskBadgeClass(entry.riskLevel)}>
          {mapRiskLevel(entry.riskLevel)}
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReputationPage() {
  const { asOf, summary, leaderboard, error } =
    useLoaderData<typeof loader>();

  const isEmpty = !error && summary.total === 0;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Điểm Uy tín Doanh nghiệp"
        subtitle="Bảng xếp hạng rủi ro uy tín dựa trên phân tích cảm xúc tin tức — tín hiệu cảnh báo sớm"
        actions={
          <span className="text-xs text-slate-500 text-right">
            {summary.total > 0 && (
              <span className="block font-medium text-slate-300">
                {summary.total} mã theo dõi
              </span>
            )}
            {asOf && (
              <span className="block text-slate-600">
                Dữ liệu tính đến ngày {asOf}
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
          Không thể tải dữ liệu uy tín doanh nghiệp — {error}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Chưa có dữ liệu điểm uy tín
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Hệ thống chưa có dữ liệu phân tích cảm xúc tin tức nào. Vui lòng thử lại sau.
          </p>
        </div>
      )}

      {/* Main content — only shown when no error and data present */}
      {!error && !isEmpty && (
        <>
          {/* Summary cluster */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard
              label="Tổng số mã"
              value={String(summary.total)}
              sub="mã đang theo dõi"
            />
            <MetricCard
              label="Điểm trung bình"
              value={
                summary.avgScore !== null
                  ? summary.avgScore.toFixed(1)
                  : "—"
              }
              sub="thang điểm 0–100"
            />
            <MetricCard
              label="An toàn"
              value={String(summary.byRisk.safe)}
              sub="score cao, uy tín tốt"
            />
            <MetricCard
              label="Theo dõi"
              value={String(summary.byRisk.watch)}
              sub="cần tiếp tục quan sát"
            />
            <MetricCard
              label="Cảnh báo"
              value={String(summary.byRisk.warning)}
              sub="tín hiệu rủi ro đáng chú ý"
            />
            <MetricCard
              label="Nguy hiểm"
              value={String(summary.byRisk.danger)}
              sub="rủi ro uy tín nghiêm trọng"
            />
          </div>

          {/* Leaderboard table */}
          {leaderboard.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-x-auto">
              <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Bảng xếp hạng — {leaderboard.length} mã (điểm cao nhất trước)
              </p>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800">
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-center w-10">
                      Hạng
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">
                      Mã
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Điểm
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">
                      Xu hướng
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">
                      Mức rủi ro
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, idx) => (
                    <LeaderboardRow
                      key={entry.code}
                      entry={entry}
                      rank={idx + 1}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Framing note */}
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-400">Lưu ý:</span>{" "}
            Điểm uy tín doanh nghiệp (0–100) được tính từ phân tích cảm xúc tin tức theo thời gian thực.
            Điểm cao (gần 100) phản ánh uy tín tốt, tin tức tích cực; điểm thấp (gần 0) cho thấy nguy cơ rủi ro danh tiếng cao.
            Mức độ rủi ro: An toàn (&gt;60), Theo dõi (40–60), Cảnh báo (20–40), Nguy hiểm (&lt;20).
            Đây là tín hiệu cảnh báo sớm dựa trên dữ liệu truyền thông — không phải khuyến nghị đầu tư.
            Áp dụng cho 41 mã cổ phiếu đang theo dõi trong danh mục giám sát.
          </p>
        </>
      )}
    </div>
  );
}
