/**
 * /dashboard/kinh-dich-signals — Tín hiệu Kinh Dịch (I-Ching hexagram trading signals per stock).
 *
 * Data source: GET /api/kinh-dich-signals (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.kinh-dich-signals.tsx, mirroring the api.sector-cascade.tsx precedent.
 *
 * This page renders the system's signature I-Ching lens: each stock in the watchlist is
 * mapped to a hexagram (quẻ Kinh Dịch) and distilled into a trading signal action
 * (MUA / BÁN / GIỮ / THẬN TRỌNG / CHỜ) with a confidence score.
 *
 * Endpoint contract (GET /api/kinh-dich-signals?source=cycle) — VERIFIED live 2026-06-10:
 *   {
 *     generatedAt: string (ISO),
 *     tradingDate: "YYYY-MM-DD" ("" when empty),
 *     source: "cycle" | "manual" | "all",
 *     snapshot: [{
 *       stockCode, timestamp, hexagramNumber, hoQueNumber, bienQueNumber,
 *       hexagramName,   // e.g. "Khiêm"
 *       action,         // "MUA" | "BAN" | "GIU" | "THAN TRONG" | "CHO" | "UNKNOWN"
 *       sentiment,      // "positive" | "negative" | "neutral"
 *       trend,          // e.g. "THUẬN LỢI" | "BẤT LỢI" | "TRUNG TÍNH" | ""
 *       confidence,     // number 0..1 OR null
 *       actionNote,     // Vietnamese recommendation string
 *       source          // "cycle" | "manual"
 *     }],
 *     flips: [{ stockCode, fromAction, toAction, toSentiment, confidence, timestamp }],
 *     summary: {
 *       symbols, mua, ban, giu, thanTrong, cho, unknown,
 *       positive, negative, neutral,
 *       avgConfidence,
 *       topBuy:  [up to 5 snapshot items action=MUA, confidence DESC],
 *       topSell: [up to 5 snapshot items action=BAN, confidence DESC]
 *     },
 *     count
 *   }
 *
 * NOTE: snapshot is already sorted by the server:
 *   actionPriority [MUA < THAN TRONG < GIU < CHO < BAN < UNKNOWN] then confidence DESC then stockCode ASC.
 *   Do NOT re-sort — render in given order.
 *
 * Named exports (for unit tests):
 *   fetchKinhDichSignalsData, actionLabel, actionBadgeClass, sentimentLabel,
 *   sentimentBadgeClass, confidencePercent, formatTimestamp
 *
 * Decision journal (DJ-GATE-1): New read-only dashboard page (TASK17-PAGE11).
 * I-Ching signals use the system's proprietary hexagram lens — distinct from price/news signals.
 * Named-export helper pattern: Remix strips loader in jsdom; named helpers bypass that.
 * source=cycle forwarded through proxy to upstream (default for the analyst view).
 * Snapshot rendered in server sort order — no client re-sort to avoid conflicting with server logic.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Tín hiệu Kinh Dịch — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/kinh-dich-signals live payload
// ---------------------------------------------------------------------------

export interface KinhDichSnapshotItem {
  stockCode: string;
  timestamp: string;
  hexagramNumber: number;
  hoQueNumber: number;
  bienQueNumber: number;
  hexagramName: string;
  action: string;
  sentiment: string;
  trend: string;
  confidence: number | null;
  actionNote: string;
  source: string;
}

export interface KinhDichFlip {
  stockCode: string;
  fromAction: string;
  toAction: string;
  toSentiment: string;
  confidence: number | null;
  timestamp: string;
}

export interface KinhDichSummary {
  symbols: number;
  mua: number;
  ban: number;
  giu: number;
  thanTrong: number;
  cho: number;
  unknown: number;
  positive: number;
  negative: number;
  neutral: number;
  avgConfidence: number | null;
  topBuy: KinhDichSnapshotItem[];
  topSell: KinhDichSnapshotItem[];
}

export interface KinhDichSignalsDto {
  generatedAt: string;
  tradingDate: string;
  source: string;
  snapshot: KinhDichSnapshotItem[];
  flips: KinhDichFlip[];
  summary: KinhDichSummary;
  count: number;
}

// ---------------------------------------------------------------------------
// LoaderData
// ---------------------------------------------------------------------------

export interface LoaderData {
  generatedAt: string;
  tradingDate: string;
  source: string;
  snapshot: KinhDichSnapshotItem[];
  flips: KinhDichFlip[];
  summary: KinhDichSummary;
  count: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Map action value to Vietnamese display label.
 * The API returns uppercase strings ("MUA", "BAN", "GIU", "THAN TRONG", "CHO", "UNKNOWN").
 */
export function actionLabel(action: string): string {
  switch (action) {
    case "MUA":
      return "MUA";
    case "BAN":
      return "BÁN";
    case "GIU":
      return "GIỮ";
    case "THAN TRONG":
      return "THẬN TRỌNG";
    case "CHO":
      return "CHỜ";
    case "UNKNOWN":
    default:
      return "—";
  }
}

/**
 * Map action value to Tailwind badge CSS class.
 */
export function actionBadgeClass(action: string): string {
  switch (action) {
    case "MUA":
      return "bg-emerald-900 text-emerald-300 border border-emerald-700";
    case "BAN":
      return "bg-red-900 text-red-300 border border-red-700";
    case "GIU":
      return "bg-slate-700 text-slate-300 border border-slate-600";
    case "THAN TRONG":
      return "bg-amber-900 text-amber-300 border border-amber-700";
    case "CHO":
      return "bg-blue-900 text-blue-300 border border-blue-700";
    case "UNKNOWN":
    default:
      return "bg-slate-800 text-slate-500 border border-slate-700";
  }
}

/**
 * Map sentiment to Vietnamese display label.
 */
export function sentimentLabel(sentiment: string): string {
  switch (sentiment) {
    case "positive":
      return "Tích cực";
    case "negative":
      return "Tiêu cực";
    case "neutral":
    default:
      return "Trung tính";
  }
}

/**
 * Map sentiment to Tailwind badge CSS class.
 */
export function sentimentBadgeClass(sentiment: string): string {
  switch (sentiment) {
    case "positive":
      return "bg-emerald-900 text-emerald-300 border border-emerald-700";
    case "negative":
      return "bg-red-900 text-red-300 border border-red-700";
    case "neutral":
    default:
      return "bg-slate-700 text-slate-300 border border-slate-600";
  }
}

/**
 * Format a confidence value (0..1 | null) as a percentage string.
 * null or undefined → "—"
 * 0.63 → "63%"
 */
export function confidencePercent(confidence: number | null | undefined): string {
  if (confidence === null || confidence === undefined) return "—";
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Format a timestamp string for Vietnamese readers.
 * "2026-06-10 14:35:22" or ISO → "10/06/2026, 14:35:22"
 * Empty string → "—"
 */
export function formatTimestamp(ts: string): string {
  if (!ts) return "—";
  try {
    const normalized = ts.includes("T") ? ts : ts.replace(" ", "T");
    return new Date(normalized).toLocaleString("vi-VN");
  } catch {
    return ts;
  }
}

// ---------------------------------------------------------------------------
// fetchKinhDichSignalsData — exported named helper for unit tests
// (Remix strips loader in jsdom; named helper bypasses that)
// ---------------------------------------------------------------------------

const EMPTY_SUMMARY: KinhDichSummary = {
  symbols: 0,
  mua: 0,
  ban: 0,
  giu: 0,
  thanTrong: 0,
  cho: 0,
  unknown: 0,
  positive: 0,
  negative: 0,
  neutral: 0,
  avgConfidence: null,
  topBuy: [],
  topSell: [],
};

export async function fetchKinhDichSignalsData(
  origin: string,
  source?: string
): Promise<LoaderData> {
  let generatedAt = new Date().toISOString();
  let tradingDate = "";
  let src = source ?? "cycle";
  let snapshot: KinhDichSnapshotItem[] = [];
  let flips: KinhDichFlip[] = [];
  let summary: KinhDichSummary = { ...EMPTY_SUMMARY };
  let count = 0;
  let error: string | null = null;

  try {
    const urlObj = new URL(`${origin}/api/kinh-dich-signals`);
    urlObj.searchParams.set("source", src);
    const url = urlObj.toString();

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      error = `Upstream returned ${response.status} ${response.statusText}`;
    } else {
      const raw = (await response.json()) as unknown;
      if (raw !== null && typeof raw === "object" && "snapshot" in raw) {
        const dto = raw as KinhDichSignalsDto;
        generatedAt =
          typeof dto.generatedAt === "string" ? dto.generatedAt : generatedAt;
        tradingDate =
          typeof dto.tradingDate === "string" ? dto.tradingDate : "";
        src =
          typeof dto.source === "string" ? dto.source : src;
        snapshot = Array.isArray(dto.snapshot) ? dto.snapshot : [];
        flips = Array.isArray(dto.flips) ? dto.flips : [];
        count = typeof dto.count === "number" ? dto.count : snapshot.length;

        if (
          dto.summary !== null &&
          typeof dto.summary === "object" &&
          "symbols" in dto.summary
        ) {
          const s = dto.summary;
          summary = {
            symbols: typeof s.symbols === "number" ? s.symbols : 0,
            mua: typeof s.mua === "number" ? s.mua : 0,
            ban: typeof s.ban === "number" ? s.ban : 0,
            giu: typeof s.giu === "number" ? s.giu : 0,
            thanTrong: typeof s.thanTrong === "number" ? s.thanTrong : 0,
            cho: typeof s.cho === "number" ? s.cho : 0,
            unknown: typeof s.unknown === "number" ? s.unknown : 0,
            positive: typeof s.positive === "number" ? s.positive : 0,
            negative: typeof s.negative === "number" ? s.negative : 0,
            neutral: typeof s.neutral === "number" ? s.neutral : 0,
            avgConfidence:
              typeof s.avgConfidence === "number" ? s.avgConfidence : null,
            topBuy: Array.isArray(s.topBuy) ? s.topBuy : [],
            topSell: Array.isArray(s.topSell) ? s.topSell : [],
          };
        }
      } else {
        error = "Unexpected response shape from /api/kinh-dich-signals";
      }
    }
  } catch (err) {
    error =
      err instanceof Error
        ? err.message
        : "Không thể kết nối tới máy chủ dữ liệu Kinh Dịch";
  }

  return {
    generatedAt,
    tradingDate,
    source: src,
    snapshot,
    flips,
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

  const data = await fetchKinhDichSignalsData(origin, "cycle");
  return json<LoaderData>(data);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Action badge */
function ActionBadge({ action }: { action: string }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${actionBadgeClass(action)}`}
    >
      {actionLabel(action)}
    </span>
  );
}

/** Sentiment badge */
function SentimentBadge({ sentiment }: { sentiment: string }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${sentimentBadgeClass(sentiment)}`}
    >
      {sentimentLabel(sentiment)}
    </span>
  );
}

/** Summary stat card */
function StatCard({
  label,
  value,
  colorClass,
  borderClass,
}: {
  label: string;
  value: string | number;
  colorClass: string;
  borderClass: string;
}) {
  return (
    <div
      className={`flex-1 rounded-lg border ${borderClass} bg-slate-800 px-4 py-3 text-center`}
    >
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-500 uppercase tracking-wide">
        {label}
      </p>
    </div>
  );
}

/** Top-N stock cards (topBuy / topSell) */
function TopSignalCard({
  title,
  items,
  colorClass,
  borderClass,
}: {
  title: string;
  items: KinhDichSnapshotItem[];
  colorClass: string;
  borderClass: string;
}) {
  if (items.length === 0) {
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
        {items.map((item) => (
          <li
            key={item.stockCode}
            className="flex items-center justify-between gap-2"
          >
            <span className="text-sm font-bold text-slate-100 font-mono">
              {item.stockCode}
            </span>
            <span className={`text-xs font-semibold tabular-nums ${colorClass}`}>
              {confidencePercent(item.confidence)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One flip row */
function FlipRow({ flip }: { flip: KinhDichFlip }) {
  return (
    <div className="border-b border-slate-700 last:border-0 px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="text-sm font-bold text-slate-100 font-mono w-14 shrink-0">
        {flip.stockCode}
      </span>
      <ActionBadge action={flip.fromAction} />
      <span className="text-slate-500 text-xs">→</span>
      <ActionBadge action={flip.toAction} />
      <SentimentBadge sentiment={flip.toSentiment} />
      {flip.confidence !== null && flip.confidence !== undefined && (
        <span className="text-[10px] text-slate-500 font-medium">
          {confidencePercent(flip.confidence)}
        </span>
      )}
      <span className="ml-auto text-[10px] text-slate-600 tabular-nums whitespace-nowrap">
        {formatTimestamp(flip.timestamp)}
      </span>
    </div>
  );
}

/** One snapshot table row */
function SnapshotRow({ item, idx }: { item: KinhDichSnapshotItem; idx: number }) {
  const rowBg = idx % 2 === 0 ? "bg-slate-800" : "bg-slate-850";

  return (
    <tr className={`border-b border-slate-700 last:border-0 ${rowBg}`}>
      {/* Mã CK */}
      <td className="px-3 py-2 text-xs font-bold font-mono text-slate-100 whitespace-nowrap">
        {item.stockCode}
      </td>
      {/* Quẻ: hexagramName + "#"+hexagramNumber */}
      <td className="px-3 py-2 text-xs text-slate-300 whitespace-nowrap">
        <span className="font-semibold">{item.hexagramName || "—"}</span>
        <span className="ml-1 text-slate-500 tabular-nums">
          #{item.hexagramNumber}
        </span>
      </td>
      {/* Khuyến nghị */}
      <td className="px-3 py-2">
        <ActionBadge action={item.action} />
      </td>
      {/* Xu hướng */}
      <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">
        {item.trend || "—"}
      </td>
      {/* Tâm lý */}
      <td className="px-3 py-2">
        <SentimentBadge sentiment={item.sentiment} />
      </td>
      {/* Độ tin cậy */}
      <td className="px-3 py-2 text-xs tabular-nums text-center text-slate-300">
        {confidencePercent(item.confidence)}
      </td>
      {/* Ghi chú (truncated) */}
      <td className="px-3 py-2 text-xs text-slate-400 max-w-[200px]">
        <span
          className="block truncate"
          title={item.actionNote}
        >
          {item.actionNote || "—"}
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function KinhDichSignalsPage() {
  const {
    generatedAt,
    tradingDate,
    snapshot,
    flips,
    summary,
    count,
    error,
  } = useLoaderData<typeof loader>();

  const isEmpty = !error && count === 0;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Tín hiệu Kinh Dịch"
        subtitle="Tín hiệu giao dịch theo quẻ Kinh Dịch cho từng cổ phiếu — góc nhìn đặc trưng của hệ thống kết hợp phân tích chu kỳ và biến quẻ để đưa ra khuyến nghị MUA / BÁN / GIỮ."
        actions={
          <span className="text-xs text-slate-500">
            {count > 0 && (
              <span className="mr-3 font-medium text-slate-300">
                {count} cổ phiếu
              </span>
            )}
            {tradingDate && (
              <span className="mr-3">Phiên {tradingDate}</span>
            )}
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
          Không thể tải dữ liệu tín hiệu Kinh Dịch — {error}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Chưa có tín hiệu Kinh Dịch cho phiên giao dịch hiện tại.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Hệ thống sẽ cập nhật tín hiệu sau khi hoàn thành chu kỳ phân tích. Vui lòng thử lại sau.
          </p>
        </div>
      )}

      {/* Summary stat cards */}
      {!error && !isEmpty && (
        <>
          <div className="flex flex-col gap-4 sm:flex-row">
            <StatCard
              label="Số cổ phiếu"
              value={summary.symbols}
              colorClass="text-slate-300"
              borderClass="border-slate-600"
            />
            <StatCard
              label="MUA"
              value={summary.mua}
              colorClass="text-emerald-400"
              borderClass="border-emerald-800"
            />
            <StatCard
              label="BÁN"
              value={summary.ban}
              colorClass="text-red-400"
              borderClass="border-red-800"
            />
            <StatCard
              label="GIỮ"
              value={summary.giu}
              colorClass="text-slate-400"
              borderClass="border-slate-600"
            />
            <StatCard
              label="THẬN TRỌNG"
              value={summary.thanTrong}
              colorClass="text-amber-400"
              borderClass="border-amber-800"
            />
            <StatCard
              label="Độ tin cậy TB"
              value={confidencePercent(summary.avgConfidence)}
              colorClass="text-blue-400"
              borderClass="border-blue-800"
            />
          </div>

          {/* Sentiment mini-row */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 flex items-center justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tâm lý thị trường
              </span>
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-emerald-400">
                  Tích cực: {summary.positive}
                </span>
                <span className="text-xs font-bold text-red-400">
                  Tiêu cực: {summary.negative}
                </span>
                <span className="text-xs font-bold text-slate-400">
                  Trung tính: {summary.neutral}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Top Buy / Top Sell */}
      {!error && !isEmpty && (
        <div className="flex flex-col gap-4 sm:flex-row">
          <TopSignalCard
            title="Khuyến nghị MUA hàng đầu"
            items={summary.topBuy}
            colorClass="text-emerald-400"
            borderClass="border-emerald-800"
          />
          <TopSignalCard
            title="Khuyến nghị BÁN hàng đầu"
            items={summary.topSell}
            colorClass="text-red-400"
            borderClass="border-red-800"
          />
        </div>
      )}

      {/* Flips section */}
      {!error && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Thay đổi tín hiệu
          </h2>
          {flips.length === 0 ? (
            <div className="rounded border border-slate-700 bg-slate-800 px-4 py-3 text-xs text-slate-500">
              Không có thay đổi tín hiệu trong phiên này.
            </div>
          ) : (
            <div className="rounded-lg border border-slate-700 bg-slate-800">
              {flips.map((flip, idx) => (
                <FlipRow key={`${flip.stockCode}-${idx}`} flip={flip} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main snapshot table — rendered in server order, do NOT re-sort */}
      {snapshot.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Bảng tín hiệu chi tiết
          </h2>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900 text-left">
                  <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap">
                    Mã CK
                  </th>
                  <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap">
                    Quẻ
                  </th>
                  <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap">
                    Khuyến nghị
                  </th>
                  <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap">
                    Xu hướng
                  </th>
                  <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap">
                    Tâm lý
                  </th>
                  <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap text-center">
                    Độ tin cậy
                  </th>
                  <th className="px-3 py-2 font-medium text-slate-400 whitespace-nowrap">
                    Ghi chú
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.map((item, idx) => (
                  <SnapshotRow key={item.stockCode} item={item} idx={idx} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
