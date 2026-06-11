/**
 * /dashboard/conviction-history — Niềm tin AI theo cổ phiếu.
 *
 * Data source: GET /api/conviction-history (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.conviction-history.tsx, mirroring the api.prediction-claims.tsx precedent.
 *
 * Endpoint contract (GET /api/conviction-history?limit=N) — VERIFIED live (2026-06-11):
 *   {
 *     generatedAt: string,           // ISO timestamp
 *     tradingDate: string,           // global MAX(date); "" when empty
 *     snapshot: [                    // ONE per symbol at that symbol's OWN latest date
 *       { symbol: string, date: string, peakScore: number, signal: string }
 *     ],
 *     series: {                      // symbol → full history ASC for sparklines
 *       [symbol: string]: Array<{ date: string, peakScore: number, signal: string }>
 *     },
 *     summary: {
 *       symbols: number, bullish: number, bearish: number, neutral: number, unknown: number,
 *       avgPeakScore: number | null,
 *       topBullish: Array<{ symbol: string, date: string, peakScore: number, signal: string }>,
 *       topBearish: Array<{ symbol: string, date: string, peakScore: number, signal: string }>
 *     },
 *     count: number
 *   }
 *
 * CRITICAL: The snapshot mixes FRESH (row.date === tradingDate) and STALE rows.
 * The page partitions them — stale rows are shown only in a collapsed section.
 * signal ∈ "bullish"|"bearish"|"neutral"|"unknown" — "unknown" is shown honestly, not hidden.
 *
 * Named exports (pure helpers for unit tests):
 *   formatScore, signalLabel, signalColorClass, isStale, partitionSnapshot,
 *   fetchConvictionData
 */
import { useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Niềm tin AI theo cổ phiếu — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/conviction-history DTO contract
// ---------------------------------------------------------------------------

export type ConvictionSignal = "bullish" | "bearish" | "neutral" | "unknown";

export interface ConvictionRow {
  symbol: string;
  date: string;
  peakScore: number;
  signal: ConvictionSignal;
}

export interface ConvictionSummary {
  symbols: number;
  bullish: number;
  bearish: number;
  neutral: number;
  unknown: number;
  avgPeakScore: number | null;
  topBullish: ConvictionRow[];
  topBearish: ConvictionRow[];
}

export interface ConvictionHistoryDto {
  generatedAt: string;
  tradingDate: string;
  snapshot: ConvictionRow[];
  series: Record<string, ConvictionRow[]>;
  summary: ConvictionSummary;
  count: number;
}

// ---------------------------------------------------------------------------
// LoaderData
// ---------------------------------------------------------------------------

export interface ConvictionLoaderData {
  generatedAt: string;
  tradingDate: string;
  snapshot: ConvictionRow[];
  series: Record<string, ConvictionRow[]>;
  summary: ConvictionSummary;
  count: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Pure helper functions — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Format peakScore (0–1) to 2 decimal places.
 * null/undefined → "—".
 */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "—";
  return score.toFixed(2);
}

/**
 * Map signal to plain Vietnamese label.
 * "unknown" → "Không rõ" (honest, not hidden).
 */
export function signalLabel(signal: ConvictionSignal | string): string {
  switch (signal) {
    case "bullish":
      return "Tăng";
    case "bearish":
      return "Giảm";
    case "neutral":
      return "Trung lập";
    case "unknown":
    default:
      return "Không rõ";
  }
}

/**
 * Map signal to Tailwind color classes.
 * Returns badge and text classes.
 */
export function signalColorClass(signal: ConvictionSignal | string): {
  badge: string;
  text: string;
} {
  switch (signal) {
    case "bullish":
      return {
        badge: "bg-emerald-900 text-emerald-300 border border-emerald-700",
        text: "text-emerald-400",
      };
    case "bearish":
      return {
        badge: "bg-red-900 text-red-300 border border-red-700",
        text: "text-red-400",
      };
    case "neutral":
      return {
        badge: "bg-slate-700 text-slate-300 border border-slate-600",
        text: "text-slate-400",
      };
    case "unknown":
    default:
      return {
        badge: "bg-zinc-800 text-zinc-400 border border-zinc-600",
        text: "text-zinc-500",
      };
  }
}

/**
 * Return true when the row's date does NOT match the global tradingDate.
 * Both empty string or mismatch counts as stale.
 */
export function isStale(rowDate: string, tradingDate: string): boolean {
  if (!tradingDate || !rowDate) return true;
  return rowDate !== tradingDate;
}

/**
 * Partition snapshot into fresh (date === tradingDate) and stale (date !== tradingDate).
 * Returns { fresh, stale }.
 */
export function partitionSnapshot(
  snapshot: ConvictionRow[],
  tradingDate: string
): { fresh: ConvictionRow[]; stale: ConvictionRow[] } {
  const fresh: ConvictionRow[] = [];
  const stale: ConvictionRow[] = [];
  for (const row of snapshot) {
    if (isStale(row.date, tradingDate)) {
      stale.push(row);
    } else {
      fresh.push(row);
    }
  }
  return { fresh, stale };
}

// ---------------------------------------------------------------------------
// fetchConvictionData — exported named helper for unit tests
// (Remix strips loader in jsdom; named helper bypasses that — same pattern
//  as fetchPredictionClaimsData in dashboard.prediction-claims.tsx)
// ---------------------------------------------------------------------------

const EMPTY_SUMMARY: ConvictionSummary = {
  symbols: 0,
  bullish: 0,
  bearish: 0,
  neutral: 0,
  unknown: 0,
  avgPeakScore: null,
  topBullish: [],
  topBearish: [],
};

export async function fetchConvictionData(
  origin: string,
  params?: { limit?: number; symbol?: string }
): Promise<ConvictionLoaderData> {
  let generatedAt = new Date().toISOString();
  let tradingDate = "";
  let snapshot: ConvictionRow[] = [];
  let series: Record<string, ConvictionRow[]> = {};
  let summary: ConvictionSummary = { ...EMPTY_SUMMARY };
  let count = 0;
  let error: string | null = null;

  try {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) {
      qs.set("limit", String(params.limit));
    }
    if (params?.symbol !== undefined) {
      qs.set("symbol", params.symbol);
    }
    const qsStr = qs.toString();
    const url = `${origin}/api/conviction-history${qsStr ? `?${qsStr}` : ""}`;

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      error = `Upstream returned ${response.status} ${response.statusText}`;
    } else {
      const raw = (await response.json()) as unknown;
      if (raw !== null && typeof raw === "object" && "snapshot" in raw) {
        const dto = raw as ConvictionHistoryDto;
        generatedAt =
          typeof dto.generatedAt === "string" ? dto.generatedAt : generatedAt;
        tradingDate =
          typeof dto.tradingDate === "string" ? dto.tradingDate : "";
        snapshot = Array.isArray(dto.snapshot) ? dto.snapshot : [];
        series =
          dto.series !== null &&
          typeof dto.series === "object" &&
          !Array.isArray(dto.series)
            ? (dto.series as Record<string, ConvictionRow[]>)
            : {};
        count = typeof dto.count === "number" ? dto.count : snapshot.length;
        if (
          dto.summary !== null &&
          typeof dto.summary === "object" &&
          "symbols" in dto.summary
        ) {
          const s = dto.summary;
          summary = {
            symbols: typeof s.symbols === "number" ? s.symbols : 0,
            bullish: typeof s.bullish === "number" ? s.bullish : 0,
            bearish: typeof s.bearish === "number" ? s.bearish : 0,
            neutral: typeof s.neutral === "number" ? s.neutral : 0,
            unknown: typeof s.unknown === "number" ? s.unknown : 0,
            // Preserve null — NEVER coerce to 0
            avgPeakScore:
              s.avgPeakScore !== null &&
              s.avgPeakScore !== undefined &&
              typeof s.avgPeakScore === "number"
                ? s.avgPeakScore
                : null,
            topBullish: Array.isArray(s.topBullish) ? s.topBullish : [],
            topBearish: Array.isArray(s.topBearish) ? s.topBearish : [],
          };
        }
      } else {
        error = "Unexpected response shape from /api/conviction-history";
      }
    }
  } catch (err) {
    error =
      err instanceof Error
        ? err.message
        : "Không thể kết nối tới máy chủ dữ liệu niềm tin AI";
  }

  return {
    generatedAt,
    tradingDate,
    snapshot,
    series,
    summary,
    count,
    error,
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const data = await fetchConvictionData(origin);

  return json<ConvictionLoaderData>(data);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Signal badge — bullish/bearish/neutral/unknown with VN label. */
function SignalBadge({ signal }: { signal: ConvictionSignal | string }) {
  const { badge } = signalColorClass(signal);
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge}`}
    >
      {signalLabel(signal)}
    </span>
  );
}

/** "Cũ" stale tag — shown on rows whose date !== tradingDate. */
function StaleTag() {
  return (
    <span className="inline-block rounded bg-amber-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400 border border-amber-700">
      cũ
    </span>
  );
}

/** Score bar — visual 0–1 bar alongside the numeric score. */
function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-right text-xs font-mono tabular-nums text-slate-300">
        {formatScore(score)}
      </span>
      <div className="h-1.5 w-16 rounded-full bg-slate-700">
        <div
          className="h-1.5 rounded-full bg-blue-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Inline sparkline — compact bar trail from series data. */
function Sparkline({
  points,
}: {
  points: Array<{ peakScore: number }>;
}) {
  if (!points || points.length === 0) {
    return <span className="text-xs text-slate-600">—</span>;
  }
  // Show up to last 10 points
  const recent = points.slice(-10);
  const max = Math.max(...recent.map((p) => p.peakScore), 0.01);
  return (
    <svg
      width={recent.length * 5}
      height={20}
      aria-hidden="true"
      className="inline-block align-middle"
    >
      {recent.map((p, i) => {
        const barH = Math.max(2, Math.round((p.peakScore / max) * 18));
        return (
          <rect
            key={i}
            x={i * 5}
            y={20 - barH}
            width={4}
            height={barH}
            rx={1}
            className="fill-blue-500 opacity-70"
          />
        );
      })}
    </svg>
  );
}

/** Summary banner — chips with signal counts and average score. */
function SummaryBanner({
  summary,
  tradingDate,
}: {
  summary: ConvictionSummary;
  tradingDate: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/60 px-5 py-4">
      {/* Tổng số mã */}
      <div className="flex flex-col items-center rounded-md border border-slate-600 bg-slate-900 px-4 py-2 min-w-[80px]">
        <span className="text-lg font-bold text-slate-100">
          {summary.symbols}
        </span>
        <span className="mt-0.5 text-[11px] text-slate-500">Tổng số mã</span>
      </div>

      {/* Tăng */}
      <div className="flex flex-col items-center rounded-md border border-emerald-800 bg-slate-900 px-4 py-2 min-w-[72px]">
        <span className="text-lg font-bold text-emerald-400">
          {summary.bullish}
        </span>
        <span className="mt-0.5 text-[11px] text-emerald-700">Tăng</span>
      </div>

      {/* Giảm */}
      <div className="flex flex-col items-center rounded-md border border-red-800 bg-slate-900 px-4 py-2 min-w-[72px]">
        <span className="text-lg font-bold text-red-400">{summary.bearish}</span>
        <span className="mt-0.5 text-[11px] text-red-700">Giảm</span>
      </div>

      {/* Trung lập */}
      <div className="flex flex-col items-center rounded-md border border-slate-600 bg-slate-900 px-4 py-2 min-w-[80px]">
        <span className="text-lg font-bold text-slate-300">
          {summary.neutral}
        </span>
        <span className="mt-0.5 text-[11px] text-slate-500">Trung lập</span>
      </div>

      {/* Không rõ — only shown when > 0 */}
      {summary.unknown > 0 && (
        <div className="flex flex-col items-center rounded-md border border-zinc-600 bg-slate-900 px-4 py-2 min-w-[80px]">
          <span className="text-lg font-bold text-zinc-400">
            {summary.unknown}
          </span>
          <span className="mt-0.5 text-[11px] text-zinc-600">Không rõ</span>
        </div>
      )}

      {/* Điểm tin cậy TB */}
      <div className="flex flex-col items-center rounded-md border border-blue-800 bg-slate-900 px-4 py-2 min-w-[100px]">
        <span
          className={`text-lg font-bold ${
            summary.avgPeakScore !== null ? "text-blue-400" : "text-slate-500"
          }`}
        >
          {formatScore(summary.avgPeakScore)}
        </span>
        <span className="mt-0.5 text-[11px] text-slate-500">
          Điểm tin cậy TB
        </span>
      </div>

      {/* Ngày cập nhật */}
      {tradingDate && (
        <div className="ml-auto text-xs text-slate-500">
          Ngày giao dịch:{" "}
          <span className="font-medium text-slate-300">{tradingDate}</span>
        </div>
      )}
    </div>
  );
}

/** Top conviction cards (topBullish / topBearish). */
function TopConvictionCard({
  title,
  rows,
  tradingDate,
}: {
  title: string;
  rows: ConvictionRow[];
  tradingDate: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 space-y-2">
      <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li
            key={row.symbol}
            className="flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-100">
                {row.symbol}
              </span>
              {isStale(row.date, tradingDate) && <StaleTag />}
            </div>
            <ScoreBar score={row.peakScore} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Single row in the conviction table. */
function ConvictionTableRow({
  row,
  series,
  tradingDate,
  showDate,
}: {
  row: ConvictionRow;
  series: Record<string, ConvictionRow[]>;
  tradingDate: string;
  showDate?: boolean;
}) {
  const points = series[row.symbol] ?? [];
  const stale = isStale(row.date, tradingDate);
  return (
    <tr className="border-b border-slate-700 hover:bg-slate-700/30 transition-colors">
      <td className="px-4 py-2.5 font-bold text-slate-100 text-sm">
        <div className="flex items-center gap-2">
          {row.symbol}
          {stale && <StaleTag />}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <ScoreBar score={row.peakScore} />
      </td>
      <td className="px-4 py-2.5">
        <SignalBadge signal={row.signal} />
      </td>
      <td className="px-4 py-2.5">
        <Sparkline points={points} />
      </td>
      {showDate && (
        <td className="px-4 py-2.5 text-xs text-slate-500 tabular-nums">
          {row.date}
        </td>
      )}
    </tr>
  );
}

/** Conviction table — used for both fresh and stale partitions. */
function ConvictionTable({
  rows,
  series,
  tradingDate,
  showDate,
}: {
  rows: ConvictionRow[];
  series: Record<string, ConvictionRow[]>;
  tradingDate: string;
  showDate?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-700 bg-slate-800">
          <tr>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Mã
            </th>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Điểm tin cậy
            </th>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Tín hiệu
            </th>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Xu hướng
            </th>
            {showDate && (
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Ngày
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-slate-800/40">
          {rows.map((row) => (
            <ConvictionTableRow
              key={row.symbol}
              row={row}
              series={series}
              tradingDate={tradingDate}
              showDate={showDate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Collapsible stale section. */
function StaleSection({
  rows,
  series,
  tradingDate,
}: {
  rows: ConvictionRow[];
  series: Record<string, ConvictionRow[]>;
  tradingDate: string;
}) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
        aria-expanded={open}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`inline-block transition-transform duration-200 ${open ? "rotate-90" : "rotate-0"}`}
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Mã chưa cập nhật gần đây ({rows.length})
      </button>
      {open && (
        <ConvictionTable
          rows={rows}
          series={series}
          tradingDate={tradingDate}
          showDate
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ConvictionHistoryPage() {
  const {
    generatedAt,
    tradingDate,
    snapshot,
    series,
    summary,
    count,
    error,
  } = useLoaderData<typeof loader>();

  const isEmpty = !error && (count === 0 || !tradingDate);

  const { fresh, stale } = !isEmpty
    ? partitionSnapshot(snapshot, tradingDate)
    : { fresh: [], stale: [] };

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Niềm tin AI theo cổ phiếu"
        subtitle="Điểm tin cậy (0–1) thể hiện mức độ AI tin rằng cổ phiếu sẽ tăng (Tăng), giảm (Giảm), hay đi ngang (Trung lập) trong ngắn hạn. Điểm càng cao, AI càng chắc chắn về xu hướng đó."
        actions={
          <span className="text-xs text-slate-500">
            {count > 0 && (
              <span className="mr-3 font-medium text-slate-300">
                {count} mã
              </span>
            )}
            {generatedAt && (
              <span>
                {new Date(generatedAt).toLocaleTimeString("vi-VN")}
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
          Không thể tải dữ liệu niềm tin AI — {error}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && !error && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Chưa có dữ liệu niềm tin AI
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Hệ thống chưa tính toán điểm tin cậy cho bất kỳ cổ phiếu nào. Vui
            lòng thử lại sau.
          </p>
        </div>
      )}

      {/* Summary banner */}
      {!error && !isEmpty && (
        <SummaryBanner summary={summary} tradingDate={tradingDate} />
      )}

      {/* Top conviction cards */}
      {!error && !isEmpty && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TopConvictionCard
            title="Dẫn đầu — Tăng mạnh nhất"
            rows={summary.topBullish}
            tradingDate={tradingDate}
          />
          <TopConvictionCard
            title="Dẫn đầu — Giảm mạnh nhất"
            rows={summary.topBearish}
            tradingDate={tradingDate}
          />
        </div>
      )}

      {/* PRIMARY table — fresh rows only (date === tradingDate) */}
      {!error && fresh.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-200">
            Niềm tin hôm nay ({tradingDate})
          </h2>
          <ConvictionTable
            rows={fresh}
            series={series}
            tradingDate={tradingDate}
          />
        </section>
      )}

      {/* SECONDARY collapsible — stale rows (default collapsed) */}
      {!error && stale.length > 0 && (
        <StaleSection rows={stale} series={series} tradingDate={tradingDate} />
      )}
    </div>
  );
}
