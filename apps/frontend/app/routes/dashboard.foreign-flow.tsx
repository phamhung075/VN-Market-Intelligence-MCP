/**
 * /dashboard/foreign-flow — Khối Ngoại (Foreign Flow).
 *
 * Data source: GET /api/foreign-flow (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.foreign-flow.tsx, mirroring the api.alerts.tsx precedent.
 *
 * Endpoint contract (GET /api/foreign-flow?limit=200) — VERIFIED live 2026-06-11:
 *   {
 *     tradingDate: string,           // "2026-06-11"
 *     items: [
 *       { code: string, foreignVolume: number, direction: "BUY"|"SELL"|"FLAT",
 *         foreignRoom: number, currentHoldingRatio: number|null,
 *         maxHoldingRatio: number|null, marketCapBn: number|null,
 *         fetchedAt: string }
 *     ],
 *     summary: {
 *       netBuyCount: number, netSellCount: number,
 *       topBuys: ForeignFlowItem[], topSells: ForeignFlowItem[]
 *     },
 *     count: number, fetchedAt: string
 *   }
 *
 * CRITICAL null-tolerance: currentHoldingRatio, maxHoldingRatio, marketCapBn are
 * NULL on today's rows — render "—", NEVER 0, NEVER crash.
 * direction ∈ "BUY"|"SELL"|"FLAT". foreignVolume is a signed integer (net shares).
 *
 * Sections rendered (all copy in plain Vietnamese):
 *   - PageHeader: ngày giao dịch + headline "khối ngoại" summary banner
 *     (netBuyCount vs netSellCount, green/red contrast) — user reads this FIRST.
 *   - Two side-by-side highlight cards: topBuys / topSells (ticker + signed volume).
 *   - Full sortable table of items: Mã, KL ròng, Chiều, Room ngoại,
 *     Tỷ lệ sở hữu, Vốn hóa.
 *   - Honest empty state when items is empty.
 *
 * Named export fetchForeignFlowData(origin, params?) for direct unit testing.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Khối Ngoại — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/foreign-flow DTO contract (live 2026-06-11)
// ---------------------------------------------------------------------------

export type ForeignDirection = "BUY" | "SELL" | "FLAT";

export interface ForeignFlowItem {
  code: string;
  foreignVolume: number;
  direction: ForeignDirection;
  foreignRoom: number;
  currentHoldingRatio: number | null;
  maxHoldingRatio: number | null;
  marketCapBn: number | null;
  fetchedAt: string;
}

export interface ForeignFlowSummary {
  netBuyCount: number;
  netSellCount: number;
  topBuys: ForeignFlowItem[];
  topSells: ForeignFlowItem[];
}

export interface ForeignFlowDto {
  tradingDate: string;
  items: ForeignFlowItem[];
  summary: ForeignFlowSummary;
  count: number;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// LoaderData
// ---------------------------------------------------------------------------

export interface LoaderData {
  tradingDate: string;
  items: ForeignFlowItem[];
  summary: ForeignFlowSummary;
  count: number;
  fetchedAt: string;
  error: string | null;
}

// ---------------------------------------------------------------------------
// fetchForeignFlowData — exported named helper for unit tests
// (Remix strips loader in jsdom; named helper bypasses that — same pattern
//  as fetchAlertsData in dashboard.alerts.tsx)
// ---------------------------------------------------------------------------

const EMPTY_SUMMARY: ForeignFlowSummary = {
  netBuyCount: 0,
  netSellCount: 0,
  topBuys: [],
  topSells: [],
};

export async function fetchForeignFlowData(
  origin: string,
  params?: { limit?: number }
): Promise<LoaderData> {
  let tradingDate = "";
  let items: ForeignFlowItem[] = [];
  let summary: ForeignFlowSummary = { ...EMPTY_SUMMARY };
  let count = 0;
  let fetchedAt = new Date().toISOString();
  let error: string | null = null;

  try {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) {
      qs.set("limit", String(params.limit));
    }
    const qsStr = qs.toString();
    const url = `${origin}/api/foreign-flow${qsStr ? `?${qsStr}` : ""}`;

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      error = `Upstream returned ${response.status} ${response.statusText}`;
    } else {
      const raw = (await response.json()) as unknown;
      if (raw !== null && typeof raw === "object" && "items" in raw) {
        const dto = raw as ForeignFlowDto;
        tradingDate =
          typeof dto.tradingDate === "string" ? dto.tradingDate : "";
        items = Array.isArray(dto.items) ? dto.items : [];
        count = typeof dto.count === "number" ? dto.count : items.length;
        fetchedAt =
          typeof dto.fetchedAt === "string" ? dto.fetchedAt : fetchedAt;
        summary =
          dto.summary !== null &&
          typeof dto.summary === "object" &&
          "netBuyCount" in dto.summary
            ? {
                netBuyCount:
                  typeof dto.summary.netBuyCount === "number"
                    ? dto.summary.netBuyCount
                    : 0,
                netSellCount:
                  typeof dto.summary.netSellCount === "number"
                    ? dto.summary.netSellCount
                    : 0,
                topBuys: Array.isArray(dto.summary.topBuys)
                  ? dto.summary.topBuys
                  : [],
                topSells: Array.isArray(dto.summary.topSells)
                  ? dto.summary.topSells
                  : [],
              }
            : { ...EMPTY_SUMMARY };
      } else {
        error = "Unexpected response shape from /api/foreign-flow";
      }
    }
  } catch (err) {
    error =
      err instanceof Error
        ? err.message
        : "Không thể kết nối tới máy chủ dữ liệu khối ngoại";
  }

  return { tradingDate, items, summary, count, fetchedAt, error };
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const data = await fetchForeignFlowData(origin, { limit: 200 });

  return json<LoaderData>(data);
}

// ---------------------------------------------------------------------------
// Helpers — formatting
// ---------------------------------------------------------------------------

/** Format a signed integer volume with thousands separator, + prefix for BUY. */
export function formatVolume(vol: number): string {
  if (vol === 0) return "0";
  const abs = Math.abs(vol).toLocaleString("vi-VN");
  return vol > 0 ? `+${abs}` : `-${abs}`;
}

/** Format a nullable ratio as a percentage string or "—". */
export function formatRatio(ratio: number | null): string {
  if (ratio === null || ratio === undefined) return "—";
  return `${(ratio * 100).toFixed(2)}%`;
}

/** Format a nullable market cap in billions, or "—". */
export function formatMarketCap(bn: number | null): string {
  if (bn === null || bn === undefined) return "—";
  return `${bn.toFixed(1)} tỷ`;
}

/** Format foreign room (always present). */
export function formatRoom(room: number): string {
  return room.toLocaleString("vi-VN");
}

// ---------------------------------------------------------------------------
// Direction badge styling
// ---------------------------------------------------------------------------

type DirectionStyle = { badge: string; volumeClass: string };

function directionStyle(dir: ForeignDirection): DirectionStyle {
  switch (dir) {
    case "BUY":
      return {
        badge:
          "bg-emerald-900 text-emerald-300 border border-emerald-700",
        volumeClass: "text-emerald-400 font-semibold",
      };
    case "SELL":
      return {
        badge: "bg-red-900 text-red-300 border border-red-700",
        volumeClass: "text-red-400 font-semibold",
      };
    case "FLAT":
    default:
      return {
        badge: "bg-slate-700 text-slate-300 border border-slate-600",
        volumeClass: "text-slate-400",
      };
  }
}

const DIRECTION_LABEL: Record<ForeignDirection, string> = {
  BUY: "Mua",
  SELL: "Bán",
  FLAT: "Trung lập",
};

// ---------------------------------------------------------------------------
// Sort types
// ---------------------------------------------------------------------------

type SortKey = "code" | "foreignVolume" | "foreignRoom";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DirectionBadge({ direction }: { direction: ForeignDirection }) {
  const { badge } = directionStyle(direction);
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge}`}
    >
      {DIRECTION_LABEL[direction]}
    </span>
  );
}

/** Summary banner — headline the user reads first. */
function SummaryBanner({
  summary,
  tradingDate,
}: {
  summary: ForeignFlowSummary;
  tradingDate: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-700 bg-slate-800/60 px-5 py-4">
      {tradingDate && (
        <span className="text-xs font-medium text-slate-500">
          Phiên {tradingDate}
        </span>
      )}
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400">Khối ngoại hôm nay:</span>
        <span className="inline-flex items-center gap-1.5 rounded bg-emerald-900 border border-emerald-700 px-3 py-1 text-sm font-bold text-emerald-300">
          <span className="text-base">▲</span>
          {summary.netBuyCount} mã mua ròng
        </span>
        <span className="inline-flex items-center gap-1.5 rounded bg-red-900 border border-red-700 px-3 py-1 text-sm font-bold text-red-300">
          <span className="text-base">▼</span>
          {summary.netSellCount} mã bán ròng
        </span>
      </div>
    </div>
  );
}

/** Top-N highlight card (topBuys or topSells). */
function HighlightCard({
  title,
  items,
  colorClass,
  borderClass,
}: {
  title: string;
  items: ForeignFlowItem[];
  colorClass: string;
  borderClass: string;
}) {
  if (items.length === 0) {
    return (
      <div
        className={`flex-1 rounded-lg border ${borderClass} bg-slate-800 px-4 py-3`}
      >
        <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${colorClass}`}>
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
      <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${colorClass}`}>
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => {
          const volStr = formatVolume(item.foreignVolume);
          return (
            <li key={item.code} className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-100 text-sm">
                {item.code}
              </span>
              <span className={`text-xs ${colorClass} font-semibold`}>
                {volStr}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One table row — null-safe on all optional fields. */
function FlowRow({
  item,
  idx,
}: {
  item: ForeignFlowItem;
  idx: number;
}) {
  const rowBg = idx % 2 === 0 ? "bg-slate-800" : "bg-slate-850";
  const { volumeClass } = directionStyle(item.direction);

  return (
    <tr className={`border-b border-slate-700 last:border-0 ${rowBg}`}>
      {/* Mã */}
      <td className="px-3 py-2 text-xs font-bold text-slate-100 whitespace-nowrap">
        {item.code}
      </td>
      {/* KL ròng */}
      <td className={`px-3 py-2 text-xs whitespace-nowrap tabular-nums ${volumeClass}`}>
        {formatVolume(item.foreignVolume)}
      </td>
      {/* Chiều */}
      <td className="px-3 py-2">
        <DirectionBadge direction={item.direction} />
      </td>
      {/* Room ngoại */}
      <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap tabular-nums">
        {formatRoom(item.foreignRoom)}
      </td>
      {/* Tỷ lệ sở hữu */}
      <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap tabular-nums">
        {formatRatio(item.currentHoldingRatio)}
      </td>
      {/* Vốn hóa */}
      <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap tabular-nums">
        {formatMarketCap(item.marketCapBn)}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Sort helper
// ---------------------------------------------------------------------------

function sortItems(
  items: ForeignFlowItem[],
  key: SortKey,
  dir: SortDir
): ForeignFlowItem[] {
  return [...items].sort((a, b) => {
    let cmp = 0;
    if (key === "code") {
      cmp = a.code.localeCompare(b.code);
    } else if (key === "foreignVolume") {
      cmp = a.foreignVolume - b.foreignVolume;
    } else if (key === "foreignRoom") {
      cmp = a.foreignRoom - b.foreignRoom;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

// ---------------------------------------------------------------------------
// SortHeader
// ---------------------------------------------------------------------------

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <th
      className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap cursor-pointer select-none hover:text-slate-200"
      onClick={() => onClick(sortKey)}
      aria-sort={isActive ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      {isActive && (
        <span className="ml-1 text-slate-500">{dir === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ForeignFlowPage() {
  const { tradingDate, items, summary, count, fetchedAt, error } =
    useLoaderData<typeof loader>();

  const [sortKey, setSortKey] = useState<SortKey>("foreignVolume");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = sortItems(items, sortKey, sortDir);
  const isEmpty = !error && items.length === 0;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Khối Ngoại"
        subtitle="Giao dịch mua/bán ròng của nhà đầu tư nước ngoài — chỉ số định hướng thị trường"
        actions={
          <span className="text-xs text-slate-500">
            {count > 0 && (
              <span className="mr-3 font-medium text-slate-300">
                {count} mã
              </span>
            )}
            <span>{fetchedAt ? new Date(fetchedAt).toLocaleTimeString("vi-VN") : ""}</span>
          </span>
        }
      />

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không thể tải dữ liệu khối ngoại — {error}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Chưa có dữ liệu khối ngoại cho phiên này.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Hệ thống đang cập nhật dữ liệu. Vui lòng thử lại sau.
          </p>
        </div>
      )}

      {/* Summary banner — headline, user reads FIRST */}
      {!error && !isEmpty && (
        <SummaryBanner summary={summary} tradingDate={tradingDate} />
      )}

      {/* Highlight cards: topBuys + topSells */}
      {!error && !isEmpty && (
        <div className="flex flex-col gap-4 sm:flex-row">
          <HighlightCard
            title="Mua ròng nhiều nhất"
            items={summary.topBuys}
            colorClass="text-emerald-400"
            borderClass="border-emerald-800"
          />
          <HighlightCard
            title="Bán ròng mạnh nhất"
            items={summary.topSells}
            colorClass="text-red-400"
            borderClass="border-red-800"
          />
        </div>
      )}

      {/* Full sortable table */}
      {sorted.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900 text-left">
                <SortHeader
                  label="Mã"
                  sortKey="code"
                  active={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <SortHeader
                  label="KL ròng"
                  sortKey="foreignVolume"
                  active={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap">
                  Chiều
                </th>
                <SortHeader
                  label="Room ngoại"
                  sortKey="foreignRoom"
                  active={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap">
                  Tỷ lệ sở hữu
                </th>
                <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap">
                  Vốn hóa
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, idx) => (
                <FlowRow key={item.code} item={item} idx={idx} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
