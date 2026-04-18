/**
 * TASK 1428 — TDD RED: Evening TA section restricted to RSI overbought/oversold only
 *
 * All assertions MUST FAIL before Task 1429 changes BOTH filter predicates in
 * eveningSummaryJob.ts from:
 *   `s.rsiStatus !== "neutral" || s.priceVsMa20 !== "neutral"`
 * to:
 *   `s.rsiStatus !== "neutral"`
 *
 * AC-a: ticker with neutral RSI but price above MA20 → EXCLUDED from Telegram message
 * AC-b: ticker with overbought RSI (>70) → INCLUDED in Telegram message
 * AC-c: ticker with oversold RSI (<30) → INCLUDED in Telegram message
 * AC-d: all-neutral-RSI tickers → "TA tín hiệu đóng cửa:" section absent from message
 */

import { describe, it, expect, beforeEach } from "bun:test";
import type { Database } from "bun:sqlite";
import type { EveningSummary } from "../application/usecases/assembleEveningSummary.js";
import type { TaSignal } from "../application/usecases/assembleBriefing.js";
import {
  runEveningSummary,
  resetEveningSummaryGuard,
} from "../scheduler/eveningSummaryJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock DB — satisfies dedup guard (returns empty count → no skip)
// ─────────────────────────────────────────────────────────────────────────────

const mockDb = {
  prepare: () => ({ all: () => [], get: () => ({ cnt: 0 }) }),
} as unknown as Database;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a minimal EveningSummary with injected taSummary
// One top story ensures hasContent = true so the message is always sent.
// ─────────────────────────────────────────────────────────────────────────────

function makeSummary(taSummary: TaSignal[]): EveningSummary {
  return {
    date: "2026-04-18",
    topAlerts: [],
    topStories: [
      {
        title: "Dummy story for hasContent",
        level: "global",
        sentiment: "neutral",
        impactScore: 1,
      },
    ],
    watchlistMovers: [],
    predictionSignals: [],
    predictionDiag: { stored: 0 },
    taDiag: {
      tickersWithSignal: taSummary.length,
      tickersBelowThreshold: 0,
      ohlcvRowsMin: 20,
      ohlcvRowsMax: 20,
    },
    taSummary,
    newsCount: 0,
    generatedAt: "2026-04-18T15:30:00.000Z",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared TA signal fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** neutral RSI but price ABOVE MA20 — should be excluded post-fix */
const neutralRsiAboveMa20: TaSignal = {
  code: "VCB",
  rsi14: 55,
  rsiStatus: "neutral",
  ma20: 90,
  priceVsMa20: "above",
  currentPrice: 95,
};

/** overbought RSI — always included */
const overboughtRsi: TaSignal = {
  code: "HPG",
  rsi14: 75,
  rsiStatus: "overbought",
  ma20: 28,
  priceVsMa20: "above",
  currentPrice: 30,
};

/** oversold RSI — always included */
const oversoldRsi: TaSignal = {
  code: "SSI",
  rsi14: 22,
  rsiStatus: "oversold",
  ma20: 22,
  priceVsMa20: "below",
  currentPrice: 20,
};

/** fully neutral — RSI neutral, MA20 neutral */
const fullyNeutral: TaSignal = {
  code: "MBB",
  rsi14: 50,
  rsiStatus: "neutral",
  ma20: 18,
  priceVsMa20: "neutral",
  currentPrice: 18,
};

// ─────────────────────────────────────────────────────────────────────────────
// AC-a: neutral RSI but price above MA20 → EXCLUDED
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-a: neutral-RSI / above-MA20 ticker excluded from TA section", () => {
  beforeEach(() => resetEveningSummaryGuard());

  it("VCB (neutral RSI, above MA20) does NOT appear under TA tín hiệu đóng cửa", async () => {
    let captured = "";
    const sendFn = async (msg: string) => { captured = msg; };
    const summaryFn = async () => makeSummary([neutralRsiAboveMa20]);

    await runEveningSummary(
      summaryFn,
      sendFn as Parameters<typeof runEveningSummary>[1],
      mockDb,
    );

    // The section header must not appear because the only TA entry has neutral RSI
    expect(captured).not.toContain("TA tín hiệu đóng cửa:");
  });

  it("VCB ticker code does NOT appear in the TA block", async () => {
    let captured = "";
    const sendFn = async (msg: string) => { captured = msg; };
    const summaryFn = async () => makeSummary([neutralRsiAboveMa20]);

    await runEveningSummary(
      summaryFn,
      sendFn as Parameters<typeof runEveningSummary>[1],
      mockDb,
    );

    // Find TA section range — section absent means VCB not in TA context
    const taIdx = captured.indexOf("TA tín hiệu đóng cửa:");
    expect(taIdx).toBe(-1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-b: overbought RSI → INCLUDED
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-b: overbought RSI ticker included in TA section", () => {
  beforeEach(() => resetEveningSummaryGuard());

  it("HPG (RSI=75 overbought) appears under TA tín hiệu đóng cửa", async () => {
    let captured = "";
    const sendFn = async (msg: string) => { captured = msg; };
    const summaryFn = async () => makeSummary([overboughtRsi]);

    await runEveningSummary(
      summaryFn,
      sendFn as Parameters<typeof runEveningSummary>[1],
      mockDb,
    );

    expect(captured).toContain("TA tín hiệu đóng cửa:");
    expect(captured).toContain("HPG:");
  });

  it("HPG line contains RSI value and quá mua label", async () => {
    let captured = "";
    const sendFn = async (msg: string) => { captured = msg; };
    const summaryFn = async () => makeSummary([overboughtRsi]);

    await runEveningSummary(
      summaryFn,
      sendFn as Parameters<typeof runEveningSummary>[1],
      mockDb,
    );

    expect(captured).toContain("RSI=75.0 (quá mua)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-c: oversold RSI → INCLUDED
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-c: oversold RSI ticker included in TA section", () => {
  beforeEach(() => resetEveningSummaryGuard());

  it("SSI (RSI=22 oversold) appears under TA tín hiệu đóng cửa", async () => {
    let captured = "";
    const sendFn = async (msg: string) => { captured = msg; };
    const summaryFn = async () => makeSummary([oversoldRsi]);

    await runEveningSummary(
      summaryFn,
      sendFn as Parameters<typeof runEveningSummary>[1],
      mockDb,
    );

    expect(captured).toContain("TA tín hiệu đóng cửa:");
    expect(captured).toContain("SSI:");
  });

  it("SSI line contains RSI value and quá bán label", async () => {
    let captured = "";
    const sendFn = async (msg: string) => { captured = msg; };
    const summaryFn = async () => makeSummary([oversoldRsi]);

    await runEveningSummary(
      summaryFn,
      sendFn as Parameters<typeof runEveningSummary>[1],
      mockDb,
    );

    expect(captured).toContain("RSI=22.0 (quá bán)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-d: all-neutral-RSI → TA section entirely absent
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-d: all-neutral-RSI tickers → TA section absent", () => {
  beforeEach(() => resetEveningSummaryGuard());

  it("message has no TA tín hiệu đóng cửa section when all RSI are neutral", async () => {
    let captured = "";
    const sendFn = async (msg: string) => { captured = msg; };
    // Mix neutral RSI variants: one with above-MA20, one fully neutral
    const summaryFn = async () => makeSummary([neutralRsiAboveMa20, fullyNeutral]);

    await runEveningSummary(
      summaryFn,
      sendFn as Parameters<typeof runEveningSummary>[1],
      mockDb,
    );

    expect(captured).not.toContain("TA tín hiệu đóng cửa:");
  });

  it("neither VCB nor MBB ticker codes appear in TA context", async () => {
    let captured = "";
    const sendFn = async (msg: string) => { captured = msg; };
    const summaryFn = async () => makeSummary([neutralRsiAboveMa20, fullyNeutral]);

    await runEveningSummary(
      summaryFn,
      sendFn as Parameters<typeof runEveningSummary>[1],
      mockDb,
    );

    // No TA section at all → section header absent
    expect(captured.indexOf("TA tín hiệu đóng cửa:")).toBe(-1);
  });

  it("hasContent remains true (story keeps message alive) even with all-neutral TA", async () => {
    let captured = "";
    const sendFn = async (msg: string) => { captured = msg; };
    const summaryFn = async () => makeSummary([neutralRsiAboveMa20, fullyNeutral]);

    await runEveningSummary(
      summaryFn,
      sendFn as Parameters<typeof runEveningSummary>[1],
      mockDb,
    );

    // Message was still sent (hasContent = true via story)
    expect(captured).toContain("TÓM TẮT BUỔI TỐI");
  });
});
