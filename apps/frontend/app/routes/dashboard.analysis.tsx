/**
 * /dashboard/analysis — Agent market analysis.
 * Sections: Kinh Dịch market signal, macro signals, stock table, detail panel.
 * ?stock=CODE — loads full Kinh Dịch reading + price history for that ticker.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, Form, useSearchParams } from "@remix-run/react";
import {
  fetchKinhDichMarket,
  fetchKinhDichReading,
  fetchMacroSnapshot,
  fetchPriceHistory,
} from "~/lib/api/client";
import type {
  KinhDichMarket,
  KinhDichReading,
  MacroSnapshot,
  PricePoint,
} from "~/domain/market";
import { ClientTimestamp } from "~/components/ClientTimestamp";

export const meta: MetaFunction = () => [
  { title: "Market Analysis — VN Market Intelligence" },
];

// Representative cross-sector sample shown in the overview table
const OVERVIEW_TICKERS = [
  "FPT", "VNM", "HPG", "VCB", "MSN", "TCB", "VIC", "SSI",
] as const;

interface StockDetail {
  reading: KinhDichReading;
  prices: PricePoint[];
}

interface LoaderData {
  market: KinhDichMarket | null;
  readings: KinhDichReading[];
  snapshot: MacroSnapshot | null;
  selectedStock: string | null;
  detail: StockDetail | null;
  detailError: string | null;
  errors: string[];
  fetchedAt: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const selectedStock = url.searchParams.get("stock")?.toUpperCase().trim() || null;

  const errors: string[] = [];

  // Base data — always fetched
  const [marketResult, snapshotResult, ...readingResults] =
    await Promise.allSettled([
      fetchKinhDichMarket(),
      fetchMacroSnapshot(),
      ...OVERVIEW_TICKERS.map((t) => fetchKinhDichReading(t)),
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

  // Detail — only when a stock is selected
  let detail: StockDetail | null = null;
  let detailError: string | null = null;

  if (selectedStock) {
    const [readingRes, priceRes] = await Promise.allSettled([
      fetchKinhDichReading(selectedStock),
      fetchPriceHistory(selectedStock),
    ]);

    if (readingRes.status === "fulfilled" && priceRes.status === "fulfilled") {
      detail = { reading: readingRes.value, prices: priceRes.value };
    } else {
      detailError =
        readingRes.status === "rejected"
          ? `Không tải được dữ liệu cho ${selectedStock}: ${String(readingRes.reason)}`
          : `Không tải được giá cho ${selectedStock}`;
    }
  }

  return json<LoaderData>({
    market,
    readings,
    snapshot,
    selectedStock,
    detail,
    detailError,
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
  if (s.includes("BÁN") || s.includes("BEARISH")) return "text-red-400";
  if (s.includes("THẬN TRỌNG") || s.includes("THAN TRONG")) return "text-yellow-400";
  return "text-slate-300";
}

function confidencePct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function confidenceBar(confidence: number) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-slate-700">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-400">{pct}%</span>
    </div>
  );
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
// Section shell
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

// --------------------------------------------------------------------------
// Kinh Dịch market panel
// --------------------------------------------------------------------------

function KinhDichMarketPanel({ market }: { market: KinhDichMarket }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
      <div className="flex flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-6 py-4 shrink-0">
        <span className="text-4xl font-bold text-blue-400">#{market.hexagram}</span>
        <span className="text-sm font-semibold text-slate-300">{market.name}</span>
      </div>
      <div className="flex-1 space-y-2 text-sm">
        <Row label="Xu hướng" value={<span className="font-medium text-slate-200">{market.trend}</span>} />
        <Row label="Tín hiệu" value={<span className={`font-semibold ${signalColor(market.signal)}`}>{market.signal}</span>} />
        <Row label="Độ tin cậy" value={confidenceBar(market.confidence)} />
        <Row label="Thời gian" value={<ClientTimestamp iso={market.timestamp} />} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-slate-500">{label}</span>
      {value}
    </div>
  );
}

// --------------------------------------------------------------------------
// Macro signals panel
// --------------------------------------------------------------------------

function MacroSignalPanel({ snapshot }: { snapshot: MacroSnapshot }) {
  const valueMap: Record<string, number | null> = {
    oil_usd: snapshot.oilUsd,
    gold_usd: snapshot.goldUsd,
    usd_vnd: snapshot.usdVnd,
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {snapshot.signals.map((sig) => {
        const isBullish = sig.direction === "BULLISH";
        const isBearish = sig.direction === "BEARISH";
        const dirColor = isBullish
          ? "text-green-400"
          : isBearish
            ? "text-red-400"
            : "text-slate-400";
        const impactClass =
          sig.impact === "HIGH"
            ? "border-red-800"
            : sig.impact === "MEDIUM"
              ? "border-yellow-800"
              : "border-slate-700";

        return (
          <div
            key={sig.indicator}
            className={`rounded-lg border bg-slate-800 p-4 ${impactClass}`}
          >
            <p className="text-xs text-slate-500">{indicatorLabel(sig.indicator)}</p>
            <p suppressHydrationWarning className="mt-1 text-xl font-bold text-slate-100">
              {valueMap[sig.indicator] != null
                ? Number(valueMap[sig.indicator]).toLocaleString("vi-VN")
                : "—"}
            </p>
            <p className="text-xs text-slate-500">{sig.unit}</p>
            <div className={`mt-2 flex items-center gap-1 text-sm font-semibold ${dirColor}`}>
              {isBullish ? "↑" : isBearish ? "↓" : "—"}
              <span>{sig.direction}</span>
              <span className="ml-auto text-xs font-normal text-slate-500">{sig.impact}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------
// Stock table + selector
// --------------------------------------------------------------------------

function StockTable({
  readings,
  selectedStock,
}: {
  readings: KinhDichReading[];
  selectedStock: string | null;
}) {
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
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {readings.map((r, idx) => {
            const isSelected = r.stock === selectedStock;
            return (
              <tr
                key={r.stock}
                className={`border-b border-slate-700 last:border-0 transition-colors ${
                  isSelected
                    ? "bg-blue-950 border-blue-800"
                    : idx % 2 === 0
                      ? "bg-slate-900 hover:bg-slate-800"
                      : "bg-slate-800 hover:bg-slate-750"
                }`}
              >
                <td className="px-3 py-2 font-mono font-semibold text-blue-400">
                  {r.stock}
                </td>
                <td className="px-3 py-2 text-center">
                  <span className="text-slate-300">#{r.hexagram}</span>
                  <span className="ml-1 text-xs text-slate-600">{r.name}</span>
                </td>
                <td className="px-3 py-2 text-slate-300">{r.trend}</td>
                <td className={`px-3 py-2 font-medium ${signalColor(r.signal)}`}>
                  {r.signal}
                </td>
                <td className="px-3 py-2 text-right">
                  {confidenceBar(r.confidence)}
                </td>
                <td className="px-3 py-2 text-right">
                  {isSelected ? (
                    <Link
                      to="."
                      className="text-xs text-slate-500 hover:text-slate-300"
                    >
                      ✕ đóng
                    </Link>
                  ) : (
                    <Link
                      to={`?stock=${r.stock}`}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Chi tiết →
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StockSearchForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <Form method="get" className="flex items-center gap-2">
      <input
        name="stock"
        type="text"
        defaultValue={defaultValue ?? ""}
        placeholder="Nhập mã cổ phiếu (VD: VNM)"
        className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none w-52"
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="submit"
        className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
      >
        Phân tích
      </button>
    </Form>
  );
}

// --------------------------------------------------------------------------
// Detail panel
// --------------------------------------------------------------------------

function MiniPriceTable({ prices }: { prices: PricePoint[] }) {
  const recent = prices.slice(-7).reverse();
  if (recent.length === 0) return <p className="text-sm text-slate-500">Không có dữ liệu giá.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400">
            <th className="py-1.5 text-left pr-3">Ngày</th>
            <th className="py-1.5 text-right pr-3">Đóng cửa</th>
            <th className="py-1.5 text-right pr-3">Mở cửa</th>
            <th className="py-1.5 text-right pr-3">Cao</th>
            <th className="py-1.5 text-right pr-3">Thấp</th>
            <th className="py-1.5 text-right">Khối lượng</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((p, i) => {
            const delta =
              p.open != null && p.open !== 0
                ? ((p.close - p.open) / p.open) * 100
                : null;
            return (
              <tr key={i} className="border-b border-slate-800 last:border-0">
                <td className="py-1.5 font-mono text-slate-400 pr-3">{p.date}</td>
                <td suppressHydrationWarning className="py-1.5 text-right font-semibold text-slate-100 pr-3">
                  {p.close.toLocaleString("vi-VN")}
                  {delta != null && (
                    <span
                      className={`ml-1 text-xs ${
                        delta > 0
                          ? "text-green-400"
                          : delta < 0
                            ? "text-red-400"
                            : "text-slate-500"
                      }`}
                    >
                      {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                    </span>
                  )}
                </td>
                <td suppressHydrationWarning className="py-1.5 text-right text-slate-400 pr-3">
                  {p.open != null ? p.open.toLocaleString("vi-VN") : "—"}
                </td>
                <td suppressHydrationWarning className="py-1.5 text-right text-green-400 pr-3">
                  {p.high != null ? p.high.toLocaleString("vi-VN") : "—"}
                </td>
                <td suppressHydrationWarning className="py-1.5 text-right text-red-400 pr-3">
                  {p.low != null ? p.low.toLocaleString("vi-VN") : "—"}
                </td>
                <td suppressHydrationWarning className="py-1.5 text-right text-slate-500">
                  {p.volume != null ? p.volume.toLocaleString("vi-VN") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StockDetailPanel({
  detail,
  stock,
}: {
  detail: StockDetail;
  stock: string;
}) {
  const { reading, prices } = detail;

  return (
    <div className="mt-6 rounded-lg border border-blue-800 bg-slate-900 space-y-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-blue-800 bg-blue-950 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xl font-bold text-blue-300">{stock}</span>
          <span className={`text-sm font-semibold ${signalColor(reading.signal)}`}>
            {reading.signal}
          </span>
        </div>
        <Link to="." className="text-xs text-slate-400 hover:text-slate-200">
          ✕ đóng
        </Link>
      </div>

      <div className="grid gap-0 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-700">
        {/* Kinh Dịch details */}
        <div className="p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Kinh Dịch
          </h3>
          <div className="space-y-2 text-sm">
            <Row
              label="Quẻ"
              value={
                <span className="text-slate-200">
                  #{reading.hexagram} — {reading.name}
                </span>
              }
            />
            <Row
              label="Xu hướng"
              value={<span className="text-slate-200">{reading.trend}</span>}
            />
            <Row
              label="Tín hiệu"
              value={
                <span className={`font-semibold ${signalColor(reading.signal)}`}>
                  {reading.signal}
                </span>
              }
            />
            <Row label="Độ tin cậy" value={confidenceBar(reading.confidence)} />
          </div>

          {reading.actionNote && (
            <div className="mt-3 rounded bg-slate-800 px-3 py-2 text-xs text-slate-300 leading-relaxed">
              {reading.actionNote}
            </div>
          )}

          {reading.overallReading && (
            <div className="mt-2 rounded bg-slate-800 px-3 py-2 text-xs text-slate-400 leading-relaxed">
              {reading.overallReading}
            </div>
          )}
        </div>

        {/* Price history */}
        <div className="p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Lịch sử giá — 7 phiên gần nhất
          </h3>
          <MiniPriceTable prices={prices} />
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

export default function AnalysisDashboard() {
  const {
    market,
    readings,
    snapshot,
    selectedStock,
    detail,
    detailError,
    errors,
    fetchedAt,
  } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-5xl space-y-6">
      {/* Page header */}
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
      <SectionCard title="Kinh Dịch — Tín hiệu thị trường" subtitle="tổng quan">
        {market ? (
          <KinhDichMarketPanel market={market} />
        ) : (
          <p className="text-sm text-slate-500">Không có dữ liệu.</p>
        )}
      </SectionCard>

      {/* Macro signals */}
      <SectionCard title="Macro Signals" subtitle="dầu · vàng · tỷ giá">
        {snapshot ? (
          <MacroSignalPanel snapshot={snapshot} />
        ) : (
          <p className="text-sm text-slate-500">Không có dữ liệu.</p>
        )}
      </SectionCard>

      {/* Stock table + selector */}
      <SectionCard
        title="Kinh Dịch — Cổ phiếu"
        subtitle="chọn mã để xem chi tiết"
      >
        {/* Search any ticker */}
        <div className="mb-4">
          <StockSearchForm defaultValue={selectedStock ?? ""} />
        </div>

        <StockTable readings={readings} selectedStock={selectedStock} />

        {/* Detail panel */}
        {selectedStock && detailError && (
          <div className="mt-4 rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300">
            {detailError}
          </div>
        )}
        {selectedStock && detail && (
          <StockDetailPanel detail={detail} stock={selectedStock} />
        )}
      </SectionCard>
    </div>
  );
}
