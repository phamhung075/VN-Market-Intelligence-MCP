/**
 * Task 260 — Energy Market Analyzer Tests
 *
 * Pure domain service: power grid data → stock impact signals.
 * 12 tests covering all signal types and edge cases.
 */

import { describe, it, expect } from "bun:test";
import {
  analyzeEnergyMarket,
  type EnergyData,
  type EnergySignal,
} from "../domain/services/energyMarketAnalyzer.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const normalData: EnergyData = {
  hydroCapacityPct: 65,
  thermalDispatchPct: 35,
  renewableDispatchPct: 20,
  peakDemandGW: 40,
  installedCapacityGW: 80,
};

const hydroDeficitData: EnergyData = {
  hydroCapacityPct: 32, // < 40% threshold
  thermalDispatchPct: 45,
  renewableDispatchPct: 15,
  peakDemandGW: 38,
  installedCapacityGW: 80,
};

const powerShortageData: EnergyData = {
  hydroCapacityPct: 50,
  thermalDispatchPct: 50,
  renewableDispatchPct: 18,
  peakDemandGW: 74, // > 90% of 80GW installed = 72GW threshold
  installedCapacityGW: 80,
};

const thermalStressData: EnergyData = {
  hydroCapacityPct: 55,
  thermalDispatchPct: 68, // > 60% threshold
  renewableDispatchPct: 12,
  peakDemandGW: 45,
  installedCapacityGW: 80,
};

const renewableGrowthData: EnergyData = {
  hydroCapacityPct: 60,
  thermalDispatchPct: 30,
  renewableDispatchPct: 35, // > 30% threshold
  peakDemandGW: 42,
  installedCapacityGW: 80,
};

const extremeShortageData: EnergyData = {
  hydroCapacityPct: 20, // critical low
  thermalDispatchPct: 60,
  renewableDispatchPct: 10,
  peakDemandGW: 78, // very high demand
  installedCapacityGW: 80,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 260 — Energy Market Analyzer", () => {
  // 1. Normal conditions → no signals
  it("normal conditions return empty signals array", () => {
    const result = analyzeEnergyMarket(normalData);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  // 2. Hydro < 40% → hydro_deficit signal
  it("hydroCapacityPct < 40 triggers hydro_deficit signal", () => {
    const result = analyzeEnergyMarket(hydroDeficitData);
    const deficit = result.find((s) => s.type === "hydro_deficit");
    expect(deficit).toBeDefined();
  });

  // 3. hydro_deficit → REE/GEG bullish (alternatives)
  it("hydro_deficit makes REE bullish (alternatives to hydro)", () => {
    const result = analyzeEnergyMarket(hydroDeficitData);
    const deficit = result.find((s) => s.type === "hydro_deficit");
    expect(deficit).toBeDefined();
    const ree = deficit!.affectedStocks.find((s) => s.code === "REE");
    expect(ree).toBeDefined();
    expect(ree!.direction).toBe("up");
  });

  // 4. hydro_deficit → small hydro CHP bearish
  it("hydro_deficit makes CHP bearish (small hydro output drops)", () => {
    const result = analyzeEnergyMarket(hydroDeficitData);
    const deficit = result.find((s) => s.type === "hydro_deficit");
    expect(deficit).toBeDefined();
    const chp = deficit!.affectedStocks.find((s) => s.code === "CHP");
    expect(chp).toBeDefined();
    expect(chp!.direction).toBe("down");
  });

  // 5. Peak > 90% installed → power_shortage signal
  it("peakDemandGW > 90% installed triggers power_shortage", () => {
    const result = analyzeEnergyMarket(powerShortageData);
    const shortage = result.find((s) => s.type === "power_shortage");
    expect(shortage).toBeDefined();
  });

  // 6. power_shortage → IDC/KBC bearish
  it("power_shortage makes IDC bearish (industrial zone FDI risk)", () => {
    const result = analyzeEnergyMarket(powerShortageData);
    const shortage = result.find((s) => s.type === "power_shortage");
    expect(shortage).toBeDefined();
    const idc = shortage!.affectedStocks.find((s) => s.code === "IDC");
    expect(idc).toBeDefined();
    expect(idc!.direction).toBe("down");
  });

  // 7. power_shortage → GEG bullish
  it("power_shortage makes GEG bullish (renewable demand up)", () => {
    const result = analyzeEnergyMarket(powerShortageData);
    const shortage = result.find((s) => s.type === "power_shortage");
    expect(shortage).toBeDefined();
    const geg = shortage!.affectedStocks.find((s) => s.code === "GEG");
    expect(geg).toBeDefined();
    expect(geg!.direction).toBe("up");
  });

  // 8. Thermal > 60% → thermal_stress signal
  it("thermalDispatchPct > 60 triggers thermal_stress signal", () => {
    const result = analyzeEnergyMarket(thermalStressData);
    const thermal = result.find((s) => s.type === "thermal_stress");
    expect(thermal).toBeDefined();
  });

  // 9. Renewable > 30% → renewable_growth signal
  it("renewableDispatchPct > 30 triggers renewable_growth signal", () => {
    const result = analyzeEnergyMarket(renewableGrowthData);
    const renewable = result.find((s) => s.type === "renewable_growth");
    expect(renewable).toBeDefined();
  });

  // 10. renewable_growth → REE/GEG bullish
  it("renewable_growth makes GEG/REE bullish", () => {
    const result = analyzeEnergyMarket(renewableGrowthData);
    const renewable = result.find((s) => s.type === "renewable_growth");
    expect(renewable).toBeDefined();
    const geg = renewable!.affectedStocks.find((s) => s.code === "GEG");
    expect(geg).toBeDefined();
    expect(geg!.direction).toBe("up");
  });

  // 11. EnergySignal has all required fields
  it("all returned EnergySignals have required fields", () => {
    const result = analyzeEnergyMarket(hydroDeficitData);
    for (const signal of result) {
      expect(typeof signal.type).toBe("string");
      expect(typeof signal.severity).toBe("string");
      expect(Array.isArray(signal.affectedStocks)).toBe(true);
      expect(typeof signal.confidence).toBe("number");
      expect(signal.confidence).toBeGreaterThan(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
    }
  });

  // 12. Extreme shortage → critical severity
  it("extreme hydro deficit + high demand → critical severity", () => {
    const result = analyzeEnergyMarket(extremeShortageData);
    const critical = result.find((s) => s.severity === "critical");
    expect(critical).toBeDefined();
  });
});
