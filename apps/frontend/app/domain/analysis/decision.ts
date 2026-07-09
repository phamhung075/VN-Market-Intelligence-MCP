/**
 * computeDecision — TA/RSI/Kinh Dịch/price composite scoring.
 * Tier 1 of DDD: pure TypeScript — ZERO imports from Remix, React, or app/lib/api/.
 *
 * Moved out of app/routes/dashboard.analysis.tsx (FACTORY-FRONTEND-extract-computeDecision) —
 * this was business logic living in the interface layer. Pure move + threshold naming,
 * no behavior change: same score math, same MUA MẠNH/MUA/GIỮ/BÁN/BÁN MẠNH output.
 */
import type { TASnapshot, KinhDichReading, PricePoint } from "~/domain/market";

export interface DecisionResult {
  label: string;
  textColor: string;
  bgColor: string;
  reasons: string[];
}

// --------------------------------------------------------------------------
// Score weights — contribution per signal type
// --------------------------------------------------------------------------

/** TA trend (BULLISH/BEARISH) contribution to the composite score. */
const TA_TREND_SCORE = 2;
/** RSI oversold/overbought contribution to the composite score. */
const RSI_SCORE = 1;
/** Kinh Dịch MUA/BÁN (strong) contribution to the composite score. */
const KD_STRONG_SCORE = 2;
/** Kinh Dịch THẬN TRỌNG (caution) contribution to the composite score. */
const KD_CAUTION_SCORE = 1;
/** 5-session price trend contribution to the composite score. */
const PRICE_TREND_SCORE = 1;
/** Number of trading sessions to look back for the price trend check. */
const PRICE_TREND_LOOKBACK = 5;

// --------------------------------------------------------------------------
// RSI thresholds
// --------------------------------------------------------------------------

const RSI_OVERSOLD = 30;
/** Upper bound of the RSI "recovery zone" that still scores like oversold. */
const RSI_RECOVERY_CEILING = 50;
const RSI_OVERBOUGHT = 70;

// --------------------------------------------------------------------------
// Composite score → label thresholds
// --------------------------------------------------------------------------

const STRONG_BUY_SCORE = 4;
const BUY_SCORE = 2;
const HOLD_SCORE = -1;
const SELL_SCORE = -3;

export function computeDecision(
  ta: TASnapshot | null,
  reading: KinhDichReading,
  prices: PricePoint[],
): DecisionResult {
  let score = 0;
  const reasons: string[] = [];

  // TA trend
  if (ta) {
    if (ta.trend === "BULLISH") {
      score += TA_TREND_SCORE;
      reasons.push("TA: BULLISH");
    } else if (ta.trend === "BEARISH") {
      score -= TA_TREND_SCORE;
      reasons.push("TA: BEARISH");
    } else {
      reasons.push("TA: NEUTRAL");
    }

    // RSI
    if (ta.rsi !== null) {
      const rsi = ta.rsi;
      reasons.push(`RSI: ${rsi.toFixed(1)}`);
      if (rsi < RSI_OVERSOLD) {
        score += RSI_SCORE; // oversold — recovery potential
      } else if (rsi >= RSI_OVERSOLD && rsi < RSI_RECOVERY_CEILING) {
        score += RSI_SCORE; // oversold recovery zone
      } else if (rsi > RSI_OVERBOUGHT) {
        score -= RSI_SCORE; // overbought
      }
      // RSI_RECOVERY_CEILING–RSI_OVERBOUGHT: neutral, no adjustment
    }
  }

  // Kinh Dịch signal
  const sig = reading.signal.toUpperCase();
  if (sig.includes("MUA")) {
    score += KD_STRONG_SCORE;
    reasons.push(`KD: ${reading.signal}`);
  } else if (sig.includes("BÁN") || sig.includes("BAN")) {
    score -= KD_STRONG_SCORE;
    reasons.push(`KD: ${reading.signal}`);
  } else if (sig.includes("THẬN TRỌNG") || sig.includes("THAN TRONG")) {
    score -= KD_CAUTION_SCORE;
    reasons.push(`KD: ${reading.signal}`);
  } else {
    reasons.push(`KD: ${reading.signal}`);
  }

  // Price trend — last close vs PRICE_TREND_LOOKBACK sessions ago
  if (prices.length >= PRICE_TREND_LOOKBACK) {
    const last = prices[prices.length - 1].close;
    const prev5 = prices[prices.length - PRICE_TREND_LOOKBACK].close;
    const deltaPct = ((last - prev5) / prev5) * 100;
    if (deltaPct > 0) {
      score += PRICE_TREND_SCORE;
      reasons.push(`Giá +${deltaPct.toFixed(1)}% (5 phiên)`);
    } else if (deltaPct < 0) {
      score -= PRICE_TREND_SCORE;
      reasons.push(`Giá ${deltaPct.toFixed(1)}% (5 phiên)`);
    }
  }

  // Map score to label + colors
  if (score >= STRONG_BUY_SCORE) {
    return { label: "MUA MẠNH", textColor: "text-green-400", bgColor: "bg-green-950", reasons };
  }
  if (score >= BUY_SCORE) {
    return { label: "MUA", textColor: "text-green-300", bgColor: "bg-green-900/30", reasons };
  }
  if (score >= HOLD_SCORE) {
    return { label: "GIỮ", textColor: "text-yellow-400", bgColor: "bg-yellow-900/20", reasons };
  }
  if (score >= SELL_SCORE) {
    return { label: "BÁN", textColor: "text-red-300", bgColor: "bg-red-900/30", reasons };
  }
  return { label: "BÁN MẠNH", textColor: "text-red-400", bgColor: "bg-red-950", reasons };
}
