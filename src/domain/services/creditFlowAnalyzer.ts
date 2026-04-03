/**
 * Credit Flow Analyzer — Task 246
 *
 * Pure domain service. No I/O.
 *
 * Analyzes NHNN credit growth data and translates it into impact signals
 * for Vietnamese banking and real estate stocks.
 *
 * Chain logic:
 *   NHNN tăng room tín dụng → thanh khoản BĐS cải thiện
 *     → VHM, NVL, KDH: doanh thu tăng → VCB, BID, CTG: nợ xấu giảm → EPS tốt
 *   NHNN siết tín dụng BĐS → thanh khoản BĐS giảm
 *     → VHM, NVL: doanh thu giảm → VCB, BID: provision tăng → EPS giảm
 *
 * Layer: domain/services — NO imports from infrastructure/
 */

import type { Severity } from "./signalDetector.js";

export type ImpactDirection = "up" | "down" | "neutral";
export type { Severity };

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Monthly credit snapshot from NHNN (State Bank of Vietnam).
 */
export interface CreditData {
  totalCreditTrillion: number;
  reCreditTrillion: number;
  reCreditRatioPct: number;
  yoyGrowthPct: number;
  avgMortgageRatePct: number;
  date: string;
}

/**
 * Result of credit flow analysis.
 */
export interface CreditSignal {
  direction: ImpactDirection;
  affectedStocks: Array<{ code: string; impact: string }>;
  summary: string;
  severity: Severity;
  confidence: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Credit chain rules
// ─────────────────────────────────────────────────────────────────────────────

const CREDIT_CHAIN = {
  re_credit_up: [
    {
      stocks: ["VHM", "NVL", "KDH"],
      impact: "Thanh khoản BĐS cải thiện → doanh thu nhận nhà tăng",
    },
    {
      stocks: ["VCB", "BID", "CTG"],
      impact: "Nợ xấu BĐS giảm → provision thấp → EPS tốt",
    },
  ],
  re_credit_down: [
    {
      stocks: ["VHM", "NVL", "KDH"],
      impact: "Thanh khoản BĐS giảm → doanh thu chậm",
    },
    {
      stocks: ["VCB", "BID", "CTG"],
      impact: "Rủi ro nợ xấu BĐS tăng → provision cao",
    },
  ],
  rate_up: [
    {
      stocks: ["VCB", "BID", "CTG"],
      impact: "NIM mở rộng ngắn hạn → EPS tốt",
    },
    {
      stocks: ["VHM", "NVL"],
      impact: "Chi phí vay tăng → khó bán",
    },
  ],
  rate_down: [
    {
      stocks: ["VHM", "NVL", "KDH"],
      impact: "Chi phí vay giảm → thanh khoản BĐS tăng",
    },
    {
      stocks: ["VCB", "BID", "CTG"],
      impact: "NIM thu hẹp → nhưng chất lượng tài sản tốt hơn",
    },
  ],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return 0;
  return ((curr - prev) / prev) * 100;
}

function mergeStockImpacts(
  entries: Array<{ code: string; impact: string }>,
): Array<{ code: string; impact: string }> {
  const map = new Map<string, string>();
  for (const { code, impact } of entries) {
    if (map.has(code)) {
      map.set(code, `${map.get(code)!}; ${impact}`);
    } else {
      map.set(code, impact);
    }
  }
  return Array.from(map.entries()).map(([code, impact]) => ({ code, impact }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyze credit flow changes and generate a market impact signal.
 */
export function analyzeCreditFlow(
  current: CreditData,
  previous: CreditData,
): CreditSignal {
  const reCreditChangePct = pctChange(
    current.reCreditTrillion,
    previous.reCreditTrillion,
  );
  const rateChangePct = current.avgMortgageRatePct - previous.avgMortgageRatePct;
  const yoyChangeDiff = current.yoyGrowthPct - previous.yoyGrowthPct;

  const collectedImpacts: Array<{ code: string; impact: string }> = [];
  let positiveSignals = 0;
  let negativeSignals = 0;

  const RE_THRESHOLD = 2;

  if (reCreditChangePct > RE_THRESHOLD) {
    positiveSignals++;
    for (const group of CREDIT_CHAIN.re_credit_up) {
      for (const code of group.stocks) {
        collectedImpacts.push({ code, impact: group.impact });
      }
    }
  } else if (reCreditChangePct < -RE_THRESHOLD) {
    negativeSignals++;
    for (const group of CREDIT_CHAIN.re_credit_down) {
      for (const code of group.stocks) {
        collectedImpacts.push({ code, impact: group.impact });
      }
    }
  }

  const RATE_THRESHOLD = 0.2;

  if (rateChangePct > RATE_THRESHOLD) {
    negativeSignals++;
    for (const group of CREDIT_CHAIN.rate_up) {
      for (const code of group.stocks) {
        collectedImpacts.push({ code, impact: group.impact });
      }
    }
  } else if (rateChangePct < -RATE_THRESHOLD) {
    positiveSignals++;
    for (const group of CREDIT_CHAIN.rate_down) {
      for (const code of group.stocks) {
        collectedImpacts.push({ code, impact: group.impact });
      }
    }
  }

  if (collectedImpacts.length === 0) {
    return {
      direction: "neutral",
      affectedStocks: [
        { code: "VHM", impact: "Tín dụng BĐS ổn định — tác động trung tính" },
        { code: "VCB", impact: "Tín dụng ổn định — provision không đổi" },
      ],
      summary: "Tín dụng BĐS ổn định — không có thay đổi đáng kể.",
      severity: "low",
      confidence: 0.5,
    };
  }

  // RE credit change dominates rate change when ≥5%
  let direction: ImpactDirection;
  if (Math.abs(reCreditChangePct) >= 5) {
    direction = reCreditChangePct > 0 ? "up" : "down";
  } else {
    direction =
      positiveSignals > negativeSignals
        ? "up"
        : negativeSignals > positiveSignals
          ? "down"
          : "neutral";
  }

  const absReCreditChange = Math.abs(reCreditChangePct);
  const totalSignalStrength = Math.abs(yoyChangeDiff) + absReCreditChange;

  let severity: Severity;
  if (absReCreditChange >= 20 || totalSignalStrength >= 25) {
    severity = "critical";
  } else if (absReCreditChange >= 10 || totalSignalStrength >= 15) {
    severity = "high";
  } else if (absReCreditChange >= 5 || totalSignalStrength >= 8) {
    severity = "medium";
  } else {
    severity = "low";
  }

  const confidence = Math.min(
    0.95,
    0.55 + Math.min(absReCreditChange, 30) / 100,
  );

  const reCreditSign = reCreditChangePct >= 0 ? "+" : "";
  const rateSign = rateChangePct >= 0 ? "+" : "";
  const summary =
    `Tín dụng BĐS ${reCreditSign}${reCreditChangePct.toFixed(1)}% MoM ` +
    `(${current.reCreditTrillion.toLocaleString("vi-VN")} nghìn tỷ). ` +
    `Lãi suất vay trung bình ${rateSign}${rateChangePct.toFixed(2)}pp. ` +
    `Tác động: ${direction === "up" ? "tích cực" : direction === "down" ? "tiêu cực" : "trung tính"} ` +
    `cho cổ phiếu BĐS và ngân hàng.`;

  return {
    direction,
    affectedStocks: mergeStockImpacts(collectedImpacts),
    summary,
    severity,
    confidence,
  };
}
