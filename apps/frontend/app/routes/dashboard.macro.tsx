/**
 * /dashboard/macro — Vĩ Mô & Bối Cảnh Thị Trường.
 *
 * Data source: GET /api/macro-regime (frontend proxy → mcp-server :3000).
 * The proxy route is api.macro-regime.tsx.
 *
 * Response shape:
 *   { generated_at: ISO, data_source: "live"|"stale"|"unavailable",
 *     stale_served: boolean,
 *     indicators: { vnIndex: number|null, oilUsd: number|null,
 *                   goldUsd: number|null, usdVnd: number|null },
 *     signals: {
 *       investment_clock: { phase: string, score: number, tier: string },
 *       oil:    { direction: string, price_usd: number, reasoning: string },
 *       gold:   { direction: string, price_usd: number, reasoning: string },
 *       usdvnd: { direction: string, rate_vnd: number, reasoning: string } },
 *     calendar: { available: boolean, events: unknown[], note: string } }
 *
 * Honest states:
 *   - data_source:"unavailable" / null indicators → degraded banner, never a crash.
 *   - stale_served:true → stale warning banner.
 *   - calendar.available:false → show note, no fabricated events.
 *   - Upstream 5xx / network failure → error banner, never throws.
 *
 * Labels: plain Vietnamese — non-technical user.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { ClientTimestamp } from "~/components/ClientTimestamp";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Vĩ Mô — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/macro-regime DTO
// ---------------------------------------------------------------------------

type SignalDirection = "BULLISH" | "BEARISH" | "NEUTRAL" | string;

interface InvestmentClock {
  phase: string;
  score: number;
  tier: string;
}

interface CommoditySignal {
  direction: SignalDirection;
  price_usd: number;
  reasoning: string;
}

interface UsdVndSignal {
  direction: SignalDirection;
  rate_vnd: number;
  reasoning: string;
}

interface MacroSignals {
  investment_clock: InvestmentClock;
  oil: CommoditySignal;
  gold: CommoditySignal;
  usdvnd: UsdVndSignal;
}

interface MacroIndicators {
  vnIndex: number | null;
  oilUsd: number | null;
  goldUsd: number | null;
  usdVnd: number | null;
}

interface MacroCalendar {
  available: boolean;
  events: unknown[];
  note: string;
}

interface MacroRegimeDto {
  generated_at: string;
  data_source: "live" | "stale" | "unavailable" | string;
  stale_served: boolean;
  indicators: MacroIndicators;
  signals: MacroSignals;
  calendar: MacroCalendar;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export interface LoaderData {
  generated_at: string;
  stale_served: boolean;
  data_source: string | null;
  indicators: MacroIndicators | null;
  signals: MacroSignals | null;
  calendar: MacroCalendar | null;
  error: string | null;
}

/**
 * Core fetch-and-parse logic — exported for unit testing.
 * Pure async function, no Remix dependency, no JSON wrapping.
 * The loader calls this and wraps it with json().
 */
export async function fetchMacroData(origin: string): Promise<Omit<LoaderData, "generated_at">> {
  let stale_served = false;
  let data_source: string | null = null;
  let indicators: MacroIndicators | null = null;
  let signals: MacroSignals | null = null;
  let calendar: MacroCalendar | null = null;
  let error: string | null = null;

  try {
    const response = await fetch(`${origin}/api/macro-regime`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      error = `Upstream returned ${response.status} ${response.statusText}`;
    } else {
      const raw = (await response.json()) as unknown;
      if (
        raw !== null &&
        typeof raw === "object" &&
        "signals" in raw &&
        "indicators" in raw
      ) {
        const dto = raw as MacroRegimeDto;
        stale_served = dto.stale_served === true;
        data_source = typeof dto.data_source === "string" ? dto.data_source : null;
        indicators =
          dto.indicators !== null && typeof dto.indicators === "object"
            ? dto.indicators
            : null;
        signals =
          dto.signals !== null && typeof dto.signals === "object"
            ? dto.signals
            : null;
        calendar =
          dto.calendar !== null && typeof dto.calendar === "object"
            ? dto.calendar
            : null;
      } else {
        error = "Unexpected response shape from /api/macro-regime";
      }
    }
  } catch (err) {
    error =
      err instanceof Error
        ? err.message
        : "Không thể kết nối tới máy chủ vĩ mô";
  }

  return { stale_served, data_source, indicators, signals, calendar, error };
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const generated_at = new Date().toISOString();

  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const data = await fetchMacroData(origin);

  return json<LoaderData>({
    generated_at,
    ...data,
  });
}

// ---------------------------------------------------------------------------
// DirectionPill — BULLISH=green, BEARISH=red, NEUTRAL=grey
// ---------------------------------------------------------------------------

function DirectionPill({ direction }: { direction: string }) {
  const upper = direction?.toUpperCase() ?? "";
  if (upper === "BULLISH") {
    return (
      <span className="inline-flex items-center rounded border border-green-700 bg-green-950 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-green-400">
        Tăng
      </span>
    );
  }
  if (upper === "BEARISH") {
    return (
      <span className="inline-flex items-center rounded border border-red-700 bg-red-950 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-400">
        Giảm
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded border border-slate-600 bg-slate-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
      Trung lập
    </span>
  );
}

// ---------------------------------------------------------------------------
// InvestmentClockCard — prominent phase display
// ---------------------------------------------------------------------------

const PHASE_LABELS: Record<string, string> = {
  CORE_VN: "Giai đoạn đầu tư cổ phiếu Việt Nam trực tiếp",
  RECOVERY: "Giai đoạn phục hồi",
  EXPANSION: "Giai đoạn tăng trưởng",
  SLOWDOWN: "Giai đoạn hạ nhiệt",
  CONTRACTION: "Giai đoạn thu hẹp",
  REFLATION: "Giai đoạn tái lạm phát",
};

const PHASE_EXPLANATIONS: Record<string, string> = {
  CORE_VN:
    "Điều kiện vĩ mô đang thuận lợi cho chứng khoán Việt Nam. Dòng tiền nội địa và tín hiệu hàng hóa hỗ trợ việc nắm giữ cổ phiếu trực tiếp.",
  RECOVERY:
    "Nền kinh tế đang phục hồi sau giai đoạn khó khăn. Cổ phiếu chu kỳ và vốn hóa nhỏ thường hưởng lợi trong giai đoạn này.",
  EXPANSION:
    "Kinh tế tăng trưởng mạnh, lạm phát bắt đầu tăng. Cổ phiếu công nghiệp và nguyên vật liệu thường dẫn dắt thị trường.",
  SLOWDOWN:
    "Tăng trưởng đang chậm lại, lãi suất ở mức cao. Nhà đầu tư thường chuyển sang cổ phiếu phòng thủ và trái phiếu.",
  CONTRACTION:
    "Kinh tế co lại, rủi ro cao. Tài sản an toàn như vàng và tiền mặt được ưu tiên.",
  REFLATION:
    "Chính sách kích thích đang phát huy tác dụng. Hàng hóa và tài sản thực thường tăng giá trong giai đoạn này.",
};

function InvestmentClockCard({ clock }: { clock: InvestmentClock }) {
  const phaseLabel = PHASE_LABELS[clock.phase] ?? clock.phase;
  const explanation =
    PHASE_EXPLANATIONS[clock.phase] ??
    "Đang phân tích bối cảnh vĩ mô hiện tại.";

  return (
    <div className="rounded-lg border border-slate-600 bg-slate-800 p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Đồng hồ đầu tư
        </span>
        <span className="rounded border border-blue-700 bg-blue-950 px-3 py-1 text-sm font-bold text-blue-300">
          {phaseLabel}
        </span>
        <span className="text-xs text-slate-500">
          Điểm: {clock.score} · Mức: {clock.tier}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-slate-300">{explanation}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SignalCard — one commodity/FX signal (oil / gold / usdvnd)
// ---------------------------------------------------------------------------

interface SignalCardProps {
  label: string;
  sublabel: string;
  direction: string;
  priceLabel: string;
  reasoning: string;
}

function SignalCard({
  label,
  sublabel,
  direction,
  priceLabel,
  reasoning,
}: SignalCardProps) {
  return (
    <article className="rounded-lg border border-slate-700 bg-slate-800 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-100">{label}</span>
        <span className="text-xs text-slate-500">{sublabel}</span>
        <DirectionPill direction={direction} />
      </div>
      <p className="text-xl font-bold text-slate-100">{priceLabel}</p>
      <p className="text-xs leading-relaxed text-slate-400">{reasoning}</p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// IndicatorTile — raw stat display
// ---------------------------------------------------------------------------

interface IndicatorTileProps {
  label: string;
  value: number | null;
  unit: string;
  formatter?: (v: number) => string;
}

function IndicatorTile({ label, value, unit, formatter }: IndicatorTileProps) {
  const displayValue =
    value === null || value === undefined
      ? "—"
      : formatter
        ? formatter(value)
        : value.toLocaleString("vi-VN");

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-4 space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="text-xl font-bold text-slate-100">{displayValue}</p>
      <p className="text-xs text-slate-600">{unit}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MacroRegimePage() {
  const {
    generated_at,
    stale_served,
    data_source,
    indicators,
    signals,
    calendar,
    error,
  } = useLoaderData<typeof loader>();

  const isUnavailable =
    data_source === "unavailable" || (!error && !signals && !indicators);

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Vĩ Mô & Bối Cảnh Thị Trường"
        subtitle="Tín hiệu hàng hóa, ngoại hối và giai đoạn kinh tế giúp bạn đánh giá môi trường đầu tư"
        actions={
          <span className="text-xs text-slate-500">
            <ClientTimestamp iso={generated_at} />
          </span>
        }
      />

      {/* Stale banner */}
      {stale_served && (
        <div
          role="status"
          className="rounded border border-yellow-700 bg-yellow-950 px-4 py-3 text-sm text-yellow-300"
        >
          Dữ liệu có thể chưa được cập nhật mới nhất — đang hiển thị bản phân tích cũ.
        </div>
      )}

      {/* Unavailable banner */}
      {isUnavailable && !error && (
        <div
          role="status"
          className="rounded border border-slate-600 bg-slate-800 px-4 py-3 text-sm text-slate-400"
        >
          Dữ liệu vĩ mô tạm thời không khả dụng — vui lòng quay lại sau.
        </div>
      )}

      {/* Error banner — shown on upstream error */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không thể tải dữ liệu vĩ mô — {error}
        </div>
      )}

      {/* Investment clock — most prominent */}
      {signals?.investment_clock && (
        <InvestmentClockCard clock={signals.investment_clock} />
      )}

      {/* Signal cards — oil, gold, usdvnd */}
      {signals && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Tín hiệu hàng hóa & ngoại hối
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SignalCard
              label="Dầu thô"
              sublabel="Oil"
              direction={signals.oil?.direction ?? ""}
              priceLabel={
                signals.oil?.price_usd != null
                  ? `$${signals.oil.price_usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "—"
              }
              reasoning={signals.oil?.reasoning ?? ""}
            />
            <SignalCard
              label="Vàng"
              sublabel="Gold"
              direction={signals.gold?.direction ?? ""}
              priceLabel={
                signals.gold?.price_usd != null
                  ? `$${signals.gold.price_usd.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                  : "—"
              }
              reasoning={signals.gold?.reasoning ?? ""}
            />
            <SignalCard
              label="USD/VND"
              sublabel="Tỷ giá"
              direction={signals.usdvnd?.direction ?? ""}
              priceLabel={
                signals.usdvnd?.rate_vnd != null
                  ? signals.usdvnd.rate_vnd.toLocaleString("vi-VN")
                  : "—"
              }
              reasoning={signals.usdvnd?.reasoning ?? ""}
            />
          </div>
        </section>
      )}

      {/* Raw indicator tiles */}
      {indicators && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Chỉ số thị trường
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <IndicatorTile
              label="VNINDEX"
              value={indicators.vnIndex}
              unit="điểm"
              formatter={(v) =>
                v.toLocaleString("vi-VN", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })
              }
            />
            <IndicatorTile
              label="Dầu thô"
              value={indicators.oilUsd}
              unit="USD/thùng"
              formatter={(v) =>
                `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              }
            />
            <IndicatorTile
              label="Vàng"
              value={indicators.goldUsd}
              unit="USD/oz"
              formatter={(v) =>
                `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
              }
            />
            <IndicatorTile
              label="USD/VND"
              value={indicators.usdVnd}
              unit="VND"
              formatter={(v) => v.toLocaleString("vi-VN")}
            />
          </div>
        </section>
      )}

      {/* Calendar section */}
      {calendar && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Lịch sự kiện vĩ mô
          </h2>
          {!calendar.available ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800 px-5 py-4 text-sm text-slate-400">
              {calendar.note || "Không có dữ liệu lịch sự kiện."}
            </div>
          ) : Array.isArray(calendar.events) && calendar.events.length === 0 ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800 px-5 py-4 text-sm text-slate-400">
              Không có sự kiện nào trong lịch hiện tại.
            </div>
          ) : null}
        </section>
      )}

      {/* Full unavailable state — no data at all */}
      {!signals && !indicators && !error && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Chưa có dữ liệu vĩ mô
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Dữ liệu vĩ mô tạm thời không khả dụng. Vui lòng quay lại sau.
          </p>
        </div>
      )}
    </div>
  );
}
