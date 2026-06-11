/**
 * /dashboard/global-markets — Bối cảnh thị trường toàn cầu (Global Market Context).
 *
 * Data source: GET /api/global-markets (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.global-markets.tsx, mirroring the api.sector-cascade.tsx precedent.
 *
 * This page renders the "Phong vũ biểu rủi ro thế giới" — 12 global market indicators
 * grouped into commodities, equities, and fx_rates/risk, with 24h and 7d deltas,
 * a summary risk-tone band, and per-indicator inline sparklines from the series data.
 *
 * Endpoint contract (GET /api/global-markets?window=7) — VERIFIED live 2026-06-11:
 *   {
 *     generatedAt: string (ISO),
 *     currentAt:   string (ISO),
 *     source:      string,
 *     window:      number,
 *     indicators:  [ {
 *       key, label, unit, group: "commodities"|"equities"|"fx_rates",
 *       current: number,
 *       prev24h: number|null, delta24h: number|null, deltaPct24h: number|null,
 *       direction24h: "up"|"down"|"flat",
 *       prev7d:  number|null, delta7d:  number|null, deltaPct7d:  number|null,
 *       direction7d:  "up"|"down"|"flat"
 *     } ]  (12 items — render in server order, group by `group` field),
 *     series: { [key]: [{t:string, v:number}] }  (each ~141 pts for window=7),
 *     summary: {
 *       vix: number|null,
 *       vixBand: "low"|"elevated"|"high"|null,
 *       riskTone: "risk-on"|"risk-off"|"neutral"|null,
 *       topMovers: [{key, label, deltaPct24h: number, direction24h}]  (≤5)
 *     },
 *     count: number
 *   }
 *
 * Named exports (for unit tests):
 *   fetchGlobalMarketsData, formatDelta, formatPct, vixBandLabel, vixBandClass,
 *   riskToneLabel, riskToneClass, directionArrow, directionClass,
 *   groupLabel, buildSparklinePath
 *
 * Decision journal (DJ-GATE-1): New read-only dashboard page (TASK17-PAGE12).
 * Named-export helper pattern: Remix strips loader in jsdom; named helpers bypass that.
 * window=7 forwarded through proxy to upstream (default for the analyst view).
 * Indicators rendered in server sort order grouped by the `group` field.
 * Null deltas render as "—" — NEVER fabricate or show -100%.
 * Colors reflect direction only (up/down/flat) — no good/bad semantics.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Bối cảnh thị trường toàn cầu — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/global-markets live payload
// ---------------------------------------------------------------------------

export type IndicatorGroup = "commodities" | "equities" | "fx_rates";
export type Direction = "up" | "down" | "flat";
export type VixBand = "low" | "elevated" | "high";
export type RiskTone = "risk-on" | "risk-off" | "neutral";

export interface GlobalIndicator {
  key: string;
  label: string;
  unit: string;
  group: IndicatorGroup;
  current: number;
  prev24h: number | null;
  delta24h: number | null;
  deltaPct24h: number | null;
  direction24h: Direction;
  prev7d: number | null;
  delta7d: number | null;
  deltaPct7d: number | null;
  direction7d: Direction;
}

export interface SeriesPoint {
  t: string;
  v: number;
}

export interface GlobalTopMover {
  key: string;
  label: string;
  deltaPct24h: number;
  direction24h: Direction;
}

export interface GlobalSummary {
  vix: number | null;
  vixBand: VixBand | null;
  riskTone: RiskTone | null;
  topMovers: GlobalTopMover[];
}

export interface GlobalMarketsDto {
  generatedAt: string;
  currentAt: string;
  source: string;
  window: number;
  indicators: GlobalIndicator[];
  series: Record<string, SeriesPoint[]>;
  summary: GlobalSummary;
  count: number;
}

// ---------------------------------------------------------------------------
// LoaderData
// ---------------------------------------------------------------------------

export interface LoaderData {
  generatedAt: string;
  currentAt: string;
  source: string;
  window: number;
  indicators: GlobalIndicator[];
  series: Record<string, SeriesPoint[]>;
  summary: GlobalSummary;
  count: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Format a raw numeric delta for display.
 * null → "—"  (means baseline not captured; never show -100% or fabricate)
 * otherwise format to 2 decimal places.
 */
export function formatDelta(delta: number | null | undefined): string {
  if (delta === null || delta === undefined) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)}`;
}

/**
 * Format a percentage delta for display.
 * null → "—"
 * otherwise format to 2 decimal places with %.
 */
export function formatPct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * Map VIX band to Vietnamese label.
 */
export function vixBandLabel(band: VixBand | null | undefined): string {
  switch (band) {
    case "low":
      return "Bình ổn";
    case "elevated":
      return "Thận trọng";
    case "high":
      return "Sợ hãi";
    default:
      return "—";
  }
}

/**
 * Map VIX band to Tailwind badge CSS class.
 */
export function vixBandClass(band: VixBand | null | undefined): string {
  switch (band) {
    case "low":
      return "bg-emerald-900 text-emerald-300 border border-emerald-700";
    case "elevated":
      return "bg-amber-900 text-amber-300 border border-amber-700";
    case "high":
      return "bg-red-900 text-red-300 border border-red-700";
    default:
      return "bg-slate-800 text-slate-500 border border-slate-700";
  }
}

/**
 * Map risk tone to Vietnamese label.
 */
export function riskToneLabel(tone: RiskTone | null | undefined): string {
  switch (tone) {
    case "risk-on":
      return "Ưa rủi ro";
    case "risk-off":
      return "Né rủi ro";
    case "neutral":
      return "Trung tính";
    default:
      return "—";
  }
}

/**
 * Map risk tone to Tailwind badge CSS class.
 */
export function riskToneClass(tone: RiskTone | null | undefined): string {
  switch (tone) {
    case "risk-on":
      return "bg-emerald-900 text-emerald-300 border border-emerald-700";
    case "risk-off":
      return "bg-red-900 text-red-300 border border-red-700";
    case "neutral":
      return "bg-slate-700 text-slate-300 border border-slate-600";
    default:
      return "bg-slate-800 text-slate-500 border border-slate-700";
  }
}

/**
 * Map direction to directional arrow symbol.
 * Direction colors reflect direction only — not semantically good/bad.
 */
export function directionArrow(direction: Direction): string {
  switch (direction) {
    case "up":
      return "▲";
    case "down":
      return "▼";
    case "flat":
    default:
      return "—";
  }
}

/**
 * Map direction to Tailwind text color class.
 * up=green (higher value), down=red (lower value), flat=grey.
 * Semantic neutrality: these are direction indicators, not good/bad labels.
 */
export function directionClass(direction: Direction): string {
  switch (direction) {
    case "up":
      return "text-emerald-400";
    case "down":
      return "text-red-400";
    case "flat":
    default:
      return "text-slate-400";
  }
}

/**
 * Map indicator group to Vietnamese section label.
 */
export function groupLabel(group: IndicatorGroup): string {
  switch (group) {
    case "commodities":
      return "Hàng hoá";
    case "equities":
      return "Chứng khoán thế giới";
    case "fx_rates":
      return "Tỷ giá & Rủi ro";
    default:
      return group;
  }
}

/**
 * Build an SVG polyline `points` attribute string from a series array.
 * Maps time-series values onto a viewBox of width x height pixels.
 * Returns "" if series is empty or has fewer than 2 points.
 */
export function buildSparklinePath(
  series: SeriesPoint[],
  width = 80,
  height = 24,
): string {
  if (!series || series.length < 2) return "";
  const values = series.map((p) => p.v);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1; // avoid division by zero for flat series
  return series
    .map((p, i) => {
      const x = (i / (series.length - 1)) * width;
      const y = height - ((p.v - minV) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

// ---------------------------------------------------------------------------
// fetchGlobalMarketsData — exported named helper for unit tests
// (Remix strips loader in jsdom; named helper bypasses that)
// ---------------------------------------------------------------------------

const EMPTY_SUMMARY: GlobalSummary = {
  vix: null,
  vixBand: null,
  riskTone: null,
  topMovers: [],
};

export async function fetchGlobalMarketsData(
  origin: string,
  windowDays?: number,
): Promise<LoaderData> {
  let generatedAt = new Date().toISOString();
  let currentAt = generatedAt;
  let source = "";
  let windowVal = windowDays ?? 7;
  let indicators: GlobalIndicator[] = [];
  let series: Record<string, SeriesPoint[]> = {};
  let summary: GlobalSummary = { ...EMPTY_SUMMARY };
  let count = 0;
  let error: string | null = null;

  try {
    const urlObj = new URL(`${origin}/api/global-markets`);
    urlObj.searchParams.set("window", String(windowVal));
    const url = urlObj.toString();

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      error = `Upstream returned ${response.status} ${response.statusText}`;
    } else {
      const raw = (await response.json()) as unknown;
      if (raw !== null && typeof raw === "object" && "indicators" in raw) {
        const dto = raw as GlobalMarketsDto;
        generatedAt =
          typeof dto.generatedAt === "string" ? dto.generatedAt : generatedAt;
        currentAt =
          typeof dto.currentAt === "string" ? dto.currentAt : currentAt;
        source =
          typeof dto.source === "string" ? dto.source : source;
        windowVal =
          typeof dto.window === "number" ? dto.window : windowVal;
        indicators = Array.isArray(dto.indicators) ? dto.indicators : [];
        series =
          dto.series !== null && typeof dto.series === "object"
            ? (dto.series as Record<string, SeriesPoint[]>)
            : {};
        count = typeof dto.count === "number" ? dto.count : indicators.length;

        if (
          dto.summary !== null &&
          typeof dto.summary === "object" &&
          "riskTone" in dto.summary
        ) {
          const s = dto.summary;
          summary = {
            vix: typeof s.vix === "number" ? s.vix : null,
            vixBand: s.vixBand ?? null,
            riskTone: s.riskTone ?? null,
            topMovers: Array.isArray(s.topMovers) ? s.topMovers : [],
          };
        }
      } else {
        error = "Unexpected response shape from /api/global-markets";
      }
    }
  } catch (err) {
    error =
      err instanceof Error
        ? err.message
        : "Không thể kết nối tới máy chủ dữ liệu thị trường toàn cầu";
  }

  return {
    generatedAt,
    currentAt,
    source,
    window: windowVal,
    indicators,
    series,
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

  const data = await fetchGlobalMarketsData(origin, 7);
  return json<LoaderData>(data);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Inline SVG sparkline — dependency-free polyline from series data. */
function Sparkline({
  series,
  direction,
}: {
  series: SeriesPoint[];
  direction: Direction;
}) {
  const points = buildSparklinePath(series, 80, 24);
  if (!points) return <span className="text-slate-700 text-xs">—</span>;

  const strokeColor =
    direction === "up"
      ? "#34d399" // emerald-400
      : direction === "down"
        ? "#f87171" // red-400
        : "#94a3b8"; // slate-400

  return (
    <svg
      width={80}
      height={24}
      viewBox={`0 0 80 24`}
      className="overflow-visible"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** VIX band badge */
function VixBandBadge({ band }: { band: VixBand | null }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-bold tracking-wide ${vixBandClass(band)}`}
    >
      {vixBandLabel(band)}
    </span>
  );
}

/** Risk tone badge */
function RiskToneBadge({ tone }: { tone: RiskTone | null }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-bold tracking-wide ${riskToneClass(tone)}`}
    >
      {riskToneLabel(tone)}
    </span>
  );
}

/** One top mover chip in the summary band */
function TopMoverChip({ mover }: { mover: GlobalTopMover }) {
  const arrow = directionArrow(mover.direction24h);
  const color = directionClass(mover.direction24h);
  return (
    <span className="inline-flex items-center gap-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs">
      <span className="font-semibold text-slate-200">{mover.label}</span>
      <span className={`font-bold tabular-nums ${color}`}>
        {arrow} {formatPct(mover.deltaPct24h)}
      </span>
    </span>
  );
}

/** One indicator card */
function IndicatorCard({
  indicator,
  seriesPoints,
}: {
  indicator: GlobalIndicator;
  seriesPoints: SeriesPoint[];
}) {
  const color24h = directionClass(indicator.direction24h);
  const arrow24h = directionArrow(indicator.direction24h);
  const color7d = directionClass(indicator.direction7d);
  const arrow7d = directionArrow(indicator.direction7d);

  // Format current value — use locale formatting for large numbers
  const currentFormatted =
    indicator.current >= 1000
      ? indicator.current.toLocaleString("vi-VN", { maximumFractionDigits: 2 })
      : indicator.current.toFixed(2);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 flex flex-col gap-2">
      {/* Header row: label + sparkline */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs font-semibold text-slate-300 truncate">
            {indicator.label}
          </span>
          {indicator.unit && (
            <span className="text-[10px] text-slate-600">{indicator.unit}</span>
          )}
        </div>
        <div className="shrink-0">
          <Sparkline series={seriesPoints} direction={indicator.direction24h} />
        </div>
      </div>

      {/* Current value */}
      <div className="text-xl font-bold text-slate-100 tabular-nums">
        {currentFormatted}
      </div>

      {/* 24h delta row */}
      <div className={`flex items-center gap-1 text-xs font-medium tabular-nums ${color24h}`}>
        <span>{arrow24h}</span>
        {indicator.delta24h !== null ? (
          <>
            <span>{formatDelta(indicator.delta24h)}</span>
            <span>({formatPct(indicator.deltaPct24h)})</span>
            <span className="text-slate-600 font-normal">24h</span>
          </>
        ) : (
          <span className="text-slate-500">— 24h</span>
        )}
      </div>

      {/* 7d delta row */}
      <div className={`flex items-center gap-1 text-xs tabular-nums ${color7d}`}>
        {indicator.delta7d !== null ? (
          <>
            <span>{formatDelta(indicator.delta7d)}</span>
            <span>({formatPct(indicator.deltaPct7d)})</span>
            <span className="text-slate-600">7d</span>
          </>
        ) : (
          <span className="text-slate-500">— 7d</span>
        )}
      </div>
    </div>
  );
}

/** Section heading for one group */
function GroupSection({
  group,
  indicators,
  series,
}: {
  group: IndicatorGroup;
  indicators: GlobalIndicator[];
  series: Record<string, SeriesPoint[]>;
}) {
  if (indicators.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
        {groupLabel(group)}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {indicators.map((ind) => (
          <IndicatorCard
            key={ind.key}
            indicator={ind}
            seriesPoints={series[ind.key] ?? []}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GlobalMarketsPage() {
  const {
    currentAt,
    source,
    indicators,
    series,
    summary,
    count,
    error,
  } = useLoaderData<typeof loader>();

  const isEmpty = !error && count === 0;

  // Group indicators by the `group` field, preserving server order within each group.
  const groups: IndicatorGroup[] = ["commodities", "equities", "fx_rates"];
  const byGroup: Record<IndicatorGroup, GlobalIndicator[]> = {
    commodities: [],
    equities: [],
    fx_rates: [],
  };
  for (const ind of indicators) {
    if (ind.group in byGroup) {
      byGroup[ind.group as IndicatorGroup].push(ind);
    }
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Bối cảnh thị trường toàn cầu"
        subtitle="Phong vũ biểu rủi ro thế giới — bối cảnh risk-on/risk-off cho thị trường VN"
        actions={
          <span className="text-xs text-slate-500 text-right">
            {currentAt && (
              <span className="block">
                Dữ liệu:{" "}
                {new Date(currentAt).toLocaleString("vi-VN")}
              </span>
            )}
            {source && (
              <span className="block text-slate-600">{source}</span>
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
          Không thể tải dữ liệu thị trường toàn cầu — {error}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Chưa có dữ liệu thị trường toàn cầu.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Hệ thống sẽ cập nhật khi có dữ liệu mới. Vui lòng thử lại sau.
          </p>
        </div>
      )}

      {/* Summary band: VIX + risk tone + top movers */}
      {!error && !isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 space-y-3">
          {/* VIX + risk tone row */}
          <div className="flex flex-wrap items-center gap-3">
            {summary.vix !== null && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                  VIX
                </span>
                <span className="text-lg font-bold text-slate-100 tabular-nums">
                  {summary.vix.toFixed(2)}
                </span>
                <VixBandBadge band={summary.vixBand} />
              </div>
            )}
            {summary.riskTone !== null && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                  Xu hướng
                </span>
                <RiskToneBadge tone={summary.riskTone} />
              </div>
            )}
          </div>

          {/* Top movers row */}
          {summary.topMovers.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Biến động mạnh nhất 24h
              </p>
              <div className="flex flex-wrap gap-2">
                {summary.topMovers.map((mover) => (
                  <TopMoverChip key={mover.key} mover={mover} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* THREE grouped sections */}
      {!error && !isEmpty && (
        <div className="space-y-6">
          {groups.map((group) => (
            <GroupSection
              key={group}
              group={group}
              indicators={byGroup[group]}
              series={series}
            />
          ))}
        </div>
      )}
    </div>
  );
}
