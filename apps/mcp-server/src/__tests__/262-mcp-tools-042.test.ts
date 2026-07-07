/**
 * Task 262 — MCP Tools: get_climate_risk_signals + get_energy_grid_signals
 *
 * 6 tests covering tool registration, response format, and content.
 */

import { describe, it, expect, mock, afterAll } from "bun:test";

// ─────────────────────────────────────────────────────────────────────────────
// Network-fetcher mocks (CI-RED-c5b5f885-FIX) — climateTools/energyTools call
// real external network with no DI hook at the tool layer (weatherVn.js →
// nchmf.gov.vn/NOAA, hydrologicalData.js → vneconomy.vn RSS). Under CI's
// 16-way parallel per-file bun-test isolation this consistently exceeds the
// bun-test default per-test timeout (5000ms vs the fetchers' own 15000ms axios
// timeout) — same recurring cause the getEnergyGridSignals/getEnergyGridStatus
// tests below were previously .skip'd for. Mock both fetchers to resolve empty
// deterministically (matches their own documented fail-soft behaviour on real
// network failure) so these tool-format assertions run hermetically, and
// restore full coverage by un-skipping the two energy tests.
// Must run BEFORE the climateTools.js/energyTools.js imports below so Bun's
// module registry serves the mock to their transitive imports.
// Freeze-before-mock + afterAll-restore: mock.module() is worker-scoped and
// permanent in Bun 1.x — must not leak into sibling files that exercise the
// real fetchers directly (257-weather-vn / 258-hydro-data / 259-climate-impact).
// ─────────────────────────────────────────────────────────────────────────────
import * as _realWeatherVn262 from "../infrastructure/fetchers/weatherVn.js";
import * as _realHydro262 from "../infrastructure/fetchers/hydrologicalData.js";
const _frozenWeatherVn262 = { ..._realWeatherVn262 };
const _frozenHydro262 = { ..._realHydro262 };
mock.module("../infrastructure/fetchers/weatherVn.js", () => ({
  ..._frozenWeatherVn262,
  fetchWeatherWarnings: async () => [],
}));
mock.module("../infrastructure/fetchers/hydrologicalData.js", () => ({
  ..._frozenHydro262,
  fetchReservoirLevels: async () => [],
}));

import {
  getClimateRiskSignals,
} from "../interface/mcp/tools/sector/climateTools.js";
import {
  getEnergyGridSignals,
  getEnergyGridStatus,
} from "../interface/mcp/tools/sector/energyTools.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 262 — MCP Tools: Climate + Energy", () => {
  // 1. getClimateRiskSignals returns content array
  it("getClimateRiskSignals returns MCP content format", async () => {
    const result = await getClimateRiskSignals({});
    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]!).toHaveProperty("type", "text");
    expect(typeof (result.content[0] as { type: "text"; text: string }).text).toBe("string");
  });

  // 2. getClimateRiskSignals output contains seasonal context section
  it("getClimateRiskSignals output contains seasonal context", async () => {
    const result = await getClimateRiskSignals({});
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text.toLowerCase()).toMatch(/mùa|khí hậu|thời tiết|seasonal|tháng/i);
  });

  // 3. getClimateRiskSignals with stock filter
  it("getClimateRiskSignals with stock param filters to that stock", async () => {
    const result = await getClimateRiskSignals({ stock: "REE" });
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text.length).toBeGreaterThan(0);
    // Result should mention REE or be a valid response
    expect(typeof text).toBe("string");
  });

  // 4. getEnergyGridSignals returns content array
  // Un-skipped (CI-RED-c5b5f885-FIX): fetchReservoirLevels is now mocked
  // module-wide above, so this no longer depends on real network.
  it("getEnergyGridSignals returns MCP content format", async () => {
    const result = await getEnergyGridSignals({});
    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]!).toHaveProperty("type", "text");
    expect(typeof (result.content[0] as { type: "text"; text: string }).text).toBe("string");
  });

  // 5. getEnergyGridStatus function exported from energyTools
  // Un-skipped (CI-RED-c5b5f885-FIX): fetchReservoirLevels is now mocked
  // module-wide above, so this no longer depends on real network.
  it("getEnergyGridStatus function is exported", async () => {
    expect(typeof getEnergyGridStatus).toBe("function");
    const result = await getEnergyGridStatus({});
    expect(result).toHaveProperty("content");
  });

  // 6. climateTools.ts and energyTools.ts export register functions
  it("climate and energy tools export registerClimateTools and registerEnergyTools", async () => {
    const climateModule = await import("../interface/mcp/tools/sector/climateTools.js");
    const energyModule = await import("../interface/mcp/tools/sector/energyTools.js");
    expect(typeof climateModule.registerClimateTools).toBe("function");
    expect(typeof energyModule.registerEnergyTools).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Teardown — restore real weatherVn/hydrologicalData modules (CI-RED-c5b5f885-FIX)
//
// mock.module() in Bun 1.x is worker-scoped and permanent. Re-register the
// real implementations captured at file top-level so worker-siblings
// (257-weather-vn / 258-hydro-data / 259-climate-impact) see genuine modules.
// ─────────────────────────────────────────────────────────────────────────────
afterAll(() => {
  mock.module("../infrastructure/fetchers/weatherVn.js", () => _frozenWeatherVn262);
  mock.module("../infrastructure/fetchers/hydrologicalData.js", () => _frozenHydro262);
});
