/**
 * /dashboard/shareholders — Cơ cấu cổ đông.
 *
 * Data source: GET /api/shareholders (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.shareholders.tsx, mirroring the api.sector-cascade.tsx precedent.
 *
 * Endpoint contract (GET /api/shareholders?code=XXX) — VERIFIED live 2026-06-11:
 *   {
 *     generatedAt: string (ISO),
 *     asOf: string (ISO),
 *     codes: string[],          // 32 codes ASC (BID is first)
 *     selectedCode: string,     // e.g. "BID"
 *     holders: [{ rank, name, quantity, ownPercent }],  // for selectedCode, capped 200
 *     selectedSummary: {
 *       code, holderCount, top1Name, top1Pct, top5Pct, disclosedPct,
 *       concentration, concentrationLabel
 *     } | null,
 *     ranking: [{ code, holderCount, top1Pct, top5Pct, disclosedPct,
 *                 concentration, concentrationLabel }],  // ALL codes, top1Pct DESC
 *     count: number
 *   }
 *
 * concentration ∈ {high, medium, low}
 * concentrationLabel ∈ {"Tập trung cao","Tập trung vừa","Phân tán"}
 *
 * HONEST FRAMING (load-bearing): disclosedPct is the SUM of publicly-disclosed
 * own_percent values and CAN exceed 100% (overlapping / aggregate disclosures).
 * It is NOT a clean 0-100 ownership slice. Must not be presented as a pie slice.
 * Show the raw % with an honest caption.
 *
 * Named exports (for unit tests):
 *   fetchShareholdersData, concentrationColorClass, formatQuantity, formatPct
 *
 * Decision journal (DJ-GATE-1): New read-only dashboard page (TASK17-PAGE14).
 * Named-export helper pattern: Remix strips loader in jsdom; named helpers bypass that.
 * ?code= forwarded through proxy to upstream (default BID).
 * Code selector triggers SSR round-trip via anchor links.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Cơ cấu cổ đông — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/shareholders live payload
// ---------------------------------------------------------------------------

export type Concentration = "high" | "medium" | "low";

export interface HolderRow {
  rank: number;
  name: string;
  quantity: number | null;
  ownPercent: number | null;
}

export interface SelectedSummary {
  code: string;
  holderCount: number;
  top1Name: string;
  top1Pct: number | null;
  top5Pct: number | null;
  disclosedPct: number | null;
  concentration: Concentration;
  concentrationLabel: string;
}

export interface RankingRow {
  code: string;
  holderCount: number;
  top1Pct: number | null;
  top5Pct: number | null;
  disclosedPct: number | null;
  concentration: Concentration;
  concentrationLabel: string;
}

export interface ShareholdersDto {
  generatedAt: string;
  asOf: string;
  codes: string[];
  selectedCode: string;
  holders: HolderRow[];
  selectedSummary: SelectedSummary | null;
  ranking: RankingRow[];
  count: number;
}

// ---------------------------------------------------------------------------
// LoaderData
// ---------------------------------------------------------------------------

export interface LoaderData {
  generatedAt: string;
  asOf: string;
  codes: string[];
  selectedCode: string;
  holders: HolderRow[];
  selectedSummary: SelectedSummary | null;
  ranking: RankingRow[];
  count: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Map concentration value to Tailwind badge CSS class.
 * high=red, medium=yellow, low=green.
 */
export function concentrationColorClass(concentration: Concentration | string): string {
  switch (concentration) {
    case "high":
      return "bg-red-900 text-red-300 border border-red-700";
    case "medium":
      return "bg-amber-900 text-amber-300 border border-amber-700";
    case "low":
      return "bg-emerald-900 text-emerald-300 border border-emerald-700";
    default:
      return "bg-slate-700 text-slate-300 border border-slate-600";
  }
}

/**
 * Format a quantity number with thousands separators (e.g. 1,234,567).
 * null → "—"
 */
export function formatQuantity(q: number | null): string {
  if (q === null || q === undefined) return "—";
  return q.toLocaleString("en-US");
}

/**
 * Format a percent value to 2 decimal places with "%" suffix.
 * null → "—"
 */
export function formatPct(p: number | null): string {
  if (p === null || p === undefined) return "—";
  return `${p.toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// fetchShareholdersData — exported named helper for unit tests
// (Remix strips loader in jsdom; named helper bypasses that)
// ---------------------------------------------------------------------------

export async function fetchShareholdersData(
  origin: string,
  code?: string,
): Promise<LoaderData> {
  let generatedAt = new Date().toISOString();
  let asOf = "";
  let codes: string[] = [];
  let selectedCode = "";
  let holders: HolderRow[] = [];
  let selectedSummary: SelectedSummary | null = null;
  let ranking: RankingRow[] = [];
  let count = 0;
  let error: string | null = null;

  try {
    const urlObj = new URL(`${origin}/api/shareholders`);
    if (code !== undefined && code !== "") {
      urlObj.searchParams.set("code", code);
    }
    const url = urlObj.toString();

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      error = `Upstream returned ${response.status} ${response.statusText}`;
    } else {
      const raw = (await response.json()) as unknown;
      if (raw !== null && typeof raw === "object" && "holders" in raw) {
        const dto = raw as ShareholdersDto;
        generatedAt =
          typeof dto.generatedAt === "string" ? dto.generatedAt : generatedAt;
        asOf = typeof dto.asOf === "string" ? dto.asOf : "";
        codes = Array.isArray(dto.codes) ? dto.codes : [];
        selectedCode =
          typeof dto.selectedCode === "string" ? dto.selectedCode : "";
        holders = Array.isArray(dto.holders) ? dto.holders : [];
        selectedSummary =
          dto.selectedSummary !== null &&
          typeof dto.selectedSummary === "object" &&
          "code" in dto.selectedSummary
            ? dto.selectedSummary
            : null;
        ranking = Array.isArray(dto.ranking) ? dto.ranking : [];
        count = typeof dto.count === "number" ? dto.count : holders.length;
      } else {
        error = "Unexpected response shape from /api/shareholders";
      }
    }
  } catch (err) {
    error =
      err instanceof Error
        ? err.message
        : "Không thể kết nối tới máy chủ dữ liệu cổ đông";
  }

  return {
    generatedAt,
    asOf,
    codes,
    selectedCode,
    holders,
    selectedSummary,
    ranking,
    count,
    error,
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const url = new URL(request.url);
  const codeParam = url.searchParams.get("code") ?? undefined;

  const data = await fetchShareholdersData(origin, codeParam);
  return json<LoaderData>(data);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Concentration badge */
function ConcentrationBadge({
  concentration,
  label,
}: {
  concentration: string;
  label: string;
}) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${concentrationColorClass(concentration)}`}
    >
      {label}
    </span>
  );
}

/** Code selector — SSR round-trip via anchor links */
function CodeSelector({
  codes,
  selectedCode,
  basePath,
}: {
  codes: string[];
  selectedCode: string;
  basePath: string;
}) {
  if (codes.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-slate-400 mr-1">Mã:</span>
      {codes.map((c) => {
        const isSelected = c === selectedCode;
        const href = `${basePath}?code=${c}`;
        return (
          <Link
            key={c}
            to={href}
            className={[
              "rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors",
              isSelected
                ? "bg-slate-600 text-slate-100"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200",
            ].join(" ")}
            aria-current={isSelected ? "page" : undefined}
          >
            {c}
          </Link>
        );
      })}
    </div>
  );
}

/** Summary card for selected company */
function SummaryCard({ summary }: { summary: SelectedSummary }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm font-semibold text-slate-100">
          {summary.code}
        </span>
        <ConcentrationBadge
          concentration={summary.concentration}
          label={summary.concentrationLabel}
        />
      </div>

      {/* Top shareholder */}
      <div className="space-y-1">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
          Cổ đông lớn nhất
        </p>
        <p className="text-sm text-slate-200 break-words">{summary.top1Name}</p>
        <p className="text-xs font-semibold tabular-nums text-slate-300">
          {formatPct(summary.top1Pct)}
        </p>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        <div>
          <p className="text-[11px] text-slate-500 uppercase tracking-wide">
            Top 5
          </p>
          <p className="text-sm font-semibold tabular-nums text-slate-200">
            {formatPct(summary.top5Pct)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-slate-500 uppercase tracking-wide">
            Số cổ đông
          </p>
          <p className="text-sm font-semibold tabular-nums text-slate-200">
            {summary.holderCount.toLocaleString("en-US")}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-2">
          <p className="text-[11px] text-slate-500 uppercase tracking-wide">
            Tỷ lệ sở hữu đã công bố
          </p>
          <p className="text-sm font-semibold tabular-nums text-slate-200">
            {formatPct(summary.disclosedPct)}
          </p>
          <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
            Tổng tỷ lệ các cổ đông đã công bố; có thể vượt 100% do công bố chồng lấp hoặc tổng hợp.
          </p>
        </div>
      </div>
    </div>
  );
}

/** One holder row in the roster table */
function HolderTableRow({ holder }: { holder: HolderRow }) {
  return (
    <tr className="border-b border-slate-700 last:border-0 hover:bg-slate-800/50">
      <td className="px-3 py-2 text-xs tabular-nums text-slate-500 text-right">
        {holder.rank}
      </td>
      <td className="px-3 py-2 text-sm text-slate-200 break-words max-w-xs">
        {holder.name}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatQuantity(holder.quantity)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatPct(holder.ownPercent)}
      </td>
    </tr>
  );
}

/** Cross-company concentration ranking row */
function RankingTableRow({ row }: { row: RankingRow }) {
  return (
    <tr className="border-b border-slate-700 last:border-0 hover:bg-slate-800/50">
      <td className="px-3 py-2 text-xs font-mono font-semibold text-slate-200 whitespace-nowrap">
        {row.code}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right">
        {row.holderCount.toLocaleString("en-US")}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right">
        {formatPct(row.top1Pct)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right">
        {formatPct(row.top5Pct)}
      </td>
      <td className="px-3 py-2 text-right">
        <ConcentrationBadge
          concentration={row.concentration}
          label={row.concentrationLabel}
        />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ShareholdersPage() {
  const {
    asOf,
    codes,
    selectedCode,
    holders,
    selectedSummary,
    ranking,
    error,
  } = useLoaderData<typeof loader>();

  // Base path for code selector links (strip query string).
  const basePath = "/dashboard/shareholders";

  const isEmpty = !error && codes.length === 0;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Cơ cấu cổ đông"
        subtitle={
          selectedCode
            ? `Cổ đông của ${selectedCode}` +
              (asOf ? ` · Cập nhật: ${asOf.slice(0, 10)}` : "")
            : "Chọn mã để xem chi tiết"
        }
        actions={
          <span className="text-xs text-slate-500 text-right">
            {codes.length > 0 && (
              <span className="block font-medium text-slate-300">
                {codes.length} mã
              </span>
            )}
            {asOf && (
              <span className="block text-slate-600">
                Dữ liệu tính đến: {asOf.slice(0, 10)}
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
          Không thể tải dữ liệu cổ đông — {error}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Không có dữ liệu cổ đông
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Không tìm thấy mã nào trong hệ thống.
          </p>
        </div>
      )}

      {/* Main content — only shown when no error and codes present */}
      {!error && !isEmpty && (
        <>
          {/* Code selector */}
          <CodeSelector
            codes={codes}
            selectedCode={selectedCode}
            basePath={basePath}
          />

          {/* Selected-company summary card */}
          {selectedSummary !== null ? (
            <SummaryCard summary={selectedSummary} />
          ) : (
            <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-6 text-center">
              <p className="text-sm text-slate-500">
                Không có thông tin tổng hợp cho mã {selectedCode}.
              </p>
            </div>
          )}

          {/* Holder roster table */}
          {holders.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-x-auto">
              <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Danh sách cổ đông — {selectedCode} ({holders.length} cổ đông)
              </p>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800">
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      #
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">
                      Tên cổ đông
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Số cổ phần
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Tỷ lệ (%)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {holders.map((h) => (
                    <HolderTableRow key={`${h.rank}-${h.name}`} holder={h} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Cross-company concentration ranking */}
          {ranking.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-x-auto">
              <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Xếp hạng mức độ tập trung — {ranking.length} mã (theo tỷ lệ cổ đông lớn nhất)
              </p>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800">
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">
                      Mã
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Số cổ đông
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Top 1 (%)
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Top 5 (%)
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Mức độ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r) => (
                    <RankingTableRow key={r.code} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
