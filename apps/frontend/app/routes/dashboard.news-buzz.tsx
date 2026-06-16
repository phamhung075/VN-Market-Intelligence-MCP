/**
 * /dashboard/news-buzz — Tin tức nhắc đến (Cảnh báo sớm).
 *
 * Data source: GET /api/news-buzz (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.news-buzz.tsx, mirroring the api.reputation.tsx precedent.
 *
 * Endpoint contract (GET /api/news-buzz) — VERIFIED live 2026-06-11:
 *   {
 *     generatedAt:  string (ISO),
 *     windowStart:  string | null,   // SQLite space-format or null when empty
 *     windowEnd:    string | null,   // ISO or null when empty
 *     summary: {
 *       distinctCodes:   number,
 *       totalMentions:   number,
 *       totalNegative:   number,
 *       totalSources:    number,
 *     },
 *     leaderboard: NewsBuzzEntry[],  // mentions DESC, code ASC; length === distinctCodes
 *   }
 *
 * Empty-state: windowStart/windowEnd null, summary all zeros, leaderboard [].
 *
 * Named exports (for unit tests):
 *   fetchNewsBuzzData, getNegativityTier, formatNegativeRatioPct
 *
 * Decision journal: New read-only dashboard page (TASK17-PAGE19).
 * Named-export helper pattern: Remix strips loader in jsdom; named helpers bypass that.
 * No query params forwarded — full-universe endpoint (7-day rolling window).
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { PageHeader } from "~/components/PageHeader";
import { safeFetch } from "~/lib/api/fetchUtils";

export const meta: MetaFunction = () => [
  { title: "Tin tức nhắc đến (Cảnh báo sớm) — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/news-buzz live payload
// ---------------------------------------------------------------------------

export interface NewsBuzzEntry {
  code: string;
  mentions: number;
  negative: number;
  sources: number;
  hoursActive: number;
  negativeRatio: number;
}

export interface NewsBuzzSummary {
  distinctCodes: number;
  totalMentions: number;
  totalNegative: number;
  totalSources: number;
}

export interface NewsBuzzDto {
  generatedAt: string;
  windowStart: string | null;
  windowEnd: string | null;
  summary: NewsBuzzSummary;
  leaderboard: NewsBuzzEntry[];
}

// ---------------------------------------------------------------------------
// LoaderData
// ---------------------------------------------------------------------------

export interface LoaderData {
  generatedAt: string;
  windowStart: string | null;
  windowEnd: string | null;
  summary: NewsBuzzSummary;
  leaderboard: NewsBuzzEntry[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Negativity tier mapping for negativeRatio.
 * ratio >= 0.6  → "danger"   (Cao)
 * 0.3 <= ratio < 0.6 → "warning" (Trung bình)
 * ratio < 0.3   → "ok"       (Thấp)
 */
export type NegativityTier = "danger" | "warning" | "ok";

export function getNegativityTier(ratio: number): NegativityTier {
  if (ratio >= 0.6) return "danger";
  if (ratio >= 0.3) return "warning";
  return "ok";
}

/**
 * Format negativeRatio as a percent string (0.73 → "73%").
 */
export function formatNegativeRatioPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/**
 * Return Tailwind CSS classes for the negativity badge pill.
 * danger  → red    (>= 0.6)
 * warning → yellow (0.3–0.6)
 * ok      → green  (< 0.3)
 */
export function getNegativityBadgeClass(tier: NegativityTier): string {
  if (tier === "danger")
    return "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold bg-red-900 text-red-300";
  if (tier === "warning")
    return "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold bg-yellow-900 text-yellow-300";
  return "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold bg-green-900 text-green-300";
}

/**
 * Return Vietnamese label for the negativity tier.
 * danger  → "Cao"
 * warning → "Trung bình"
 * ok      → "Thấp"
 */
export function getNegativityLabel(tier: NegativityTier): string {
  if (tier === "danger") return "Cao";
  if (tier === "warning") return "Trung bình";
  return "Thấp";
}

/**
 * fetchNewsBuzzData — exported named helper for unit tests.
 * (Remix strips loader in jsdom; named helper bypasses that.)
 */
const EMPTY_NEWS_BUZZ_SUMMARY: NewsBuzzSummary = {
  distinctCodes: 0,
  totalMentions: 0,
  totalNegative: 0,
  totalSources: 0,
};

function parseNewsBuzzDto(raw: unknown): NewsBuzzDto {
  const now = new Date().toISOString();
  if (raw === null) {
    return {
      generatedAt: now,
      windowStart: null,
      windowEnd: null,
      summary: { ...EMPTY_NEWS_BUZZ_SUMMARY },
      leaderboard: [],
    };
  }
  if (typeof raw !== "object" || !("summary" in raw) || !("leaderboard" in raw)) {
    throw new Error("Unexpected response shape from /api/news-buzz");
  }
  const dto = raw as NewsBuzzDto;
  return {
    generatedAt: typeof dto.generatedAt === "string" ? dto.generatedAt : now,
    windowStart: typeof dto.windowStart === "string" ? dto.windowStart : null,
    windowEnd: typeof dto.windowEnd === "string" ? dto.windowEnd : null,
    summary: {
      distinctCodes: typeof dto.summary?.distinctCodes === "number" ? dto.summary.distinctCodes : 0,
      totalMentions: typeof dto.summary?.totalMentions === "number" ? dto.summary.totalMentions : 0,
      totalNegative: typeof dto.summary?.totalNegative === "number" ? dto.summary.totalNegative : 0,
      totalSources: typeof dto.summary?.totalSources === "number" ? dto.summary.totalSources : 0,
    },
    leaderboard: Array.isArray(dto.leaderboard) ? dto.leaderboard : [],
  };
}

export async function fetchNewsBuzzData(origin: string): Promise<LoaderData> {
  const { data, error } = await safeFetch<NewsBuzzDto>(
    `${origin}/api/news-buzz`,
    parseNewsBuzzDto,
    { label: "dashboard.news-buzz" },
  );
  return {
    generatedAt: data.generatedAt,
    windowStart: data.windowStart,
    windowEnd: data.windowEnd,
    summary: data.summary,
    leaderboard: data.leaderboard,
    error,
  };
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const data = await fetchNewsBuzzData(origin);
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

/** One row in the news-buzz leaderboard table */
function LeaderboardRow({
  entry,
  rank,
}: {
  entry: NewsBuzzEntry;
  rank: number;
}) {
  const tier = getNegativityTier(entry.negativeRatio);
  return (
    <tr className="border-b border-slate-700 last:border-0 hover:bg-slate-800/50">
      <td className="px-3 py-2 text-xs tabular-nums text-slate-500 text-center w-10">
        {rank}
      </td>
      <td className="px-3 py-2 text-xs font-mono font-semibold text-slate-100 whitespace-nowrap">
        {entry.code}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-200 text-right whitespace-nowrap">
        {entry.mentions}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {entry.negative}
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-right">
        <span className={getNegativityBadgeClass(tier)}>
          {formatNegativeRatioPct(entry.negativeRatio)}{" "}
          {getNegativityLabel(tier)}
        </span>
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {entry.sources}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {entry.hoursActive}h
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewsBuzzPage() {
  const { generatedAt, windowStart, windowEnd, summary, leaderboard, error } =
    useLoaderData<typeof loader>();

  const isEmpty = !error && summary.distinctCodes === 0;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Tin tức nhắc đến (Cảnh báo sớm)"
        subtitle="Bảng xếp hạng cổ phiếu được nhắc đến nhiều nhất trong 7 ngày, kèm tỷ lệ tin tiêu cực — tín hiệu cảnh báo sớm"
        actions={
          <span className="text-xs text-slate-500 text-right">
            {summary.distinctCodes > 0 && (
              <span className="block font-medium text-slate-300">
                {summary.distinctCodes} mã theo dõi
              </span>
            )}
            {(windowStart || windowEnd) && (
              <span className="block text-slate-600">
                {windowStart ?? "?"} → {windowEnd ?? "?"}
              </span>
            )}
            {generatedAt && (
              <span className="block text-slate-600">
                Cập nhật: {generatedAt}
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
          Không thể tải dữ liệu tin tức — {error}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Chưa có dữ liệu tin tức trong cửa sổ 7 ngày.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Hệ thống chưa thu thập đủ dữ liệu tin tức. Vui lòng thử lại sau.
          </p>
        </div>
      )}

      {/* Main content — only shown when no error and data present */}
      {!error && !isEmpty && (
        <>
          {/* Summary cluster */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Số mã"
              value={String(summary.distinctCodes)}
              sub="mã được nhắc đến"
            />
            <MetricCard
              label="Tổng lượt nhắc"
              value={String(summary.totalMentions)}
              sub="lần xuất hiện trong 7 ngày"
            />
            <MetricCard
              label="Tin tiêu cực"
              value={String(summary.totalNegative)}
              sub="lượt nhắc mang tính tiêu cực"
            />
            <MetricCard
              label="Nguồn tin"
              value={String(summary.totalSources)}
              sub="nguồn tin độc lập"
            />
          </div>

          {/* Window range info */}
          {(windowStart || windowEnd) && (
            <p className="text-xs text-slate-500">
              Cửa sổ dữ liệu:{" "}
              <span className="text-slate-400">{windowStart ?? "?"}</span>
              {" → "}
              <span className="text-slate-400">{windowEnd ?? "?"}</span>
            </p>
          )}

          {/* Leaderboard table */}
          {leaderboard.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-x-auto">
              <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Bảng xếp hạng — {leaderboard.length} mã (nhiều lượt nhắc nhất trước)
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
                      Lượt nhắc
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Tin tiêu cực
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Tỷ lệ tiêu cực
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Nguồn
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Giờ hoạt động
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
            Tỷ lệ tiêu cực là tỷ lệ tin tức mang cảm xúc tiêu cực trên tổng lượt nhắc trong 7 ngày.
            Tỷ lệ cao (≥60%) là tín hiệu cảnh báo sớm cho thấy áp lực truyền thông tiêu cực.
            Mức độ: Thấp (&lt;30%), Trung bình (30–60%), Cao (≥60%).
            Đây là tín hiệu cảnh báo sớm dựa trên dữ liệu truyền thông — không phải khuyến nghị đầu tư.
          </p>
        </>
      )}
    </div>
  );
}
