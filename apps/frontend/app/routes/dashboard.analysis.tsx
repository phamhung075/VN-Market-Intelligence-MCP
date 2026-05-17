/**
 * /dashboard/analysis — Agent market analysis.
 * Sections: Kinh Dịch market signal, macro commodity/FX signals, per-stock hexagram table.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  fetchKinhDichMarket,
  fetchKinhDichReading,
  fetchMacroSnapshot,
} from "~/lib/api/client";
import type {
  KinhDichMarket,
  KinhDichReading,
  MacroSnapshot,
} from "~/domain/market";
import { ClientTimestamp } from "~/components/ClientTimestamp";

export const meta: MetaFunction = () => [
  { title: "Market Analysis — VN Market Intelligence" },
];

// Key tickers to show Kinh Dịch readings for (representative cross-sector sample)
const ANALYSIS_TICKERS = [
  "FPT", "VNM", "HPG", "VCB", "MSN", "TCB", "MWG", "VIC",
] as const;

interface LoaderData {
  market: KinhDichMarket | null;
  readings: KinhDichReading[];
  snapshot: MacroSnapshot | null;
  errors: string[];
  fetchedAt: string;
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const errors: string[] = [];

  const [marketResult, snapshotResult, ...readingResults] =
    await Promise.allSettled([
      fetchKinhDichMarket(),
      fetchMacroSnapshot(),
      ...ANALYSIS_TICKERS.map((t) => fetchKinhDichReading(t)),
    ]);

  const market =
    marketResult.status === "fulfilled"
      ? marketResult.value
      : (errors.push(`Kinh Dịch market: ${String(marketResult.reason)}`), null);

  const snapshot =
    snapshotResult.status === "fulfilled"
      ? snapshotResult.value
      : (errors.push(`Macro snapshot: ${String(snapshotResult.reason)}`), null);

  const readings = readingResults
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((r): r is KinhDichReading => r !== null);

  return json<LoaderData>({
    market,
    readings,
    snapshot,
    errors,
    fetchedAt: new Date().toISOString(),
  });
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function signalColor(signal: string): string {
  const s = signal.toUpperCase();
  if (s.includes("MUA") || s.includes("BULLISH")) return "text-green-400";
  if (s.includes("BÁN") || s.includes("BAN") || s.includes("BEARISH")) return "text-red-400";
  if (s.includes("THẬN TRỌNG") || s.includes("THAN TRONG")) return "text-yellow-400";
  return "text-slate-300";
}

function directionBadge(direction: string, impact: string) {
  const isBullish = direction === "BULLISH";
  const isBearish = direction === "BEARISH";
  const impactClass =
    impact === "HIGH"
      ? "font-bold"
      : impact === "MEDIUM"
        ? "font-medium"
        : "font-normal";

  return (
    <span
      className={`${impactClass} ${
        isBullish
          ? "text-green-400"
          : isBearish
            ? "text-red-400"
            : "text-slate-400"
      }`}
    >
      {isBullish ? "↑" : isBearish ? "↓" : "—"} {direction}
    </span>
  );
}

function impactBadge(impact: string) {
  const cls =
    impact === "HIGH"
      ? "bg-red-900 text-red-300"
      : impact === "MEDIUM"
        ? "bg-yellow-900 text-yellow-300"
        : "bg-slate-700 text-slate-400";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${cls}`}>{impact}</span>
  );
}

function confidencePct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function indicatorLabel(indicator: string): string {
  switch (indicator) {
    case "oil_usd": return "Dầu thô (WTI)";
    case "gold_usd": return "Vàng";
    case "usd_vnd": return "USD/VND";
    default: return indicator;
  }
}

// --------------------------------------------------------------------------
// Section components
// --------------------------------------------------------------------------

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900">
      <div className="border-b border-slate-700 px-4 py-3">
        <h2 className="font-semibold text-slate-300">
          {title}
          {subtitle && (
            <span className="ml-2 text-xs font-normal text-slate-500">
              {subtitle}
            </span>
          )}
        </h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function KinhDichMarketPanel({ market }: { market: KinhDichMarket }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-8">
      {/* Hexagram badge */}
      <div className="flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-6 py-4">
        <span className="text-4xl font-bold text-blue-400">#{market.hexagram}</span>
        <span className="text-sm font-semibold text-slate-300">{market.name}</span>
      </div>

      {/* Signal details */}
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-20">Xu hướng</span>
          <span className="font-medium text-slate-200">{market.trend}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-20">Tín hiệu</span>
          <span className={`font-semibold ${signalColor(market.signal)}`}>
            {market.signal}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-20">Độ tin cậy</span>
          <span className="font-medium text-slate-200">
            {confidencePct(market.confidence)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-20">Thời gian</span>
          <ClientTimestamp iso={market.timestamp} />
        </div>
      </div>
    </div>
  );
}

function MacroSignalPanel({ snapshot }: { snapshot: MacroSnapshot }) {
  const valueMap: Record<string, number | null> = {
    oil_usd: snapshot.oilUsd,
    gold_usd: snapshot.goldUsd,
    usd_vnd: snapshot.usdVnd,
  };

  return (
    <div className="space-y-3">
      {snapshot.signals.map((sig) => (
        <div
          key={sig.indicator}
          className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-800 px-4 py-3"
        >
          <div>
            <p className="font-medium text-slate-200">{indicatorLabel(sig.indicator)}</p>
            <p className="text-xs text-slate-500">{sig.unit}</p>
          </div>
          <div className="text-right space-y-1">
            <p suppressHydrationWarning className="font-semibold text-slate-100">
              {valueMap[sig.indicator] != null
                ? Number(valueMap[sig.indicator]).toLocaleString("vi-VN")
                : "—"}
            </p>
            <div className="flex items-center justify-end gap-2">
              {directionBadge(sig.direction, sig.impact)}
              {impactBadge(sig.impact)}
            </div>
          </div>
        </div>
      ))}
      <p className="text-right text-xs text-slate-600">
        Cập nhật: <ClientTimestamp iso={snapshot.fetchedAt} />
      </p>
    </div>
  );
}

function ReadingsTable({ readings }: { readings: KinhDichReading[] }) {
  if (readings.length === 0) {
    return <p className="text-sm text-slate-500">Không có dữ liệu.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-800">
            <th className="px-3 py-2 text-left font-semibold text-slate-300">Mã</th>
            <th className="px-3 py-2 text-center font-semibold text-slate-300">Quẻ</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-300">Xu hướng</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-300">Tín hiệu</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-300">Tin cậy</th>
          </tr>
        </thead>
        <tbody>
          {readings.map((r, idx) => (
            <tr
              key={r.stock}
              className={`border-b border-slate-700 last:border-0 ${
                idx % 2 === 0 ? "bg-slate-900" : "bg-slate-800"
              }`}
            >
              <td className="px-3 py-2 font-mono font-semibold text-blue-400">
                {r.stock}
              </td>
              <td className="px-3 py-2 text-center text-slate-400">
                #{r.hexagram}
                <span className="ml-1 text-xs text-slate-600">{r.name}</span>
              </td>
              <td className="px-3 py-2 text-slate-300">{r.trend}</td>
              <td className={`px-3 py-2 font-medium ${signalColor(r.signal)}`}>
                {r.signal}
              </td>
              <td className="px-3 py-2 text-right text-slate-400">
                {confidencePct(r.confidence)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

export default function AnalysisDashboard() {
  const { market, readings, snapshot, errors, fetchedAt } =
    useLoaderData<typeof loader>();

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Market Analysis</h1>
        <span className="text-xs text-slate-500">
          <ClientTimestamp iso={fetchedAt} />
        </span>
      </div>

      {errors.length > 0 && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300 space-y-1"
        >
          {errors.map((e, idx) => (
            <p key={idx}>{e}</p>
          ))}
        </div>
      )}

      {/* Kinh Dịch market signal */}
      <SectionCard
        title="Kinh Dịch — Tín hiệu thị trường"
        subtitle="tổng quan"
      >
        {market ? (
          <KinhDichMarketPanel market={market} />
        ) : (
          <p className="text-sm text-slate-500">Không có dữ liệu.</p>
        )}
      </SectionCard>

      {/* Macro commodity / FX signals */}
      <SectionCard
        title="Macro Signals"
        subtitle="dầu · vàng · tỷ giá"
      >
        {snapshot ? (
          <MacroSignalPanel snapshot={snapshot} />
        ) : (
          <p className="text-sm text-slate-500">Không có dữ liệu.</p>
        )}
      </SectionCard>

      {/* Per-stock Kinh Dịch readings */}
      <SectionCard
        title="Kinh Dịch — Cổ phiếu"
        subtitle={`${readings.length} mã`}
      >
        <ReadingsTable readings={readings} />
      </SectionCard>
    </div>
  );
}
