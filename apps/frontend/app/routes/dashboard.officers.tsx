/**
 * /dashboard/officers — Ban lãnh đạo & quản trị.
 *
 * Data source: GET /api/officers (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.officers.tsx, mirroring the api.shareholders.tsx precedent.
 *
 * Endpoint contract (GET /api/officers?code=XXX) — VERIFIED live 2026-06-11:
 *   {
 *     generatedAt: string (ISO),
 *     asOf: string (ISO),
 *     codes: string[],          // 32 codes ASC (BID is first)
 *     selectedCode: string,     // e.g. "BID"
 *     officers: [{ rank, name, position, ownPercent, quantity, appointmentYear }],
 *     selectedSummary: {
 *       code, officerCount, boardSeats, totalInsiderPct,
 *       topName, topPosition, topPct
 *     } | null,
 *     ranking: [{ code, officerCount, boardSeats, totalInsiderPct }],
 *     count: number
 *   }
 *
 * appointmentYear: null for ~64% of rows — show "—", do NOT invent tenure.
 *
 * HONEST FRAMING (load-bearing): totalInsiderPct is the SUM of DISCLOSED insider
 * ownership values only. It will be 0 for state-owned firms (e.g. BID) where
 * individual executive holdings are not publicly disclosed. It is NOT a measure
 * of total insider control — only of what has been formally reported.
 * High totalInsiderPct (HPG ~34%, PDR ~28%) = founder/insider-heavy governance.
 * 0% (BID, state banks) = dispersed/state-controlled, not necessarily zero actual holdings.
 *
 * Named exports (for unit tests):
 *   fetchOfficersData, formatQuantity, formatPct
 *
 * Decision journal (DJ-GATE-1): New read-only dashboard page (TASK17-PAGE15).
 * Named-export helper pattern: Remix strips loader in jsdom; named helpers bypass that.
 * ?code= forwarded through proxy to upstream (default BID).
 * Code selector triggers SSR round-trip via anchor links.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Ban lãnh đạo & quản trị — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/officers live payload
// ---------------------------------------------------------------------------

export interface OfficerRow {
  rank: number;
  name: string;
  position: string;
  ownPercent: number | null;
  quantity: number | null;
  appointmentYear: number | null;
}

export interface SelectedSummary {
  code: string;
  officerCount: number;
  boardSeats: number;
  totalInsiderPct: number;
  topName: string | null;
  topPosition: string | null;
  topPct: number | null;
}

export interface RankingRow {
  code: string;
  officerCount: number;
  boardSeats: number;
  totalInsiderPct: number;
}

export interface OfficersDto {
  generatedAt: string;
  asOf: string;
  codes: string[];
  selectedCode: string;
  officers: OfficerRow[];
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
  officers: OfficerRow[];
  selectedSummary: SelectedSummary | null;
  ranking: RankingRow[];
  count: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers — exported for unit tests
// ---------------------------------------------------------------------------

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
// fetchOfficersData — exported named helper for unit tests
// (Remix strips loader in jsdom; named helper bypasses that)
// ---------------------------------------------------------------------------

export async function fetchOfficersData(
  origin: string,
  code?: string,
): Promise<LoaderData> {
  let generatedAt = new Date().toISOString();
  let asOf = "";
  let codes: string[] = [];
  let selectedCode = "";
  let officers: OfficerRow[] = [];
  let selectedSummary: SelectedSummary | null = null;
  let ranking: RankingRow[] = [];
  let count = 0;
  let error: string | null = null;

  try {
    const urlObj = new URL(`${origin}/api/officers`);
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
      if (raw !== null && typeof raw === "object" && "officers" in raw) {
        const dto = raw as OfficersDto;
        generatedAt =
          typeof dto.generatedAt === "string" ? dto.generatedAt : generatedAt;
        asOf = typeof dto.asOf === "string" ? dto.asOf : "";
        codes = Array.isArray(dto.codes) ? dto.codes : [];
        selectedCode =
          typeof dto.selectedCode === "string" ? dto.selectedCode : "";
        officers = Array.isArray(dto.officers) ? dto.officers : [];
        selectedSummary =
          dto.selectedSummary !== null &&
          typeof dto.selectedSummary === "object" &&
          "code" in dto.selectedSummary
            ? dto.selectedSummary
            : null;
        ranking = Array.isArray(dto.ranking) ? dto.ranking : [];
        count = typeof dto.count === "number" ? dto.count : officers.length;
      } else {
        error = "Unexpected response shape from /api/officers";
      }
    }
  } catch (err) {
    error =
      err instanceof Error
        ? err.message
        : "Không thể kết nối tới máy chủ dữ liệu ban lãnh đạo";
  }

  return {
    generatedAt,
    asOf,
    codes,
    selectedCode,
    officers,
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

  const data = await fetchOfficersData(origin, codeParam);
  return json<LoaderData>(data);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
        <span className="text-xs text-slate-400">
          {summary.officerCount} thành viên · {summary.boardSeats} ghế HĐQT
        </span>
      </div>

      {/* Top officer */}
      {summary.topName && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Lãnh đạo chủ chốt
          </p>
          <p className="text-sm text-slate-200 break-words">{summary.topName}</p>
          {summary.topPosition && (
            <p className="text-xs text-slate-400">{summary.topPosition}</p>
          )}
          {summary.topPct !== null && (
            <p className="text-xs font-semibold tabular-nums text-slate-300">
              {formatPct(summary.topPct)}
            </p>
          )}
        </div>
      )}

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
        <div>
          <p className="text-[11px] text-slate-500 uppercase tracking-wide">
            Số thành viên
          </p>
          <p className="text-sm font-semibold tabular-nums text-slate-200">
            {summary.officerCount}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-slate-500 uppercase tracking-wide">
            Số ghế HĐQT
          </p>
          <p className="text-sm font-semibold tabular-nums text-slate-200">
            {summary.boardSeats}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-[11px] text-slate-500 uppercase tracking-wide">
            Tỷ lệ sở hữu nội bộ đã công bố
          </p>
          <p className="text-sm font-semibold tabular-nums text-slate-200">
            {formatPct(summary.totalInsiderPct)}
          </p>
          <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
            Tổng tỷ lệ sở hữu được công bố của thành viên lãnh đạo; bằng 0 với ngân hàng nhà nước hoặc nơi chưa công bố.
          </p>
        </div>
      </div>
    </div>
  );
}

/** One officer row in the roster table */
function OfficerTableRow({ officer }: { officer: OfficerRow }) {
  return (
    <tr className="border-b border-slate-700 last:border-0 hover:bg-slate-800/50">
      <td className="px-3 py-2 text-xs tabular-nums text-slate-500 text-right">
        {officer.rank}
      </td>
      <td className="px-3 py-2 text-sm text-slate-200 break-words max-w-xs">
        {officer.name}
      </td>
      <td className="px-3 py-2 text-xs text-slate-300 break-words max-w-xs">
        {officer.position}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {officer.appointmentYear !== null ? officer.appointmentYear : "—"}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatQuantity(officer.quantity)}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right whitespace-nowrap">
        {formatPct(officer.ownPercent)}
      </td>
    </tr>
  );
}

/** Cross-company insider ownership ranking row */
function RankingTableRow({ row }: { row: RankingRow }) {
  return (
    <tr className="border-b border-slate-700 last:border-0 hover:bg-slate-800/50">
      <td className="px-3 py-2 text-xs font-mono font-semibold text-slate-200 whitespace-nowrap">
        {row.code}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right">
        {row.officerCount}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right">
        {row.boardSeats}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-slate-300 text-right">
        {formatPct(row.totalInsiderPct)}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OfficersPage() {
  const {
    asOf,
    codes,
    selectedCode,
    officers,
    selectedSummary,
    ranking,
    error,
  } = useLoaderData<typeof loader>();

  // Base path for code selector links (strip query string).
  const basePath = "/dashboard/officers";

  const isEmpty = !error && codes.length === 0;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Ban lãnh đạo & quản trị"
        subtitle={
          selectedCode
            ? `Lãnh đạo của ${selectedCode}` +
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
          Không thể tải dữ liệu ban lãnh đạo — {error}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Không có dữ liệu ban lãnh đạo
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

          {/* Insider-ownership concentration note */}
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-400">Tín hiệu phân tích:</span>{" "}
            Tỷ lệ sở hữu nội bộ cao (HPG ~34%, PDR ~28%) cho thấy doanh nghiệp do người sáng lập hoặc nhóm nội bộ nắm quyền kiểm soát.
            Tỷ lệ 0% (BID và ngân hàng nhà nước) phản ánh sở hữu phân tán hoặc nhà nước — không đồng nghĩa với việc lãnh đạo không có cổ phần.
            Đây là tổng các tỷ lệ đã được công bố chính thức, có thể thấp hơn thực tế.
          </p>

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

          {/* Officers roster table */}
          {officers.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-x-auto">
              <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Danh sách ban lãnh đạo — {selectedCode} ({officers.length} thành viên)
              </p>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800">
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      #
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">
                      Họ tên
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">
                      Chức vụ
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Năm bổ nhiệm
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Số CP
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Tỷ lệ (%)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {officers.map((o) => (
                    <OfficerTableRow key={`${o.rank}-${o.name}`} officer={o} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Cross-company insider ownership ranking */}
          {ranking.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-x-auto">
              <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Xếp hạng sở hữu nội bộ — {ranking.length} mã (theo tỷ lệ sở hữu nội bộ đã công bố)
              </p>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800">
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">
                      Mã
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Số thành viên
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Ghế HĐQT
                    </th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase text-right">
                      Sở hữu nội bộ (%)
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
