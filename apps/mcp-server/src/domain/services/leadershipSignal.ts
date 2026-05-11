/**
 * Leadership Signal Detector — Task 247
 *
 * Pure domain service. No I/O.
 *
 * Classifies insider transactions (from SSC disclosures) into investment
 * signals based on executive position, transaction size, and direction.
 *
 * Layer: domain/services — NO imports from infrastructure/
 */

import type { Severity } from "./signalDetector.js";

export type ImpactDirection = "up" | "down" | "neutral";
export type { Severity };

export type InsiderPosition = "CEO" | "CFO" | "Chairman" | "Board" | "Other";

export interface InsiderTransaction {
  code: string;
  insiderName: string;
  position: InsiderPosition;
  type: "buy" | "sell";
  volume: number;
  registeredVolume: number;
  price: number;
  date: string;
}

export interface LeadershipSignal {
  type: "insider_buy" | "insider_sell" | "leadership_change" | "mass_insider_buy";
  severity: Severity;
  code: string;
  insiderName: string;
  position: string;
  volumePctOutstanding: number;
  direction: ImpactDirection;
  confidence: number;
  reasoning: string;
}

const MIN_PCT_THRESHOLD = 0.1;
const HIGH_SIGNAL_PCT = 0.5;
const HIGH_SELL_PCT_OF_HOLDINGS = 0.5;
const MASS_BUY_MIN_INSIDERS = 2;
const SENIOR_POSITIONS: InsiderPosition[] = ["CEO", "CFO", "Chairman"];

function isSenior(position: InsiderPosition): boolean {
  return (SENIOR_POSITIONS as string[]).includes(position);
}

function pctOfOutstanding(volume: number, outstanding: number): number {
  if (outstanding === 0) return 0;
  return (volume / outstanding) * 100;
}

function pctOfHoldings(volume: number, registeredVolume: number): number {
  if (registeredVolume === 0) return 0;
  return (volume / registeredVolume) * 100;
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000;
  const tsA = new Date(a).getTime();
  const tsB = new Date(b).getTime();
  if (Number.isNaN(tsA) || Number.isNaN(tsB)) return Infinity;
  return Math.abs(tsA - tsB) / msPerDay;
}

/**
 * Classify a single insider transaction.
 * Returns null if too small to be meaningful (< MIN_PCT_THRESHOLD).
 */
export function classifyInsiderTransaction(
  tx: InsiderTransaction,
  outstandingShares: number,
): LeadershipSignal | null {
  const volumePct = pctOfOutstanding(tx.volume, outstandingShares);
  if (volumePct < MIN_PCT_THRESHOLD) return null;

  const holdingsPct = pctOfHoldings(tx.volume, tx.registeredVolume);

  if (tx.type === "buy") {
    if (isSenior(tx.position) && volumePct >= HIGH_SIGNAL_PCT) {
      return {
        type: "insider_buy",
        severity: "high",
        code: tx.code,
        insiderName: tx.insiderName,
        position: tx.position,
        volumePctOutstanding: volumePct,
        direction: "up",
        confidence: Math.min(0.9, 0.65 + volumePct / 100),
        reasoning:
          `${tx.position} ${tx.insiderName} mua ${volumePct.toFixed(2)}% cổ phiếu ` +
          `lưu hành (${tx.volume.toLocaleString("vi-VN")} cp @ ` +
          `${tx.price.toLocaleString("vi-VN")} VND) — tín hiệu lạc quan mạnh từ lãnh đạo cấp cao.`,
      };
    }
    const severity: Severity = tx.position === "Other" ? "low" : "medium";
    return {
      type: "insider_buy",
      severity,
      code: tx.code,
      insiderName: tx.insiderName,
      position: tx.position,
      volumePctOutstanding: volumePct,
      direction: "up",
      confidence: 0.5 + volumePct / 100,
      reasoning:
        `${tx.position} ${tx.insiderName} mua ${volumePct.toFixed(2)}% cổ phiếu ` +
        `lưu hành — tín hiệu tích cực từ nội bộ.`,
    };
  } else {
    if (isSenior(tx.position) && holdingsPct >= 99.9) {
      return {
        type: "insider_sell",
        severity: "critical",
        code: tx.code,
        insiderName: tx.insiderName,
        position: tx.position,
        volumePctOutstanding: volumePct,
        direction: "down",
        confidence: 0.9,
        reasoning:
          `${tx.position} ${tx.insiderName} bán TOÀN BỘ cổ phần nắm giữ ` +
          `(${tx.volume.toLocaleString("vi-VN")} cp) — cảnh báo rủi ro nghiêm trọng.`,
      };
    }
    if (holdingsPct > HIGH_SELL_PCT_OF_HOLDINGS * 100) {
      return {
        type: "insider_sell",
        severity: "high",
        code: tx.code,
        insiderName: tx.insiderName,
        position: tx.position,
        volumePctOutstanding: volumePct,
        direction: "down",
        confidence: 0.75,
        reasoning:
          `${tx.position} ${tx.insiderName} bán ${holdingsPct.toFixed(1)}% cổ phần ` +
          `đang nắm giữ — tín hiệu tiêu cực từ lãnh đạo.`,
      };
    }
    const severity: Severity = isSenior(tx.position) ? "medium" : "low";
    return {
      type: "insider_sell",
      severity,
      code: tx.code,
      insiderName: tx.insiderName,
      position: tx.position,
      volumePctOutstanding: volumePct,
      direction: "down",
      confidence: 0.55,
      reasoning:
        `${tx.position} ${tx.insiderName} bán ${volumePct.toFixed(2)}% cổ phiếu lưu hành.`,
    };
  }
}

/**
 * Detect a mass insider buy: multiple distinct insiders buying within windowDays.
 * Returns null if threshold not met.
 */
export function detectMassInsiderBuy(
  txs: InsiderTransaction[],
  windowDays: number,
): LeadershipSignal | null {
  const buys = txs.filter((t) => t.type === "buy");
  if (buys.length < MASS_BUY_MIN_INSIDERS + 1) return null;

  const sorted = [...buys].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  for (let i = 0; i < sorted.length; i++) {
    const anchor = sorted[i]!;
    const window = sorted.filter(
      (t) => daysBetween(t.date, anchor.date) <= windowDays,
    );
    const uniqueInsiders = new Set(window.map((t) => t.insiderName)).size;

    if (uniqueInsiders >= MASS_BUY_MIN_INSIDERS + 1) {
      const totalVolume = window.reduce((s, t) => s + t.volume, 0);
      const code = anchor.code;
      const names = [...new Set(window.map((t) => t.insiderName))].join(", ");

      return {
        type: "mass_insider_buy",
        severity: "high",
        code,
        insiderName: names,
        position: "Multiple",
        volumePctOutstanding: 0,
        direction: "up",
        confidence: Math.min(0.9, 0.65 + uniqueInsiders * 0.05),
        reasoning:
          `${uniqueInsiders} lãnh đạo khác nhau mua ${totalVolume.toLocaleString("vi-VN")} cp ` +
          `trong vòng ${windowDays} ngày — tín hiệu tích lũy nội bộ mạnh.`,
      };
    }
  }

  return null;
}
