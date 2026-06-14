/**
 * StockChart — client-only financial chart component.
 *
 * Renders in a single lightweight-charts instance with 3 panes:
 *   Pane 0: Candlestick + MA20 (amber) + MA50 (orange) + Bollinger Bands (blue)
 *   Pane 1: RSI(14) with 30/70 reference lines
 *   Pane 2: MACD(12,26,9) — line + signal + histogram
 *
 * All chart creation is inside useEffect — never runs on SSR.
 */
import { useEffect, useRef } from "react";
import type { PricePoint } from "~/domain/market";
import { sanitizePrices, computeMA, computeBB, computeRSI, computeMACD } from "./indicators";

interface Props {
  prices: PricePoint[];
  height?: number;
}

// lightweight-charts LineWidth is a literal union 1|2|3|4
type LW = 1 | 2 | 3 | 4;

// Type-safe null filter — TypeScript can't narrow Array.filter(Boolean) automatically
function nn<T>(arr: (T | null)[]): T[] {
  return arr.filter((x): x is T => x !== null);
}

export function StockChart({ prices, height = 560 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || prices.length === 0) return;
    let mounted = true;

    import("lightweight-charts").then((lc) => {
      if (!mounted || !container) return;

      const {
        createChart,
        CandlestickSeries,
        LineSeries,
        HistogramSeries,
        ColorType,
        CrosshairMode,
        LineStyle,
      } = lc;

      const chart = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: "#0f172a" },
          textColor: "#94a3b8",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "#1e293b" },
          horzLines: { color: "#1e293b" },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: "#334155" },
        timeScale: { borderColor: "#334155", timeVisible: true, fixRightEdge: true },
        autoSize: true,
        height,
      });
      chartRef.current = chart;

      // ── Part 1: Sanitize series BEFORE any indicator computation ─────────
      // Drops non-trading-day poison rows (close===0 && volume===0) and
      // clamps obvious 1000x-scale outliers via forward-fill.
      // Generic — no per-ticker hardcode. Defense-in-depth behind upstream fix.
      const clean = sanitizePrices(prices);

      const closes = clean.map((p) => p.close);
      const times = clean.map((p) => p.date as `${number}-${number}-${number}`);

      // ── Pane 0: Candlestick ───────────────────────────────────────────────
      const candle = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });
      candle.setData(
        clean.map((p) => ({
          time: p.date as `${number}-${number}-${number}`,
          open: (p.open ?? p.close) || p.close,
          high: (p.high ?? p.close) || p.close,
          low: (p.low ?? p.close) || p.close,
          close: p.close,
        })),
      );

      // MA20
      const ma20 = computeMA(closes, 20);
      const ma20s = chart.addSeries(LineSeries, {
        color: "#f59e0b",
        lineWidth: 1 as LW,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: "MA20",
      });
      ma20s.setData(nn(ma20.map((v, i) => (v !== null ? { time: times[i], value: v } : null))));

      // MA50
      const ma50 = computeMA(closes, 50);
      const ma50s = chart.addSeries(LineSeries, {
        color: "#f97316",
        lineWidth: 1 as LW,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: "MA50",
      });
      ma50s.setData(nn(ma50.map((v, i) => (v !== null ? { time: times[i], value: v } : null))));

      // Bollinger Bands
      const bb = computeBB(closes);
      const bbShared = {
        lineWidth: 1 as LW,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      };
      const bbUpper = chart.addSeries(LineSeries, {
        ...bbShared,
        color: "#3b82f6",
        title: "BB+",
      });
      const bbMid = chart.addSeries(LineSeries, {
        ...bbShared,
        color: "#6366f1",
        title: "BBmid",
      });
      const bbLower = chart.addSeries(LineSeries, {
        ...bbShared,
        color: "#3b82f6",
        title: "BB-",
      });

      const bbPoints = bb
        .map((b, i) =>
          b.upper !== null
            ? { time: times[i], upper: b.upper!, mid: b.mid!, lower: b.lower! }
            : null,
        )
        .filter(Boolean) as { time: string; upper: number; mid: number; lower: number }[];
      bbUpper.setData(bbPoints.map((d) => ({ time: d.time, value: d.upper })));
      bbMid.setData(bbPoints.map((d) => ({ time: d.time, value: d.mid })));
      bbLower.setData(bbPoints.map((d) => ({ time: d.time, value: d.lower })));

      // ── Part 2: Data-driven Y-domain ─────────────────────────────────────
      // Compute price-pane domain from the ACTUAL visible band:
      //   min/max over (candle high/low ∪ MA20 ∪ MA50 ∪ BB+ ∪ BB-)
      // domain = [min*(1-pad), max*(1+pad)], pad=0.06, NEVER forced to 0.
      // Applied via autoscaleInfoProvider on the candle series.
      {
        const DOMAIN_PAD = 0.06;
        const allValues: number[] = [];

        // Candle highs/lows
        clean.forEach((p) => {
          allValues.push(p.high ?? p.close);
          allValues.push(p.low ?? p.close);
        });

        // MA20 non-null values
        ma20.forEach((v) => { if (v !== null) allValues.push(v); });

        // MA50 non-null values
        ma50.forEach((v) => { if (v !== null) allValues.push(v); });

        // BB upper/lower non-null values
        bb.forEach((b) => {
          if (b.upper !== null) allValues.push(b.upper!);
          if (b.lower !== null) allValues.push(b.lower!);
        });

        if (allValues.length > 0) {
          const rawMin = Math.min(...allValues);
          const rawMax = Math.max(...allValues);
          const domainMin = rawMin * (1 - DOMAIN_PAD);
          const domainMax = rawMax * (1 + DOMAIN_PAD);

          candle.applyOptions({
            autoscaleInfoProvider: () => ({
              priceRange: { minValue: domainMin, maxValue: domainMax },
              margins: { above: 0, below: 0 },
            }),
          });
        }
      }

      // ── Pane 1: RSI ───────────────────────────────────────────────────────
      const rsiValues = computeRSI(closes);
      const rsiS = chart.addSeries(
        LineSeries,
        {
          color: "#8b5cf6",
          lineWidth: 1 as LW,
          priceLineVisible: false,
          lastValueVisible: true,
          title: "RSI",
        },
        1,
      );
      rsiS.setData(nn(rsiValues.map((v, i) => (v !== null ? { time: times[i], value: v } : null))));
      rsiS.createPriceLine({
        price: 70,
        color: "#ef4444",
        lineWidth: 1 as LW,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "70",
      });
      rsiS.createPriceLine({
        price: 30,
        color: "#22c55e",
        lineWidth: 1 as LW,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "30",
      });

      // ── Pane 2: MACD ──────────────────────────────────────────────────────
      const macd = computeMACD(closes);

      const macdHist = chart.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false, title: "Hist" },
        2,
      );
      macdHist.setData(
        nn(macd.map((d, i) =>
          d.histogram !== null
            ? { time: times[i], value: d.histogram, color: d.histogram >= 0 ? "#22c55e66" : "#ef444466" }
            : null,
        )),
      );

      const macdLineS = chart.addSeries(
        LineSeries,
        { color: "#3b82f6", lineWidth: 1 as LW, priceLineVisible: false, lastValueVisible: true, title: "MACD" },
        2,
      );
      macdLineS.setData(nn(macd.map((d, i) => (d.line !== null ? { time: times[i], value: d.line } : null))));

      const macdSigS = chart.addSeries(
        LineSeries,
        { color: "#f59e0b", lineWidth: 1 as LW, priceLineVisible: false, lastValueVisible: false, title: "Signal" },
        2,
      );
      macdSigS.setData(nn(macd.map((d, i) => (d.signal !== null ? { time: times[i], value: d.signal } : null))));

      chart.timeScale().fitContent();
    });

    return () => {
      mounted = false;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [prices, height]);

  return (
    <div className="rounded-md overflow-hidden">
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 bg-slate-800 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-green-500" />Tăng / <span className="inline-block w-3 h-0.5 bg-red-500" />Giảm
        </span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-amber-400" />MA20</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-orange-400" />MA50</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-blue-400" />BB</span>
        <span className="ml-2 text-slate-600">|</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-violet-500" />RSI(14)</span>
        <span className="ml-2 text-slate-600">|</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-blue-400" />MACD</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-amber-400" />Signal</span>
      </div>
      <div ref={containerRef} style={{ height }} className="bg-slate-900" />
    </div>
  );
}
