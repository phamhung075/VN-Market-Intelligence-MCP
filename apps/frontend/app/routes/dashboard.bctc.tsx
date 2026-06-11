/**
 * /dashboard/bctc — Báo Cáo Tài Chính (Financial Reports hub).
 *
 * Data source: GET /api/analysis-briefs (frontend proxy → mcp-server :3000).
 * The proxy route is api.analysis-briefs.tsx.
 *
 * Response shape:
 *   { generated_at: ISO, count: number,
 *     items: [ { ticker: string, exchange: string|null, latest_period: string|null,
 *                released: string|null, verdict_label: string|null,
 *                verdict_summary: string|null, confidence: number|null,
 *                updated_at: string|null } ] }
 *
 * Honest states:
 *   - Loader error / non-2xx / network → friendly degraded banner, never a crash.
 *   - count:0 → friendly empty state.
 *   - Never fabricate items.
 *
 * Client-side search: filter by ticker substring (no SSR re-fetch needed).
 * Client-side exchange filter: HOSE / HNX / UPCOM chips.
 *
 * Labels: plain Vietnamese — non-technical user.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useState } from "react";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Báo Cáo Tài Chính — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/analysis-briefs DTO
// ---------------------------------------------------------------------------

export interface AnalysisBriefItem {
  ticker: string;
  exchange: string | null;
  latest_period: string | null;
  released: string | null;
  verdict_label: string | null;
  verdict_summary: string | null;
  confidence: number | null;
  updated_at: string | null;
}

export interface AnalysisBriefsDto {
  generated_at: string;
  count: number;
  items: AnalysisBriefItem[];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export interface LoaderData {
  generated_at: string;
  count: number;
  items: AnalysisBriefItem[];
  error: string | null;
}

/**
 * Core fetch-and-parse logic — exported for unit testing.
 * Pure async function, no Remix dependency, no JSON wrapping.
 * The loader calls this and wraps it with json().
 */
export async function fetchAnalysisBriefs(
  origin: string,
): Promise<Omit<LoaderData, "generated_at">> {
  let count = 0;
  let items: AnalysisBriefItem[] = [];
  let error: string | null = null;

  try {
    const response = await fetch(`${origin}/api/analysis-briefs`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      error = `Upstream returned ${response.status} ${response.statusText}`;
    } else {
      const raw = (await response.json()) as unknown;
      if (raw !== null && typeof raw === "object" && "items" in raw) {
        const dto = raw as AnalysisBriefsDto;
        items = Array.isArray(dto.items) ? dto.items : [];
        count = typeof dto.count === "number" ? dto.count : items.length;
      } else {
        error = "Unexpected response shape from /api/analysis-briefs";
      }
    }
  } catch (err) {
    error =
      err instanceof Error
        ? err.message
        : "Không thể kết nối tới máy chủ báo cáo";
  }

  return { count, items, error };
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const generated_at = new Date().toISOString();

  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const data = await fetchAnalysisBriefs(origin);

  return json<LoaderData>({
    generated_at,
    ...data,
  });
}

// ---------------------------------------------------------------------------
// VerdictPill — colour-coded by verdict_label
// ---------------------------------------------------------------------------

/**
 * Verdict colour mapping:
 *   Positive/Bullish/In-line → green
 *   Caution/Bearish/Negative → red
 *   Neutral / unknown / null → grey
 */
function verdictStyle(label: string | null): {
  bg: string;
  border: string;
  text: string;
} {
  if (!label) {
    return {
      bg: "bg-slate-700",
      border: "border-slate-600",
      text: "text-slate-400",
    };
  }
  const u = label.toUpperCase();
  if (
    u.includes("BULL") ||
    u.includes("POSITIVE") ||
    u.includes("IN-LINE") ||
    u.includes("INLINE") ||
    u === "BUY" ||
    u.includes("STRONG")
  ) {
    return {
      bg: "bg-green-950",
      border: "border-green-700",
      text: "text-green-400",
    };
  }
  if (
    u.includes("BEAR") ||
    u.includes("NEGATIVE") ||
    u.includes("CAUTION") ||
    u === "SELL" ||
    u.includes("WEAK")
  ) {
    return {
      bg: "bg-red-950",
      border: "border-red-700",
      text: "text-red-400",
    };
  }
  return {
    bg: "bg-slate-700",
    border: "border-slate-600",
    text: "text-slate-400",
  };
}

function VerdictPill({ label }: { label: string | null }) {
  const style = verdictStyle(label);
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${style.bg} ${style.border} ${style.text}`}
    >
      {label ?? "—"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ExchangeChip — tiny badge for HOSE / HNX / UPCOM
// ---------------------------------------------------------------------------

function ExchangeChip({ exchange }: { exchange: string | null }) {
  if (!exchange) return null;
  return (
    <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
      {exchange}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ConfidenceBar — small bar + label
// ---------------------------------------------------------------------------

function ConfidenceBar({ confidence }: { confidence: number | null }) {
  if (confidence === null || confidence === undefined) {
    return (
      <span className="text-xs text-slate-600">Độ tin cậy: —</span>
    );
  }
  const pct = Math.round(confidence * 100);
  const barColor =
    pct >= 65 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">Độ tin cậy:</span>
      <div className="h-1.5 w-16 rounded-full bg-slate-700">
        <div
          className={`h-1.5 rounded-full ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-400">{pct}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BriefCard — one card per analysis brief item
// ---------------------------------------------------------------------------

function BriefCard({ item }: { item: AnalysisBriefItem }) {
  return (
    <Link
      to={`/dashboard/analysis?stock=${encodeURIComponent(item.ticker)}`}
      className="group block rounded-lg border border-slate-700 bg-slate-800/60 p-4 hover:border-blue-600 hover:bg-slate-800 transition-colors space-y-3"
    >
      {/* Header row: ticker + exchange */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-base font-bold text-blue-400 group-hover:text-blue-300">
          {item.ticker}
        </span>
        <ExchangeChip exchange={item.exchange} />
      </div>

      {/* Period + released date */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {item.latest_period && (
          <span>{item.latest_period}</span>
        )}
        {item.released && (
          <span>Công bố: {item.released}</span>
        )}
        {!item.latest_period && !item.released && (
          <span>Chưa có thông tin kỳ báo cáo</span>
        )}
      </div>

      {/* Verdict pill */}
      <VerdictPill label={item.verdict_label} />

      {/* Verdict summary — clamped to 2 lines */}
      {item.verdict_summary ? (
        <p className="text-xs leading-relaxed text-slate-400 line-clamp-2">
          {item.verdict_summary}
        </p>
      ) : (
        <p className="text-xs text-slate-600 italic">Chưa có tóm tắt phân tích.</p>
      )}

      {/* Confidence bar */}
      <ConfidenceBar confidence={item.confidence} />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Exchange filter pills
// ---------------------------------------------------------------------------

const EXCHANGE_OPTIONS = ["HOSE", "HNX", "UPCOM"] as const;
type ExchangeFilter = (typeof EXCHANGE_OPTIONS)[number] | null;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FinancialReportsPage() {
  const { generated_at, count, items, error } = useLoaderData<typeof loader>();

  const [search, setSearch] = useState("");
  const [exchangeFilter, setExchangeFilter] = useState<ExchangeFilter>(null);

  // Client-side filtering — no SSR re-fetch
  const filtered = items.filter((item) => {
    const matchesTicker =
      search.trim() === "" ||
      item.ticker.toUpperCase().includes(search.trim().toUpperCase());
    const matchesExchange =
      exchangeFilter === null ||
      (item.exchange ?? "").toUpperCase() === exchangeFilter;
    return matchesTicker && matchesExchange;
  });

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Báo Cáo Tài Chính"
        subtitle="Phân tích AI cho từng cổ phiếu — chọn để xem chi tiết"
        actions={
          <span className="text-xs text-slate-500">
            <ClientTimestamp iso={generated_at} />
          </span>
        }
      />

      {/* Error banner — non-fatal, never crashes */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không tải được danh sách báo cáo — {error}
        </div>
      )}

      {/* Controls: search + exchange filter */}
      {!error && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Ticker search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo mã (VD: VCB)"
            className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none w-48"
            autoComplete="off"
            spellCheck={false}
            aria-label="Tìm kiếm theo mã cổ phiếu"
          />

          {/* Exchange filter chips */}
          <div className="flex items-center gap-1.5" role="group" aria-label="Lọc theo sàn">
            <button
              onClick={() => setExchangeFilter(null)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                exchangeFilter === null
                  ? "bg-blue-700 text-white"
                  : "bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200"
              }`}
            >
              Tất cả
            </button>
            {EXCHANGE_OPTIONS.map((ex) => (
              <button
                key={ex}
                onClick={() =>
                  setExchangeFilter(exchangeFilter === ex ? null : ex)
                }
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  exchangeFilter === ex
                    ? "bg-blue-700 text-white"
                    : "bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200"
                }`}
              >
                {ex}
              </button>
            ))}
          </div>

          {/* Count label */}
          <span className="ml-auto text-xs text-slate-500">
            {filtered.length < count
              ? `${filtered.length} / ${count} báo cáo`
              : `${count} báo cáo`}
          </span>
        </div>
      )}

      {/* Empty state — not an error, just no items */}
      {!error && items.length === 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Chưa có báo cáo phân tích
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Hệ thống chưa có dữ liệu báo cáo. Vui lòng quay lại sau.
          </p>
        </div>
      )}

      {/* Filter empty state — items exist but search/filter matched nothing */}
      {!error && items.length > 0 && filtered.length === 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-8 text-center">
          <p className="text-sm text-slate-400">
            Không tìm thấy báo cáo phù hợp với bộ lọc hiện tại.
          </p>
        </div>
      )}

      {/* Grid of cards */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => (
            <BriefCard key={item.ticker} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
