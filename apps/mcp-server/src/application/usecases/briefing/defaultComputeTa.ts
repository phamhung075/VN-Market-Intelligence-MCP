/**
 * Morning/Evening Briefing — default per-ticker TA computation.
 *
 * Extracted from assembleBriefing.ts (formerly the module-level
 * defaultComputeTa/computeMALocal helpers at line 657) — FACTORY-APP-split-assembleBriefing.
 *
 * `defaultComputeTa` is exported — it's the exact function
 * `assembleBriefing.ts` re-exports at the same name for direct-import tests
 * (RSIFIX-2-assembleBriefing.test.ts, 1342/1346-ta-*.test.ts, etc), and
 * assembleEveningSummary.ts also imports it directly.
 *
 * computeRSILocal (the pre-Go-engine local Wilder RSI implementation) was
 * dropped here — RSIFIX-2 already rewired defaultComputeTa to the Go TA
 * engine and the local RSI helper had zero remaining call sites (verified
 * repo-wide grep before removal); computeMALocal is still the ma20 fallback
 * when the Go engine's response omits it.
 *
 * Layer: application/usecases/briefing — may import from infrastructure/microservices.
 */
import type { Database } from "bun:sqlite";
import { computeTAIndicators } from "../../../infrastructure/microservices/clients.js";
import type { TaSignal } from "./types.js";

/** Internal: one daily price row — day TEXT, close_price REAL, volume REAL. */
interface CandleRow {
  day: string;
  close_price: number;
  volume: number;
}

/** Simple Moving Average of last `period` values in `prices`. Returns null if insufficient data. */
export function computeMALocal(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const window = prices.slice(-period);
  return window.reduce((a, b) => a + b, 0) / period;
}

/**
 * Default TA computation for one ticker: queries daily_ohlcv for the last 60
 * calendar days, delegates RSI(14) and MA20 to the canonical Go TA engine at
 * port 5003, and classifies signals.
 *
 * RSIFIX-2: rewired from TS-local computeRSILocal to Go computeTAIndicators so
 * that evening_summary RSI agrees with alert-block RSI to ≤0.1 (same Wilder
 * algorithm, same candle window).
 *
 * Min-candle gate: 35 (Go convergence recommendation — ta-engine-contract.md § 4.3).
 * Candle window: date-windowed `date >= date(now,-60 days)` matching taAlertScanJob.
 * Synthetic market_prices_history fallback: REMOVED (fail-closed is honest).
 * Stub-bar guard: rejects last candle with close<=0 or volume<=0.
 *
 * Returns null when:
 *   - fewer than 35 candles in daily_ohlcv (gate)
 *   - last candle is a stub bar (close<=0 or volume<=0)
 *   - Go TA service is unreachable or returns no RSI (fail-closed)
 */
export async function defaultComputeTa(code: string, db: Database): Promise<TaSignal | null> {
  const rows = db.query<CandleRow, [string]>(
    `SELECT date AS day, close AS close_price, volume
       FROM daily_ohlcv
      WHERE date >= date('now', '-60 days')
        AND code = ?
      ORDER BY date ASC`,
  ).all(code);

  // Min-candle gate: 35 for Go Wilder convergence (ta-engine-contract.md § 4.3)
  if (rows.length < 35) return null;

  // Stub-bar guard: reject if last candle is a placeholder bar
  const lastRow = rows[rows.length - 1]!;
  if (!lastRow || lastRow.close_price <= 0 || lastRow.volume <= 0) return null;

  const closes = rows.map((r) => r.close_price);
  const currentPrice = closes[closes.length - 1] ?? null;

  // Delegate to Go TA engine (pure-compute path: closes[] provided)
  let taResult;
  try {
    taResult = await computeTAIndicators({ code, closes });
  } catch {
    // Go service unreachable → fail-closed (honest null, same as alert-block)
    return null;
  }

  const rsi14 = taResult.rsi ?? null;
  const ma20 = taResult.ma20 ?? computeMALocal(closes, Math.min(20, closes.length));

  const rsiStatus: TaSignal["rsiStatus"] =
    rsi14 === null ? "neutral"
    : rsi14 > 70   ? "overbought"
    : rsi14 < 30   ? "oversold"
    :                "neutral";

  const priceVsMa20: TaSignal["priceVsMa20"] =
    ma20 === null || currentPrice === null ? "neutral"
    : currentPrice > ma20                  ? "above"
    : currentPrice < ma20                  ? "below"
    :                                        "neutral";

  return { code, rsi14, rsiStatus, ma20, priceVsMa20, currentPrice };
}
