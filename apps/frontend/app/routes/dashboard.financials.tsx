/**
 * /dashboard/financials — Định giá & Cơ bản (Valuation & Fundamentals screener).
 *
 * Data source: GET /api/financials (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.financials.tsx, mirroring the api.officers.tsx precedent.
 *
 * Endpoint contract (GET /api/financials) — VERIFIED live 2026-04-15:
 *   {
 *     generatedAt: string (ISO),
 *     asOf: string (ISO),
 *     count: number,           // 78 — one row per code, latest period per code
 *     rows: FinancialsRow[],
 *     summary: { medianPe, medianPb, medianRoe },
 *     rankings: {
 *       cheapestPe:         [{ code, pe, roe }, ...5],
 *       highestRoe:         [{ code, roe, pe }, ...5],
 *       highestRevenueYoy:  [{ code, revenueYoy }, ...5],
 *     }
 *   }
 *
 * CRITICAL DATA FACTS:
 * - nim and npl are NULL for ALL 78 rows (bank-only metrics, unpopulated).
 *   DO NOT render them as table columns — OMITTED entirely.
 * - eps can be legitimately 0 — render 0 as "0", only null → "—".
 * - This is a FULL-UNIVERSE screener: NO ?code selector, NO per-code drilldown.
 *   The proxy must NOT forward any query param.
 *
 * Named exports (for unit tests):
 *   fetchFinancialsData, formatNum, formatPct1, formatDate
 *
 * Decision journal (DJ-GATE-1): New read-only dashboard page (TASK17-PAGE16).
 * Named-export helper pattern: Remix strips loader in jsdom; named helpers bypass that.
 * No query params forwarded — full-universe endpoint.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Định giá & Cơ bản — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/financials live payload
// ---------------------------------------------------------------------------

export interface FinancialsRow {
  code: string;
  period: string;
  yearReport: number | null;
  quarter: number | null;
  revenueBn: number | null;
  revenueYoy: number | null;
  netProfitBn: number | null;
  netProfitYoy: number | null;
  eps: number | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  roa: number | null;
  debtToEquity: number | null;
  netProfitMargin: number | null;
  // nim and npl intentionally OMITTED — NULL for all 78 rows in this dataset
}

export interface FinancialsSummary {
  medianPe: number;
  medianPb: number;
  medianRoe: number;
}

export interface CheapestPeItem {
  code: string;
  pe: number;
  roe: number;
}

export interface HighestRoeItem {
  code: string;
  roe: number;
  pe: number;
}

export interface HighestRevenueYoyItem {
  code: string;
  revenueYoy: number;
}

export interface FinancialsRankings {
  cheapestPe: CheapestPeItem[];
  highestRoe: HighestRoeItem[];
  highestRevenueYoy: HighestRevenueYoyItem[];
}

export interface FinancialsDto {
  generatedAt: string;
  asOf: string;
  stale?: boolean;
  staleByDays?: number;
  count: number;
  rows: FinancialsRow[];
  summary: FinancialsSummary;
  rankings: FinancialsRankings;
}

// ---------------------------------------------------------------------------
// LoaderData
// ---------------------------------------------------------------------------

export interface LoaderData {
  generatedAt: string;
  asOf: string;
  stale: boolean;
  staleByDays: number;
  count: number;
  rows: FinancialsRow[];
  summary: FinancialsSummary | null;
  rankings: FinancialsRankings | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Format a number with up to 2 decimal places and thousands separators.
 * Large integers (no decimal): toLocaleString.
 * null → "—"; 0 → "0".
 */
export function formatNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * Format a percentage value to 1 decimal place with "%" suffix.
 * null → "—"; 0 → "0.0%".
 */
export function formatPct1(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  return `${p.toFixed(1)}%`;
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
// fetchFinancialsData — exported named helper for unit tests
// (Remix strips loader in jsdom; named helper bypasses that)
// ---------------------------------------------------------------------------

export async function fetchFinancialsData(origin: string): Promise<LoaderData> {
  let generatedAt = new Date().toISOString();
  let asOf = "";
  let stale = false;
  let staleByDays = 0;
  let count = 0;
  let rows: FinancialsRow[] = [];
  let summary: FinancialsSummary | null = null;
  let rankings: FinancialsRankings | null = null;
  let error: string | null = null;

  try {
    const url = `${origin}/api/financials`;

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
        "rows" in raw &&
        "summary" in raw &&
        "rankings" in raw
      ) {
        const dto = raw as FinancialsDto;
        generatedAt =
          typeof dto.generatedAt === "string" ? dto.generatedAt : generatedAt;
        asOf = typeof dto.asOf === "string" ? dto.asOf : "";
        stale = typeof dto.stale === "boolean" ? dto.stale : false;
        staleByDays = typeof dto.staleByDays === "number" ? dto.staleByDays : 0;
        count = typeof dto.count === "number" ? dto.count : 0;
        rows = Array.isArray(dto.rows) ? dto.rows : [];
        summary =
          dto.summary !== null &&
          typeof dto.summary === "object" &&
          "medianPe" in dto.summary
            ? (dto.summary as FinancialsSummary)
            : null;
        rankings =
          dto.rankings !== null &&
          typeof dto.rankings === "object" &&
          "cheapestPe" in dto.rankings
            ? (dto.rankings as FinancialsRankings)
            : null;
      } else {
        error = "Unexpected response shape from /api/financials";
      }
    }
  } catch (err) {
    error =
      err instanceof Error
        ? err.message
        : "Không thể kết nối tới máy chủ dữ liệu định giá";
  }

  return {
    generatedAt,
    asOf,
    stale,
    staleByDays,
    count,
    rows,
    summary,
    rankings,
    error,
  };
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const data = await fetchFinancialsData(origin);
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

/** One row in the main screener table */
function ScreenerRow({ row }: { row: FinancialsRow }) {
  return (
    <tr className="border-b border-slate-700 last:border-0 hover:bg-slate-800/50">
      <td className="px-3 py-2 text-xs font-mono font-semibold text-slate-200 whitespace-nowrap">
        {row.code}
      </td>
      <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">
        {row.period}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatNum(row.revenueBn)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatPct1(row.revenueYoy)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatNum(row.netProfitBn)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatPct1(row.netProfitYoy)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {row.eps === null || row.eps === undefined ? "—" : formatNum(row.eps)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatNum(row.pe)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatNum(row.pb)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatPct1(row.roe)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatPct1(row.roa)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatNum(row.debtToEquity)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatPct1(row.netProfitMargin)}
      </td>
    </tr>
  );
}

/** Cheapest P/E ranking row */
function CheapestPeRow({ item, rank }: { item: CheapestPeItem; rank: number }) {
  return (
    <tr className="border-b border-slate-700 last:border-0 hover:bg-slate-800/50">
      <td className="px-3 py-2 text-xs tabular-nums text-slate-500 text-right">
        {rank}
      </td>
      <td className="px-3 py-2 text-xs font-mono font-semibold text-slate-200">
        {item.code}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right">
        {formatNum(item.pe)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right">
        {formatPct1(item.roe)}
      </td>
    </tr>
  );
}

/** Highest ROE ranking row */
function HighestRoeRow({ item, rank }: { item: HighestRoeItem; rank: number }) {
  return (
    <tr className="border-b border-slate-700 last:border-0 hover:bg-slate-800/50">
      <td className="px-3 py-2 text-xs tabular-nums text-slate-500 text-right">
        {rank}
      </td>
      <td className="px-3 py-2 text-xs font-mono font-semibold text-slate-200">
        {item.code}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right">
        {formatPct1(item.roe)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right">
        {formatNum(item.pe)}
      </td>
    </tr>
  );
}

/** Highest Revenue YoY ranking row */
function HighestRevenueYoyRow({
  item,
  rank,
}: {
  item: HighestRevenueYoyItem;
  rank: number;
}) {
  return (
    <tr className="border-b border-slate-700 last:border-0 hover:bg-slate-800/50">
      <td className="px-3 py-2 text-xs tabular-nums text-slate-500 text-right">
        {rank}
      </td>
      <td className="px-3 py-2 text-xs font-mono font-semibold text-slate-200">
        {item.code}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right">
        {formatPct1(item.revenueYoy)}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FinancialsPage() {
  const { asOf, stale, staleByDays, count, rows, summary, rankings, error } =
    useLoaderData<typeof loader>();

  const isEmpty = !error && rows.length === 0;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Định giá & Cơ bản"
        subtitle="Màn hình toàn thị trường — định giá, sinh lời và tăng trưởng"
        actions={
          <span className="text-xs text-slate-500 text-right">
            {count > 0 && (
              <span className="block font-medium text-slate-300">
                {count} mã
              </span>
            )}
            {asOf && (
              <span className="block text-slate-600">
                Dữ liệu tính đến: {formatDate(asOf)}
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
          Không thể tải dữ liệu định giá — {error}
        </div>
      )}

      {/* Stale data warning banner */}
      {!error && stale && (
        <div
          role="status"
          className="rounded border border-amber-700 bg-amber-950 px-4 py-3 text-sm text-amber-300"
        >
          Dữ liệu đã cũ {staleByDays} ngày — có thể không cập nhật
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Không có dữ liệu định giá
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Hệ thống chưa có dữ liệu tài chính nào.
          </p>
        </div>
      )}

      {/* Main content — only shown when no error and rows present */}
      {!error && !isEmpty && (
        <>
          {/* Summary cluster — 3 metric cards */}
          {summary !== null && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label="P/E trung vị"
                value={formatNum(summary.medianPe)}
                sub="Toàn thị trường"
              />
              <MetricCard
                label="P/B trung vị"
                value={formatNum(summary.medianPb)}
                sub="Toàn thị trường"
              />
              <MetricCard
                label="ROE trung vị"
                value={formatPct1(summary.medianRoe)}
                sub="Toàn thị trường"
              />
            </div>
          )}

          {/* Ranking slices — 3 mini tables */}
          {rankings !== null && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* P/E thấp nhất */}
              {rankings.cheapestPe.length > 0 && (
                <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-x-auto">
                  <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    P/E thấp nhất (top {rankings.cheapestPe.length})
                  </p>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-700 bg-slate-800">
                        <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                          #
                        </th>
                        <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">
                          Mã
                        </th>
                        <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                          P/E
                        </th>
                        <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                          ROE (%)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankings.cheapestPe.map((item, i) => (
                        <CheapestPeRow key={item.code} item={item} rank={i + 1} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ROE cao nhất */}
              {rankings.highestRoe.length > 0 && (
                <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-x-auto">
                  <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    ROE cao nhất (top {rankings.highestRoe.length})
                  </p>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-700 bg-slate-800">
                        <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                          #
                        </th>
                        <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">
                          Mã
                        </th>
                        <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                          ROE (%)
                        </th>
                        <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                          P/E
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankings.highestRoe.map((item, i) => (
                        <HighestRoeRow key={item.code} item={item} rank={i + 1} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tăng trưởng doanh thu cao nhất */}
              {rankings.highestRevenueYoy.length > 0 && (
                <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-x-auto">
                  <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    Tăng trưởng DT cao nhất (top {rankings.highestRevenueYoy.length})
                  </p>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-700 bg-slate-800">
                        <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                          #
                        </th>
                        <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">
                          Mã
                        </th>
                        <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                          Tăng trưởng DT (%)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankings.highestRevenueYoy.map((item, i) => (
                        <HighestRevenueYoyRow
                          key={item.code}
                          item={item}
                          rank={i + 1}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Main screener table — all rows */}
          {rows.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-x-auto">
              <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Toàn bộ {rows.length} mã — kỳ gần nhất
              </p>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800">
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">
                      Mã
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">
                      Kỳ
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Doanh thu (tỷ)
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Tăng trưởng DT
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      LN ròng (tỷ)
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Tăng trưởng LN
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      EPS
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      P/E
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      P/B
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      ROE (%)
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      ROA (%)
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Nợ/VCSH
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Biên LN ròng
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <ScreenerRow key={row.code} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Honest framing note */}
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-400">Lưu ý:</span>{" "}
            P/E = 0 hoặc trống có thể nghĩa là chưa công bố hoặc không áp dụng.
            Các giá trị trung vị là ảnh chụp cắt ngang toàn thị trường tại một thời điểm, không phải khuyến nghị đầu tư.
            NIM/NPL (chỉ số ngân hàng) chưa có trong bộ dữ liệu này nên không hiển thị.
          </p>
        </>
      )}
    </div>
  );
}
