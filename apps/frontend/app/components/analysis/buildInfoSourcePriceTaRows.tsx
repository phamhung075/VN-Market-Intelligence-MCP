import type { PricePoint, TASnapshot } from "~/domain/market";
import type { InfoSourceRow } from "~/components/analysis/InfoSourceRow";

/**
 * buildPriceRow / buildTaRows — "Stock Price" + "TA service" rows for the
 * InfoSourcePanel "Nguồn dữ liệu" table.
 *
 * Extracted from dashboard.analysis.tsx InfoSourcePanel() (FACTORY-FRONTEND-split-dashboard-analysis)
 * — pure move, no behavior change.
 */
export function buildPriceRow(prices: PricePoint[]): InfoSourceRow | null {
  if (prices.length === 0) return null;
  const last = prices[prices.length - 1];
  const sessions = prices.length;
  let priceDelta: React.ReactNode = null;
  if (prices.length >= 2) {
    const prev = prices[prices.length - 2].close;
    const pct = ((last.close - prev) / prev) * 100;
    priceDelta = (
      <span className={pct > 0 ? "text-green-400" : pct < 0 ? "text-red-400" : "text-slate-400"}>
        {pct > 0 ? "↑" : pct < 0 ? "↓" : "—"}{Math.abs(pct).toFixed(1)}%
      </span>
    );
  }
  return {
    source: "Stock Price",
    indicator: `${sessions} phiên`,
    value: (
      <span className="text-slate-200">
        {last.close.toLocaleString("vi-VN")} {priceDelta}
      </span>
    ),
  };
}

export function buildTaRows(ta: TASnapshot | null): InfoSourceRow[] {
  if (!ta) {
    return [
      { source: "TA service", indicator: "RSI(14)", value: <span className="text-slate-500">—</span> },
      { source: "TA service", indicator: "MACD", value: <span className="text-slate-500">—</span> },
    ];
  }
  const rsiRow: InfoSourceRow = {
    source: "TA service",
    indicator: "RSI(14)",
    value: (
      <span className="text-slate-200">
        {ta.rsi !== null ? ta.rsi.toFixed(1) : "—"}
        {" · "}
        <span className={ta.trend === "BULLISH" ? "text-green-400" : ta.trend === "BEARISH" ? "text-red-400" : "text-slate-400"}>
          {ta.trend}
        </span>
      </span>
    ),
  };
  const macdRow: InfoSourceRow = ta.macd !== null
    ? {
        source: "TA service",
        indicator: "MACD",
        value: (
          <span className={ta.macd.histogram > 0 ? "text-green-400" : ta.macd.histogram < 0 ? "text-red-400" : "text-slate-400"}>
            {ta.macd.histogram > 0 ? "+" : ""}{ta.macd.histogram.toFixed(3)} ({ta.macd.histogram > 0 ? "tăng" : ta.macd.histogram < 0 ? "giảm" : "ngang"})
          </span>
        ),
      }
    : { source: "TA service", indicator: "MACD", value: <span className="text-slate-500">—</span> };
  return [rsiRow, macdRow];
}
