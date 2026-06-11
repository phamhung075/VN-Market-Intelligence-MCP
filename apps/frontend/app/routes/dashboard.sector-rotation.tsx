/**
 * /dashboard/sector-rotation — Dòng tiền theo ngành.
 *
 * Data source: GET /api/sector-rotation (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.sector-rotation.tsx, mirroring the api.foreign-flow.tsx precedent.
 *
 * Endpoint contract (GET /api/sector-rotation) — VERIFIED live 2026-06-11:
 *   {
 *     generatedAt: string,
 *     tradingDate: string,           // ISO datetime — MAX(updated_at) from market_prices; "" when empty
 *     priceSource: string,           // "stored"
 *     only1dAvailable: boolean,      // true when 5-day history not yet deep enough
 *     sectors: [
 *       { sector: string, sectorNameVi: string, classification: string,
 *         avg1dReturn: number, avg5dReturn: number | null,
 *         stockCount: number, stocks: string[], watchlistWarning: boolean }
 *     ],
 *     summary: {
 *       inflow: number, outflow: number, neutral: number,
 *       topInflow:  SectorEntry[],   // up to 5 by avg1dReturn DESC
 *       topOutflow: SectorEntry[]    // up to 5 by avg1dReturn ASC
 *     },
 *     count: number
 *   }
 *
 * classification ∈ {"DONG_TIEN_VAO","DONG_TIEN_RA","NEUTRAL"}.
 * avg5dReturn is null for all sectors when only1dAvailable === true.
 *
 * Anti-demo requirement: when only1dAvailable === true, show a transparent info
 * banner — do NOT fabricate a 5-day verdict. Rows sorted as returned by endpoint
 * (avg1dReturn DESC when only1dAvailable, otherwise by 5d classification logic).
 *
 * Named exports (for unit tests):
 *   fetchSectorRotationData, formatReturn, returnColorClass,
 *   classificationLabel, classificationBadgeClass, format5dReturn
 *
 * Decision journal (DJ-GATE-1): New read-only dashboard page.
 * No state mutations, no DB access from frontend — pure HTTP read over proxy.
 * Single route (no dual mode needed — endpoint takes no params).
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Dòng tiền theo ngành — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/sector-rotation live payload (STEP 0)
// ---------------------------------------------------------------------------

export type Classification = "DONG_TIEN_VAO" | "DONG_TIEN_RA" | "NEUTRAL";

export interface SectorEntry {
  sector: string;
  sectorNameVi: string;
  classification: Classification;
  avg1dReturn: number;
  avg5dReturn: number | null;
  stockCount: number;
  stocks: string[];
  watchlistWarning: boolean;
}

export interface SectorSummary {
  inflow: number;
  outflow: number;
  neutral: number;
  topInflow: SectorEntry[];
  topOutflow: SectorEntry[];
}

export interface SectorRotationDto {
  generatedAt: string;
  tradingDate: string;
  priceSource: string;
  only1dAvailable: boolean;
  sectors: SectorEntry[];
  summary: SectorSummary;
  count: number;
}

// ---------------------------------------------------------------------------
// LoaderData
// ---------------------------------------------------------------------------

export interface LoaderData {
  generatedAt: string;
  tradingDate: string;
  priceSource: string;
  only1dAvailable: boolean;
  sectors: SectorEntry[];
  summary: SectorSummary;
  count: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// fetchSectorRotationData — exported named helper for unit tests
// (Remix strips loader in jsdom; named helper bypasses that)
// ---------------------------------------------------------------------------

const EMPTY_SUMMARY: SectorSummary = {
  inflow: 0,
  outflow: 0,
  neutral: 0,
  topInflow: [],
  topOutflow: [],
};

export async function fetchSectorRotationData(
  origin: string
): Promise<LoaderData> {
  let generatedAt = new Date().toISOString();
  let tradingDate = "";
  let priceSource = "stored";
  let only1dAvailable = false;
  let sectors: SectorEntry[] = [];
  let summary: SectorSummary = { ...EMPTY_SUMMARY };
  let count = 0;
  let error: string | null = null;

  try {
    const url = `${origin}/api/sector-rotation`;

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      error = `Upstream returned ${response.status} ${response.statusText}`;
    } else {
      const raw = (await response.json()) as unknown;
      if (raw !== null && typeof raw === "object" && "sectors" in raw) {
        const dto = raw as SectorRotationDto;
        generatedAt =
          typeof dto.generatedAt === "string" ? dto.generatedAt : generatedAt;
        tradingDate =
          typeof dto.tradingDate === "string" ? dto.tradingDate : "";
        priceSource =
          typeof dto.priceSource === "string" ? dto.priceSource : "stored";
        only1dAvailable =
          typeof dto.only1dAvailable === "boolean" ? dto.only1dAvailable : false;
        sectors = Array.isArray(dto.sectors) ? dto.sectors : [];
        count = typeof dto.count === "number" ? dto.count : sectors.length;

        if (
          dto.summary !== null &&
          typeof dto.summary === "object" &&
          "inflow" in dto.summary
        ) {
          summary = {
            inflow:
              typeof dto.summary.inflow === "number" ? dto.summary.inflow : 0,
            outflow:
              typeof dto.summary.outflow === "number" ? dto.summary.outflow : 0,
            neutral:
              typeof dto.summary.neutral === "number" ? dto.summary.neutral : 0,
            topInflow: Array.isArray(dto.summary.topInflow)
              ? dto.summary.topInflow
              : [],
            topOutflow: Array.isArray(dto.summary.topOutflow)
              ? dto.summary.topOutflow
              : [],
          };
        }
      } else {
        error = "Unexpected response shape from /api/sector-rotation";
      }
    }
  } catch (err) {
    error =
      err instanceof Error
        ? err.message
        : "Không thể kết nối tới máy chủ dữ liệu ngành";
  }

  return {
    generatedAt,
    tradingDate,
    priceSource,
    only1dAvailable,
    sectors,
    summary,
    count,
    error,
  };
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const data = await fetchSectorRotationData(origin);
  return json<LoaderData>(data);
}

// ---------------------------------------------------------------------------
// Helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Format avg1dReturn or avg5dReturn as a signed percentage string.
 * e.g. 2.135 → "+2.13%", -1.66 → "-1.66%", 0 → "0.00%"
 */
export function formatReturn(pct: number): string {
  const fixed = pct.toFixed(2);
  if (pct > 0) return `+${fixed}%`;
  return `${fixed}%`;
}

/**
 * Map return value to Tailwind text-color class.
 * Positive → green, negative → red, zero → slate.
 */
export function returnColorClass(pct: number): string {
  if (pct > 0) return "text-emerald-400";
  if (pct < 0) return "text-red-400";
  return "text-slate-400";
}

/**
 * Map classification to Vietnamese display label.
 */
export function classificationLabel(cls: Classification | string): string {
  switch (cls) {
    case "DONG_TIEN_VAO":
      return "VÀO";
    case "DONG_TIEN_RA":
      return "RA";
    case "NEUTRAL":
    default:
      return "TRUNG LẬP";
  }
}

/**
 * Map classification to Tailwind badge class.
 */
export function classificationBadgeClass(cls: Classification | string): string {
  switch (cls) {
    case "DONG_TIEN_VAO":
      return "bg-emerald-900 text-emerald-300 border border-emerald-700";
    case "DONG_TIEN_RA":
      return "bg-red-900 text-red-300 border border-red-700";
    case "NEUTRAL":
    default:
      return "bg-slate-700 text-slate-300 border border-slate-600";
  }
}

/**
 * Format the 5-day return field.
 * null → "đang tích lũy" (still accumulating).
 * number → formatReturn(pct).
 */
export function format5dReturn(pct: number | null): string {
  if (pct === null || pct === undefined) return "đang tích lũy";
  return formatReturn(pct);
}

/**
 * Format an ISO trading date string for Vietnamese readers.
 * e.g. "2026-06-11T12:15:02.679Z" → "11/06/2026, 12:15:02"
 * Empty string → "—"
 */
export function formatTradingDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN");
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Classification badge */
function ClassificationBadge({ cls }: { cls: Classification | string }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${classificationBadgeClass(cls)}`}
    >
      {classificationLabel(cls)}
    </span>
  );
}

/** Summary stat card — inflow / outflow / neutral counts */
function StatCard({
  label,
  count,
  colorClass,
  borderClass,
}: {
  label: string;
  count: number;
  colorClass: string;
  borderClass: string;
}) {
  return (
    <div
      className={`flex-1 rounded-lg border ${borderClass} bg-slate-800 px-4 py-3 text-center`}
    >
      <p className={`text-2xl font-bold ${colorClass}`}>{count}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-500 uppercase tracking-wide">
        {label}
      </p>
    </div>
  );
}

/** Top-N sector list (topInflow / topOutflow) */
function TopSectorCard({
  title,
  entries,
  colorClass,
  borderClass,
}: {
  title: string;
  entries: SectorEntry[];
  colorClass: string;
  borderClass: string;
}) {
  if (entries.length === 0) {
    return (
      <div
        className={`flex-1 rounded-lg border ${borderClass} bg-slate-800 px-4 py-3`}
      >
        <p
          className={`mb-2 text-xs font-semibold uppercase tracking-wide ${colorClass}`}
        >
          {title}
        </p>
        <p className="text-xs text-slate-600">Chưa có dữ liệu.</p>
      </div>
    );
  }

  return (
    <div
      className={`flex-1 rounded-lg border ${borderClass} bg-slate-800 px-4 py-3`}
    >
      <p
        className={`mb-2 text-xs font-semibold uppercase tracking-wide ${colorClass}`}
      >
        {title}
      </p>
      <ul className="space-y-1.5">
        {entries.map((e) => (
          <li
            key={e.sector}
            className="flex items-center justify-between gap-2"
          >
            <span className="text-sm font-bold text-slate-100">
              {e.sectorNameVi}
            </span>
            <span className={`text-xs font-semibold ${colorClass}`}>
              {formatReturn(e.avg1dReturn)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One sector table row */
function SectorRow({
  entry,
  rank,
  idx,
}: {
  entry: SectorEntry;
  rank: number;
  idx: number;
}) {
  const rowBg = idx % 2 === 0 ? "bg-slate-800" : "bg-slate-850";

  return (
    <tr className={`border-b border-slate-700 last:border-0 ${rowBg}`}>
      {/* Rank */}
      <td className="px-3 py-2 text-xs tabular-nums text-slate-500 text-center">
        {rank}
      </td>
      {/* Sector (Vietnamese name) */}
      <td className="px-3 py-2 text-xs font-bold text-slate-100 whitespace-nowrap">
        {entry.sectorNameVi}
        {entry.watchlistWarning && (
          <span
            title="Danh mục theo dõi có cổ phiếu trong ngành này"
            className="ml-1.5 inline-block rounded bg-amber-900 border border-amber-700 px-1 py-0.5 text-[9px] font-bold text-amber-300 uppercase"
          >
            ⚠
          </span>
        )}
      </td>
      {/* Avg 1d return */}
      <td
        className={`px-3 py-2 text-xs font-semibold tabular-nums text-right ${returnColorClass(entry.avg1dReturn)}`}
      >
        {formatReturn(entry.avg1dReturn)}
      </td>
      {/* Avg 5d return */}
      <td
        className={`px-3 py-2 text-xs tabular-nums text-right ${
          entry.avg5dReturn !== null
            ? returnColorClass(entry.avg5dReturn)
            : "text-slate-600 italic"
        }`}
      >
        {format5dReturn(entry.avg5dReturn)}
      </td>
      {/* Classification badge */}
      <td className="px-3 py-2">
        <ClassificationBadge cls={entry.classification} />
      </td>
      {/* Stock count */}
      <td className="px-3 py-2 text-xs text-slate-400 tabular-nums text-center">
        {entry.stockCount}
      </td>
      {/* Member stock codes */}
      <td className="px-3 py-2 text-xs text-slate-500 max-w-[180px]">
        <span className="line-clamp-2 leading-relaxed">
          {entry.stocks.join(", ")}
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SectorRotationPage() {
  const {
    tradingDate,
    only1dAvailable,
    sectors,
    summary,
    count,
    error,
    generatedAt,
  } = useLoaderData<typeof loader>();

  const isEmpty = !error && count === 0;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Dòng tiền theo ngành"
        subtitle="Xếp hạng ngành theo biến động giá bình quân — theo dõi dòng tiền vào/ra thị trường"
        actions={
          <span className="text-xs text-slate-500">
            {count > 0 && (
              <span className="mr-3 font-medium text-slate-300">
                {count} ngành
              </span>
            )}
            {tradingDate && (
              <span>Phiên: {formatTradingDate(tradingDate)}</span>
            )}
            {!tradingDate && generatedAt && (
              <span>{new Date(generatedAt).toLocaleTimeString("vi-VN")}</span>
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
          Không thể tải dữ liệu dòng tiền theo ngành — {error}
        </div>
      )}

      {/* Honest 5d-accumulating banner — shown whenever only1dAvailable is true */}
      {!error && only1dAvailable && (
        <div
          role="status"
          className="rounded border border-blue-700 bg-blue-950 px-4 py-3 text-sm text-blue-300"
        >
          <span className="font-semibold">Đang tích lũy lịch sử 5 ngày.</span>{" "}
          Phân loại Dòng tiền VÀO / RA dựa trên biến động bình quân 5 ngày —
          hiện tại hệ thống chưa đủ dữ liệu lịch sử để xác định chiều dòng
          tiền. Trang này đang xếp hạng theo mức tăng/giảm 1 ngày và tất cả
          ngành hiển thị trạng thái TRUNG LẬP. Phân loại sẽ tự động nâng cấp
          khi lịch sử đủ 5 phiên.
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Chưa có dữ liệu dòng tiền theo ngành.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Hệ thống đang cập nhật dữ liệu. Vui lòng thử lại sau.
          </p>
        </div>
      )}

      {/* Summary stat cards — inflow / outflow / neutral */}
      {!error && !isEmpty && (
        <div className="flex flex-col gap-4 sm:flex-row">
          <StatCard
            label="Dòng tiền VÀO"
            count={summary.inflow}
            colorClass="text-emerald-400"
            borderClass="border-emerald-800"
          />
          <StatCard
            label="Dòng tiền RA"
            count={summary.outflow}
            colorClass="text-red-400"
            borderClass="border-red-800"
          />
          <StatCard
            label="Trung lập"
            count={summary.neutral}
            colorClass="text-slate-400"
            borderClass="border-slate-600"
          />
        </div>
      )}

      {/* Top inflow / top outflow highlight cards */}
      {!error && !isEmpty && (
        <div className="flex flex-col gap-4 sm:flex-row">
          <TopSectorCard
            title="Tăng mạnh nhất (top tăng)"
            entries={summary.topInflow}
            colorClass="text-emerald-400"
            borderClass="border-emerald-800"
          />
          <TopSectorCard
            title="Giảm mạnh nhất (top giảm)"
            entries={summary.topOutflow}
            colorClass="text-red-400"
            borderClass="border-red-800"
          />
        </div>
      )}

      {/* Main sector ranking table */}
      {sectors.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900 text-left">
                <th className="px-3 py-2 font-medium text-slate-400 text-center whitespace-nowrap w-10">
                  #
                </th>
                <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap">
                  Ngành
                </th>
                <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap text-right">
                  BQ 1 ngày
                </th>
                <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap text-right">
                  BQ 5 ngày
                </th>
                <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap">
                  Phân loại
                </th>
                <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap text-center">
                  Số CP
                </th>
                <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap">
                  Cổ phiếu
                </th>
              </tr>
            </thead>
            <tbody>
              {sectors.map((entry, idx) => (
                <SectorRow
                  key={entry.sector}
                  entry={entry}
                  rank={idx + 1}
                  idx={idx}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
