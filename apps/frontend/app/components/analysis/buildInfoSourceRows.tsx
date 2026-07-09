import type { KinhDichReading, MacroSignalEntry, MacroSnapshot, PricePoint, TASnapshot } from "~/domain/market";
import { signalColor } from "~/domain/formatters/signal-color";
import { confidencePct } from "~/domain/formatters/confidence-pct";
import { indicatorLabel } from "~/domain/formatters/indicator-label";
import { QueName } from "~/components/QueName";
import type { InfoSourceRow } from "~/components/analysis/InfoSourceRow";
import { buildPriceRow, buildTaRows } from "~/components/analysis/buildInfoSourcePriceTaRows";

export type { InfoSourceRow };

/**
 * buildInfoSourceRows — assembles the "Nguồn dữ liệu" table rows for
 * InfoSourcePanel: price, TA (RSI/MACD), Kinh Dịch, and top-impact macro.
 *
 * Extracted from dashboard.analysis.tsx InfoSourcePanel() (FACTORY-FRONTEND-split-dashboard-analysis)
 * — pure move, no behavior change.
 */
export function buildInfoSourceRows(
  ta: TASnapshot | null,
  reading: KinhDichReading,
  prices: PricePoint[],
  snapshot: MacroSnapshot | null,
): InfoSourceRow[] {
  const rows: InfoSourceRow[] = [];

  const priceRow = buildPriceRow(prices);
  if (priceRow) rows.push(priceRow);
  rows.push(...buildTaRows(ta));

  // Kinh Dịch row
  rows.push({
    source: "Kinh Dịch",
    indicator: (
      <QueName
        hexagram={reading.hexagram}
        name={reading.name}
        className="text-xs text-slate-400"
      />
    ),
    value: (
      <span className="text-slate-200">
        <span className={`font-semibold ${signalColor(reading.signal)}`}>{reading.signal}</span>
        {" · "}
        {confidencePct(reading.confidence)}
      </span>
    ),
  });

  // Macro row — highest impact signal (keyed-object contract)
  if (snapshot && Object.values(snapshot.signals).length > 0) {
    const impactRank = (entry: MacroSignalEntry) => {
      const imp = entry.impact ?? entry.tier ?? "LOW";
      return imp === "HIGH" ? 3 : imp === "MEDIUM" ? 2 : 1;
    };
    const [[topKey, topEntry]] = Object.entries(snapshot.signals).sort(
      ([, a], [, b]) => impactRank(b) - impactRank(a)
    );
    const topDirection = topEntry.direction ?? topEntry.regime ?? topEntry.label ?? "—";
    const topImpact = topEntry.impact ?? topEntry.tier ?? "LOW";
    rows.push({
      source: "Macro",
      indicator: indicatorLabel(topKey),
      value: (
        <span className="text-slate-200">
          <span className={topDirection === "BULLISH" ? "text-green-400" : topDirection === "BEARISH" ? "text-red-400" : "text-slate-400"}>
            {topDirection}
          </span>
          {" · "}
          <span className="text-slate-400">{topImpact}</span>
        </span>
      ),
    });
  }

  return rows;
}
