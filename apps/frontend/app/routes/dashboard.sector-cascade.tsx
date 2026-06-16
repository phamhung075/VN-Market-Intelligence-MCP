/**
 * /dashboard/sector-cascade — Tín hiệu dây chuyền theo ngành.
 *
 * Data source: GET /api/sector-cascade (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.sector-cascade.tsx, mirroring the api.sector-rotation.tsx precedent.
 *
 * THIS PAGE IS DISTINCT FROM PAGE 9 (Dòng tiền theo ngành = price-based money flow).
 * This page = news/event CASCADE pressure per sector: how many bullish vs bearish vs neutral
 * news-rule triggers fired per sector over the window.
 * netBias = (up hits − down hits).
 * It answers "where is the NEWS FLOW leaning?" not "where did PRICE move?".
 *
 * Endpoint contract (GET /api/sector-cascade?days=7) — VERIFIED live 2026-06-11:
 *   {
 *     generatedAt: string (ISO),
 *     windowDays: number (default 7, server clamps [1,30]),
 *     windowStart: string "YYYY-MM-DD HH:MM:SS",
 *     source: "cascade_rules",
 *     sectors: [ {
 *       sector: string, up: number, down: number, neutral: number,
 *       total: number, netBias: number
 *     }],  // sorted netBias DESC, tie-break total DESC
 *     summary: {
 *       bullishSectors: number, bearishSectors: number, neutralSectors: number,
 *       topBullish: SectorCascadeEntry[],   // up to 5, netBias DESC
 *       topBearish: SectorCascadeEntry[]    // up to 5, netBias ASC
 *     },
 *     recentHits: [ {
 *       ruleKey: string, sector: string,
 *       direction: "up" | "down" | "neutral",
 *       matchedText: string,
 *       affectedStocks: string[],
 *       hitAt: string "YYYY-MM-DD HH:MM:SS",
 *       confidence: number | null
 *     }],  // up to 40, hit_at DESC
 *     count: number   // sectors.length
 *   }
 *
 * NOTE: confidence is almost always null — shown inline on a hit only when present.
 * affectedStocks is often [] — renders "—" gracefully.
 *
 * Named exports (for unit tests):
 *   fetchSectorCascadeData, netBiasLabel, netBiasBadgeClass, directionLabel,
 *   directionBadgeClass, formatHitAt, sectorNameViMap, getSectorNameVi
 *
 * Decision journal (DJ-GATE-1): New read-only dashboard page.
 * No state mutations, no DB access from frontend — pure HTTP read over proxy.
 * Distinct lens from page 9: news/event cascade hits (not price movement).
 * Named-export helper pattern (Remix strips loader in jsdom; helper bypasses that).
 * ?days=7 query string forwarded through proxy to upstream.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { PageHeader } from "~/components/PageHeader";
import { safeFetch } from "~/lib/api/fetchUtils";

export const meta: MetaFunction = () => [
  { title: "Tín hiệu dây chuyền theo ngành — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/sector-cascade live payload
// ---------------------------------------------------------------------------

export interface SectorCascadeEntry {
  sector: string;
  up: number;
  down: number;
  neutral: number;
  total: number;
  netBias: number;
}

export interface CascadeSummary {
  bullishSectors: number;
  bearishSectors: number;
  neutralSectors: number;
  topBullish: SectorCascadeEntry[];
  topBearish: SectorCascadeEntry[];
}

export interface RecentHit {
  ruleKey: string;
  sector: string;
  direction: "up" | "down" | "neutral";
  matchedText: string;
  affectedStocks: string[];
  hitAt: string;
  confidence: number | null;
}

export interface SectorCascadeDto {
  generatedAt: string;
  windowDays: number;
  windowStart: string;
  source: string;
  sectors: SectorCascadeEntry[];
  summary: CascadeSummary;
  recentHits: RecentHit[];
  count: number;
}

// ---------------------------------------------------------------------------
// LoaderData
// ---------------------------------------------------------------------------

export interface LoaderData {
  generatedAt: string;
  windowDays: number;
  windowStart: string;
  source: string;
  sectors: SectorCascadeEntry[];
  summary: CascadeSummary;
  recentHits: RecentHit[];
  count: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Vietnamese sector name map — all 17 live sector keys + fallback
// ---------------------------------------------------------------------------

export const sectorNameViMap: Record<string, string> = {
  tech: "Công nghệ",
  real_estate: "Bất động sản",
  retail: "Bán lẻ",
  gold_mining: "Khai khoáng/Vàng",
  logistics: "Vận tải/Logistics",
  aviation: "Hàng không",
  pharma: "Dược phẩm",
  utilities: "Tiện ích",
  construction: "Xây dựng",
  agriculture: "Nông nghiệp",
  steel: "Thép",
  machinery: "Máy móc/Cơ khí",
  chemicals: "Hóa chất",
  automotive: "Ô tô/Xe máy",
  securities: "Chứng khoán",
  banking: "Ngân hàng",
  oil_gas: "Dầu khí",
  // Additional keys from page 9 (defensive coverage)
  food: "Thực phẩm",
  insurance: "Bảo hiểm",
  realestate: "Bất động sản",
  other: "Khác",
};

/**
 * Get Vietnamese label for a sector key.
 * Falls back to the raw key if unmapped — never crashes.
 */
export function getSectorNameVi(sector: string): string {
  return sectorNameViMap[sector] ?? sector;
}

// ---------------------------------------------------------------------------
// Helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Map netBias value to Vietnamese badge label.
 * netBias > 0 → "TÍCH CỰC" (bullish)
 * netBias < 0 → "TIÊU CỰC" (bearish)
 * netBias === 0 → "TRUNG TÍNH" (neutral)
 */
export function netBiasLabel(netBias: number): string {
  if (netBias > 0) return "TÍCH CỰC";
  if (netBias < 0) return "TIÊU CỰC";
  return "TRUNG TÍNH";
}

/**
 * Map netBias to Tailwind badge CSS class.
 */
export function netBiasBadgeClass(netBias: number): string {
  if (netBias > 0) return "bg-emerald-900 text-emerald-300 border border-emerald-700";
  if (netBias < 0) return "bg-red-900 text-red-300 border border-red-700";
  return "bg-slate-700 text-slate-300 border border-slate-600";
}

/**
 * Map recentHit direction to Vietnamese display label.
 * "up" → "Tăng", "down" → "Giảm", "neutral" → "Trung tính"
 */
export function directionLabel(direction: "up" | "down" | "neutral" | string): string {
  switch (direction) {
    case "up":
      return "Tăng";
    case "down":
      return "Giảm";
    case "neutral":
    default:
      return "Trung tính";
  }
}

/**
 * Map recentHit direction to Tailwind badge CSS class.
 */
export function directionBadgeClass(direction: "up" | "down" | "neutral" | string): string {
  switch (direction) {
    case "up":
      return "bg-emerald-900 text-emerald-300 border border-emerald-700";
    case "down":
      return "bg-red-900 text-red-300 border border-red-700";
    case "neutral":
    default:
      return "bg-slate-700 text-slate-300 border border-slate-600";
  }
}

/**
 * Format hitAt timestamp for Vietnamese readers.
 * e.g. "2026-06-10 14:35:22" → "10/06/2026, 14:35:22"
 * Empty string → "—"
 */
export function formatHitAt(hitAt: string): string {
  if (!hitAt) return "—";
  try {
    // Handle both ISO and "YYYY-MM-DD HH:MM:SS" formats
    const normalized = hitAt.includes("T") ? hitAt : hitAt.replace(" ", "T");
    return new Date(normalized).toLocaleString("vi-VN");
  } catch {
    return hitAt;
  }
}

// ---------------------------------------------------------------------------
// fetchSectorCascadeData — exported named helper for unit tests
// (Remix strips loader in jsdom; named helper bypasses that)
// ---------------------------------------------------------------------------

const EMPTY_SUMMARY: CascadeSummary = {
  bullishSectors: 0,
  bearishSectors: 0,
  neutralSectors: 0,
  topBullish: [],
  topBearish: [],
};

function parseSectorCascadeDto(raw: unknown): SectorCascadeDto {
  const now = new Date().toISOString();
  if (raw === null) {
    return {
      generatedAt: now,
      windowDays: 7,
      windowStart: "",
      source: "cascade_rules",
      sectors: [],
      summary: { ...EMPTY_SUMMARY },
      recentHits: [],
      count: 0,
    };
  }
  if (typeof raw !== "object" || !("sectors" in raw)) {
    throw new Error("Unexpected response shape from /api/sector-cascade");
  }
  const dto = raw as SectorCascadeDto;
  const sectors = Array.isArray(dto.sectors) ? dto.sectors : [];
  const summary =
    dto.summary !== null &&
    typeof dto.summary === "object" &&
    "bullishSectors" in dto.summary
      ? {
          bullishSectors: typeof dto.summary.bullishSectors === "number" ? dto.summary.bullishSectors : 0,
          bearishSectors: typeof dto.summary.bearishSectors === "number" ? dto.summary.bearishSectors : 0,
          neutralSectors: typeof dto.summary.neutralSectors === "number" ? dto.summary.neutralSectors : 0,
          topBullish: Array.isArray(dto.summary.topBullish) ? dto.summary.topBullish : [],
          topBearish: Array.isArray(dto.summary.topBearish) ? dto.summary.topBearish : [],
        }
      : { ...EMPTY_SUMMARY };
  return {
    generatedAt: typeof dto.generatedAt === "string" ? dto.generatedAt : now,
    windowDays: typeof dto.windowDays === "number" ? dto.windowDays : 7,
    windowStart: typeof dto.windowStart === "string" ? dto.windowStart : "",
    source: typeof dto.source === "string" ? dto.source : "cascade_rules",
    sectors,
    summary,
    recentHits: Array.isArray(dto.recentHits) ? dto.recentHits : [],
    count: typeof dto.count === "number" ? dto.count : sectors.length,
  };
}

export async function fetchSectorCascadeData(
  origin: string,
  days?: number
): Promise<LoaderData> {
  const urlObj = new URL(`${origin}/api/sector-cascade`);
  if (days !== undefined) {
    urlObj.searchParams.set("days", String(days));
  }
  const url = urlObj.toString();

  const { data, error } = await safeFetch<SectorCascadeDto>(url, parseSectorCascadeDto, {
    label: "dashboard.sector-cascade",
  });
  return {
    generatedAt: data.generatedAt,
    windowDays: data.windowDays,
    windowStart: data.windowStart,
    source: data.source,
    sectors: data.sectors,
    summary: data.summary,
    recentHits: data.recentHits,
    count: data.count,
    error,
  };
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const data = await fetchSectorCascadeData(origin, 7);
  return json<LoaderData>(data);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** netBias badge */
function NetBiasBadge({ netBias }: { netBias: number }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${netBiasBadgeClass(netBias)}`}
    >
      {netBiasLabel(netBias)}
      {netBias !== 0 && (
        <span className="ml-1 font-normal">
          {netBias > 0 ? `+${netBias}` : netBias}
        </span>
      )}
    </span>
  );
}

/** Direction badge for recentHits */
function DirectionBadge({ direction }: { direction: "up" | "down" | "neutral" | string }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${directionBadgeClass(direction)}`}
    >
      {directionLabel(direction)}
    </span>
  );
}

/** Summary stat card */
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

/** Top-N sector list (topBullish / topBearish) */
function TopSectorCard({
  title,
  entries,
  colorClass,
  borderClass,
}: {
  title: string;
  entries: SectorCascadeEntry[];
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
              {getSectorNameVi(e.sector)}
            </span>
            <span className={`text-xs font-semibold tabular-nums ${colorClass}`}>
              {e.netBias > 0 ? `+${e.netBias}` : e.netBias}
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
  entry: SectorCascadeEntry;
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
        {getSectorNameVi(entry.sector)}
      </td>
      {/* Up hits (green) */}
      <td className="px-3 py-2 text-xs font-semibold tabular-nums text-center text-emerald-400">
        {entry.up}
      </td>
      {/* Down hits (red) */}
      <td className="px-3 py-2 text-xs font-semibold tabular-nums text-center text-red-400">
        {entry.down}
      </td>
      {/* Neutral hits (grey) */}
      <td className="px-3 py-2 text-xs tabular-nums text-center text-slate-400">
        {entry.neutral}
      </td>
      {/* Total hits */}
      <td className="px-3 py-2 text-xs tabular-nums text-center text-slate-300">
        {entry.total}
      </td>
      {/* netBias badge */}
      <td className="px-3 py-2">
        <NetBiasBadge netBias={entry.netBias} />
      </td>
    </tr>
  );
}

/** One recent hit row */
function RecentHitRow({ hit }: { hit: RecentHit }) {
  const sectorLabel = getSectorNameVi(hit.sector);
  const hasStocks = Array.isArray(hit.affectedStocks) && hit.affectedStocks.length > 0;

  return (
    <div className="border-b border-slate-700 last:border-0 px-4 py-3 space-y-1.5">
      {/* Header row: sector label + direction badge + time */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-300">{sectorLabel}</span>
        <DirectionBadge direction={hit.direction} />
        {hit.confidence !== null && hit.confidence !== undefined && (
          <span className="text-[10px] text-slate-500 font-medium">
            ({Math.round(hit.confidence * 100)}%)
          </span>
        )}
        <span className="ml-auto text-[10px] text-slate-600 tabular-nums whitespace-nowrap">
          {formatHitAt(hit.hitAt)}
        </span>
      </div>
      {/* matchedText — the headline / reasoning material */}
      <p className="text-sm text-slate-200 leading-relaxed">{hit.matchedText}</p>
      {/* affectedStocks chips (when non-empty) */}
      {hasStocks && (
        <div className="flex flex-wrap gap-1">
          {hit.affectedStocks.map((ticker) => (
            <span
              key={ticker}
              className="inline-block rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-300"
            >
              {ticker}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SectorCascadePage() {
  const {
    generatedAt,
    windowDays,
    sectors,
    summary,
    count,
    recentHits,
    error,
  } = useLoaderData<typeof loader>();

  const isEmpty = !error && count === 0;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Tín hiệu dây chuyền theo ngành"
        subtitle="Áp lực tin tức/sự kiện theo ngành — theo dõi chiều hướng dòng chảy thông tin (khác với dòng tiền giá). Đây là tín hiệu từ các quy tắc kích hoạt theo sự kiện, không phải biến động giá."
        actions={
          <span className="text-xs text-slate-500">
            {count > 0 && (
              <span className="mr-3 font-medium text-slate-300">
                {count} ngành
              </span>
            )}
            <span className="mr-3">
              {windowDays} ngày gần nhất
            </span>
            {generatedAt && (
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
          Không thể tải dữ liệu tín hiệu dây chuyền ngành — {error}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Chưa có dữ liệu tín hiệu dây chuyền theo ngành.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Hệ thống đang cập nhật dữ liệu. Vui lòng thử lại sau.
          </p>
        </div>
      )}

      {/* Summary stat cards — bullish / bearish / neutral */}
      {!error && !isEmpty && (
        <div className="flex flex-col gap-4 sm:flex-row">
          <StatCard
            label="Số ngành tích cực"
            count={summary.bullishSectors}
            colorClass="text-emerald-400"
            borderClass="border-emerald-800"
          />
          <StatCard
            label="Số ngành tiêu cực"
            count={summary.bearishSectors}
            colorClass="text-red-400"
            borderClass="border-red-800"
          />
          <StatCard
            label="Số ngành trung tính"
            count={summary.neutralSectors}
            colorClass="text-slate-400"
            borderClass="border-slate-600"
          />
        </div>
      )}

      {/* Top bullish / top bearish highlight cards */}
      {!error && !isEmpty && (
        <div className="flex flex-col gap-4 sm:flex-row">
          <TopSectorCard
            title="Top tích cực (netBias cao nhất)"
            entries={summary.topBullish}
            colorClass="text-emerald-400"
            borderClass="border-emerald-800"
          />
          <TopSectorCard
            title="Top tiêu cực (netBias thấp nhất)"
            entries={summary.topBearish}
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
                <th className="px-3 py-2 font-medium text-emerald-400 whitespace-nowrap text-center">
                  Tăng
                </th>
                <th className="px-3 py-2 font-medium text-red-400 whitespace-nowrap text-center">
                  Giảm
                </th>
                <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap text-center">
                  Trung tính
                </th>
                <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap text-center">
                  Tổng
                </th>
                <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap">
                  Xu hướng tin
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

      {/* Recent hits — the key reasoning section */}
      {!error && recentHits.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Tin tức kích hoạt gần đây
          </h2>
          <p className="text-xs text-slate-500">
            Các sự kiện/tin tức đã kích hoạt quy tắc dây chuyền — đây là nguyên liệu phân tích của nhà đầu tư.
          </p>
          <div className="rounded-lg border border-slate-700 bg-slate-800">
            {recentHits.map((hit, idx) => (
              <RecentHitRow key={`${hit.ruleKey}-${idx}`} hit={hit} />
            ))}
          </div>
        </div>
      )}

      {/* No recent hits empty state (only when sectors are present) */}
      {!error && !isEmpty && recentHits.length === 0 && (
        <div className="rounded border border-slate-700 bg-slate-800 px-4 py-3 text-xs text-slate-500">
          Chưa có tin tức kích hoạt trong cửa sổ {windowDays} ngày.
        </div>
      )}
    </div>
  );
}
