/**
 * Tasks 1203 & 1217 — Macro Indicator Outlier Validation
 *
 * Statistically impossible percentage changes in macro indicators (e.g.
 * Dow Jones +59%, Dow Jones -69%, Oil -200%) must be flagged as data
 * anomalies and discarded rather than propagating into cascade rules.
 *
 * Rules:
 *   - Equity index daily % change > ±25% → data_anomaly
 *   - Commodity daily % change > ±50%    → data_anomaly
 *   - Normal values pass through unchanged
 */

import { describe, it, expect } from "bun:test";
import {
  validateMacroChangePercent,
  MacroAssetClass,
} from "../domain/services/macroOutlierGuard.js";
import type { MacroOutlierResult } from "../domain/services/macroOutlierGuard.js";

describe("Tasks 1203 & 1217 — Macro Indicator Outlier Validation", () => {
  // ── OV-01: Dow Jones +59% is flagged as data_anomaly ─────────────────────
  it("OV-01: Dow Jones +59% daily change is flagged as data_anomaly", () => {
    const result: MacroOutlierResult = validateMacroChangePercent(
      "Dow Jones",
      59,
      MacroAssetClass.EQUITY_INDEX,
    );
    expect(result.isAnomaly).toBe(true);
    expect(result.reason).toContain("25%");
  });

  // ── OV-02: Dow Jones -69% is flagged as data_anomaly ─────────────────────
  it("OV-02: Dow Jones -69% daily change is flagged as data_anomaly", () => {
    const result = validateMacroChangePercent(
      "Dow Jones",
      -69,
      MacroAssetClass.EQUITY_INDEX,
    );
    expect(result.isAnomaly).toBe(true);
    expect(result.reason).toContain("25%");
  });

  // ── OV-03: Oil -200% is flagged as data_anomaly ───────────────────────────
  it("OV-03: Oil price -200% daily change is flagged as data_anomaly", () => {
    const result = validateMacroChangePercent(
      "Brent Crude",
      -200,
      MacroAssetClass.COMMODITY,
    );
    expect(result.isAnomaly).toBe(true);
    expect(result.reason).toContain("50%");
  });

  // ── OV-04: Gold +45% is flagged as data_anomaly (precious metal threshold = 40%) ──
  it("OV-04: Gold +45% daily change is flagged as data_anomaly", () => {
    const result = validateMacroChangePercent(
      "Gold",
      45,
      MacroAssetClass.PRECIOUS_METAL,
    );
    expect(result.isAnomaly).toBe(true);
    expect(result.reason).toContain("40%");
  });

  // ── OV-05: Normal DJ change (+1.2%) passes through ───────────────────────
  it("OV-05: Dow Jones +1.2% daily change is NOT an anomaly", () => {
    const result = validateMacroChangePercent(
      "Dow Jones",
      1.2,
      MacroAssetClass.EQUITY_INDEX,
    );
    expect(result.isAnomaly).toBe(false);
    expect(result.reason).toBeNull();
  });

  // ── OV-06: Normal DJ change (-3.5%) passes through ────────────────────────
  it("OV-06: Dow Jones -3.5% daily change is NOT an anomaly", () => {
    const result = validateMacroChangePercent(
      "Dow Jones",
      -3.5,
      MacroAssetClass.EQUITY_INDEX,
    );
    expect(result.isAnomaly).toBe(false);
    expect(result.reason).toBeNull();
  });

  // ── OV-07: Normal Brent change (+8%) passes through ──────────────────────
  it("OV-07: Brent crude +8% daily change is NOT an anomaly", () => {
    const result = validateMacroChangePercent(
      "Brent Crude",
      8,
      MacroAssetClass.COMMODITY,
    );
    expect(result.isAnomaly).toBe(false);
    expect(result.reason).toBeNull();
  });

  // ── OV-08: Boundary — exactly ±25% equity → anomaly (inclusive) ──────────
  it("OV-08: Equity index at exactly +25% is flagged as anomaly (inclusive threshold)", () => {
    const result = validateMacroChangePercent(
      "S&P 500",
      25,
      MacroAssetClass.EQUITY_INDEX,
    );
    expect(result.isAnomaly).toBe(true);
  });

  // ── OV-09: Boundary — exactly ±50% commodity → anomaly (inclusive) ────────
  it("OV-09: Commodity at exactly -50% is flagged as anomaly (inclusive threshold)", () => {
    const result = validateMacroChangePercent(
      "Natural Gas",
      -50,
      MacroAssetClass.COMMODITY,
    );
    expect(result.isAnomaly).toBe(true);
  });

  // ── OV-10: Just below equity threshold (+24.9%) passes ────────────────────
  it("OV-10: Equity index at +24.9% is NOT an anomaly", () => {
    const result = validateMacroChangePercent(
      "VN-Index",
      24.9,
      MacroAssetClass.EQUITY_INDEX,
    );
    expect(result.isAnomaly).toBe(false);
  });

  // ── OV-11: Just below commodity threshold (+49.9%) passes ─────────────────
  it("OV-11: Commodity at +49.9% is NOT an anomaly", () => {
    const result = validateMacroChangePercent(
      "WTI Crude",
      49.9,
      MacroAssetClass.COMMODITY,
    );
    expect(result.isAnomaly).toBe(false);
  });

  // ── OV-12: Result carries indicator name and raw value ────────────────────
  it("OV-12: OutlierResult carries indicator name and raw percent value", () => {
    const result = validateMacroChangePercent(
      "S&P 500",
      59,
      MacroAssetClass.EQUITY_INDEX,
    );
    expect(result.indicatorName).toBe("S&P 500");
    expect(result.changePercent).toBe(59);
    expect(result.assetClass).toBe(MacroAssetClass.EQUITY_INDEX);
  });
});
