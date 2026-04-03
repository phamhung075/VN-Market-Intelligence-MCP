// src/__tests__/246-credit-flow.test.ts
import { describe, it, expect } from "bun:test";
import {
  analyzeCreditFlow,
  type CreditData,
  type CreditSignal,
} from "../domain/services/creditFlowAnalyzer.js";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BASE: CreditData = {
  totalCreditTrillion: 14_000,
  reCreditTrillion: 2_800,
  reCreditRatioPct: 20,
  yoyGrowthPct: 15,
  avgMortgageRatePct: 9.5,
  date: "2026-03-01",
};

const PREV: CreditData = {
  totalCreditTrillion: 13_500,
  reCreditTrillion: 2_600,
  reCreditRatioPct: 19.3,
  yoyGrowthPct: 12,
  avgMortgageRatePct: 10,
  date: "2026-02-01",
};

describe("Task 246 — Credit Flow Analyzer", () => {
  // ── 1. Basic return shape ───────────────────────────────────────────────

  it("returns a CreditSignal with required fields", () => {
    const signal: CreditSignal = analyzeCreditFlow(BASE, PREV);
    expect(signal).toHaveProperty("direction");
    expect(signal).toHaveProperty("affectedStocks");
    expect(signal).toHaveProperty("summary");
    expect(signal).toHaveProperty("severity");
    expect(signal).toHaveProperty("confidence");
  });

  it("affectedStocks is a non-empty array", () => {
    const signal = analyzeCreditFlow(BASE, PREV);
    expect(Array.isArray(signal.affectedStocks)).toBe(true);
    expect(signal.affectedStocks.length).toBeGreaterThan(0);
  });

  it("each affectedStock has code and impact", () => {
    const signal = analyzeCreditFlow(BASE, PREV);
    for (const s of signal.affectedStocks) {
      expect(typeof s.code).toBe("string");
      expect(typeof s.impact).toBe("string");
    }
  });

  // ── 2. RE credit growth → BULLISH chain ────────────────────────────────

  it("RE credit growth → direction up", () => {
    const curr = { ...BASE, reCreditTrillion: 3_000 };
    const prev = { ...PREV, reCreditTrillion: 2_500 };
    const signal = analyzeCreditFlow(curr, prev);
    expect(signal.direction).toBe("up");
  });

  it("RE credit growth → VHM/NVL/KDH in affectedStocks", () => {
    const curr = { ...BASE, reCreditTrillion: 3_000 };
    const prev = { ...PREV, reCreditTrillion: 2_500 };
    const signal = analyzeCreditFlow(curr, prev);
    const codes = signal.affectedStocks.map((s) => s.code);
    expect(codes).toContain("VHM");
    expect(codes).toContain("NVL");
    expect(codes).toContain("KDH");
  });

  it("RE credit growth → VCB/BID/CTG with positive provision impact", () => {
    const curr = { ...BASE, reCreditTrillion: 3_000 };
    const prev = { ...PREV, reCreditTrillion: 2_500 };
    const signal = analyzeCreditFlow(curr, prev);
    const codes = signal.affectedStocks.map((s) => s.code);
    expect(codes).toContain("VCB");
    expect(codes).toContain("BID");
    expect(codes).toContain("CTG");
  });

  // ── 3. RE credit decline → BEARISH chain ───────────────────────────────

  it("RE credit decline → direction down", () => {
    const curr = { ...BASE, reCreditTrillion: 2_200 };
    const prev = { ...PREV, reCreditTrillion: 2_600 };
    const signal = analyzeCreditFlow(curr, prev);
    expect(signal.direction).toBe("down");
  });

  it("RE credit decline → VHM/NVL impacted negatively", () => {
    const curr = { ...BASE, reCreditTrillion: 2_200 };
    const prev = { ...PREV, reCreditTrillion: 2_600 };
    const signal = analyzeCreditFlow(curr, prev);
    const vhmEntry = signal.affectedStocks.find((s) => s.code === "VHM");
    expect(vhmEntry).toBeDefined();
    expect(vhmEntry!.impact).toMatch(/giảm|chậm|rủi/i);
  });

  // ── 4. Rate change effects ──────────────────────────────────────────────

  it("rate drop → KDH included with positive impact", () => {
    const curr = { ...BASE, avgMortgageRatePct: 8.0 };
    const prev = { ...PREV, avgMortgageRatePct: 10.5 };
    const signal = analyzeCreditFlow(curr, prev);
    const codes = signal.affectedStocks.map((s) => s.code);
    expect(codes).toContain("KDH");
  });

  it("rate increase → banking stocks with NIM expansion note", () => {
    const curr = { ...BASE, avgMortgageRatePct: 12 };
    const prev = { ...PREV, avgMortgageRatePct: 9 };
    const signal = analyzeCreditFlow(curr, prev);
    const bankEntry = signal.affectedStocks.find((s) => s.code === "VCB");
    expect(bankEntry).toBeDefined();
  });

  // ── 5. Severity levels ──────────────────────────────────────────────────

  it("large RE credit increase (>20%) → severity high or critical", () => {
    const curr = { ...BASE, reCreditTrillion: 3_500 };
    const prev = { ...PREV, reCreditTrillion: 2_500 };
    const signal = analyzeCreditFlow(curr, prev);
    expect(["high", "critical"]).toContain(signal.severity);
  });

  it("flat credit (no change) → severity low", () => {
    const signal = analyzeCreditFlow(BASE, BASE);
    expect(signal.severity).toBe("low");
  });

  // ── 6. Confidence ──────────────────────────────────────────────────────

  it("confidence is between 0 and 1", () => {
    const signal = analyzeCreditFlow(BASE, PREV);
    expect(signal.confidence).toBeGreaterThanOrEqual(0);
    expect(signal.confidence).toBeLessThanOrEqual(1);
  });

  // ── 7. Summary is Vietnamese text ──────────────────────────────────────

  it("summary is a non-empty string", () => {
    const signal = analyzeCreditFlow(BASE, PREV);
    expect(typeof signal.summary).toBe("string");
    expect(signal.summary.length).toBeGreaterThan(0);
  });

  // ── 8. Pure function — no mutation ─────────────────────────────────────

  it("does not mutate input objects", () => {
    const currCopy = { ...BASE };
    const prevCopy = { ...PREV };
    analyzeCreditFlow(currCopy, prevCopy);
    expect(currCopy).toEqual(BASE);
    expect(prevCopy).toEqual(PREV);
  });
});
