// src/__tests__/046-period-delta.test.ts
import { describe, it, expect } from "bun:test";
import {
  computePeriodDelta,
  type FinancialMetrics,
} from "../domain/services/financial-reports/periodDeltaComputer.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseMetrics: FinancialMetrics = {
  // Income Statement
  netRevenue: 1_000_000,
  grossProfit: 250_000,
  operatingProfit: 150_000,
  netProfit: 120_000,
  ebitda: 180_000,
  eps: 1_200,
  // Balance Sheet
  totalAssets: 5_000_000,
  equity: 2_000_000,
  totalDebt: 1_500_000,
  cash: 300_000,
  // Cash Flow
  operatingCF: 200_000,
  freeCashFlow: 140_000,
  // Ratios (in percent or ratio units)
  grossMarginPct: 25.0,
  netMarginPct: 12.0,
  roe: 6.0,
  debtToEquity: 0.75,
};

const previousMetrics: FinancialMetrics = {
  netRevenue: 800_000,
  grossProfit: 180_000,
  operatingProfit: 100_000,
  netProfit: 80_000,
  ebitda: 130_000,
  eps: 800,
  totalAssets: 4_500_000,
  equity: 1_800_000,
  totalDebt: 1_600_000,
  cash: 200_000,
  operatingCF: 150_000,
  freeCashFlow: 90_000,
  grossMarginPct: 22.5,
  netMarginPct: 10.0,
  roe: 5.0,
  debtToEquity: 0.89,
};

// ---------------------------------------------------------------------------
// Task 046 — Period Delta Computer
// ---------------------------------------------------------------------------

describe("Task 046 — Period Delta Computer", () => {
  // ── Criterion 1: Basic YoY computation with absolute + % changes ──────────
  describe("YoY comparison", () => {
    it("tags deltaType as YoY", () => {
      const result = computePeriodDelta(baseMetrics, previousMetrics, "YoY");
      expect(result.deltaType).toBe("YoY");
    });

    it("computes correct absolute and percent change for netRevenue", () => {
      const result = computePeriodDelta(baseMetrics, previousMetrics, "YoY");
      const delta = result.netRevenue;
      // absolute: 1_000_000 - 800_000 = 200_000
      expect(delta.current).toBe(1_000_000);
      expect(delta.previous).toBe(800_000);
      expect(delta.changeAbsolute).toBe(200_000);
      // pct: 200_000 / 800_000 × 100 = 25%
      expect(delta.changePct).toBeCloseTo(25.0, 5);
    });

    it("computes correct absolute and percent change for netProfit", () => {
      const result = computePeriodDelta(baseMetrics, previousMetrics, "YoY");
      const delta = result.netProfit;
      // absolute: 120_000 - 80_000 = 40_000
      // pct: 40_000 / 80_000 × 100 = 50%
      expect(delta.changeAbsolute).toBe(40_000);
      expect(delta.changePct).toBeCloseTo(50.0, 5);
    });

    it("computes ratio changes in percentage points for grossMarginPct", () => {
      const result = computePeriodDelta(baseMetrics, previousMetrics, "YoY");
      const rc = result.grossMarginPP;
      // 25.0 - 22.5 = 2.5 pp
      expect(rc.current).toBe(25.0);
      expect(rc.previous).toBe(22.5);
      expect(rc.changePP).toBeCloseTo(2.5, 5);
    });

    it("computes roe percentage-point change", () => {
      const result = computePeriodDelta(baseMetrics, previousMetrics, "YoY");
      const rc = result.roePP;
      // 6.0 - 5.0 = 1.0 pp
      expect(rc.changePP).toBeCloseTo(1.0, 5);
    });

    it("computes debtToEquity percentage-point change", () => {
      const result = computePeriodDelta(baseMetrics, previousMetrics, "YoY");
      const rc = result.debtToEquityPP;
      // 0.75 - 0.89 = -0.14 pp
      expect(rc.changePP).toBeCloseTo(-0.14, 5);
    });
  });

  // ── Criterion 2: QoQ comparison type tag ─────────────────────────────────
  describe("QoQ comparison", () => {
    it("tags deltaType as QoQ", () => {
      const result = computePeriodDelta(baseMetrics, previousMetrics, "QoQ");
      expect(result.deltaType).toBe("QoQ");
    });

    it("produces same numeric changes regardless of deltaType tag", () => {
      const yoy = computePeriodDelta(baseMetrics, previousMetrics, "YoY");
      const qoq = computePeriodDelta(baseMetrics, previousMetrics, "QoQ");
      expect(qoq.netRevenue.changeAbsolute).toBe(yoy.netRevenue.changeAbsolute);
      expect(qoq.netRevenue.changePct).toBe(yoy.netRevenue.changePct);
    });
  });

  // ── Criterion 3: prev=0 → changePct is null, not Infinity ─────────────────
  describe("prev=0 → changePct is null", () => {
    it("returns null for changePct when previous netRevenue is 0", () => {
      const zeroPrev: FinancialMetrics = { ...previousMetrics, netRevenue: 0 };
      const result = computePeriodDelta(baseMetrics, zeroPrev, "YoY");
      expect(result.netRevenue.changePct).toBeNull();
      // absolute change is still computed
      expect(result.netRevenue.changeAbsolute).toBe(1_000_000);
    });

    it("returns null for changePct when previous netProfit is 0", () => {
      const zeroPrev: FinancialMetrics = { ...previousMetrics, netProfit: 0 };
      const result = computePeriodDelta(baseMetrics, zeroPrev, "YoY");
      expect(result.netProfit.changePct).toBeNull();
    });

    it("returns null for changePct when previous cash is 0", () => {
      const zeroPrev: FinancialMetrics = { ...previousMetrics, cash: 0 };
      const result = computePeriodDelta(baseMetrics, zeroPrev, "YoY");
      expect(result.cash.changePct).toBeNull();
    });
  });

  // ── Criterion 4: Both periods identical → all changes are 0 ──────────────
  describe("identical periods", () => {
    it("returns 0 absolute change for all ValueChange fields when periods are the same", () => {
      const result = computePeriodDelta(baseMetrics, baseMetrics, "YoY");
      expect(result.netRevenue.changeAbsolute).toBe(0);
      expect(result.grossProfit.changeAbsolute).toBe(0);
      expect(result.operatingProfit.changeAbsolute).toBe(0);
      expect(result.netProfit.changeAbsolute).toBe(0);
      expect(result.ebitda.changeAbsolute).toBe(0);
      expect(result.eps.changeAbsolute).toBe(0);
      expect(result.totalAssets.changeAbsolute).toBe(0);
      expect(result.equity.changeAbsolute).toBe(0);
      expect(result.totalDebt.changeAbsolute).toBe(0);
      expect(result.cash.changeAbsolute).toBe(0);
      expect(result.operatingCF.changeAbsolute).toBe(0);
      expect(result.freeCashFlow.changeAbsolute).toBe(0);
    });

    it("returns 0 changePct when periods are the same and previous > 0", () => {
      const result = computePeriodDelta(baseMetrics, baseMetrics, "YoY");
      expect(result.netRevenue.changePct).toBeCloseTo(0, 5);
    });

    it("returns 0 pp change for all RatioChange fields when periods are the same", () => {
      const result = computePeriodDelta(baseMetrics, baseMetrics, "YoY");
      expect(result.grossMarginPP.changePP).toBe(0);
      expect(result.netMarginPP.changePP).toBe(0);
      expect(result.roePP.changePP).toBe(0);
      expect(result.debtToEquityPP.changePP).toBe(0);
    });
  });

  // ── Criterion 5: Negative-to-positive transitions ─────────────────────────
  describe("negative to positive transitions", () => {
    it("handles netProfit going from loss to profit (negative → positive)", () => {
      const currentWithProfit: FinancialMetrics = { ...baseMetrics, netProfit: 50_000 };
      const previousWithLoss: FinancialMetrics = { ...previousMetrics, netProfit: -30_000 };
      const result = computePeriodDelta(currentWithProfit, previousWithLoss, "YoY");
      // absolute: 50_000 - (-30_000) = 80_000
      expect(result.netProfit.changeAbsolute).toBe(80_000);
      // previous is negative → changePct is null (sign flip makes pct meaningless)
      expect(result.netProfit.changePct).toBeNull();
    });

    it("handles netProfit going from positive to negative (positive → negative)", () => {
      const currentWithLoss: FinancialMetrics = { ...baseMetrics, netProfit: -20_000 };
      const prevWithProfit: FinancialMetrics = { ...previousMetrics, netProfit: 80_000 };
      const result = computePeriodDelta(currentWithLoss, prevWithProfit, "YoY");
      // absolute: -20_000 - 80_000 = -100_000
      expect(result.netProfit.changeAbsolute).toBe(-100_000);
      // pct: -100_000 / 80_000 × 100 = -125%
      expect(result.netProfit.changePct).toBeCloseTo(-125.0, 5);
    });

    it("handles operatingCF going from negative to positive", () => {
      const currentPositive: FinancialMetrics = { ...baseMetrics, operatingCF: 100_000 };
      const prevNegative: FinancialMetrics = { ...previousMetrics, operatingCF: -50_000 };
      const result = computePeriodDelta(currentPositive, prevNegative, "YoY");
      expect(result.operatingCF.changeAbsolute).toBe(150_000);
      // previous negative → null
      expect(result.operatingCF.changePct).toBeNull();
    });
  });

  // ── Criterion 6: Return shape matches PeriodDelta interface ───────────────
  describe("return shape", () => {
    it("returns all required PeriodDelta fields", () => {
      const result = computePeriodDelta(baseMetrics, previousMetrics, "YoY");

      // ValueChange fields
      expect(result).toHaveProperty("netRevenue");
      expect(result).toHaveProperty("grossProfit");
      expect(result).toHaveProperty("operatingProfit");
      expect(result).toHaveProperty("netProfit");
      expect(result).toHaveProperty("ebitda");
      expect(result).toHaveProperty("eps");
      expect(result).toHaveProperty("totalAssets");
      expect(result).toHaveProperty("equity");
      expect(result).toHaveProperty("totalDebt");
      expect(result).toHaveProperty("cash");
      expect(result).toHaveProperty("operatingCF");
      expect(result).toHaveProperty("freeCashFlow");

      // RatioChange fields
      expect(result).toHaveProperty("grossMarginPP");
      expect(result).toHaveProperty("netMarginPP");
      expect(result).toHaveProperty("roePP");
      expect(result).toHaveProperty("debtToEquityPP");

      // Metadata
      expect(result).toHaveProperty("deltaType");
    });

    it("ValueChange fields each have current, previous, changeAbsolute, changePct", () => {
      const result = computePeriodDelta(baseMetrics, previousMetrics, "YoY");
      const vc = result.netRevenue;
      expect(typeof vc.current).toBe("number");
      expect(typeof vc.previous).toBe("number");
      expect(typeof vc.changeAbsolute).toBe("number");
      // changePct is number or null
      expect(vc.changePct === null || typeof vc.changePct === "number").toBe(true);
    });

    it("RatioChange fields each have current, previous, changePP", () => {
      const result = computePeriodDelta(baseMetrics, previousMetrics, "YoY");
      const rc = result.grossMarginPP;
      expect(typeof rc.current).toBe("number");
      expect(typeof rc.previous).toBe("number");
      expect(typeof rc.changePP).toBe("number");
    });
  });
});
