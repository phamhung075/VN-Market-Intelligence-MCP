// apps/mcp-server/src/__tests__/1359b-domain-logic-gaps.test.ts
// Task 1359b — Domain Logic Unit Tests
// Covers: macroOutlierGuard, signalClassWeighter, forecastConfidenceScore, periodDeltaComputer
// 32 tests total — no production changes, no DB, no mocks needed.

import { describe, it, expect } from "bun:test";

import {
  validateMacroChangePercent,
  MacroAssetClass,
  type MacroOutlierResult,
} from "../domain/services/macroOutlierGuard.js";

import {
  computeWeightedConvictionScore,
  SIGNAL_CLASS_WEIGHTS,
  DEFAULT_SIGNAL_WEIGHT,
  type WeightedSignalInput,
} from "../domain/services/signalClassWeighter.js";

import {
  forecastConfidenceScore,
  isSanctionActive,
  pickStrictestActiveSanction,
  SANCTION_MULTIPLIER,
  type BrokerSanction,
} from "../domain/services/forecastConfidenceScore.js";

import {
  computePeriodDelta,
  type FinancialMetrics,
} from "../domain/services/financial-reports/periodDeltaComputer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Section A — macroOutlierGuard (MOG-1 through MOG-8)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1359b — macroOutlierGuard", () => {
  it("MOG-1: EQUITY_INDEX below threshold (24.9) — isAnomaly false, reason null", () => {
    const result = validateMacroChangePercent(
      "VN-Index",
      24.9,
      MacroAssetClass.EQUITY_INDEX,
    );
    expect(result.isAnomaly).toBe(false);
    expect(result.reason).toBeNull();
    expect(result.indicatorName).toBe("VN-Index");
    expect(result.changePercent).toBe(24.9);
    expect(result.assetClass).toBe(MacroAssetClass.EQUITY_INDEX);
  });

  it("MOG-2: EQUITY_INDEX at exact threshold (25) — isAnomaly true, reason contains key strings", () => {
    const result = validateMacroChangePercent(
      "Dow Jones",
      25,
      MacroAssetClass.EQUITY_INDEX,
    );
    expect(result.isAnomaly).toBe(true);
    expect(result.reason).not.toBeNull();
    expect(result.reason).toContain("Dow Jones");
    expect(result.reason).toContain("25%");
    expect(result.reason).toContain("EQUITY_INDEX");
    expect(result.reason).toContain("data_anomaly");
  });

  it("MOG-3: EQUITY_INDEX negative at exact threshold (-25) — isAnomaly true (Math.abs applies)", () => {
    const result = validateMacroChangePercent(
      "S&P 500",
      -25,
      MacroAssetClass.EQUITY_INDEX,
    );
    expect(result.isAnomaly).toBe(true);
  });

  it("MOG-4: COMMODITY at exact threshold (50) — isAnomaly true, reason contains threshold and class", () => {
    const result = validateMacroChangePercent(
      "Brent Crude",
      50,
      MacroAssetClass.COMMODITY,
    );
    expect(result.isAnomaly).toBe(true);
    expect(result.reason).toContain("50%");
    expect(result.reason).toContain("COMMODITY");
  });

  it("MOG-5: COMMODITY below threshold (49.9) — isAnomaly false, reason null", () => {
    const result = validateMacroChangePercent(
      "Brent Crude",
      49.9,
      MacroAssetClass.COMMODITY,
    );
    expect(result.isAnomaly).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("MOG-6: PRECIOUS_METAL at exact threshold (40) — isAnomaly true, reason contains 40%", () => {
    const result = validateMacroChangePercent(
      "Gold",
      40,
      MacroAssetClass.PRECIOUS_METAL,
    );
    expect(result.isAnomaly).toBe(true);
    expect(result.reason).toContain("40%");
  });

  it("MOG-7: PRECIOUS_METAL below threshold (39.9) — isAnomaly false", () => {
    const result = validateMacroChangePercent(
      "Silver",
      39.9,
      MacroAssetClass.PRECIOUS_METAL,
    );
    expect(result.isAnomaly).toBe(false);
  });

  it("MOG-8: zero changePercent — isAnomaly false for all asset classes", () => {
    for (const cls of Object.values(MacroAssetClass)) {
      const r = validateMacroChangePercent("test", 0, cls);
      expect(r.isAnomaly).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section B — signalClassWeighter (SCW-1 through SCW-8)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1359b — signalClassWeighter", () => {
  it("SCW-1: empty array returns 0", () => {
    const result = computeWeightedConvictionScore([]);
    expect(result).toBe(0);
  });

  it("SCW-2: single structural_factor signal — score passes through unchanged", () => {
    const result = computeWeightedConvictionScore([
      { score: 0.8, signalClass: "structural_factor" },
    ]);
    // (0.8 * 1.5) / 1.5 = 0.8
    expect(Math.abs(result - 0.8)).toBeLessThan(1e-9);
  });

  it("SCW-3: single sentiment signal — score passes through unchanged", () => {
    const result = computeWeightedConvictionScore([
      { score: 0.6, signalClass: "sentiment" },
    ]);
    // (0.6 * 0.5) / 0.5 = 0.6
    expect(Math.abs(result - 0.6)).toBeLessThan(1e-9);
  });

  it("SCW-4: null signalClass uses default weight 1.0", () => {
    const result = computeWeightedConvictionScore([
      { score: 0.7, signalClass: null },
    ]);
    // (0.7 * 1.0) / 1.0 = 0.7
    expect(Math.abs(result - 0.7)).toBeLessThan(1e-9);
  });

  it("SCW-5: undefined signalClass uses default weight 1.0", () => {
    const result = computeWeightedConvictionScore([
      { score: 0.5, signalClass: undefined },
    ]);
    // (0.5 * 1.0) / 1.0 = 0.5
    expect(Math.abs(result - 0.5)).toBeLessThan(1e-9);
  });

  it("SCW-6: multi-class blend — structural vs one_time_catalyst — weighted not simple average", () => {
    const result = computeWeightedConvictionScore([
      { score: 0.6, signalClass: "structural_factor" },
      { score: 0.9, signalClass: "one_time_catalyst" },
    ]);
    // (0.6*1.5 + 0.9*0.7) / (1.5+0.7) = (0.9 + 0.63) / 2.2 = 1.53/2.2 ≈ 0.6954...
    expect(Math.abs(result - 1.53 / 2.2)).toBeLessThan(1e-6);
    // Weighted avg != simple avg (0.75)
    expect(result).toBeLessThan(0.75);
  });

  it("SCW-7: all five signal classes with score=1.0 — result clamped to 1.0", () => {
    const inputs: WeightedSignalInput[] = [
      { score: 1.0, signalClass: "structural_factor" },
      { score: 1.0, signalClass: "cyclical" },
      { score: 1.0, signalClass: "technical_signal" },
      { score: 1.0, signalClass: "one_time_catalyst" },
      { score: 1.0, signalClass: "sentiment" },
    ];
    const result = computeWeightedConvictionScore(inputs);
    // All scores = 1.0 → weighted avg = 1.0 regardless of weights
    expect(result).toBe(1.0);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it("SCW-8: mixed null + classified signals — null treated as neutral weight 1.0", () => {
    const result = computeWeightedConvictionScore([
      { score: 0.8, signalClass: "structural_factor" }, // weight 1.5
      { score: 0.4, signalClass: null },                // weight 1.0
    ]);
    // (0.8*1.5 + 0.4*1.0) / (1.5+1.0) = (1.2 + 0.4) / 2.5 = 1.6/2.5 = 0.64
    expect(Math.abs(result - 0.64)).toBeLessThan(1e-6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section C — forecastConfidenceScore (FCS-1 through FCS-8)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1359b — forecastConfidenceScore", () => {
  it("FCS-1: no sanctions — multiplier 1.0, confidence unchanged", () => {
    const result = forecastConfidenceScore("TVS", 0.8, [], "2026-04-06");
    expect(result.multiplier).toBe(1);
    expect(result.adjustedConfidence).toBe(0.8);
    expect(result.baseConfidence).toBe(0.8);
    expect(result.activeSanction).toBeNull();
    expect(result.reason).toBe("Không có chế tài SSC đang hiệu lực");
  });

  it("FCS-2: active warning — multiplier 0.5, confidence halved", () => {
    const sanctions: BrokerSanction[] = [
      {
        brokerName: "TVS",
        sanctionStart: "2026-03-01",
        sanctionEnd: null,
        severity: "warning",
      },
    ];
    const result = forecastConfidenceScore("TVS", 0.8, sanctions, "2026-04-06");
    expect(result.multiplier).toBe(0.5);
    expect(Math.abs(result.adjustedConfidence - 0.4)).toBeLessThan(1e-9);
    expect(result.activeSanction).not.toBeNull();
    expect(result.activeSanction!.severity).toBe("warning");
  });

  it("FCS-3: active suspension — multiplier 0.2, reason contains đình chỉ hoạt động", () => {
    const sanctions: BrokerSanction[] = [
      {
        brokerName: "TVS",
        sanctionStart: "2026-01-01",
        sanctionEnd: null,
        severity: "suspension",
      },
    ];
    const result = forecastConfidenceScore("TVS", 0.9, sanctions, "2026-04-06");
    expect(result.multiplier).toBe(0.2);
    expect(Math.abs(result.adjustedConfidence - 0.18)).toBeLessThan(1e-9);
    expect(result.reason).toContain("đình chỉ hoạt động");
  });

  it("FCS-4: expired sanction — treated as no active sanction", () => {
    const sanctions: BrokerSanction[] = [
      {
        brokerName: "TVS",
        sanctionStart: "2025-01-01",
        sanctionEnd: "2025-06-30",
        severity: "warning",
      },
    ];
    const result = forecastConfidenceScore("TVS", 0.8, sanctions, "2026-04-06");
    expect(result.multiplier).toBe(1);
    expect(result.adjustedConfidence).toBe(0.8);
    expect(result.activeSanction).toBeNull();
  });

  it("FCS-5: future sanction (not yet started) — treated as no active sanction", () => {
    const sanctions: BrokerSanction[] = [
      {
        brokerName: "TVS",
        sanctionStart: "2026-05-01",
        sanctionEnd: null,
        severity: "suspension",
      },
    ];
    const result = forecastConfidenceScore("TVS", 0.8, sanctions, "2026-04-06");
    expect(result.multiplier).toBe(1);
    expect(result.activeSanction).toBeNull();
  });

  it("FCS-6: strictest sanction wins when both warning and suspension are active", () => {
    const sanctions: BrokerSanction[] = [
      {
        brokerName: "TVS",
        sanctionStart: "2026-01-01",
        sanctionEnd: null,
        severity: "warning",
      },
      {
        brokerName: "TVS",
        sanctionStart: "2026-02-01",
        sanctionEnd: null,
        severity: "suspension",
      },
    ];
    const result = forecastConfidenceScore("TVS", 1.0, sanctions, "2026-04-06");
    expect(result.multiplier).toBe(0.2);
    expect(result.activeSanction!.severity).toBe("suspension");
  });

  it("FCS-7: broker name matching is case-insensitive and trims whitespace", () => {
    const sanctions: BrokerSanction[] = [
      {
        brokerName: "  TVS  ",
        sanctionStart: "2026-01-01",
        sanctionEnd: null,
        severity: "warning",
      },
    ];
    // Input broker name uses different casing + no spaces
    const result = forecastConfidenceScore("tvs", 0.8, sanctions, "2026-04-06");
    expect(result.multiplier).toBe(0.5);
  });

  it("FCS-8: isSanctionActive boundary — inclusive on both start and end date", () => {
    const s: BrokerSanction = {
      brokerName: "X",
      sanctionStart: "2026-03-01",
      sanctionEnd: "2026-03-31",
      severity: "warning",
    };
    expect(isSanctionActive(s, "2026-03-01")).toBe(true);   // start date inclusive
    expect(isSanctionActive(s, "2026-03-31")).toBe(true);   // end date inclusive
    expect(isSanctionActive(s, "2026-02-28")).toBe(false);  // one day before start
    expect(isSanctionActive(s, "2026-04-01")).toBe(false);  // one day after end
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section D — periodDeltaComputer gap tests (PDC-1 through PDC-8)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1359b — periodDeltaComputer (gap tests)", () => {
  // Shared base fixture
  const base: FinancialMetrics = {
    netRevenue: 1_000_000,
    grossProfit: 250_000,
    operatingProfit: 150_000,
    netProfit: 120_000,
    ebitda: 180_000,
    eps: 1_200,
    totalAssets: 5_000_000,
    equity: 2_000_000,
    totalDebt: 1_500_000,
    cash: 300_000,
    operatingCF: 200_000,
    freeCashFlow: 140_000,
    grossMarginPct: 25.0,
    netMarginPct: 12.0,
    roe: 6.0,
    debtToEquity: 0.75,
  };

  it("PDC-1: all-zero metrics — ValueChange changePct null, RatioChange changePP zero", () => {
    const zeros: FinancialMetrics = {
      netRevenue: 0,
      grossProfit: 0,
      operatingProfit: 0,
      netProfit: 0,
      ebitda: 0,
      eps: 0,
      totalAssets: 0,
      equity: 0,
      totalDebt: 0,
      cash: 0,
      operatingCF: 0,
      freeCashFlow: 0,
      grossMarginPct: 0,
      netMarginPct: 0,
      roe: 0,
      debtToEquity: 0,
    };
    const result = computePeriodDelta(zeros, zeros, "YoY");
    expect(result.netRevenue.changePct).toBeNull();
    expect(result.netProfit.changePct).toBeNull();
    // Ratio fields use subtraction (0 - 0 = 0), not division
    expect(result.grossMarginPP.changePP).toBe(0);
  });

  it("PDC-2: current < previous — negative changeAbsolute and negative changePct", () => {
    const lower: FinancialMetrics = { ...base, netRevenue: 700_000 };
    const result = computePeriodDelta(lower, base, "YoY");
    // changeAbsolute = 700_000 - 1_000_000 = -300_000
    // changePct = (-300_000 / 1_000_000) * 100 = -30
    expect(result.netRevenue.changeAbsolute).toBe(-300_000);
    expect(Math.abs(result.netRevenue.changePct! - (-30.0))).toBeLessThan(1e-5);
  });

  it("PDC-3: large VND numbers — precision preserved without overflow", () => {
    const large: FinancialMetrics = {
      ...base,
      netRevenue: 500_000_000,    // 500 billion VND
      totalAssets: 2_000_000_000,
    };
    const largePrev: FinancialMetrics = {
      ...base,
      netRevenue: 400_000_000,
      totalAssets: 1_800_000_000,
    };
    const result = computePeriodDelta(large, largePrev, "YoY");
    expect(result.netRevenue.changeAbsolute).toBe(100_000_000);
    expect(Math.abs(result.netRevenue.changePct! - 25.0)).toBeLessThan(1e-5);
    expect(result.totalAssets.changeAbsolute).toBe(200_000_000);
  });

  it("PDC-4: negative previous for multiple metrics — all return null changePct", () => {
    const negativePrev: FinancialMetrics = {
      ...base,
      netProfit: -50_000,
      operatingProfit: -20_000,
      freeCashFlow: -10_000,
    };
    const result = computePeriodDelta(base, negativePrev, "YoY");
    expect(result.netProfit.changePct).toBeNull();
    expect(result.operatingProfit.changePct).toBeNull();
    expect(result.freeCashFlow.changePct).toBeNull();
    // netRevenue previous was positive — changePct is a number
    expect(typeof result.netRevenue.changePct).toBe("number");
  });

  it("PDC-5: ratioChange with negative pp difference — grossMarginPP and roePP are negative", () => {
    const lowerMargin: FinancialMetrics = { ...base, grossMarginPct: 20.0, roe: 4.5 };
    const result = computePeriodDelta(lowerMargin, base, "YoY");
    // grossMarginPP: 20.0 - 25.0 = -5.0
    // roePP: 4.5 - 6.0 = -1.5
    expect(Math.abs(result.grossMarginPP.changePP - (-5.0))).toBeLessThan(1e-5);
    expect(Math.abs(result.roePP.changePP - (-1.5))).toBeLessThan(1e-5);
    expect(result.grossMarginPP.current).toBe(20.0);
    expect(result.grossMarginPP.previous).toBe(25.0);
  });

  it("PDC-6: comparedTo field defaults to empty string", () => {
    const result = computePeriodDelta(base, base, "QoQ");
    expect(result.comparedTo).toBe("");
  });

  it("PDC-7: deltaType flows correctly into QoQ result alongside ratio fields", () => {
    const result = computePeriodDelta(base, { ...base, debtToEquity: 0.60 }, "QoQ");
    expect(result.deltaType).toBe("QoQ");
    // debtToEquityPP: 0.75 - 0.60 = 0.15
    expect(Math.abs(result.debtToEquityPP.changePP - 0.15)).toBeLessThan(1e-5);
  });

  it("PDC-8: small float margin precision — changePP correct to 3 decimal places", () => {
    const marginA: FinancialMetrics = { ...base, grossMarginPct: 24.123 };
    const marginB: FinancialMetrics = { ...base, grossMarginPct: 23.456 };
    const result = computePeriodDelta(marginA, marginB, "YoY");
    // changePP = 24.123 - 23.456 = 0.667
    expect(Math.abs(result.grossMarginPP.changePP - 0.667)).toBeLessThan(1e-3);
  });
});
